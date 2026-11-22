/**
 * Session pruning tests (bounded storage growth).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { DatabaseHandle } from "./index";
import { pruneExpiredSessions } from "./maintenance";
import { departments, session, user } from "./schema";
import { createTestDatabase, type TestDatabase } from "./test-db";

let testDb: TestDatabase;

let db: DatabaseHandle;
const departmentId = crypto.randomUUID();
const userId = crypto.randomUUID();
const activeToken = "token-active";
const expiredToken = "token-expired";

afterAll(async () => {
	await testDb.close();
});

beforeAll(async () => {
	testDb = await createTestDatabase();
	db = testDb.db;
	await db.insert(departments).values({
		id: departmentId,
		code: "ENG",
		name: "Engineering",
	});
	await db.insert(user).values({
		id: userId,
		name: "Tester",
		email: "tester@example.test",
		userCode: "T-0001",
		departmentId,
		isActive: true,
		emailVerified: true,
	});
	await db.insert(session).values([
		{
			id: crypto.randomUUID(),
			token: activeToken,
			userId,
			expiresAt: new Date(Date.now() + 60 * 60 * 1000),
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: crypto.randomUUID(),
			token: expiredToken,
			userId,
			expiresAt: new Date(Date.now() - 60 * 60 * 1000),
			createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
			updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
		},
	]);
});

describe("pruneExpiredSessions", () => {
	test("removes only expired sessions and keeps active ones", async () => {
		await pruneExpiredSessions(db);

		const active = await db
			.select()
			.from(session)
			.where(eq(session.token, activeToken));
		const expired = await db
			.select()
			.from(session)
			.where(eq(session.token, expiredToken));

		expect(active).toHaveLength(1);
		expect(expired).toHaveLength(0);
	});

	test("is idempotent", async () => {
		await pruneExpiredSessions(db);
		const remaining = await db
			.select()
			.from(session)
			.where(eq(session.userId, userId));
		expect(remaining).toHaveLength(1);
	});
});
