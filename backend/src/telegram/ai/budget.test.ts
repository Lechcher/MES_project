/**
 * Per-user AI budget tests.
 *
 * The budget is the abusive-spend guard, so its properties are exact: a
 * rolling 30-day window (not a calendar month), a persisted counter that
 * survives restarts, a limit of zero meaning unlimited, and refusal that
 * consumes nothing further once the ceiling is reached.
 */

import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { createDatabase, type DatabaseHandle } from "../../db";
import { runMigrations } from "../../db/migrate";
import { telegramAiUsage, user as userTable } from "../../db/schema";
import type { Viewer } from "../../graphql/context";
import { BUDGET_WINDOW_DAYS, consumeBudget } from "./budget";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const dbPath = join(TMP_ROOT, `mes-tg-budget-${crypto.randomUUID()}.db`);

let db: DatabaseHandle;

async function seedUser(id: string): Promise<void> {
	await db.insert(userTable).values({
		id,
		name: id,
		email: `${id}@mes.local`,
		emailVerified: true,
		userCode: `U-${id}`,
	});
}

function viewer(id: string): Viewer {
	return {
		id,
		userCode: `U-${id}`,
		fullName: id,
		email: `${id}@mes.local`,
		departmentId: null,
		isActive: true,
		roleCodes: ["EMPLOYEE"],
	};
}

beforeAll(() => {
	runMigrations({ databasePath: dbPath });
	db = createDatabase(dbPath);
});

afterAll(() => {
	for (const suffix of ["", "-wal", "-shm"]) {
		if (existsSync(`${dbPath}${suffix}`)) rmSync(`${dbPath}${suffix}`);
	}
});

afterEach(async () => {
	await db.delete(telegramAiUsage);
	await db.delete(userTable);
});

describe("consumeBudget", () => {
	test("counts each query and refuses past the ceiling", async () => {
		await seedUser("u1");
		const who = viewer("u1");
		expect((await consumeBudget(db, who, 2)).used).toBe(1);
		expect((await consumeBudget(db, who, 2)).used).toBe(2);

		const third = await consumeBudget(db, who, 2);
		expect(third.allowed).toBe(false);
		expect(third.used).toBe(2);
		// A refused query does not consume more.
		expect((await consumeBudget(db, who, 2)).used).toBe(2);
	});

	test("a limit of zero disables the budget entirely", async () => {
		await seedUser("u2");
		const who = viewer("u2");
		for (let i = 0; i < 5; i += 1) {
			expect((await consumeBudget(db, who, 0, new Date())).allowed).toBe(true);
		}
		const [row] = await db
			.select()
			.from(telegramAiUsage)
			.where(eq(telegramAiUsage.userId, "u2"))
			.limit(1);
		expect(row).toBeUndefined();
	});

	test("the window rolls: an old row resets instead of accumulating", async () => {
		const who = viewer("u3");
		await seedUser("u3");
		const stale = new Date(
			Date.now() - (BUDGET_WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000,
		);
		await db.insert(telegramAiUsage).values({
			userId: "u3",
			windowStart: stale,
			queryCount: 99,
		});

		const outcome = await consumeBudget(db, who, 2);
		expect(outcome.allowed).toBe(true);
		expect(outcome.used).toBe(1);
	});
});
