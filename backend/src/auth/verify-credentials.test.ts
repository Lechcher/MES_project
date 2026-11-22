/**
 * Credential verification without a session.
 *
 * The bot's `/login` fallback needs the same check the web sign-in performs,
 * resolved to the viewer — with no session created (the Telegram link *is*
 * the session on that surface). The generic-failure property is the security
 * one: unknown identifier, wrong password, and deactivated account all look
 * alike to the caller.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { type AppConfig, loadConfig } from "../config";
import type { DatabaseHandle } from "../db";
import { departments, user } from "../db/schema";
import { createTestDatabase, type TestDatabase } from "../db/test-db";
import { type Auth, createAuth, verifyCredentials } from "./index";

let testDb: TestDatabase;

const PASSWORD = "dev-password-2026!";

let db: DatabaseHandle;
let auth: Auth;
let config: AppConfig;
let departmentId: string;

beforeAll(async () => {
	testDb = await createTestDatabase();
	db = testDb.db;
	config = loadConfig({
		NODE_ENV: "test",
		MES_DATABASE_URL: testDb.connectionString,
	});
	auth = createAuth(db, config);

	departmentId = crypto.randomUUID();
	await db.insert(departments).values({
		id: departmentId,
		code: "HQ",
		name: "Headquarters",
	});

	await auth.api.signUpEmail({
		body: { email: "known@mes.local", password: PASSWORD, name: "Known User" },
	});
	const [known] = await db
		.select()
		.from(user)
		.where(eq(user.email, "known@mes.local"))
		.limit(1);
	await db
		.update(user)
		.set({ departmentId, userCode: "V0000123" })
		.where(eq(user.id, known.id));

	await auth.api.signUpEmail({
		body: { email: "off@mes.local", password: PASSWORD, name: "Off User" },
	});
	const [off] = await db
		.select()
		.from(user)
		.where(eq(user.email, "off@mes.local"))
		.limit(1);
	await db
		.update(user)
		.set({ departmentId, userCode: "V0000456", isActive: false })
		.where(eq(user.id, off.id));
});

afterAll(async () => {
	await testDb.close();
});

describe("verifyCredentials", () => {
	test("resolves a viewer for valid credentials, by email", async () => {
		const viewer = await verifyCredentials(db, "known@mes.local", PASSWORD);
		expect(viewer?.email).toBe("known@mes.local");
		expect(viewer?.userCode).toBe("V0000123");
	});

	test("resolves a viewer for valid credentials, by user code", async () => {
		const viewer = await verifyCredentials(db, "V0000123", PASSWORD);
		expect(viewer?.email).toBe("known@mes.local");
	});

	test("fails alike for unknown identifier and wrong password", async () => {
		const unknown = await verifyCredentials(db, "nobody@mes.local", PASSWORD);
		const wrong = await verifyCredentials(db, "known@mes.local", "wrong");
		const unknownCode = await verifyCredentials(db, "V9999999", PASSWORD);
		expect(unknown).toBeNull();
		expect(wrong).toBeNull();
		expect(unknownCode).toBeNull();
	});

	test("refuses a deactivated account", async () => {
		const viewer = await verifyCredentials(db, "off@mes.local", PASSWORD);
		expect(viewer).toBeNull();
	});

	test("refuses empty input without touching the database", async () => {
		expect(await verifyCredentials(db, "", PASSWORD)).toBeNull();
		expect(await verifyCredentials(db, "known@mes.local", "")).toBeNull();
	});

	test("creates no session — the link is the session", async () => {
		const { session } = await import("../db/schema");
		const before = (await db.select().from(session)).length;
		await verifyCredentials(db, "known@mes.local", PASSWORD);
		expect((await db.select().from(session)).length).toBe(before);
	});
});
