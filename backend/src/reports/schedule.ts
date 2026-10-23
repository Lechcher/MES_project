/**
 * Schedule report and import engine.
 *
 * The schedule half of the report surface (`API_CONTACT_SPECIFICATION.md`
 * §7.2): `exportSchedule` renders the caller-scoped schedule as a PDF (A4
 * landscape), CSV or XLSX artifact, and `taskImportTemplate` issues the
 * downloadable import template.
 *
 * Bulk import shares one parser for preview and commit: `parseTaskImport`
 * decodes a CSV or XLSX file (2 MB cap), maps `category` onto `TaskType`,
 * `assigneeEmail` onto an active user, and `DD/MM/YYYY` dates, and checks the
 * caller's department scope per row. `previewTaskImport` returns the per-row
 * outcome without writing; `commitTaskImport` re-parses the file (a preview is
 * never trusted) and inserts every row in one transaction, so one invalid row
 * commits nothing.
 */

import { and, asc, eq, isNull, type SQL, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import type { ExportFormatValue, Priority, TaskTypeValue } from "../db/enums";
import type { ExportArtifactRow } from "../db/schema";
import { departments, tasks, user } from "../db/schema";
import { recordAuditEvent } from "../domain/audit";
import { type ScheduleInput, scheduleConditions } from "../domain/schedule";
import {
	insertTask,
	nextTaskCode,
	requireActor,
	writeTransition,
} from "../domain/tasks";
import { type DataScope, scopedDepartmentId } from "../graphql/access";
import type { ViewerContext } from "../graphql/context";
import { DomainError } from "../graphql/errors";
import {
	addWorksheet,
	type ColumnSpec,
	createPdf,
	excelBytes,
	formatDateOnly,
	normalizeFormat,
	persistArtifact,
	toCsv,
} from "./exports";

/* ------------------------------------------------------------------ */
/* Import contract                                                     */
/* ------------------------------------------------------------------ */

export interface ImportFile {
	fileName: string;
	contentBase64: string;
}

export interface TaskImportRow {
	line: number;
	values: Record<string, string>;
	errors: string[];
}

export interface TaskImportPreview {
	rows: TaskImportRow[];
	validCount: number;
	errorCount: number;
}

/** A row that passed every check, ready to insert. */
export interface ResolvedImportRow {
	title: string;
	description: string | null;
	taskType: TaskTypeValue;
	priority: Priority;
	assignedToId: string;
	departmentId: string | null;
	startDate: Date;
	endDate: Date;
	isUrgentHourly: boolean;
}

/** `parseTaskImport` result: every row's outcome plus the insertable rows. */
export interface ParsedTaskImport {
	rows: TaskImportRow[];
	/** Fully valid rows, keyed by their 1-based line number. */
	resolved: Map<number, ResolvedImportRow>;
}

const IMPORT_HEADERS = [
	"title",
	"category",
	"priority",
	"assigneeEmail",
	"startDate",
	"endDate",
	"hourSlot",
	"description",
] as const;

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MODULE = "jobs" as const;
const A4_LANDSCAPE: readonly [number, number] = [841.89, 595.28];

const CATEGORY_BY_TOKEN: Record<string, TaskTypeValue> = {
	daily: "DAILY",
	multi_day: "MULTI_DAY",
	hourly: "HOURLY",
};

const PRIORITY_BY_TOKEN: Record<string, Priority> = {
	low: "LOW",
	medium: "MEDIUM",
	high: "HIGH",
	urgent: "URGENT",
};

/* ------------------------------------------------------------------ */
/* File decoding                                                       */
/* ------------------------------------------------------------------ */

/**
 * Parse a CSV text into rows, honouring quoted fields (a doubled `"` inside
 * quotes is a literal quote). Line breaks inside quotes stay in the field.
 */
function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;

	const pushField = () => {
		row.push(field);
		field = "";
	};
	const pushRow = () => {
		pushField();
		rows.push(row);
		row = [];
	};

	for (let index = 0; index < text.length; index++) {
		const char = text[index];
		if (inQuotes) {
			if (char === '"') {
				if (text[index + 1] === '"') {
					field += '"';
					index++;
				} else {
					inQuotes = false;
				}
			} else {
				field += char;
			}
		} else if (char === '"') {
			inQuotes = true;
		} else if (char === ",") {
			pushField();
		} else if (char === "\n" || char === "\r") {
			if (char === "\r" && text[index + 1] === "\n") index++;
			pushRow();
		} else {
			field += char;
		}
	}
	if (field.length > 0 || row.length > 0) pushRow();
	return rows;
}

