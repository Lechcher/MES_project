/**
 * Audit Log app domain tests.
 *
 * Prove the append-only read surface: newest-first ordering, module filtering
 * and per-module summaries, the absence of any edit/delete operation, the
 * technical-only access rule, and a real filtered export.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { loadConfig } from "../config";
import { createDatabase, type DatabaseHandle } from "../db";
import type { RoleCode } from "../db/enums";
import { runMigrations } from "../db/migrate";
import { modules, roles, systemAuditLogs, user, userRoles } from "../db/schema";
import { authorize } from "../graphql/access";
import {
	createContext,
	type Viewer,
	type ViewerContext,
} from "../graphql/context";
import { auditLogMutation } from "../graphql/resolvers/audit-log";
import { listAuditLogs, moduleActivity } from "./audit-log";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const createdPaths: string[] = [];
const exportDirs: string[] = [];

afterAll(() => {
	for (const path of createdPaths) {
		for (const suffix of ["", "-wal", "-shm"]) {
			if (existsSync(`${path}${suffix}`)) rmSync(`${path}${suffix}`);
		}
	}
	for (const dir of exportDirs) {
		if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
	}
});

function freshDatabase(name: string): DatabaseHandle {
	const path = join(TMP_ROOT, `mes-audit-${name}-${crypto.randomUUID()}.db`);
	createdPaths.push(path);
	runMigrations({ databasePath: path });
	return createDatabase(path);
}

function context(
	db: DatabaseHandle,
	who: Viewer,
	exportDir?: string,
): ViewerContext {
	return createContext({
		db,
		config: loadConfig({
			NODE_ENV: "test",
			...(exportDir ? { MES_EXPORT_DIR: exportDir } : {}),
		}),
		request: { ipAddress: "10.0.0.2", userAgent: "bun-test" },
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

async function seedBase(db: DatabaseHandle) {
	await db.insert(modules).values([
		{ code: "jobs", name: "Jobs & Projects", sortOrder: 1 },
		{ code: "planning", name: "Planning & Attendance", sortOrder: 2 },
		{ code: "performance", name: "Performance & Audit", sortOrder: 3 },
		{ code: "settings", name: "Settings & IAM", sortOrder: 4 },
		{ code: "audit-log", name: "Audit Log", sortOrder: 5 },
	]);
	await db
		.insert(roles)
		.values({ id: "role-EMPLOYEE", code: "EMPLOYEE", name: "EMPLOYEE" });
	await db
		.insert(roles)
		.values({ id: "role-HR_MANAGER", code: "HR_MANAGER", name: "HR_MANAGER" });
	await db
		.insert(roles)
		.values({ id: "role-TECH_LEAD", code: "TECH_LEAD", name: "TECH_LEAD" });
	for (const [id, roleId] of [
		["u-emp", "role-EMPLOYEE"],
		["u-hr", "role-HR_MANAGER"],
		["u-tech", "role-TECH_LEAD"],
	] as const) {
		await db.insert(user).values({
			id,
			name: `User ${id}`,
			email: `${id}@mes.local`,
			userCode: `U-${id}`,
		});
		await db.insert(userRoles).values({ id: `ur-${id}`, userId: id, roleId });
	}
}

async function seedEvent(
	db: DatabaseHandle,
	input: {
		id: string;
		moduleCode: string | null;
		action: string;
		createdAt: string;
		resourceType?: string;
	},
) {
	await db.insert(systemAuditLogs).values({
		id: input.id,
		moduleCode: input.moduleCode,
		action: input.action,
		resourceType: input.resourceType ?? "task",
		resourceId: input.id,
		userId: "u-emp",
		createdAt: new Date(input.createdAt),
	});
}

describe("append-only read surface", () => {
	test("returns events newest first", async () => {
		const db = freshDatabase("order");
		await seedBase(db);
		await seedEvent(db, {
			id: "e1",
			moduleCode: "jobs",
			action: "task.create",
			createdAt: "2026-01-01T08:00:00.000Z",
		});
		await seedEvent(db, {
			id: "e2",
			moduleCode: "planning",
			action: "leave.register",
			createdAt: "2026-01-03T08:00:00.000Z",
		});
		await seedEvent(db, {
			id: "e3",
			moduleCode: "jobs",
			action: "task.approve",
			createdAt: "2026-01-02T08:00:00.000Z",
		});

		const tech = context(db, viewer("u-tech", ["TECH_LEAD"]));
		const page = await listAuditLogs(tech, { offset: 0, limit: 10 });
		expect(page.totalCount).toBe(3);
		expect(page.nodes.map((n) => n.id)).toEqual(["e2", "e3", "e1"]);
	});

	test("module filtering returns only that module and its summary reflects the period", async () => {
		const db = freshDatabase("module");
		await seedBase(db);
		await seedEvent(db, {
			id: "p1",
			moduleCode: "planning",
			action: "leave.register",
			createdAt: "2026-01-01T08:00:00.000Z",
		});
		await seedEvent(db, {
			id: "p2",
			moduleCode: "planning",
			action: "leave.approve",
			createdAt: "2026-01-15T08:00:00.000Z",
		});
		await seedEvent(db, {
			id: "j1",
			moduleCode: "jobs",
			action: "task.create",
			createdAt: "2026-01-10T08:00:00.000Z",
		});
		await seedEvent(db, {
			id: "n1",
			moduleCode: null,
			action: "system.migrate",
			createdAt: "2026-01-12T08:00:00.000Z",
		});

		const tech = context(db, viewer("u-tech", ["TECH_LEAD"]));
		const filter = {
			moduleCode: "planning",
			fromDate: new Date("2026-01-05T00:00:00.000Z"),
			toDate: new Date("2026-01-31T00:00:00.000Z"),
		};

		const page = await listAuditLogs(tech, { filter, offset: 0, limit: 10 });
		expect(page.nodes.map((n) => n.id)).toEqual(["p2"]);

		const summary = await moduleActivity(tech, filter);
		expect(summary).toHaveLength(1);
		expect(summary[0]?.moduleCode).toBe("planning");
		expect(summary[0]?.moduleName).toBe("Planning & Attendance");
		expect(summary[0]?.eventCount).toBe(1);
		expect(summary[0]?.lastActivityAt?.toISOString()).toBe(
			"2026-01-15T08:00:00.000Z",
		);

		const jobsSummary = await moduleActivity(tech, { moduleCode: "jobs" });
		expect(jobsSummary).toHaveLength(1);
		expect(jobsSummary[0]?.eventCount).toBe(1);
	});

	test("exposes no mutation that edits or deletes a recorded event", () => {
		expect(Object.keys(auditLogMutation)).toEqual(["exportAuditLogs"]);
	});
});

describe("audit log access", () => {
	test("denies EMPLOYEE and HR_MANAGER every audit operation", () => {
		const db = freshDatabase("access");
		const employee = context(db, viewer("u-emp", ["EMPLOYEE"]));
		const hr = context(db, viewer("u-hr", ["HR_MANAGER"]));

		for (const who of [employee, hr]) {
			expectForbidden(() => authorize(who, "auditLogs"));
			expectForbidden(() => authorize(who, "moduleActivity"));
			expectForbidden(() => authorize(who, "exportAuditLogs"));
		}
	});
});

describe("export", () => {
	test("generates a real CSV of exactly the filtered events and records the artifact", async () => {
		const db = freshDatabase("export");
		await seedBase(db);
		await seedEvent(db, {
			id: "p1",
			moduleCode: "planning",
			action: "leave.register",
			createdAt: "2026-01-01T08:00:00.000Z",
		});
		await seedEvent(db, {
			id: "j1",
			moduleCode: "jobs",
			action: "task.create",
			createdAt: "2026-01-02T08:00:00.000Z",
		});

		const exportDir = join(TMP_ROOT, `mes-audit-export-${crypto.randomUUID()}`);
		exportDirs.push(exportDir);
		const tech = context(db, viewer("u-tech", ["TECH_LEAD"]), exportDir);

		const result = (await auditLogMutation.exportAuditLogs(
			null,
			{ filter: { moduleCode: "planning" }, format: "CSV" },
			{ ctx: tech },
			undefined,
		)) as {
			id: string;
			fileName: string;
			format: string;
			url: string;
		};

		expect(result.format).toBe("CSV");
		expect(result.url).toBe(`/api/v1/exports/${result.id}`);

		const contents = readFileSync(join(exportDir, result.fileName), "utf8");
		expect(contents).toContain("leave.register");
		expect(contents).not.toContain("task.create");

		const { exportArtifacts } = await import("../db/schema");
		const [artifact] = await db
			.select()
			.from(exportArtifacts)
			.where(eq(exportArtifacts.id, result.id))
			.limit(1);
		expect(artifact?.fileName).toBe(result.fileName);

		// The audit trail itself is unchanged: still exactly the two seeded events.
		const page = await listAuditLogs(tech, { offset: 0, limit: 10 });
		expect(page.totalCount).toBe(2);
	});

	test("supports an XLSX export", async () => {
		const db = freshDatabase("export-xlsx");
		await seedBase(db);
		await seedEvent(db, {
			id: "s1",
			moduleCode: "settings",
			action: "user.update",
			createdAt: "2026-01-01T08:00:00.000Z",
		});
		const exportDir = join(TMP_ROOT, `mes-audit-xlsx-${crypto.randomUUID()}`);
		exportDirs.push(exportDir);
		const tech = context(db, viewer("u-tech", ["TECH_LEAD"]), exportDir);

		const result = (await auditLogMutation.exportAuditLogs(
			null,
			{ format: "XLSX" },
			{ ctx: tech },
			undefined,
		)) as { id: string; fileName: string; format: string };

		expect(result.format).toBe("XLSX");
		const bytes = readFileSync(join(exportDir, result.fileName));
		// XLSX is a ZIP container: starts with the PK signature.
		expect(bytes[0]).toBe(0x50);
		expect(bytes[1]).toBe(0x4b);
	});
});
