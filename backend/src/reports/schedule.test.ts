/**
 * Schedule import tests.
 *
 * Runs against an isolated SQLite database and exercises the shared parser
 * through both entry points: `previewTaskImport` reports per-row outcomes
 * without writing, and `commitTaskImport` re-parses the file and inserts
 * everything in one transaction — one invalid row commits nothing.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { type AppConfig, loadConfig } from "../config";
import { createDatabase, type DatabaseHandle } from "../db";
import { runMigrations } from "../db/migrate";
import { departments, tasks, user } from "../db/schema";
import {
	createContext,
	type Viewer,
	type ViewerContext,
} from "../graphql/context";
import { DomainError } from "../graphql/errors";
import {
	commitTaskImport,
	type ImportFile,
	previewTaskImport,
} from "./schedule";

const PREFERRED_TMP =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const RUN_ID = crypto.randomUUID();
const DB_PATH = join(
	existsSync(PREFERRED_TMP) ? PREFERRED_TMP : tmpdir(),
	`mes-schedule-${RUN_ID}.db`,
);

const DEPT_A = "dept-a";
const DEPT_B = "dept-b";

let db: DatabaseHandle;
let config: AppConfig;
let hr: ViewerContext;
let head: ViewerContext;

beforeAll(async () => {
	mkdirSync(existsSync(PREFERRED_TMP) ? PREFERRED_TMP : tmpdir(), {
		recursive: true,
	});
	runMigrations({ databasePath: DB_PATH });
	db = createDatabase(DB_PATH);
	config = loadConfig(
		{ NODE_ENV: "test", MES_DATABASE_PATH: DB_PATH },
		{ requireSecrets: false },
	);

	await db.insert(departments).values([
		{
			id: DEPT_A,
			code: "A",
			name: "Department A",
			departmentType: "DEPARTMENT",
		},
		{
			id: DEPT_B,
			code: "B",
			name: "Department B",
			departmentType: "DEPARTMENT",
		},
	]);
	await db.insert(user).values([
		{
			id: "u-head",
			name: "Head A",
			email: "head@example.com",
			userCode: "HA",
			departmentId: DEPT_A,
			isActive: true,
		},
		{
			id: "u-hr",
			name: "HR Manager",
			email: "hr@example.com",
			userCode: "HRM",
			departmentId: DEPT_B,
			isActive: true,
		},
		{
			id: "u-w1",
			name: "Worker One",
			email: "w1@example.com",
			userCode: "W1",
			departmentId: DEPT_A,
			isActive: true,
		},
		{
			id: "u-w2",
			name: "Worker Two",
			email: "w2@example.com",
			userCode: "W2",
			departmentId: DEPT_A,
			isActive: true,
		},
		{
			id: "u-b1",
			name: "Beta Worker",
			email: "b1@example.com",
			userCode: "B1",
			departmentId: DEPT_B,
			isActive: true,
		},
	]);

	hr = makeContext("u-hr", DEPT_B, ["HR_MANAGER"]);
	head = makeContext("u-head", DEPT_A, ["DEPT_HEAD"]);
});

afterAll(() => {
	try {
		db?.$client.close();
	} catch {
		// The handle is already closed.
	}
	for (const suffix of ["", "-wal", "-shm"]) {
		const path = `${DB_PATH}${suffix}`;
		if (existsSync(path)) rmSync(path);
	}
});

function makeContext(
	id: string,
	departmentId: string | null,
	roleCodes: Viewer["roleCodes"],
): ViewerContext {
	return createContext({
		db,
		config,
		request: { ipAddress: null, userAgent: "schedule.test" },
		viewer: {
			id,
			userCode: id,
			fullName: id,
			email: `${id}@example.com`,
			departmentId,
			isActive: true,
			roleCodes,
		},
	});
}

const HEADER = [
	"title",
	"category",
	"priority",
	"assigneeEmail",
	"startDate",
	"endDate",
	"hourSlot",
	"description",
];

function csvFile(rows: string[][], name = "import.csv"): ImportFile {
	const quote = (value: string) =>
		/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
	const text =
		[HEADER, ...rows].map((row) => row.map(quote).join(",")).join("\r\n") +
		"\r\n";
	return {
		fileName: name,
		contentBase64: Buffer.from(text, "utf8").toString("base64"),
	};
}

async function xlsxFile(rows: string[][]): Promise<ImportFile> {
	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet("Task Import");
	sheet.addRow(HEADER);
	for (const row of rows) sheet.addRow(row);
	const buffer = await workbook.xlsx.writeBuffer();
	return {
		fileName: "import.xlsx",
		contentBase64: Buffer.from(buffer as ArrayBuffer).toString("base64"),
	};
}

async function taskCount(): Promise<number> {
	const rows = await db.select({ id: tasks.id }).from(tasks);
	return rows.length;
}

async function captureError(run: () => Promise<unknown>): Promise<unknown> {
	try {
		await run();
	} catch (error) {
		return error;
	}
	throw new Error("Expected the operation to fail, but it succeeded.");
}

function codeOf(error: unknown): unknown {
	if (error instanceof DomainError) return error.code;
	if (error && typeof error === "object") {
		const candidate = error as {
			code?: unknown;
			extensions?: { code?: unknown };
		};
		return candidate.extensions?.code ?? candidate.code;
	}
	return undefined;
}

describe("task import", () => {
	test("previews and commits a valid CSV file", async () => {
		const file = csvFile([
			[
				"Inspect line A",
				"DAILY",
				"HIGH",
				"w1@example.com",
				"05/11/2026",
				"06/11/2026",
				"",
				"Check twice, then sign",
			],
			[
				"Shut valve 3",
				"HOURLY",
				"URGENT",
				"w2@example.com",
				"07/11/2026",
				"",
				"14:00",
				"Before the slot",
			],
			["Plain note", "DAILY", "", "w1@example.com", "08/11/2026", "", "", ""],
		]);

		const preview = await previewTaskImport(hr, "COMPANY_WIDE", file);
		expect(preview.errorCount).toBe(0);
		expect(preview.validCount).toBe(3);
		expect(preview.rows[0].values.title).toBe("Inspect line A");

		const ids = await commitTaskImport(hr, "COMPANY_WIDE", file);
		expect(ids).toHaveLength(3);

		const created = await db.select().from(tasks);
		const daily = created.find((row) => row.title === "Inspect line A");
		expect(daily?.state).toBe("REQ");
		expect(daily?.progressPercentage).toBe(0);
		expect(daily?.priority).toBe("HIGH");
		expect(daily?.departmentId).toBe(DEPT_A);
		expect(daily?.assignedTo).toBe("u-w1");
		expect(daily?.startDate?.toISOString()).toBe("2026-11-05T00:00:00.000Z");
		expect(daily?.endDate?.toISOString()).toBe("2026-11-06T00:00:00.000Z");

		const hourly = created.find((row) => row.title === "Shut valve 3");
		expect(hourly?.isUrgentHourly).toBe(true);
		expect(hourly?.startDate?.toISOString()).toBe("2026-11-07T14:00:00.000Z");
		expect(hourly?.priority).toBe("URGENT");

		// An empty priority falls back to the ticket default.
		const plain = created.find((row) => row.title === "Plain note");
		expect(plain?.priority).toBe("MEDIUM");
		expect(plain?.description).toBeNull();
	});

	test("reports an unknown assignee email and commits nothing", async () => {
		const file = csvFile([
			[
				"Ghost work",
				"DAILY",
				"LOW",
				"ghost@example.com",
				"05/11/2026",
				"",
				"",
				"",
			],
		]);
		const before = await taskCount();

		const preview = await previewTaskImport(hr, "COMPANY_WIDE", file);
		expect(preview.errorCount).toBe(1);
		expect(preview.validCount).toBe(0);
		expect(preview.rows[0].errors.join(" ")).toMatch(/Unknown assignee email/);
		expect(preview.rows[0].values.assigneeEmail).toBe("ghost@example.com");

		const error = await captureError(() =>
			commitTaskImport(hr, "COMPANY_WIDE", file),
		);
		expect(codeOf(error)).toBe("VALIDATION_FAILED");
		expect(await taskCount()).toBe(before);
	});

	test("rejects an impossible DD/MM/YYYY date", async () => {
		const file = csvFile([
			["Leap day", "DAILY", "LOW", "w1@example.com", "31/02/2026", "", "", ""],
		]);
		const preview = await previewTaskImport(hr, "COMPANY_WIDE", file);
		expect(preview.errorCount).toBe(1);
		expect(preview.rows[0].errors.join(" ")).toMatch(/Invalid startDate/);
	});

	test("blocks a Department Head importing outside their department", async () => {
		const inScope = csvFile([
			["Own work", "DAILY", "LOW", "w1@example.com", "05/11/2026", "", "", ""],
		]);
		const inScopePreview = await previewTaskImport(
			head,
			"DEPARTMENT_ONLY",
			inScope,
		);
		expect(inScopePreview.errorCount).toBe(0);

		const outOfScope = csvFile([
			[
				"Other department",
				"DAILY",
				"LOW",
				"b1@example.com",
				"05/11/2026",
				"",
				"",
				"",
			],
		]);
		const before = await taskCount();
		const preview = await previewTaskImport(
			head,
			"DEPARTMENT_ONLY",
			outOfScope,
		);
		expect(preview.errorCount).toBe(1);
		expect(preview.rows[0].errors.join(" ")).toMatch(/outside your department/);

		const error = await captureError(() =>
			commitTaskImport(head, "DEPARTMENT_ONLY", outOfScope),
		);
		expect(codeOf(error)).toBe("VALIDATION_FAILED");
		expect(await taskCount()).toBe(before);
	});

	test("rejects a file that is neither CSV nor XLSX", async () => {
		const file: ImportFile = {
			fileName: "import.txt",
			contentBase64: Buffer.from("title\nnope", "utf8").toString("base64"),
		};
		const error = await captureError(() =>
			previewTaskImport(hr, "COMPANY_WIDE", file),
		);
		expect(codeOf(error)).toBe("VALIDATION_FAILED");
		expect(String(error)).toMatch(/CSV or XLSX/);
	});

	test("requires the documented header row", async () => {
		const wrong = {
			fileName: "import.csv",
			contentBase64: Buffer.from("a,b\n1,2", "utf8").toString("base64"),
		};
		const error = await captureError(() =>
			previewTaskImport(hr, "COMPANY_WIDE", wrong),
		);
		expect(codeOf(error)).toBe("VALIDATION_FAILED");
		expect(String(error)).toMatch(/missing column/i);
	});

	test("commits nothing when any row is invalid", async () => {
		const before = await taskCount();
		const file = csvFile([
			["Valid row", "DAILY", "LOW", "w1@example.com", "05/11/2026", "", "", ""],
			["Bad row", "DAILY", "LOW", "w1@example.com", "05/13/2026", "", "", ""],
		]);

		const preview = await previewTaskImport(hr, "COMPANY_WIDE", file);
		expect(preview.validCount).toBe(1);
		expect(preview.errorCount).toBe(1);

		const error = await captureError(() =>
			commitTaskImport(hr, "COMPANY_WIDE", file),
		);
		expect(codeOf(error)).toBe("VALIDATION_FAILED");
		expect(await taskCount()).toBe(before);
	});

	test("round-trips an XLSX import", async () => {
		const file = await xlsxFile([
			[
				"From the workbook",
				"MULTI_DAY",
				"HIGH",
				"w2@example.com",
				"10/11/2026",
				"12/11/2026",
				"",
				"",
			],
		]);
		const before = await taskCount();

		const preview = await previewTaskImport(hr, "COMPANY_WIDE", file);
		expect(preview.errorCount).toBe(0);
		expect(preview.validCount).toBe(1);

		const ids = await commitTaskImport(hr, "COMPANY_WIDE", file);
		expect(ids).toHaveLength(1);
		expect(await taskCount()).toBe(before + 1);

		const created = await db.select().from(tasks);
		const task = created.find((row) => row.title === "From the workbook");
		expect(task?.taskType).toBe("MULTI_DAY");
		expect(task?.startDate?.toISOString()).toBe("2026-11-10T00:00:00.000Z");
		expect(task?.endDate?.toISOString()).toBe("2026-11-12T00:00:00.000Z");
	});

	test("rejects files over the 2 MB cap", async () => {
		const file: ImportFile = {
			fileName: "import.csv",
			contentBase64: Buffer.alloc(3 * 1024 * 1024, 65).toString("base64"),
		};
		const error = await captureError(() =>
			previewTaskImport(hr, "COMPANY_WIDE", file),
		);
		expect(codeOf(error)).toBe("VALIDATION_FAILED");
		expect(String(error)).toMatch(/2 MB/);
	});
});
