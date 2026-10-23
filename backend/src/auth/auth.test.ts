/**
 * Authentication and session lifecycle.
 *
 * Exercises the MES auth surface end to end against Better Auth: account
 * creation, sign-in, session resolution over the contract's bearer token,
 * expiry, sign-out, password change, administrative reset, and deactivation.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { type AppConfig, loadConfig } from "../config";
import { createDatabase, type DatabaseHandle } from "../db";
import { runMigrations } from "../db/migrate";
import { departments, roles, user, userRoles } from "../db/schema";
import {
	type Auth,
	createAuth,
	loadViewer,
	resolveSession,
	setUserPassword,
	signIn,
	signOut,
} from "./index";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const dbPath = join(TMP_ROOT, `mes-auth-${crypto.randomUUID()}.db`);

const PASSWORD = "dev-password-2026!";
const NEW_PASSWORD = "changed-password-2026!";

let db: DatabaseHandle;
let auth: Auth;
let config: AppConfig;
let departmentId: string;

async function createAccount(
	email: string,
	options: { roleCode?: string | null; isActive?: boolean } = {},
): Promise<string> {
	const result = await auth.api.signUpEmail({
		body: { email, password: PASSWORD, name: `User ${email}` },
	});
	const userId = result.user.id;

	if (options.roleCode !== null) {
		const [role] = await db
			.select()
			.from(roles)
			.where(eq(roles.code, options.roleCode ?? "EMPLOYEE"))
			.limit(1);
		if (role) {
			await db.insert(userRoles).values({
				id: crypto.randomUUID(),
				userId,
				roleId: role.id,
			});
		}
	}

	await db
		.update(user)
		.set({
			departmentId,
			...(options.isActive === false ? { isActive: false } : {}),
		})
		.where(eq(user.id, userId));

	return userId;
}

beforeAll(async () => {
	runMigrations({ databasePath: dbPath });
	config = loadConfig({ NODE_ENV: "test", MES_DATABASE_PATH: dbPath });
	db = createDatabase(dbPath);
	auth = createAuth(db, config);

	departmentId = crypto.randomUUID();
	await db.insert(departments).values({
		id: departmentId,
		code: "ENG",
		name: "Engineering",
	});
	await db.insert(roles).values({
		id: crypto.randomUUID(),
		code: "EMPLOYEE",
		name: "Employee",
	});
});

afterAll(() => {
	for (const suffix of ["", "-wal", "-shm"]) {
		const path = `${dbPath}${suffix}`;
		if (existsSync(path)) rmSync(path);
	}
});

describe("account creation", () => {
	test("creates a credential account and generates a user code", async () => {
		const userId = await createAccount("created@example.test");
		const [row] = await db.select().from(user).where(eq(user.id, userId));

		expect(row).toBeDefined();
		expect(row.isActive).toBe(true);
		expect(row.userCode).toMatch(/^U-\d{4}$/);
		expect(row.departmentId).toBe(departmentId);
	});

	test("loads a viewer with the account's role", async () => {
		const userId = await createAccount("viewer@example.test", {
			roleCode: "EMPLOYEE",
		});
		const viewer = await loadViewer(db, userId);

		expect(viewer).not.toBeNull();
		expect(viewer?.fullName).toBe("User viewer@example.test");
		expect(viewer?.departmentId).toBe(departmentId);
		expect(viewer?.roleCodes).toEqual(["EMPLOYEE"]);
	});

	test("returns null for a missing account", async () => {
		expect(await loadViewer(db, crypto.randomUUID())).toBeNull();
	});
});

describe("sign-in and session resolution", () => {
	test("issues a token that resolves to the viewer", async () => {
		const email = "signin@example.test";
		await createAccount(email, { roleCode: "EMPLOYEE" });

		const result = await signIn(auth, db, { email, password: PASSWORD });
		expect(result.token.length).toBeGreaterThan(0);
		expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
		expect(result.viewer.email).toBe(email);

		const resolved = await resolveSession(db, result.token);
		expect(resolved?.viewer.id).toBe(result.viewer.id);
		expect(resolved?.viewer.roleCodes).toEqual(["EMPLOYEE"]);
		expect(resolved?.session.token).toBe(result.token);
	});

	test("rejects a wrong password with UNAUTHENTICATED", async () => {
		const email = "wrongpass@example.test";
		await createAccount(email);

		await expect(
			signIn(auth, db, { email, password: "not-the-password" }),
		).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
	});

	test("rejects an unknown email with UNAUTHENTICATED", async () => {
		await expect(
			signIn(auth, db, { email: "nobody@example.test", password: PASSWORD }),
		).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
	});

	test("returns null for an unknown token", async () => {
		expect(await resolveSession(db, "unknown-token")).toBeNull();
	});

	test("returns null for an expired session", async () => {
		const email = "expired@example.test";
		const userId = await createAccount(email);
		const { session } = await import("../db/schema");

		const token = `expired-${crypto.randomUUID()}`;
		await db.insert(session).values({
			id: crypto.randomUUID(),
			token,
			userId,
			expiresAt: new Date(Date.now() - 1000),
			createdAt: new Date(Date.now() - 2000),
			updatedAt: new Date(Date.now() - 2000),
			ipAddress: null,
			userAgent: null,
		});

		expect(await resolveSession(db, token)).toBeNull();
	});

	test("refuses a deactivated account", async () => {
		const email = "deactivated@example.test";
		await createAccount(email, { isActive: false });

		await expect(
			signIn(auth, db, { email, password: PASSWORD }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

describe("sign out", () => {
	test("ends the session so the token no longer resolves", async () => {
		const email = "signout@example.test";
		await createAccount(email, { roleCode: "EMPLOYEE" });

		const { token } = await signIn(auth, db, { email, password: PASSWORD });
		expect(await resolveSession(db, token)).not.toBeNull();

		const headers = new Headers({ authorization: `Bearer ${token}` });
		expect(await signOut(auth, headers)).toBe(true);

		expect(await resolveSession(db, token)).toBeNull();
	});
});

describe("password change", () => {
	test("replaces the credential so only the new password signs in", async () => {
		const email = "change@example.test";
		await createAccount(email, { roleCode: "EMPLOYEE" });

		const { token } = await signIn(auth, db, { email, password: PASSWORD });
		const { changePassword } = await import("./index");

		const headers = new Headers({ authorization: `Bearer ${token}` });
		expect(
			await changePassword(auth, headers, {
				currentPassword: PASSWORD,
				newPassword: NEW_PASSWORD,
			}),
		).toBe(true);

		const reissued = await signIn(auth, db, {
			email,
			password: NEW_PASSWORD,
		});
		expect(reissued.token.length).toBeGreaterThan(0);

		await expect(
			signIn(auth, db, { email, password: PASSWORD }),
		).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
	});

	test("rejects a change with the wrong current password", async () => {
		const email = "change-reject@example.test";
		await createAccount(email);

		const { token } = await signIn(auth, db, { email, password: PASSWORD });
		const { changePassword } = await import("./index");
		const headers = new Headers({ authorization: `Bearer ${token}` });

		await expect(
			changePassword(auth, headers, {
				currentPassword: "wrong-current",
				newPassword: NEW_PASSWORD,
			}),
		).rejects.toBeDefined();
	});
});

describe("administrative password reset", () => {
	test("lets an administrator set a new password", async () => {
		const email = "admin-reset@example.test";
		const userId = await createAccount(email, { roleCode: "EMPLOYEE" });

		await setUserPassword(db, { userId, newPassword: NEW_PASSWORD });

		const result = await signIn(auth, db, {
			email,
			password: NEW_PASSWORD,
		});
		expect(result.viewer.id).toBe(userId);
	});

	test("rejects a password that is too short", async () => {
		const userId = await createAccount("short@example.test");
		await expect(
			setUserPassword(db, { userId, newPassword: "short" }),
		).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
	});

	test("reports NOT_FOUND for an account without a credential", async () => {
		const orphanId = crypto.randomUUID();
		await db.insert(user).values({
			id: orphanId,
			name: "Orphan",
			email: `orphan-${orphanId}@example.test`,
			userCode: `OR-${orphanId.slice(0, 6)}`,
			isActive: true,
			emailVerified: true,
		});

		await expect(
			setUserPassword(db, { userId: orphanId, newPassword: NEW_PASSWORD }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});
