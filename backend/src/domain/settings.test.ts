/**
 * Settings & IAM domain tests.
 *
 * Pin the documented role asymmetries (HR manages the directory but not RBAC or
 * the webhook), the soft-delete account lifecycle with its before/after audit
 * event, the redaction of secret application settings, and the audited Telegram
 * webhook update.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { loadConfig } from "../config";
import { createDatabase, type DatabaseHandle } from "../db";
import type { RoleCode } from "../db/enums";
import { runMigrations } from "../db/migrate";
import { departments, roles, user, userRoles } from "../db/schema";
import { authorize } from "../graphql/access";
import {
	createContext,
	type Viewer,
	type ViewerContext,
} from "../graphql/context";
import { toAppSetting } from "../graphql/shapes";
import {
	createUser,
	deactivateUser,
	listAppSettings,
	updateAppSetting,
	updateTelegramWebhookConfig,
} from "./settings";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const createdPaths: string[] = [];

afterAll(() => {
	for (const path of createdPaths) {
		for (const suffix of ["", "-wal", "-shm"]) {
			if (existsSync(`${path}${suffix}`)) rmSync(`${path}${suffix}`);
		}
	}
});

function freshDatabase(name: string): DatabaseHandle {
	const path = join(TMP_ROOT, `mes-settings-${name}-${crypto.randomUUID()}.db`);
	createdPaths.push(path);
	runMigrations({ databasePath: path });
	return createDatabase(path);
}

function context(db: DatabaseHandle, who: Viewer): ViewerContext {
	return createContext({
		db,
		config: loadConfig({ NODE_ENV: "test" }),
		request: { ipAddress: "10.0.0.1", userAgent: "bun-test" },
		viewer: who,
	});
}

function viewer(
	id: string,
	roleCodes: RoleCode[],
	departmentId: string | null = null,
): Viewer {
	return {
		id,
		userCode: `U-${id}`,
		fullName: `User ${id}`,
		email: `${id}@mes.local`,
		departmentId,
		isActive: true,
		roleCodes,
	};
}

function expectForbidden(fn: () => unknown): void {
	try {
		fn();
	} catch (error) {
		const code = (error as { extensions?: { code?: string } }).extensions?.code;
		expect(code).toBe("FORBIDDEN");
		return;
	}
	throw new Error("Expected the operation to be denied with FORBIDDEN.");
}

async function seedRole(db: DatabaseHandle, code: RoleCode) {
	await db.insert(roles).values({ id: `role-${code}`, code, name: code });
}

async function seedUser(
	db: DatabaseHandle,
	id: string,
	roleCodes: RoleCode[],
	departmentId: string | null = null,
) {
	await db.insert(user).values({
		id,
		name: `User ${id}`,
		email: `${id}@mes.local`,
		userCode: `U-${id}`,
		departmentId,
	});
	for (const code of roleCodes) {
		await db
			.insert(userRoles)
			.values({ id: `ur-${id}-${code}`, userId: id, roleId: `role-${code}` });
	}
}

async function seedBase(db: DatabaseHandle) {
	await db
		.insert(departments)
		.values({ id: "d1", code: "PROD", name: "Production" });
	for (const code of [
		"SUPER_ADMIN",
		"TECH_LEAD",
		"HR_MANAGER",
		"DEPT_HEAD",
		"EMPLOYEE",
	] as RoleCode[]) {
		await seedRole(db, code);
	}
	await seedUser(db, "u-hr", ["HR_MANAGER"], "d1");
	await seedUser(db, "u-tech", ["TECH_LEAD"], "d1");
	await seedUser(db, "u-emp", ["EMPLOYEE"], "d1");
	await seedUser(db, "u-target", ["EMPLOYEE"], "d1");
}

describe("settings authorization asymmetries", () => {
	test("HR_MANAGER manages the directory but is denied RBAC and the webhook", () => {
		const db = freshDatabase("rbac-hr");
		const hr = context(db, viewer("u-hr", ["HR_MANAGER"], "d1"));

		expect(() => authorize(hr, "users")).not.toThrow();
		expect(() => authorize(hr, "createUser")).not.toThrow();
		expect(() => authorize(hr, "updateUser")).not.toThrow();
		expect(() => authorize(hr, "deactivateUser")).not.toThrow();

		expectForbidden(() => authorize(hr, "roles"));
		expectForbidden(() => authorize(hr, "permissions"));
		expectForbidden(() => authorize(hr, "updateRolePermissions"));
		expectForbidden(() => authorize(hr, "telegramWebhookConfig"));
		expectForbidden(() => authorize(hr, "updateTelegramWebhookConfig"));
		expectForbidden(() => authorize(hr, "auditLogs"));
	});

	test("TECH_LEAD manages RBAC and the webhook but not account lifecycle", () => {
		const db = freshDatabase("rbac-tech");
		const tech = context(db, viewer("u-tech", ["TECH_LEAD"], "d1"));

		expect(() => authorize(tech, "roles")).not.toThrow();
		expect(() => authorize(tech, "permissions")).not.toThrow();
		expect(() => authorize(tech, "updateRolePermissions")).not.toThrow();
		expect(() => authorize(tech, "updateTelegramWebhookConfig")).not.toThrow();

		expectForbidden(() => authorize(tech, "createUser"));
		expectForbidden(() => authorize(tech, "updateUser"));
		expectForbidden(() => authorize(tech, "deactivateUser"));
	});
});

describe("account lifecycle", () => {
	test("HR can create a user, linking roles, through the injected credential port", async () => {
		const db = freshDatabase("create-user");
		await seedBase(db);
		const hr = context(db, viewer("u-hr", ["HR_MANAGER"], "d1"));

		let credentialCalls = 0;
		const row = await createUser(
			hr,
			{
				userCode: "U-NEW",
				fullName: "New Hire",
				email: "New.Hire@mes.local",
				password: "supersecret",
				departmentId: "d1",
				roleCodes: ["EMPLOYEE"],
			},
			async () => {
				credentialCalls += 1;
			},
		);

		expect(credentialCalls).toBe(1);
		expect(row.email).toBe("new.hire@mes.local");
		const links = await db
			.select()
			.from(userRoles)
			.where(eq(userRoles.userId, row.id));
		expect(links).toHaveLength(1);
		expect(links[0]?.roleId).toBe("role-EMPLOYEE");
	});

	test("deactivating a user soft-deletes them and records before/after audit data", async () => {
		const db = freshDatabase("deactivate");
		await seedBase(db);
		const hr = context(db, viewer("u-hr", ["HR_MANAGER"], "d1"));

		const row = await deactivateUser(hr, "u-target");
		expect(row.isActive).toBe(false);
		expect(row.deletedAt).not.toBeNull();

		const [stored] = await db
			.select()
			.from(user)
			.where(eq(user.id, "u-target"))
			.limit(1);
		expect(stored?.isActive).toBe(false);
		expect(stored?.deletedAt).not.toBeNull();
	});

	test("records an append-only audit event with before and after values", async () => {
		const db = freshDatabase("deactivate-audit");
		await seedBase(db);
		const hr = context(db, viewer("u-hr", ["HR_MANAGER"], "d1"));
		await deactivateUser(hr, "u-target");

		const { systemAuditLogs } = await import("../db/schema");
		const events = await db.select().from(systemAuditLogs);
		const event = events.find((e) => e.action === "user.deactivate");
		expect(event).toBeDefined();
		expect(event?.resourceType).toBe("user");
		expect(event?.resourceId).toBe("u-target");
		expect(event?.moduleCode).toBe("settings");

		const before = JSON.parse(event?.oldData ?? "null");
		const after = JSON.parse(event?.newData ?? "null");
		expect(before?.isActive).toBe(true);
		expect(after?.isActive).toBe(false);
		expect(after?.deletedAt).not.toBeNull();
	});
});

describe("application settings", () => {
	test("never returns an is_secret value through the shape mapper", async () => {
		const db = freshDatabase("secret");
		await seedBase(db);
		const tech = context(db, viewer("u-tech", ["TECH_LEAD"], "d1"));

		const row = await updateAppSetting(tech, {
			moduleCode: "settings",
			key: "smtp_password",
			value: "hunter2",
			isSecret: true,
		});

		// Stored value is present in the row...
		expect(row.value).toBe("hunter2");
		expect(row.isSecret).toBe(true);
		// ...but the contract shape redacts it, and the audit trail does too.
		const shaped = toAppSetting(row);
		expect(shaped.isSecret).toBe(true);
		expect(shaped.value).toBeNull();

		const listed = await listAppSettings(tech, "settings");
		for (const setting of listed) {
			if (setting.isSecret) {
				expect(toAppSetting(setting).value).toBeNull();
			}
		}

		const { systemAuditLogs } = await import("../db/schema");
		const events = await db.select().from(systemAuditLogs);
		const event = events.find((e) => e.action === "app_setting.update");
		expect(event).toBeDefined();
		expect(event?.newData ?? "").not.toContain("hunter2");
		expect(event?.newData ?? "").toContain("[REDACTED]");
	});

	test("updates an existing setting in place (upsert by moduleCode+key)", async () => {
		const db = freshDatabase("upsert");
		await seedBase(db);
		const tech = context(db, viewer("u-tech", ["TECH_LEAD"], "d1"));

		await updateAppSetting(tech, {
			moduleCode: "jobs",
			key: "auto_forking_default",
			value: true,
		});
		const updated = await updateAppSetting(tech, {
			moduleCode: "jobs",
			key: "auto_forking_default",
			value: false,
		});
		expect(updated.value).toBe("false");

		const { appSettings } = await import("../db/schema");
		const rows = await db
			.select()
			.from(appSettings)
			.where(eq(appSettings.key, "auto_forking_default"));
		expect(rows).toHaveLength(1);
	});
});

describe("telegram webhook configuration", () => {
	test("persists the destination and records an audit event", async () => {
		const db = freshDatabase("webhook");
		await seedBase(db);
		const tech = context(db, viewer("u-tech", ["TECH_LEAD"], "d1"));

		const saved = await updateTelegramWebhookConfig(tech, {
			alertGroupChatId: "-1001234567890",
			webhookUrl: "https://api.telegram.org/bot/send",
			isEnabled: true,
		});
		expect(saved.alertGroupChatId).toBe("-1001234567890");
		expect(saved.webhookUrl).toBe("https://api.telegram.org/bot/send");
		expect(saved.isEnabled).toBe(true);

		const { systemAuditLogs } = await import("../db/schema");
		const events = await db.select().from(systemAuditLogs);
		const event = events.find((e) => e.action === "telegram_webhook.update");
		expect(event).toBeDefined();
		expect(event?.moduleCode).toBe("settings");
		const after = JSON.parse(event?.newData ?? "null");
		expect(after?.alertGroupChatId).toBe("-1001234567890");
		expect(after?.isEnabled).toBe(true);
	});
});
