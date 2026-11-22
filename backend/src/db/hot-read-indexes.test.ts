/**
 * Index-adequacy guard.
 *
 * Turns the manual `EXPLAIN` audit from the baseline into an automated
 * regression guard: the schema must declare an index for each hot read path,
 * and PostgreSQL must be able to answer each of those reads with an index
 * scan rather than a sequential scan. If a query or a schema change drops or
 * bypasses an index, this fails.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestDatabase, type TestDatabase } from "./test-db";

let testDb: TestDatabase;

afterAll(async () => {
	await testDb?.close();
});

beforeAll(async () => {
	testDb = await createTestDatabase();

	// A handful of rows per table so the planner has statistics to work with
	// (an empty table is always read with a sequential scan, index or not).
	const db = testDb.db;
	await db.$client.query("set enable_seqscan = off");
	// The score events reference a rule, so the registry row must exist first.
	await db.$client.query(
		`insert into kpi_point_rules (code, event, points, sort_order)
		 values ('KPI_ON_TIME_TICKET', 'on-time completion', 10, 1)`,
	);
	for (let index = 0; index < 20; index += 1) {
		await db.$client.query(
			`insert into departments (id, code, name, department_type)
			 values ($1, $2, $3, 'DEPARTMENT')`,
			[`dept-${index}`, `D${index}`, `Department ${index}`],
		);
		await db.$client.query(
			`insert into "user" (id, name, email, user_code, department_id, is_active, email_verified)
			 values ($1, $2, $3, $4, $5, true, true)`,
			[
				`user-${index}`,
				`User ${index}`,
				`user${index}@example.test`,
				`U-${index}`,
				`dept-${index}`,
			],
		);
		await db.$client.query(
			`insert into tasks (id, task_code, title, assigned_to, department_id, state)
			 values ($1, $2, $3, $4, $5, 'REQ')`,
			[
				`task-${index}`,
				`T-${index}`,
				`Task ${index}`,
				`user-${index}`,
				`dept-${index}`,
			],
		);
		await db.$client.query(
			`insert into attendance_records (id, user_id, work_date)
			 values ($1, $2, '2026-10-01')`,
			[`att-${index}`, `user-${index}`],
		);
		await db.$client.query(
			`insert into kpi_score_events (id, user_id, rule_code, points, period_year, period_month, occurred_at)
			 values ($1, $2, 'KPI_ON_TIME_TICKET', 10, 2026, 10, now())`,
			[`kpi-${index}`, `user-${index}`],
		);
		await db.$client.query(
			`insert into session (id, token, user_id, expires_at, created_at, updated_at)
			 values ($1, $2, $3, now() + interval '1 hour', now(), now())`,
			[`sess-${index}`, `tok-${index}`, `user-${index}`],
		);
	}
});

/** Each hot read path the application depends on. */
const HOT_READS: ReadonlyArray<{ label: string; sql: string }> = [
	{
		label: "tasks by assignee",
		sql: "SELECT * FROM tasks WHERE assigned_to = 'user-1'",
	},
	{
		label: "attendance by user and date",
		sql: "SELECT * FROM attendance_records WHERE user_id = 'user-1' AND work_date = '2026-10-01'",
	},
	{
		label: "kpi events by user and period",
		sql: "SELECT * FROM kpi_score_events WHERE user_id = 'user-1' AND period_year = 2026 AND period_month = 10",
	},
	{
		label: "session by token",
		sql: "SELECT * FROM session WHERE token = 'tok-1'",
	},
];

/** The query plan text for a statement. */
async function queryPlan(sql: string): Promise<string> {
	const result = await testDb.db.$client.query(`EXPLAIN ${sql}`);
	return result.rows
		.map((row) => (row as { "QUERY PLAN": string })["QUERY PLAN"])
		.join(" | ");
}

describe("hot read query plans", () => {
	for (const read of HOT_READS) {
		test(`${read.label} uses an index, not a full scan`, async () => {
			const plan = await queryPlan(read.sql);
			expect(plan).toMatch(/Index.*Scan|Bitmap Index Scan/i);
			expect(plan).not.toMatch(/Seq Scan/i);
		});
	}

	test("the schema declares the supporting indexes", async () => {
		const result = await testDb.db.$client.query(
			`select indexname from pg_indexes where schemaname = 'public'`,
		);
		const names = new Set(
			result.rows.map((row) => (row as { indexname: string }).indexname),
		);
		expect(names.has("idx_tasks_assigned")).toBe(true);
		expect(names.has("uq_attendance_user_date")).toBe(true);
		expect(names.has("idx_kpi_events_user_period")).toBe(true);
	});
});
