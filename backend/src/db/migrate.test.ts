import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_MIGRATIONS_FOLDER, runMigrations } from "./migrate";
import { createTestDatabase, type TestDatabase } from "./test-db";

const TMP_ROOT = join(tmpdir(), "mes-migrate-tests");
const created: string[] = [];

let testDb: TestDatabase;

function _tempFolder(name: string): string {
	const path = join(TMP_ROOT, `${name}-${crypto.randomUUID()}`);
	created.push(path);
	return path;
}

/** Public table names in the migrated database, sorted. */
async function tableNames(db: TestDatabase): Promise<string[]> {
	const rows = await db.db.$client.query(
		`select table_name from information_schema.tables
		 where table_schema = 'public' order by table_name`,
	);
	return rows.rows.map((row) => (row as { table_name: string }).table_name);
}

beforeAll(async () => {
	mkdirSync(TMP_ROOT, { recursive: true });
	testDb = await createTestDatabase();
});

afterAll(async () => {
	await testDb?.close();
	for (const path of created) {
		rmSync(path, { recursive: true, force: true });
	}
});

describe("runMigrations", () => {
	test("applies the full schema to a clean database", async () => {
		const tables = await tableNames(testDb);
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
		expect(tables).toContain("task_completion_requests");
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
		expect(tables).toContain("telegram_bot_settings");
		expect(tables).toContain("telegram_links");
		expect(tables).toContain("telegram_link_codes");
		expect(tables).toContain("telegram_ai_models");
		expect(tables).toContain("telegram_ai_usage");
		expect(tables).toContain("telegram_user_prefs");
		expect(tables).toContain("telegram_accounts");
		expect(tables).toContain("notifications");
		expect(tables).toContain("export_artifacts");
	});

	test("is repeatable: applying twice changes nothing", async () => {
		const before = await tableNames(testDb);
		const indexCountBefore = await testDb.db.$client.query(
			`select count(*)::int as count from pg_indexes where schemaname = 'public'`,
		);

		const result = await runMigrations({
			databaseUrl: testDb.connectionString,
		});

		expect(result.applied).toBe(true);
		expect(await tableNames(testDb)).toEqual(before);
		const indexCountAfter = await testDb.db.$client.query(
			`select count(*)::int as count from pg_indexes where schemaname = 'public'`,
		);
		expect(indexCountAfter.rows[0]).toEqual(indexCountBefore.rows[0]);
	});

	test("enforces foreign keys", async () => {
		// A task pointing at a missing project must be rejected by the
		// database, not only by application validation.
		await expect(
			testDb.db.$client.query(
				`insert into tasks (id, task_code, title, project_id)
				 values ('fk-probe', 'FK-001', 'FK probe', 'no-such-project')`,
			),
		).rejects.toThrow();
	});

	test("enforces the code constraints", async () => {
		await expect(
			testDb.db.$client.query(
				`insert into ticket_states (code, name, color)
				 values ('BOGUS', 'x', 'y')`,
			),
		).rejects.toThrow();

		await expect(
			testDb.db.$client.query(
				`insert into leave_codes (code, name, category, payroll_rule)
				 values ('ZZ', 'x', 'PAID', 'r')`,
			),
		).rejects.toThrow();
	});

	test("enforces the telegram account constraints", async () => {
		// A linked-account row belongs to exactly one viewer and one Telegram
		// identity: the database rejects a duplicate pair and a row whose user
		// does not exist, and deleting the viewer takes the row with it.
		// `first_name` is required by the module's contract (String!), so the
		// probes carry it.
		await testDb.db.$client.query(
			`insert into "user" (id, name, email, user_code)
			 values ('tg-user', 'TG User', 'tg@example.com', 'V9999999')`,
		);
		await testDb.db.$client.query(
			`insert into telegram_accounts
			   (id, user_id, telegram_user_id, first_name, encrypted_session, session_iv, session_auth_tag)
			 values ('tg-1', 'tg-user', '1001', 'TG One', 'cipher', 'iv', 'tag')`,
		);
		await expect(
			testDb.db.$client.query(
				`insert into telegram_accounts
				   (id, user_id, telegram_user_id, first_name, encrypted_session, session_iv, session_auth_tag)
				 values ('tg-2', 'tg-user', '1001', 'TG One', 'cipher2', 'iv2', 'tag2')`,
			),
		).rejects.toThrow();
		await expect(
			testDb.db.$client.query(
				`insert into telegram_accounts
				   (id, user_id, telegram_user_id, first_name, encrypted_session, session_iv, session_auth_tag)
				 values ('tg-3', 'no-such-user', '1002', 'TG Nope', 'cipher', 'iv', 'tag')`,
			),
		).rejects.toThrow();

		await testDb.db.$client.query(`delete from "user" where id = 'tg-user'`);
		const remaining = await testDb.db.$client.query(
			`select count(*)::int as count from telegram_accounts where user_id = 'tg-user'`,
		);
		expect(remaining.rows[0]).toEqual({ count: 0 });
	});

	test("fails with an actionable message when migrations are missing", async () => {
		await expect(
			runMigrations({
				databaseUrl: testDb.connectionString,
				migrationsFolder: join(TMP_ROOT, "definitely-not-here"),
			}),
		).rejects.toThrow(/Migrations folder not found/);
	});
});

