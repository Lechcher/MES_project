/**
 * Index-adequacy guard.
 *
 * Turns the manual `EXPLAIN QUERY PLAN` audit from the baseline into an
 * automated regression guard: each hot read path must use an index
 * (`USING [COVERING] INDEX`), never a full table scan. If a query or a schema
 * change drops or bypasses an index, this fails.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createDatabase } from "./index";
import { runMigrations } from "./migrate";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const dbPath = join(TMP_ROOT, `mes-index-guard-${crypto.randomUUID()}.db`);

runMigrations({ databasePath: dbPath });
const db = createDatabase(dbPath);

afterAll(() => {
	for (const suffix of ["", "-wal", "-shm"]) {
		if (existsSync(`${dbPath}${suffix}`)) rmSync(`${dbPath}${suffix}`);
	}
});

/** Each hot read path the application depends on. */
const HOT_READS: ReadonlyArray<{ label: string; sql: string }> = [
	{
		label: "tasks by assignee",
		sql: "SELECT * FROM tasks WHERE assigned_to = 'x'",
	},
	{
		label: "attendance by user and date",
		sql: "SELECT * FROM attendance_records WHERE user_id = 'x' AND work_date = '2026-10-01'",
	},
	{
		label: "kpi events by user and period",
		sql: "SELECT * FROM kpi_score_events WHERE user_id = 'x' AND period_year = 2026 AND period_month = 10",
	},
	{
		label: "session by token",
		sql: "SELECT * FROM session WHERE token = 'tok'",
	},
];

/** The query plan text for a statement. */
function queryPlan(sql: string): string {
	const rows = db.$client.query(`EXPLAIN QUERY PLAN ${sql}`).all() as {
		detail: string;
	}[];
	return rows.map((row) => row.detail).join(" | ");
}

describe("hot read query plans", () => {
	for (const read of HOT_READS) {
		test(`${read.label} uses an index, not a full scan`, () => {
			const plan = queryPlan(read.sql);
			expect(plan).toMatch(/USING (\w+ )?INDEX/i);
		});
	}
});