/** Every worksheet cell as trimmed text (dates become `DD/MM/YYYY`). */
function cellText(value: ExcelJS.CellValue): string {
	if (value === null || value === undefined) return "";
	if (value instanceof Date) {
		return `${String(value.getUTCDate()).padStart(2, "0")}/${String(
			value.getUTCMonth() + 1,
		).padStart(2, "0")}/${value.getUTCFullYear()}`;
	}
	if (typeof value === "object") {
		if ("richText" in value) {
			return (value.richText ?? [])
				.map((part) => part.text)
				.join("")
				.trim();
		}
		if (
			"result" in value &&
			value.result !== null &&
			value.result !== undefined
		) {
			return String(value.result).trim();
		}
		if ("text" in value) return String(value.text).trim();
		return "";
	}
	return String(value).trim();
}

async function decode(file: ImportFile): Promise<Uint8Array> {
	const name = (file.fileName ?? "").trim().toLowerCase();
	if (!name.endsWith(".csv") && !name.endsWith(".xlsx")) {
		throw new DomainError(
			"VALIDATION_FAILED",
			"Only CSV or XLSX files are supported.",
		);
	}
	if (!file.contentBase64) {
		throw new DomainError("VALIDATION_FAILED", "The uploaded file is empty.");
	}
	const bytes = new Uint8Array(Buffer.from(file.contentBase64, "base64"));
	if (bytes.byteLength === 0) {
		throw new DomainError("VALIDATION_FAILED", "The uploaded file is empty.");
	}
	if (bytes.byteLength > MAX_IMPORT_BYTES) {
		throw new DomainError(
			"VALIDATION_FAILED",
			"The uploaded file exceeds the 2 MB limit.",
		);
	}
	return bytes;
}

async function readRows(file: ImportFile): Promise<string[][]> {
	const bytes = await decode(file);
	const name = file.fileName.trim().toLowerCase();
	if (name.endsWith(".csv")) {
		return parseCsv(new TextDecoder().decode(bytes));
	}

	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(
		Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0],
	);
	const sheet = workbook.worksheets[0];
	if (!sheet) {
		throw new DomainError("VALIDATION_FAILED", "The uploaded file is empty.");
	}
	const rows: string[][] = [];
	sheet.eachRow((row) => {
		// `values` is 1-based with a leading empty slot; cap at the widest row.
		const values = row.values as unknown[];
		const cells: string[] = [];
		for (let index = 1; index < values.length; index++) {
			cells.push(cellText(values[index] as ExcelJS.CellValue));
		}
		rows.push(cells);
	});
	return rows;
}

/* ------------------------------------------------------------------ */
/* Row validation                                                      */
/* ------------------------------------------------------------------ */

const DMY = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Parse `DD/MM/YYYY` strictly: `31/02/2026` is rejected, not rolled over. */
function parseDmy(value: string): Date | null {
	const match = DMY.exec(value.trim());
	if (!match) return null;
	const day = Number(match[1]);
	const month = Number(match[2]);
	const year = Number(match[3]);
	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		date.getUTCDate() !== day ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCFullYear() !== year
	) {
		return null;
	}
	return date;
}

interface AssigneeDirectory {
	byEmail: Map<string, { id: string; departmentId: string | null }>;
}

async function loadDirectory(ctx: ViewerContext): Promise<AssigneeDirectory> {
	const rows = await ctx.db
		.select({ id: user.id, email: user.email, departmentId: user.departmentId })
		.from(user)
		.where(and(eq(user.isActive, true), isNull(user.deletedAt)));
	return {
		byEmail: new Map(
			rows.map((row) => [
				row.email.toLowerCase(),
				{ id: row.id, departmentId: row.departmentId },
			]),
		),
	};
}

/**
 * Parse the file and validate every row. Returns one entry per non-blank
 * data row — the echoed raw values and the row-level errors — plus the rows
 * that passed every check, keyed by line, ready to insert.
 */
