import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runMigrations } from "./migrate";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const created: string[] = [];

function tempDatabasePath(name: string): string {
	const path = join(TMP_ROOT, `mes-migrate-${name}-${crypto.randomUUID()}.db`);
	created.push(path);
	return path;
}

function tableNames(path: string): string[] {
	const db = new Database(path, { readonly: true });
	try {
		return db
			.query(
				"select name from sqlite_master where type = 'table' order by name",
			)
			.all()
			.map((row) => (row as { name: string }).name);
	} finally {
		db.close();
	}
}

afterAll(() => {
	for (const path of created) {
		for (const suffix of ["", "-wal", "-shm"]) {
			if (existsSync(`${path}${suffix}`)) rmSync(`${path}${suffix}`);
		}
	}
});

describe("runMigrations", () => {
	test("applies the full schema to a clean database", () => {
		const path = tempDatabasePath("clean");
		const result = runMigrations({ databasePath: path });

		expect(result.applied).toBe(true);
		expect(existsSync(path)).toBe(true);

		const tables = tableNames(path);
		// Better Auth tables.
		expect(tables).toContain("user");
		expect(tables).toContain("session");
		expect(tables).toContain("account");
		expect(tables).toContain("verification");
		// MES domain tables.
		expect(tables).toContain("departments");
		expect(tables).toContain("roles");
		expect(tables).toContain("permissions");
		expect(tables).toContain("role_permissions");
		expect(tables).toContain("user_roles");
		expect(tables).toContain("ticket_states");
		expect(tables).toContain("leave_codes");
		expect(tables).toContain("modules");
		expect(tables).toContain("tasks");
		expect(tables).toContain("task_state_transitions");
		expect(tables).toContain("task_progress_logs");
		expect(tables).toContain("task_requests");
		expect(tables).toContain("attachments");
		expect(tables).toContain("leave_requests");
		expect(tables).toContain("attendance_records");
		expect(tables).toContain("leave_balance_entries");
		expect(tables).toContain("overtime_records");
		expect(tables).toContain("kpi_point_rules");
		expect(tables).toContain("kpi_score_events");
		expect(tables).toContain("kpi_monthly_summaries");
		expect(tables).toContain("system_audit_logs");
		expect(tables).toContain("app_settings");
		expect(tables).toContain("telegram_webhook_config");
		expect(tables).toContain("notifications");
		expect(tables).toContain("export_artifacts");
	});

	test("is repeatable: applying twice changes nothing", () => {
		const path = tempDatabasePath("repeat");

		runMigrations({ databasePath: path });
		const first = tableNames(path);
		const firstIndexCount = countIndexes(path);

		expect(() => runMigrations({ databasePath: path })).not.toThrow();

		expect(tableNames(path)).toEqual(first);
		expect(countIndexes(path)).toBe(firstIndexCount);
	});

	test("leaves no foreign key violations and enforces foreign keys", () => {
		const path = tempDatabasePath("keys");
		runMigrations({ databasePath: path });

		const db = new Database(path, { readonly: true });
		try {
			const violations = db.query("pragma foreign_key_check").all();
			expect(violations).toHaveLength(0);
		} finally {
			db.close();
		}
	});

	test("enforces the code constraints", () => {
		const path = tempDatabasePath("checks");
		runMigrations({ databasePath: path });

		const db = new Database(path);
		try {
			db.exec("pragma foreign_keys = ON;");
			expect(() =>
				db
					.query(
						"insert into ticket_states (code, name, color) values ('BOGUS', 'x', 'y')",
					)
					.run(),
			).toThrow();

			expect(() =>
				db
					.query(
						"insert into leave_codes (code, name, category, payroll_rule) values ('ZZ', 'x', 'PAID', 'r')",
					)
					.run(),
			).toThrow();
		} finally {
			db.close();
		}
	});

	test("fails with an actionable message when migrations are missing", () => {
		expect(() =>
			runMigrations({
				databasePath: tempDatabasePath("missing"),
				migrationsFolder: join(TMP_ROOT, "definitely-not-here"),
			}),
		).toThrow(/Migrations folder not found/);
	});
});

function countIndexes(path: string): number {
	const db = new Database(path, { readonly: true });
	try {
		const row = db
			.query("select count(*) as count from sqlite_master where type = 'index'")
			.get() as { count: number };
		return row.count;
	} finally {
		db.close();
	}
}
