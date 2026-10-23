/**
 * Report / export engine tests.
 *
 * Runs against an isolated SQLite database and export directory under the
 * session temp root. Verifies that every documented operation writes a real
 * file (non-zero bytes, expected extension and MIME type) and records it, that
 * `toExportResult` yields the authenticated download URL, and that the caller's
 * data scope is enforced for Employees and Department Heads.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { type AppConfig, loadConfig } from "../config";
import { createDatabase, type DatabaseHandle } from "../db";
import type { ExportFormatValue, RoleCode } from "../db/enums";
import { runMigrations } from "../db/migrate";
import {
	attendanceRecords,
	departments,
	type ExportArtifactRow,
	exportArtifacts,
	kpiMonthlySummaries,
	kpiPointRules,
	kpiScoreEvents,
	leaveBalanceEntries,
	leaveRequests,
	projects,
	taskProgressLogs,
	taskRequests,
	taskStateTransitions,
	tasks,
	user,
} from "../db/schema";
import {
	createContext,
	type Viewer,
	type ViewerContext,
} from "../graphql/context";
import { toExportResult } from "../graphql/shapes";
import {
	exportAttendance,
	exportAuditWorkbook,
	exportTasks,
	printAttendanceCalendar,
	printKpiReport,
	printLeaveRequest,
	printTaskSlip,
} from "./exports";
import {
	exportSchedule,
	previewTaskImport,
	taskImportTemplate,
} from "./schedule";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const RUN_ID = crypto.randomUUID();
const DB_PATH = join(TMP_ROOT, `mes-exports-${RUN_ID}.db`);
const EXPORT_DIR = join(TMP_ROOT, `mes-exports-${RUN_ID}`);

const PDF_MIME = "application/pdf";
const XLSX_MIME =
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_MIME = "text/csv";

const DEPT_ALPHA = "dept-alpha-1";
const DEPT_BETA = "dept-beta-1";
const USER_EMP = "user-employee-1";
const USER_PEER = "user-peer-1";
const USER_HEAD = "user-head-1";
const USER_BETA = "user-beta-1";
const PROJECT_ALPHA = "project-alpha-1";
const TASK_OWN = "task-own-1";
const TASK_PEER = "task-peer-1";
const TASK_BETA = "task-beta-1";
const LEAVE_EMP = "leave-emp-1";
const LEAVE_PEER = "leave-peer-1";

let db: DatabaseHandle;
let config: AppConfig;

beforeAll(async () => {
	runMigrations({ databasePath: DB_PATH });
	db = createDatabase(DB_PATH);
	config = loadConfig(
		{
			NODE_ENV: "test",
			MES_DATABASE_PATH: DB_PATH,
			MES_EXPORT_DIR: EXPORT_DIR,
		},
		{ requireSecrets: false },
	);
	await seed();
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
	if (existsSync(EXPORT_DIR)) {
		rmSync(EXPORT_DIR, { recursive: true, force: true });
	}
});

async function seed(): Promise<void> {
	await db.insert(departments).values([
		{
			id: DEPT_ALPHA,
			code: "ALPHA",
			name: "Alpha Department",
			departmentType: "DEPARTMENT",
		},
		{
			id: DEPT_BETA,
			code: "BETA",
			name: "Beta Department",
			departmentType: "DEPARTMENT",
		},
	]);

	await db.insert(user).values([
		{
			id: USER_EMP,
			name: "Erin Employee",
			email: "erin@example.com",
			userCode: "EMP001",
			departmentId: DEPT_ALPHA,
			isActive: true,
		},
		{
			id: USER_PEER,
			name: "Peer Employee",
			email: "peer@example.com",
			userCode: "EMP002",
			departmentId: DEPT_ALPHA,
			isActive: true,
		},
		{
			id: USER_HEAD,
			name: "Helen Head",
			email: "helen@example.com",
			userCode: "HEAD01",
			departmentId: DEPT_ALPHA,
			isActive: true,
		},
		{
			id: USER_BETA,
			name: "Beta Employee",
			email: "beta@example.com",
			userCode: "EMP003",
			departmentId: DEPT_BETA,
			isActive: true,
		},
	]);

	await db.insert(projects).values([
		{
			id: PROJECT_ALPHA,
			code: "PRJ-ALPHA",
			name: "Alpha Project",
			departmentId: DEPT_ALPHA,
		},
	]);

	const start = new Date("2026-10-01T00:00:00.000Z");
	const due = new Date("2026-10-10T00:00:00.000Z");
	await db.insert(tasks).values([
		{
			id: TASK_OWN,
			taskCode: "T-OWN-1",
			title: "Own task",
			projectId: PROJECT_ALPHA,
			assignedTo: USER_EMP,
			createdBy: USER_HEAD,
			departmentId: DEPT_ALPHA,
			state: "ACT",
			taskType: "DAILY",
			priority: "HIGH",
			progressPercentage: 40,
			startDate: start,
			endDate: due,
		},
		{
			id: TASK_PEER,
			taskCode: "T-PEER-1",
			title: "Peer task",
			projectId: PROJECT_ALPHA,
			assignedTo: USER_PEER,
			createdBy: USER_HEAD,
			departmentId: DEPT_ALPHA,
			state: "PEN",
			taskType: "DAILY",
			priority: "MEDIUM",
			progressPercentage: 100,
			startDate: start,
			endDate: due,
		},
		{
			id: TASK_BETA,
			taskCode: "T-BETA-1",
			title: "Beta task",
			assignedTo: USER_BETA,
			createdBy: USER_BETA,
			departmentId: DEPT_BETA,
			state: "ACT",
			taskType: "MULTI_DAY",
			priority: "LOW",
			progressPercentage: 10,
			startDate: start,
			endDate: due,
		},
	]);

	await db.insert(taskProgressLogs).values([
		{
			id: "log-own-1",
			taskId: TASK_OWN,
			userId: USER_EMP,
			previousPercentage: 0,
			newPercentage: 40,
			logComment: "First pass complete",
		},
	]);
	await db.insert(taskStateTransitions).values([
		{
			id: "transition-own-1",
			taskId: TASK_OWN,
			fromState: "REQ",
			toState: "ACT",
			actorId: USER_EMP,
			reason: "Accepted the assignment",
		},
	]);
	await db.insert(taskRequests).values([
		{
			id: "task-request-own-1",
			taskId: TASK_OWN,
			userId: USER_EMP,
			requestType: "EXTENSION",
			reason: "Need more time",
			status: "PENDING",
		},
	]);

	await db.insert(attendanceRecords).values([
		{
			id: "attendance-emp-1",
			userId: USER_EMP,
			workDate: "2026-10-01",
			checkIn: new Date("2026-10-01T01:55:00.000Z"),
			checkOut: new Date("2026-10-01T10:05:00.000Z"),
			isLate: false,
			isEarlyLeave: false,
			workingHours: 8.17,
		},
		{
			id: "attendance-emp-2",
			userId: USER_EMP,
			workDate: "2026-10-02",
			isLate: true,
			isEarlyLeave: false,
			workingHours: 7.5,
		},
		{
			id: "attendance-peer-1",
			userId: USER_PEER,
			workDate: "2026-10-01",
			isLate: false,
			isEarlyLeave: false,
			workingHours: 8,
		},
	]);

	await db.insert(leaveRequests).values([
		{
			id: LEAVE_EMP,
			userId: USER_EMP,
			leaveCode: "AL",
			startDate: "2026-10-20",
			endDate: "2026-10-22",
			totalDays: 3,
			reason: "Family trip",
			status: "PENDING",
		},
		{
			id: LEAVE_PEER,
			userId: USER_PEER,
			leaveCode: "SL",
			startDate: "2026-10-05",
			endDate: "2026-10-05",
			totalDays: 1,
			reason: "Medical",
			status: "APPROVED",
		},
	]);

	await db.insert(leaveBalanceEntries).values([
		{
			id: "balance-1",
			userId: USER_EMP,
			leaveCode: "AL",
			entryType: "ACCRUAL",
			deltaDays: 12,
			periodYear: 2026,
		},
		{
			id: "balance-2",
			userId: USER_EMP,
			leaveCode: "AL",
			entryType: "USAGE",
			deltaDays: -3,
			periodYear: 2026,
		},
		{
			id: "balance-3",
			userId: USER_EMP,
			leaveCode: "TOIL",
			entryType: "ACCRUAL",
			deltaDays: 2,
			periodYear: 2026,
		},
	]);

	await db.insert(kpiPointRules).values([
		{ code: "KPI_ON_TIME_TICKET", event: "On-time ticket", points: 10 },
		{ code: "KPI_PERFECT_ATTENDANCE", event: "Perfect attendance", points: 50 },
	]);
	await db.insert(kpiScoreEvents).values([
		{
			id: "kpi-event-1",
			userId: USER_EMP,
			taskId: TASK_OWN,
			ruleCode: "KPI_ON_TIME_TICKET",
			points: 10,
			periodYear: 2026,
			periodMonth: 10,
		},
		{
			id: "kpi-event-2",
			userId: USER_EMP,
			ruleCode: "KPI_PERFECT_ATTENDANCE",
			points: 50,
			periodYear: 2026,
			periodMonth: 10,
		},
	]);

	await db.insert(kpiMonthlySummaries).values([
		{
			id: "kpi-summary-employee",
			userId: USER_EMP,
			periodYear: 2026,
			periodMonth: 10,
			totalTasksAssigned: 2,
			completedOnTime: 1,
			approvedFirstTime: 1,
			extensionRequestsCount: 1,
			attendanceRate: 100,
			perfectAttendanceBonus: 50,
			totalKpiScore: 60,
		},
		{
			id: "kpi-summary-peer",
			userId: USER_PEER,
			periodYear: 2026,
			periodMonth: 10,
			totalTasksAssigned: 1,
			completedOnTime: 1,
			approvedFirstTime: 1,
			attendanceRate: 95,
			totalKpiScore: 10,
		},
		{
			id: "kpi-summary-beta",
			userId: USER_BETA,
			periodYear: 2026,
			periodMonth: 10,
			totalTasksAssigned: 1,
			overdueTasks: 1,
			attendanceRate: 80,
			totalKpiScore: -15,
		},
	]);
}

const USER_CODES: Record<string, string> = {
	[USER_EMP]: "EMP001",
	[USER_PEER]: "EMP002",
	[USER_HEAD]: "HEAD01",
	[USER_BETA]: "EMP003",
};

function makeViewer(
	id: string,
	departmentId: string | null,
	roleCodes: RoleCode[],
): Viewer {
	return {
		id,
		userCode: USER_CODES[id] ?? id,
		fullName: id,
		email: `${id}@example.com`,
		departmentId,
		isActive: true,
		roleCodes,
	};
}

function makeContext(viewer: Viewer): ViewerContext {
	return createContext({
		db,
		config,
		request: { ipAddress: null, userAgent: "exports.test" },
		viewer,
	});
}

async function assertArtifact(
	row: ExportArtifactRow,
	format: ExportFormatValue,
	extension: string,
	mimeType: string,
): Promise<void> {
	expect(row.id.length).toBeGreaterThan(0);
	expect(row.format).toBe(format);
	expect(row.mimeType).toBe(mimeType);
	expect(row.storagePath.endsWith(`.${extension}`)).toBe(true);
	expect(existsSync(row.storagePath)).toBe(true);
	expect(statSync(row.storagePath).size).toBeGreaterThan(0);
	expect(row.byteSize).toBeGreaterThan(0);

	const [stored] = await db
		.select()
		.from(exportArtifacts)
		.where(eq(exportArtifacts.id, row.id))
		.limit(1);
	if (!stored) {
		throw new Error(`export_artifacts row ${row.id} was not recorded`);
	}
	expect(stored.byteSize).toBeGreaterThan(0);

	// The bytes on disk are a real file of the documented type, not a stub.
	const head = readFileSync(row.storagePath).subarray(0, 4);
	if (format === "PDF") {
		expect(head.toString("latin1").startsWith("%PDF")).toBe(true);
	} else if (format === "XLSX") {
		expect(head[0]).toBe(0x50); // "PK" zip container
		expect(head[1]).toBe(0x4b);
	}

	const result = toExportResult(stored);
	expect(result.url).toBe(`/api/v1/exports/${row.id}`);
	expect(result.fileName).toBe(row.fileName);
	expect(result.format).toBe(format);
}

function serializeSheet(sheet: ExcelJS.Worksheet | undefined): string {
	if (!sheet) return "";
	const lines: string[] = [];
	sheet.eachRow((row) => {
		const values = row.values as unknown[];
		lines.push(
			values
				.slice(1)
				.map((value) => String(value ?? ""))
				.join(" "),
		);
	});
	return lines.join("\n");
}

describe("report exports", () => {
	test("generates a real, recorded artifact for every operation", async () => {
		const employee = makeContext(
			makeViewer(USER_EMP, DEPT_ALPHA, ["EMPLOYEE"]),
		);
		const head = makeContext(makeViewer(USER_HEAD, DEPT_ALPHA, ["DEPT_HEAD"]));

		await assertArtifact(
			await printTaskSlip(employee, { taskId: TASK_OWN }),
			"PDF",
			"pdf",
			PDF_MIME,
		);
		await assertArtifact(
			await exportTasks(employee, { format: "XLSX" }),
			"XLSX",
			"xlsx",
			XLSX_MIME,
		);
		await assertArtifact(
			await exportTasks(employee, { format: "CSV" }),
			"CSV",
			"csv",
			CSV_MIME,
		);
		await assertArtifact(
			await printLeaveRequest(employee, { leaveRequestId: LEAVE_EMP }),
			"PDF",
			"pdf",
			PDF_MIME,
		);
		await assertArtifact(
			await printAttendanceCalendar(employee, {
				input: { fromDate: "2026-10-01", toDate: "2026-10-31" },
			}),
			"PDF",
			"pdf",
			PDF_MIME,
		);
		await assertArtifact(
			await exportAttendance(employee, { format: "XLSX" }),
			"XLSX",
			"xlsx",
			XLSX_MIME,
		);
		await assertArtifact(
			await printKpiReport(employee, {
				input: { periodYear: 2026, periodMonth: 10 },
			}),
			"PDF",
			"pdf",
			PDF_MIME,
		);
		await assertArtifact(
			await exportAuditWorkbook(head, {
				filter: { periodYear: 2026, periodMonth: 10 },
			}),
			"XLSX",
			"xlsx",
			XLSX_MIME,
		);
		await assertArtifact(
			await exportSchedule(
				employee,
				"PERSONAL",
				{
					fromDate: "2026-09-25",
					toDate: "2026-10-15",
				},
				"PDF",
			),
			"PDF",
			"pdf",
			PDF_MIME,
		);
		await assertArtifact(
			await exportSchedule(
				employee,
				"PERSONAL",
				{
					fromDate: "2026-09-25",
					toDate: "2026-10-15",
				},
				"XLSX",
			),
			"XLSX",
			"xlsx",
			XLSX_MIME,
		);
		await assertArtifact(
			await exportSchedule(
				head,
				"DEPARTMENT_ONLY",
				{
					fromDate: "2026-09-25",
					toDate: "2026-10-15",
				},
				"CSV",
			),
			"CSV",
			"csv",
			CSV_MIME,
		);
		await assertArtifact(
			await taskImportTemplate(head, "XLSX"),
			"XLSX",
			"xlsx",
			XLSX_MIME,
		);
		await assertArtifact(
			await taskImportTemplate(head, "CSV"),
			"CSV",
			"csv",
			CSV_MIME,
		);
	});

	test("writes a readable XLSX task workbook", async () => {
		const employee = makeContext(
			makeViewer(USER_EMP, DEPT_ALPHA, ["EMPLOYEE"]),
		);
		const row = await exportTasks(employee, { format: "XLSX" });

		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.readFile(row.storagePath);
		expect(workbook.worksheets.length).toBe(1);
		expect(workbook.getWorksheet("Task List")).toBeDefined();
		expect(serializeSheet(workbook.getWorksheet("Task List"))).toContain(
			"T-OWN-1",
		);
	});

	test("limits an EMPLOYEE task export to their own tasks", async () => {
		const employee = makeContext(
			makeViewer(USER_EMP, DEPT_ALPHA, ["EMPLOYEE"]),
		);
		const row = await exportTasks(employee, { format: "CSV" });

		const csv = readFileSync(row.storagePath, "utf8");
		expect(csv).toContain("T-OWN-1");
		expect(csv).not.toContain("T-PEER-1");
		expect(csv).not.toContain("T-BETA-1");
	});

	test("limits an EMPLOYEE attendance export to their own records", async () => {
		const employee = makeContext(
			makeViewer(USER_EMP, DEPT_ALPHA, ["EMPLOYEE"]),
		);
		const row = await exportAttendance(employee, { format: "CSV" });

		const csv = readFileSync(row.storagePath, "utf8");
		expect(csv).toContain("EMP001");
		expect(csv).not.toContain("EMP002");
		expect(csv).not.toContain("EMP003");
	});

	test("limits a DEPT_HEAD audit workbook to their department", async () => {
		const head = makeContext(makeViewer(USER_HEAD, DEPT_ALPHA, ["DEPT_HEAD"]));
		const row = await exportAuditWorkbook(head, {
			filter: { periodYear: 2026, periodMonth: 10 },
		});

		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.readFile(row.storagePath);
		const names = workbook.worksheets.map((sheet) => sheet.name);

		expect(names).toContain("Level 3 - Employee");
		expect(names).toContain("Performance Ranking");
		expect(names).not.toContain("Level 1 - Company");
		expect(names).not.toContain("Level 2 - Department");

		const level3 = serializeSheet(workbook.getWorksheet("Level 3 - Employee"));
		expect(level3).toContain("Erin Employee");
		expect(level3).toContain("Peer Employee");
		expect(level3).not.toContain("Beta Employee");
	});

	test("gives a company-wide role every audit level", async () => {
		const hr = makeContext(makeViewer(USER_HEAD, DEPT_ALPHA, ["HR_MANAGER"]));
		const row = await exportAuditWorkbook(hr, {
			filter: { periodYear: 2026, periodMonth: 10 },
		});

		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.readFile(row.storagePath);
		const names = workbook.worksheets.map((sheet) => sheet.name);

		expect(names).toContain("Level 1 - Company");
		expect(names).toContain("Level 2 - Department");
		expect(names).toContain("Level 3 - Employee");
		expect(names).toContain("Performance Ranking");

		const level1 = serializeSheet(workbook.getWorksheet("Level 1 - Company"));
		expect(level1).toContain("Erin Employee");
		expect(level1).toContain("Beta Employee");
	});

	test("denies an EMPLOYEE the audit workbook", async () => {
		const employee = makeContext(
			makeViewer(USER_EMP, DEPT_ALPHA, ["EMPLOYEE"]),
		);
		await expect(
			exportAuditWorkbook(employee, { filter: { periodYear: 2026 } }),
		).rejects.toThrow(/permission/);
	});

	test("does not expose another employee's task slip", async () => {
		const employee = makeContext(
			makeViewer(USER_EMP, DEPT_ALPHA, ["EMPLOYEE"]),
		);
		await expect(
			printTaskSlip(employee, { taskId: TASK_PEER }),
		).rejects.toThrow(/not found/i);
	});

	test("does not expose another employee's leave request", async () => {
		const employee = makeContext(
			makeViewer(USER_EMP, DEPT_ALPHA, ["EMPLOYEE"]),
		);
		await expect(
			printLeaveRequest(employee, { leaveRequestId: LEAVE_PEER }),
		).rejects.toThrow(/not found/i);
	});
});

describe("schedule export and import template", () => {
	const RANGE = { fromDate: "2026-09-25", toDate: "2026-10-15" };

	test("limits a DEPT_HEAD schedule export to their department", async () => {
		const head = makeContext(makeViewer(USER_HEAD, DEPT_ALPHA, ["DEPT_HEAD"]));
		const row = await exportSchedule(
			head,
			"DEPARTMENT_ONLY",
			{ ...RANGE, departmentId: DEPT_ALPHA },
			"CSV",
		);

		const csv = readFileSync(row.storagePath, "utf8");
		expect(csv).toContain("T-OWN-1");
		expect(csv).toContain("T-PEER-1");
		expect(csv).not.toContain("T-BETA-1");
	});

	test("applies the state filter to the schedule export", async () => {
		const hr = makeContext(makeViewer(USER_HEAD, DEPT_ALPHA, ["HR_MANAGER"]));
		const row = await exportSchedule(
			hr,
			"COMPANY_WIDE",
			{ ...RANGE, departmentId: DEPT_ALPHA, state: "ACT" },
			"CSV",
		);

		const csv = readFileSync(row.storagePath, "utf8");
		expect(csv).toContain("T-OWN-1"); // ACT in Alpha
		expect(csv).not.toContain("T-PEER-1"); // PEN in Alpha
		expect(csv).not.toContain("T-BETA-1"); // outside the department filter
	});

	test("writes a readable XLSX schedule workbook", async () => {
		const hr = makeContext(makeViewer(USER_HEAD, DEPT_ALPHA, ["HR_MANAGER"]));
		const row = await exportSchedule(hr, "COMPANY_WIDE", RANGE, "XLSX");

		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.readFile(row.storagePath);
		expect(workbook.getWorksheet("Schedule")).toBeDefined();
		expect(serializeSheet(workbook.getWorksheet("Schedule"))).toContain(
			"T-OWN-1",
		);
	});

	test("the filled template parses with zero errors", async () => {
		const hr = makeContext(makeViewer(USER_HEAD, DEPT_ALPHA, ["HR_MANAGER"]));
		const row = await taskImportTemplate(hr, "CSV");
		const lines = readFileSync(row.storagePath, "utf8").trim().split(/\r?\n/);

		expect(lines[0]).toBe(
			"title,category,priority,assigneeEmail,startDate,endDate,hourSlot,description",
		);
		expect(lines).toHaveLength(2); // header + one example row

		// Fill the example row with a real user and round-trip it.
		const example = lines[1].split(",");
		example[3] = "erin@example.com";
		const filled = `${lines[0]}\r\n${example.join(",")}\r\n`;
		const preview = await previewTaskImport(hr, "COMPANY_WIDE", {
			fileName: "filled-template.csv",
			contentBase64: Buffer.from(filled, "utf8").toString("base64"),
		});
		expect(preview.errorCount).toBe(0);
		expect(preview.validCount).toBe(1);
	});
});