export async function parseTaskImport(
	ctx: ViewerContext,
	scope: DataScope,
	file: ImportFile,
): Promise<ParsedTaskImport> {
	requireActor(ctx);
	const rows = await readRows(file);
	if (rows.length === 0 || rows[0].every((cell) => cell.trim() === "")) {
		throw new DomainError(
			"VALIDATION_FAILED",
			"The uploaded file has no header row.",
		);
	}

	const header = rows[0].map((cell) => cell.trim().toLowerCase());
	const columnIndex = new Map<string, number>();
	for (const [index, name] of header.entries()) {
		if (!columnIndex.has(name)) columnIndex.set(name, index);
	}
	const missing = IMPORT_HEADERS.filter(
		(column) => !columnIndex.has(column.toLowerCase()),
	);
	if (missing.length > 0) {
		throw new DomainError(
			"VALIDATION_FAILED",
			`The file is missing column(s): ${missing.join(", ")}. Download the import template for the expected header row.`,
			{ missingColumns: missing },
		);
	}

	const directory = await loadDirectory(ctx);
	const scopedDeptId = scopedDepartmentId(ctx, scope);
	const parsed: TaskImportRow[] = [];
	const resolved = new Map<number, ResolvedImportRow>();

	for (const [rowIndex, cells] of rows.slice(1).entries()) {
		if (cells.every((cell) => cell.trim() === "")) continue;
		const line = rowIndex + 2; // 1-based, header occupies line 1.

		const values: Record<string, string> = {};
		for (const column of IMPORT_HEADERS) {
			const index = columnIndex.get(column.toLowerCase());
			values[column] = index === undefined ? "" : (cells[index] ?? "");
		}
		const row: TaskImportRow = { line, values, errors: [] };

		const title = values.title.trim();
		if (title.length === 0) row.errors.push("Title is required.");

		const categoryToken = values.category.trim().toLowerCase();
		const taskType = CATEGORY_BY_TOKEN[categoryToken];
		if (!taskType) {
			row.errors.push(
				`Unknown category '${values.category}'. Use DAILY, MULTI_DAY or HOURLY.`,
			);
		}

		const priorityToken = values.priority.trim().toLowerCase();
		const priority = priorityToken
			? (PRIORITY_BY_TOKEN[priorityToken] ?? null)
			: "MEDIUM";
		if (!priority) {
			row.errors.push(
				`Unknown priority '${values.priority}'. Use LOW, MEDIUM, HIGH or URGENT.`,
			);
		}

		const assignee = directory.byEmail.get(
			values.assigneeEmail.trim().toLowerCase(),
		);
		if (!assignee) {
			row.errors.push(`Unknown assignee email '${values.assigneeEmail}'.`);
		} else if (scopedDeptId && assignee.departmentId !== scopedDeptId) {
			row.errors.push(
				`Assignee '${values.assigneeEmail}' is outside your department.`,
			);
		}

		const startDate = parseDmy(values.startDate);
		if (!startDate) {
			row.errors.push(
				`Invalid startDate '${values.startDate}'. Use DD/MM/YYYY.`,
			);
		}

		const endDateText = values.endDate.trim();
		let endDate: Date | null = null;
		if (endDateText) {
			endDate = parseDmy(endDateText);
			if (!endDate) {
				row.errors.push(`Invalid endDate '${endDateText}'. Use DD/MM/YYYY.`);
			}
		}

		const hourSlot = values.hourSlot.trim();
		if (hourSlot && !HHMM.test(hourSlot)) {
			row.errors.push(`Invalid hourSlot '${hourSlot}'. Use HH:MM (24h).`);
		}

		let startAt = startDate;
		if (startDate && hourSlot) {
			const [hours, minutes] = hourSlot.split(":").map(Number);
			startAt = new Date(
				startDate.getTime() + ((hours ?? 0) * 60 + (minutes ?? 0)) * 60_000,
			);
		}
		const endAt = endDate ?? startAt;
		if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
			row.errors.push("endDate must not be before startDate.");
		}

		if (
			row.errors.length === 0 &&
			title &&
			taskType &&
			priority &&
			assignee &&
			startAt &&
			endAt
		) {
			resolved.set(line, {
				title,
				description: values.description.trim() || null,
				taskType,
				priority,
				assignedToId: assignee.id,
				departmentId: assignee.departmentId,
				startDate: startAt,
				endDate: endAt,
				isUrgentHourly: taskType === "HOURLY",
			});
		}

		parsed.push(row);
	}

	return { rows: parsed, resolved };
}

/* ------------------------------------------------------------------ */
/* Preview and commit                                                  */
/* ------------------------------------------------------------------ */

export async function previewTaskImport(
	ctx: ViewerContext,
	scope: DataScope,
	file: ImportFile,
): Promise<TaskImportPreview> {
	const { rows } = await parseTaskImport(ctx, scope, file);
	const errorCount = rows.filter((row) => row.errors.length > 0).length;
	return {
		rows,
		validCount: rows.length - errorCount,
		errorCount,
	};
}

