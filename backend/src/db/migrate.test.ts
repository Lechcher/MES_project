import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_MIGRATIONS_FOLDER, runMigrations } from "./migrate";

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
		expect(tables).toContain("telegram_bot_settings");
		expect(tables).toContain("telegram_links");
		expect(tables).toContain("telegram_link_codes");
		expect(tables).toContain("telegram_ai_models");
		expect(tables).toContain("telegram_ai_usage");
		expect(tables).toContain("telegram_user_prefs");
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
 * Snapshots are deliberately not checked: hand-maintained entries (the
 * uncommitted `0002`/`0003`) carry no snapshot, and drizzle only needs one to
 * generate the *next* diff.
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
		// migrations. The folder cleans itself up, so the test does not depend
		// on the shared afterAll handling directories.
		const folder = join(TMP_ROOT, `mes-migrate-parity-${crypto.randomUUID()}`);
		try {
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
		await Bun.write(
			join(folder, "0009_stray.sql"),
			"-- stray file with no journal entry\n",
		);

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
		} finally {
			rmSync(folder, { recursive: true, force: true });
		}
	});
});