/* ------------------------------------------------------------------ */
/* Migration set integrity                                              */
/* ------------------------------------------------------------------ */

interface JournalEntry {
	idx: number;
	tag: string;
	when: number;
}

interface Journal {
	entries: JournalEntry[];
}

async function readJournal(folder: string): Promise<Journal> {
	const text = await Bun.file(join(folder, "meta", "_journal.json")).text();
	return JSON.parse(text) as Journal;
}

/**
 * Every way the migration set can be inconsistent with itself.
 *
 * The runner reads each entry's `<tag>.sql` and decides whether to apply an
 * entry by comparing its `when` against the newest recorded application — so a
 * missing file, an unjournaled file, a duplicate tag, or a timestamp that does
 * not increase each break the apply in a way that only shows up at boot.
 * Snapshots are deliberately not checked: hand-maintained entries carry no
 * snapshot, and drizzle only needs one to generate the *next* diff.
 */
function setProblems(folder: string, journal: Journal): string[] {
	const problems: string[] = [];
	const tags = journal.entries.map((entry) => entry.tag);

	if (new Set(tags).size !== tags.length) {
		problems.push("duplicate journal tags");
	}

	for (let index = 1; index < journal.entries.length; index += 1) {
		const previous = journal.entries[index - 1];
		const current = journal.entries[index];
		if (!(current.when > previous.when)) {
			problems.push(
				`journal timestamps do not increase at ${current.tag} (${previous.tag} → ${current.tag})`,
			);
		}
	}

	for (const tag of tags) {
		if (!existsSync(join(folder, `${tag}.sql`))) {
			problems.push(`journal entry without its file: ${tag}`);
		}
	}

	for (const file of readdirSync(folder).filter((name) =>
		name.endsWith(".sql"),
	)) {
		const tag = file.replace(/\.sql$/, "");
		if (!tags.includes(tag)) {
			problems.push(`file without its journal entry: ${tag}`);
		}
	}

	return problems;
}

describe("migration set integrity", () => {
	test("the shipped set is internally consistent", async () => {
		const journal = await readJournal(DEFAULT_MIGRATIONS_FOLDER);
		expect(setProblems(DEFAULT_MIGRATIONS_FOLDER, journal)).toEqual([]);
	});

	test("both halves of an inconsistent set are reported", async () => {
		// A synthetic set rather than a copy of the shipped one: the check is
		// a pure function of the folder and the journal, so the broken states
		// are cheaper to build from scratch than to carve out of the real
		// migrations.
		const folder = join(TMP_ROOT, `parity-${crypto.randomUUID()}`);
		created.push(folder);
		mkdirSync(join(folder, "meta"), { recursive: true });
		await Bun.write(join(folder, "0000_first.sql"), "-- first\n");
		await Bun.write(join(folder, "0001_second.sql"), "-- second\n");
		const journal: Journal = {
			entries: [
				{ idx: 0, tag: "0000_first", when: 100 },
				{ idx: 1, tag: "0001_second", when: 200 },
			],
		};
		await Bun.write(
			join(folder, "meta", "_journal.json"),
			JSON.stringify(journal),
		);
		expect(setProblems(folder, journal)).toEqual([]);

		// An entry whose file is gone, and a file no entry names: the two
		// halves the boot path fails on.
		rmSync(join(folder, "0001_second.sql"));
		await Bun.write(join(folder, "0009_stray.sql"), "-- stray file\n");

		const problems = setProblems(folder, journal);
		expect(problems).toContain("journal entry without its file: 0001_second");
		expect(problems).toContain("file without its journal entry: 0009_stray");

		// Timestamps that do not increase set up the replay the fix repaired.
		const outOfOrder: Journal = {
			entries: [
				{ idx: 0, tag: "0000_first", when: 200 },
				{ idx: 1, tag: "0001_second", when: 100 },
			],
		};
		expect(setProblems(folder, outOfOrder)).toContain(
			"journal timestamps do not increase at 0001_second (0000_first → 0001_second)",
		);
	});
});