/**
 * Insert every row of the file in one transaction. The file is parsed again
 * (a previous preview is never trusted); any invalid row aborts the commit
 * with the row errors and creates nothing.
 */
export async function commitTaskImport(
	ctx: ViewerContext,
	scope: DataScope,
	file: ImportFile,
): Promise<string[]> {
	const { rows, resolved } = await parseTaskImport(ctx, scope, file);
	const invalid = rows.filter((row) => row.errors.length > 0);
	if (invalid.length > 0) {
		throw new DomainError(
			"VALIDATION_FAILED",
			`The import contains ${invalid.length} invalid row(s); nothing was imported.`,
			{
				rows: invalid.map((row) => ({
					line: row.line,
					errors: row.errors,
				})),
			},
		);
	}
	if (rows.length === 0) return [];

	const actor = requireActor(ctx);
	const fileName = file.fileName;

	return ctx.db.transaction(async (tx) => {
		const txCtx = { ...ctx, db: tx } as unknown as ViewerContext;
		const ids: string[] = [];
		for (const row of rows) {
			const resolvedValues = resolved.get(row.line);
			if (!resolvedValues) continue;
			const created = await insertTask(txCtx, {
				taskCode: await nextTaskCode(txCtx),
				title: resolvedValues.title,
				description: resolvedValues.description,
				projectId: null,
				taskType: resolvedValues.taskType,
				priority: resolvedValues.priority,
				createdBy: actor.id,
				assignedTo: resolvedValues.assignedToId,
				departmentId: resolvedValues.departmentId,
				startDate: resolvedValues.startDate,
				endDate: resolvedValues.endDate,
				isUrgentHourly: resolvedValues.isUrgentHourly,
			});
			await writeTransition(txCtx, {
				taskId: created.id,
				from: null,
				to: "REQ",
				actorId: actor.id,
				reason: `Imported from ${fileName}.`,
			});
			await recordAuditEvent(txCtx, {
				action: "task.create",
				moduleCode: MODULE,
				resourceType: "Task",
				resourceId: created.id,
				newData: {
					taskCode: created.taskCode,
					title: created.title,
					state: "REQ",
					assignedTo: created.assignedTo,
					departmentId: created.departmentId,
					importedFrom: fileName,
				},
			});
			ids.push(created.id);
		}
		return ids;
	});
}

/* ------------------------------------------------------------------ */
/* Schedule export                                                     */
/* ------------------------------------------------------------------ */

interface ScheduleExportRow {
	taskCode: string;
	title: string;
	taskType: string;
	priority: string;
	state: string;
	assigneeName: string | null;
	assigneeCode: string | null;
	departmentName: string | null;
	startDate: Date | null;
	endDate: Date | null;
	progressPercentage: number;
}

const SCHEDULE_COLUMNS: ColumnSpec[] = [
	{ header: "Task code", key: "taskCode", width: 16 },
	{ header: "Title", key: "title", width: 34 },
	{ header: "Category", key: "category", width: 14 },
	{ header: "Priority", key: "priority", width: 12 },
	{ header: "State", key: "state", width: 12 },
	{ header: "Assignee", key: "assignee", width: 24 },
	{ header: "Department", key: "department", width: 20 },
	{ header: "Start", key: "start", width: 12 },
	{ header: "End", key: "end", width: 12 },
	{ header: "Progress %", key: "progress", width: 12 },
];

const SCHEDULE_PDF_WIDTHS = [80, 180, 62, 58, 52, 105, 90, 50, 50, 43];

function scheduleRecord(row: ScheduleExportRow): Record<string, unknown> {
	return {
		taskCode: row.taskCode,
		title: row.title,
		category: row.taskType,
		priority: row.priority,
		state: row.state,
		assignee: row.assigneeName
			? `${row.assigneeName} (${row.assigneeCode ?? ""})`
			: "",
		department: row.departmentName ?? "",
		start: formatDateOnly(row.startDate),
		end: formatDateOnly(row.endDate),
		progress: row.progressPercentage,
	};
}

async function loadScheduleRows(
	ctx: ViewerContext,
	scope: DataScope,
	input: ScheduleInput,
): Promise<ScheduleExportRow[]> {
	const conditions: SQL[] = scheduleConditions(ctx, scope, input);
	return ctx.db
		.select({
			taskCode: tasks.taskCode,
			title: tasks.title,
			taskType: tasks.taskType,
			priority: tasks.priority,
			state: tasks.state,
			assigneeName: user.name,
			assigneeCode: user.userCode,
			departmentName: departments.name,
			startDate: tasks.startDate,
			endDate: tasks.endDate,
			progressPercentage: tasks.progressPercentage,
		})
		.from(tasks)
		.leftJoin(user, eq(user.id, tasks.assignedTo))
		.leftJoin(departments, eq(departments.id, tasks.departmentId))
		.where(and(...conditions))
		.orderBy(
			sql`${tasks.startDate} is null`,
			asc(tasks.startDate),
			asc(tasks.endDate),
			asc(tasks.taskCode),
		);
}

/**
 * Export the schedule for the requested range (and optional department and
 * state) as a real artifact in the caller's scope: an A4 landscape PDF
 * table, a CSV, or an XLSX workbook.
 */
export async function exportSchedule(
	ctx: ViewerContext,
	scope: DataScope,
	input: ScheduleInput,
	format: ExportFormatValue | null,
): Promise<ExportArtifactRow> {
	const resolvedFormat = normalizeFormat(format, "XLSX");
	const rows = await loadScheduleRows(ctx, scope, input);
	const records = rows.map(scheduleRecord);

	if (resolvedFormat === "CSV") {
		const csv = toCsv(
			SCHEDULE_COLUMNS.map((column) => column.header),
			records.map((record) =>
				SCHEDULE_COLUMNS.map((column) => record[column.key] as string | number),
			),
		);
		return persistArtifact(ctx, {
			baseName: "schedule",
			format: "CSV",
			data: csv,
		});
	}

	if (resolvedFormat === "XLSX") {
		const workbook = new ExcelJS.Workbook();
		addWorksheet(workbook, "Schedule", SCHEDULE_COLUMNS, records);
		return persistArtifact(ctx, {
			baseName: "schedule",
			format: "XLSX",
			data: await excelBytes(workbook),
		});
	}

	const report = await createPdf(A4_LANDSCAPE);
	report.heading("SCHEDULE");
	report.muted(
		`From ${formatDateOnly(input.fromDate)} to ${formatDateOnly(input.toDate)}` +
			(input.state ? ` · state ${input.state}` : "") +
			` · generated ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
	);
	report.spacer(4);
	if (rows.length === 0) {
		report.muted("No scheduled tickets in this range.");
	} else {
		report.table(
			SCHEDULE_COLUMNS.map((column) => column.header),
			records.map((record) =>
				SCHEDULE_COLUMNS.map((column) => String(record[column.key] ?? "")),
			),
			SCHEDULE_PDF_WIDTHS,
		);
	}
	return persistArtifact(ctx, {
		baseName: "schedule",
		format: "PDF",
		data: await report.finish(),
	});
}

/* ------------------------------------------------------------------ */
/* Import template                                                     */
/* ------------------------------------------------------------------ */

/** One example row; dates are `DD/MM/YYYY` text so Excel keeps them verbatim. */
const TEMPLATE_EXAMPLE: Record<string, string> = {
	title: "Shut off valve 3",
	category: "HOURLY",
	priority: "URGENT",
	assigneeEmail: "worker@example.com",
	startDate: "05/11/2026",
	endDate: "",
	hourSlot: "14:00",
	description: "Complete before the slot.",
};

/**
 * Issue the downloadable import template: the documented header row plus one
 * example row, as CSV text or an XLSX workbook.
 */
export async function taskImportTemplate(
	ctx: ViewerContext,
	format: ExportFormatValue | null,
): Promise<ExportArtifactRow> {
	const resolvedFormat = normalizeFormat(format, "XLSX");
	const example = IMPORT_HEADERS.map((column) => TEMPLATE_EXAMPLE[column]);

	if (resolvedFormat === "CSV") {
		const csv = toCsv([...IMPORT_HEADERS], [example]);
		return persistArtifact(ctx, {
			baseName: "task-import-template",
			format: "CSV",
			data: csv,
		});
	}

	const workbook = new ExcelJS.Workbook();
	addWorksheet(
		workbook,
		"Task Import",
		IMPORT_HEADERS.map((header, index) => ({
			header,
			key: header,
			width: index === 7 ? 30 : 18,
		})),
		[TEMPLATE_EXAMPLE],
	);
	return persistArtifact(ctx, {
		baseName: "task-import-template",
		format: "XLSX",
		data: await excelBytes(workbook),
	});
}
