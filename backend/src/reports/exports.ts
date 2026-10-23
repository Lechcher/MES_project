/**
 * Report and export engine.
 *
 * Every operation produces a real artifact — PDF through `pdf-lib`, XLSX
 * through `exceljs`, CSV as text — scoped to the caller's authorized data,
 * writes it under `config.exportDir`, records the matching `export_artifacts`
 * row, and returns that row. A success-shaped result is never returned when the
 * requested file was not generated.
 *
 * The engine queries the MES tables directly with Drizzle and applies the same
 * data scope as the corresponding read operation, so it does not depend on
 * other domain modules.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	like,
	lte,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import ExcelJS from "exceljs";
import {
	PDFDocument,
	type PDFFont,
	type PDFPage,
	type RGB,
	rgb,
	StandardFonts,
} from "pdf-lib";
import { EXPORT_FORMATS, type ExportFormatValue } from "../db/enums";
import {
	attendanceRecords,
	departments,
	type ExportArtifactRow,
	exportArtifacts,
	kpiMonthlySummaries,
	kpiScoreEvents,
	leaveBalanceEntries,
	leaveCodes,
	leaveRequests,
	projects,
	taskProgressLogs,
	taskRequests,
	taskStateTransitions,
	tasks,
	user,
} from "../db/schema";
import {
	authorize,
	type DataScope,
	scopedDepartmentId,
} from "../graphql/access";
import type { ViewerContext } from "../graphql/context";
import { errors } from "../graphql/errors";
import { parseDate, toDateOnly } from "../graphql/shapes";

/* ------------------------------------------------------------------ */
/* Arguments                                                           */
/* ------------------------------------------------------------------ */

export interface TaskSlipArgs {
	taskId: string;
}

export interface TaskExportFilter {
	projectId?: string | null;
	departmentId?: string | null;
	assignedToId?: string | null;
	state?: string | null;
	taskType?: string | null;
	priority?: string | null;
	isOverdue?: boolean | null;
	isUrgentHourly?: boolean | null;
	endDateBefore?: string | Date | null;
	endDateAfter?: string | Date | null;
	search?: string | null;
}

export interface ExportTasksArgs {
	filter?: TaskExportFilter | null;
	format?: ExportFormatValue | null;
}

export interface PrintLeaveRequestArgs {
	leaveRequestId: string;
}

export interface AttendanceCalendarInput {
	departmentId?: string | null;
	fromDate: string | Date;
	toDate: string | Date;
}

export interface PrintAttendanceCalendarArgs {
	input: AttendanceCalendarInput;
}

export interface AttendanceExportFilter {
	userId?: string | null;
	departmentId?: string | null;
	fromDate?: string | Date | null;
	toDate?: string | Date | null;
	isLate?: boolean | null;
	isEarlyLeave?: boolean | null;
	leaveCode?: string | null;
}

export interface ExportAttendanceArgs {
	filter?: AttendanceExportFilter | null;
	format?: ExportFormatValue | null;
}

export interface KpiPeriodArgs {
	input: { periodYear: number; periodMonth: number };
}

export interface AuditWorkbookFilter {
	periodYear: number;
	periodMonth?: number | null;
	departmentId?: string | null;
}

export interface ExportAuditWorkbookArgs {
	filter: AuditWorkbookFilter;
}

/* ------------------------------------------------------------------ */
/* Constants and small helpers                                         */
/* ------------------------------------------------------------------ */

const MIME_BY_FORMAT: Record<ExportFormatValue, string> = {
	PDF: "application/pdf",
	XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	CSV: "text/csv",
};

const EXTENSION_BY_FORMAT: Record<ExportFormatValue, string> = {
	PDF: "pdf",
	XLSX: "xlsx",
	CSV: "csv",
};

const BALANCE_TRACKED = ["AL", "TOIL"] as const;

const A4_PORTRAIT: readonly [number, number] = [595.28, 841.89];
const A4_LANDSCAPE: readonly [number, number] = [841.89, 595.28];

const PDF_MARGIN = 36;
const INK = rgb(0.09, 0.11, 0.13);
const MUTED = rgb(0.36, 0.4, 0.44);
const ACCENT = rgb(0.06, 0.38, 0.99);

function viewerId(ctx: ViewerContext): string {
	if (!ctx.viewer) throw errors.unauthenticated();
	return ctx.viewer.id;
}

export function normalizeFormat(
	value: ExportFormatValue | null | undefined,
	fallback: ExportFormatValue,
): ExportFormatValue {
	if (value && (EXPORT_FORMATS as readonly string[]).includes(value)) {
		return value;
	}
	return fallback;
}

/** Push a possibly-undefined condition (e.g. `or(...)`) without asserting. */
function pushCondition(conditions: SQL[], condition: SQL | undefined): void {
	if (condition) conditions.push(condition);
}

export function formatDateOnly(
	value: Date | string | null | undefined,
): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "string") return value.slice(0, 10);
	return value.toISOString().slice(0, 10);
}

function formatDateTime(value: Date | string | null | undefined): string {
	if (value === null || value === undefined) return "";
	const date = typeof value === "string" ? new Date(value) : value;
	if (Number.isNaN(date.getTime())) return "";
	return date.toISOString().replace("T", " ").slice(0, 16);
}

function formatNumber(value: number | null | undefined, digits = 2): string {
	if (value === null || value === undefined || Number.isNaN(value)) return "";
	return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function dayKeyOf(value: Date): string {
	return value.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Artifact persistence                                                */
/* ------------------------------------------------------------------ */

/**
 * Write the generated payload to disk and record its `export_artifacts` row.
 * The file name embeds the artifact id so concurrent exports cannot collide.
 */
export async function persistArtifact(
	ctx: ViewerContext,
	input: {
		baseName: string;
		format: ExportFormatValue;
		data: Uint8Array | string;
	},
): Promise<ExportArtifactRow> {
	const id = crypto.randomUUID();
	const safeBase =
		input.baseName
			.replace(/[^a-zA-Z0-9._-]+/g, "-")
			.replace(/^[.-]+|[.-]+$/g, "")
			.slice(0, 80) || "export";
	const fileName = `${safeBase}-${id.slice(0, 8)}.${EXTENSION_BY_FORMAT[input.format]}`;

	const directory = resolve(ctx.config.exportDir);
	await mkdir(directory, { recursive: true });
	const storagePath = join(directory, fileName);

	const bytes =
		typeof input.data === "string"
			? new TextEncoder().encode(input.data)
			: input.data;
	if (bytes.byteLength === 0) {
		throw errors.internal(
			"The generated export is empty; no artifact was stored.",
		);
	}

	await writeFile(storagePath, bytes);

	const row: ExportArtifactRow = {
		id,
		userId: ctx.viewer?.id ?? null,
		fileName,
		mimeType: MIME_BY_FORMAT[input.format],
		format: input.format,
		storagePath,
		byteSize: bytes.byteLength,
		createdAt: new Date(),
	};

	await ctx.db.insert(exportArtifacts).values(row);
	return row;
}

/* ------------------------------------------------------------------ */
/* Scope resolution                                                    */
/* ------------------------------------------------------------------ */

/**
 * Resolve the user ids an operation may read, or `null` for an unrestricted
 * scope. A requested department narrows `ALL`/`COMPANY_WIDE` callers; a
 * department-scoped caller is always pinned to their own department.
 */
async function effectiveUserIds(
	ctx: ViewerContext,
	scope: DataScope,
	requestedDepartmentId?: string | null,
): Promise<string[] | null> {
	if (scope === "PERSONAL") return [viewerId(ctx)];

	let departmentId = requestedDepartmentId ?? null;
	if (scope === "DEPARTMENT_ONLY") {
		departmentId = scopedDepartmentId(ctx, scope);
	}
	if (!departmentId) return null;

	const rows = await ctx.db
		.select({ id: user.id })
		.from(user)
		.where(
			and(
				eq(user.departmentId, departmentId),
				eq(user.isActive, true),
				isNull(user.deletedAt),
			),
		);
	return rows.map((row) => row.id);
}

interface UserSummary {
	id: string;
	userCode: string;
	name: string;
	departmentId: string | null;
}

async function loadUserSummaries(
	ctx: ViewerContext,
	ids: string[] | null,
): Promise<UserSummary[]> {
	if (ids !== null && ids.length === 0) return [];
	const condition =
		ids === null
			? and(eq(user.isActive, true), isNull(user.deletedAt))
			: inArray(user.id, ids);
	return ctx.db
		.select({
			id: user.id,
			userCode: user.userCode,
			name: user.name,
			departmentId: user.departmentId,
		})
		.from(user)
		.where(condition)
		.orderBy(asc(user.userCode));
}

async function loadUserSummary(
	ctx: ViewerContext,
	id: string,
): Promise<UserSummary | null> {
	const [row] = await ctx.db
		.select({
			id: user.id,
			userCode: user.userCode,
			name: user.name,
			departmentId: user.departmentId,
		})
		.from(user)
		.where(eq(user.id, id))
		.limit(1);
	return row ?? null;
}

async function departmentName(
	ctx: ViewerContext,
	id: string | null | undefined,
): Promise<string> {
	if (!id) return "";
	const [row] = await ctx.db
		.select({ name: departments.name })
		.from(departments)
		.where(eq(departments.id, id))
		.limit(1);
	return row?.name ?? "";
}

function taskVisible(
	ctx: ViewerContext,
	scope: DataScope,
	task: {
		assignedTo: string | null;
		createdBy: string | null;
		departmentId: string | null;
	},
): boolean {
	if (scope === "ALL" || scope === "COMPANY_WIDE") return true;
	if (scope === "PERSONAL") {
		const id = viewerId(ctx);
		return task.assignedTo === id || task.createdBy === id;
	}
	return task.departmentId === scopedDepartmentId(ctx, scope);
}

/* ------------------------------------------------------------------ */
/* PDF layout                                                          */
/* ------------------------------------------------------------------ */

/** Substitute characters the standard PDF fonts cannot encode. */
function pdfSafe(value: unknown): string {
	return String(value ?? "")
		.replace(/[\u2013\u2014]/g, "-")
		.replace(/[\u2018\u2019]/g, "'")
		.replace(/[\u201c\u201d]/g, '"')
		.replace(/\u2026/g, "...")
		.replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function truncate(
	value: string,
	maxWidth: number,
	font: PDFFont,
	size: number,
): string {
	if (maxWidth <= 0) return "";
	if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
	let result = value;
	while (
		result.length > 1 &&
		font.widthOfTextAtSize(`${result}...`, size) > maxWidth
	) {
		result = result.slice(0, -1);
	}
	return `${result}...`;
}

class PdfReport {
	private page: PDFPage;
	private y: number;
	private readonly pageWidth: number;
	private readonly pageHeight: number;

	constructor(
		private readonly doc: PDFDocument,
		private readonly font: PDFFont,
		private readonly bold: PDFFont,
		pageSize: readonly [number, number],
	) {
		this.pageWidth = pageSize[0];
		this.pageHeight = pageSize[1];
		this.page = this.newPage();
		this.y = this.pageHeight - PDF_MARGIN;
	}

	private newPage(): PDFPage {
		const page = this.doc.addPage([this.pageWidth, this.pageHeight]);
		return page;
	}

	private ensure(space: number): void {
		if (this.y - space < PDF_MARGIN) {
			this.page = this.newPage();
			this.y = this.pageHeight - PDF_MARGIN;
		}
	}

	private text(
		value: string,
		x: number,
		options: { font?: PDFFont; size?: number; color?: RGB } = {},
	): void {
		this.page.drawText(pdfSafe(value), {
			x,
			y: this.y,
			size: options.size ?? 9.5,
			font: options.font ?? this.font,
			color: options.color ?? INK,
		});
	}

	heading(value: string): void {
		this.ensure(28);
		this.text(value, PDF_MARGIN, { font: this.bold, size: 15, color: ACCENT });
		this.y -= 20;
	}

	subheading(value: string): void {
		this.ensure(20);
		this.text(value, PDF_MARGIN, { font: this.bold, size: 11 });
		this.y -= 15;
	}

	muted(value: string): void {
		this.ensure(12);
		this.text(value, PDF_MARGIN, { size: 8.5, color: MUTED });
		this.y -= 12;
	}

	line(value: string): void {
		this.ensure(13);
		this.text(value, PDF_MARGIN);
		this.y -= 13;
	}

	field(label: string, value: string): void {
		this.ensure(13);
		this.text(label, PDF_MARGIN, { color: MUTED, size: 9 });
		this.text(value, PDF_MARGIN + 120, { size: 9.5 });
		this.y -= 13;
	}

	spacer(height = 8): void {
		this.y -= height;
	}

	paragraph(value: string): void {
		const maxWidth = this.pageWidth - PDF_MARGIN * 2;
		const words = pdfSafe(value).split(/\s+/).filter(Boolean);
		let current = "";
		const flush = () => {
			if (current === "") return;
			this.ensure(13);
			this.text(current, PDF_MARGIN);
			this.y -= 13;
			current = "";
		};
		for (const word of words) {
			const candidate = current === "" ? word : `${current} ${word}`;
			if (
				current !== "" &&
				this.font.widthOfTextAtSize(candidate, 9.5) > maxWidth
			) {
				flush();
				current = word;
			} else {
				current = candidate;
			}
		}
		flush();
	}

	table(
		headers: string[],
		rows: string[][],
		widths: number[],
		fontSize = 8,
	): void {
		const rowHeight = fontSize + 6;
		const drawHeader = () => {
			let x = PDF_MARGIN;
			headers.forEach((header, index) => {
				this.text(header, x, { font: this.bold, size: fontSize, color: MUTED });
				x += widths[index] ?? 0;
			});
			this.y -= rowHeight;
		};

		this.ensure(rowHeight * 2);
		drawHeader();
		for (const row of rows) {
			if (this.y - rowHeight < PDF_MARGIN) {
				this.page = this.newPage();
				this.y = this.pageHeight - PDF_MARGIN;
				drawHeader();
			}
			let x = PDF_MARGIN;
			row.forEach((cell, index) => {
				const width = widths[index] ?? 0;
				this.text(truncate(pdfSafe(cell), width - 4, this.font, fontSize), x, {
					size: fontSize,
				});
				x += width;
			});
			this.y -= rowHeight;
		}
	}

	async finish(): Promise<Uint8Array> {
		return this.doc.save();
	}
}

export async function createPdf(
	pageSize: readonly [number, number],
): Promise<PdfReport> {
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	const bold = await doc.embedFont(StandardFonts.HelveticaBold);
	return new PdfReport(doc, font, bold, pageSize);
}

/* ------------------------------------------------------------------ */
/* XLSX / CSV helpers                                                  */
/* ------------------------------------------------------------------ */

export interface ColumnSpec {
	header: string;
	key: string;
	width?: number;
}

export function addWorksheet(
	workbook: ExcelJS.Workbook,
	name: string,
	columns: ColumnSpec[],
	rows: Array<Record<string, unknown>>,
): void {
	const sheet = workbook.addWorksheet(name.slice(0, 31));
	sheet.columns = columns.map((column) => ({
		header: column.header,
		key: column.key,
		width: column.width ?? 18,
	}));
	for (const row of rows) sheet.addRow(row);
	sheet.getRow(1).font = { bold: true };
	sheet.views = [{ state: "frozen", ySplit: 1 }];
}

export async function excelBytes(
	workbook: ExcelJS.Workbook,
): Promise<Uint8Array> {
	const buffer = await workbook.xlsx.writeBuffer();
	return new Uint8Array(buffer as ArrayBuffer);
}

export function toCsv(
	headers: string[],
	rows: Array<Array<string | number | null | undefined>>,
): string {
	const quoteCsvValue = (value: string | number | null | undefined): string => {
		const text = value === null || value === undefined ? "" : String(value);
		return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
	};
	const lines = [headers, ...rows].map((row) =>
		row.map(quoteCsvValue).join(","),
	);
	return `${lines.join("\r\n")}\r\n`;
}

/* ------------------------------------------------------------------ */
/* Jobs reports                                                        */
/* ------------------------------------------------------------------ */

export async function printTaskSlip(
	ctx: ViewerContext,
	args: TaskSlipArgs,
): Promise<ExportArtifactRow> {
	const scope = authorize(ctx, "printTaskSlip");

	const [task] = await ctx.db
		.select()
		.from(tasks)
		.where(and(eq(tasks.id, args.taskId), isNull(tasks.deletedAt)))
		.limit(1);
	if (!task || !taskVisible(ctx, scope, task)) {
		throw errors.notFound(`Task ${args.taskId} was not found.`);
	}

	const project = task.projectId
		? await ctx.db
				.select({ name: projects.name })
				.from(projects)
				.where(eq(projects.id, task.projectId))
				.limit(1)
				.then((rows) => rows[0]?.name ?? "")
		: "";
	const assignee = task.assignedTo
		? await loadUserSummary(ctx, task.assignedTo)
		: null;
	const creator = task.createdBy
		? await loadUserSummary(ctx, task.createdBy)
		: null;
	const department = await departmentName(ctx, task.departmentId);

	const logs = await ctx.db
		.select()
		.from(taskProgressLogs)
		.where(eq(taskProgressLogs.taskId, task.id))
		.orderBy(asc(taskProgressLogs.createdAt));
	const transitions = await ctx.db
		.select()
		.from(taskStateTransitions)
		.where(eq(taskStateTransitions.taskId, task.id))
		.orderBy(asc(taskStateTransitions.createdAt));
	const requests = await ctx.db
		.select()
		.from(taskRequests)
		.where(eq(taskRequests.taskId, task.id))
		.orderBy(asc(taskRequests.createdAt));

	const names = new Map<string, string>();
	for (const id of [
		...logs.map((log) => log.userId),
		...transitions.map((row) => row.actorId),
		...requests.map((row) => row.userId),
	]) {
		if (id && !names.has(id)) {
			const summary = await loadUserSummary(ctx, id);
			names.set(id, summary ? `${summary.name} (${summary.userCode})` : id);
		}
	}
	const nameOf = (id: string | null): string =>
		id ? (names.get(id) ?? id) : "";

	const report = await createPdf(A4_PORTRAIT);
	report.heading("TASK ASSIGNMENT / ACCEPTANCE SLIP");
	report.muted(
		`Task ${task.taskCode} · generated ${formatDateTime(new Date())}`,
	);
	report.spacer(4);

	report.field("Task code", task.taskCode);
	report.field("Title", task.title);
	report.field("Project", project || "-");
	report.field("Task type", task.taskType);
	report.field("Priority", task.priority);
	report.field("State", task.state);
	report.field("Progress", `${task.progressPercentage}%`);
	report.field(
		"Assigned to",
		assignee ? `${assignee.name} (${assignee.userCode})` : "-",
	);
	report.field(
		"Created by",
		creator ? `${creator.name} (${creator.userCode})` : "-",
	);
	report.field("Department", department || "-");
	report.field("Start date", formatDateOnly(task.startDate) || "-");
	report.field("Due date", formatDateOnly(task.endDate) || "-");
	report.field(
		"Extended deadline",
		formatDateOnly(task.extendedDeadline) || "-",
	);
	report.field("Urgent hourly", task.isUrgentHourly ? "Yes" : "No");
	if (task.description) {
		report.spacer(2);
		report.subheading("Description");
		report.paragraph(task.description);
	}

	report.spacer(6);
	report.subheading("Time log");
	if (logs.length === 0) {
		report.muted("No progress has been logged for this task.");
	} else {
		report.table(
			["Logged at", "User", "Progress", "Comment"],
			logs.map((log) => [
				formatDateTime(log.createdAt),
				nameOf(log.userId),
				`${log.previousPercentage}% -> ${log.newPercentage}%`,
				log.logComment ?? "",
			]),
			[110, 150, 80, 183],
		);
	}

	report.spacer(6);
	report.subheading("Comments and history");
	const historyRows: string[][] = [
		...transitions.map((row) => [
			formatDateTime(row.createdAt),
			nameOf(row.actorId),
			`${row.fromState ?? "-"} -> ${row.toState}`,
			row.reason ?? "",
		]),
		...requests.map((row) => [
			formatDateTime(row.createdAt),
			nameOf(row.userId),
			`${row.requestType} (${row.status})`,
			row.reviewComment ? `${row.reason} | ${row.reviewComment}` : row.reason,
		]),
	];
	if (historyRows.length === 0) {
		report.muted("No comments or state changes recorded.");
	} else {
		report.table(
			["When", "Actor", "Change", "Reason / comment"],
			historyRows,
			[110, 150, 110, 153],
		);
	}

	const bytes = await report.finish();
	return persistArtifact(ctx, {
		baseName: `task-slip-${task.taskCode}`,
		format: "PDF",
		data: bytes,
	});
}

interface TaskListRow {
	taskCode: string;
	title: string;
	projectName: string | null;
	assigneeName: string | null;
	assigneeCode: string | null;
	departmentName: string | null;
	taskType: string;
	priority: string;
	state: string;
	progressPercentage: number;
	startDate: Date | null;
	endDate: Date | null;
	isOverdue: boolean;
	createdAt: Date;
}

async function loadScopedTaskList(
	ctx: ViewerContext,
	scope: DataScope,
	filter: TaskExportFilter | null | undefined,
): Promise<TaskListRow[]> {
	const conditions: SQL[] = [isNull(tasks.deletedAt)];

	if (scope === "PERSONAL") {
		const id = viewerId(ctx);
		pushCondition(
			conditions,
			or(eq(tasks.assignedTo, id), eq(tasks.createdBy, id)),
		);
	} else if (scope === "DEPARTMENT_ONLY") {
		const departmentId = scopedDepartmentId(ctx, scope);
		conditions.push(
			departmentId === null ? sql`1 = 0` : eq(tasks.departmentId, departmentId),
		);
	}

	if (filter?.projectId) conditions.push(eq(tasks.projectId, filter.projectId));
	if (filter?.departmentId) {
		conditions.push(eq(tasks.departmentId, filter.departmentId));
	}
	if (filter?.assignedToId) {
		conditions.push(eq(tasks.assignedTo, filter.assignedToId));
	}
	if (filter?.state) conditions.push(eq(tasks.state, filter.state));
	if (filter?.taskType) conditions.push(eq(tasks.taskType, filter.taskType));
	if (filter?.priority) conditions.push(eq(tasks.priority, filter.priority));
	if (filter?.isOverdue !== null && filter?.isOverdue !== undefined) {
		conditions.push(eq(tasks.isOverdue, filter.isOverdue));
	}
	if (filter?.isUrgentHourly !== null && filter?.isUrgentHourly !== undefined) {
		conditions.push(eq(tasks.isUrgentHourly, filter.isUrgentHourly));
	}
	const endBefore = parseDate(filter?.endDateBefore ?? null);
	if (endBefore) conditions.push(lte(tasks.endDate, endBefore));
	const endAfter = parseDate(filter?.endDateAfter ?? null);
	if (endAfter) conditions.push(gte(tasks.endDate, endAfter));
	if (filter?.search) {
		pushCondition(
			conditions,
			or(
				like(tasks.title, `%${filter.search}%`),
				like(tasks.taskCode, `%${filter.search}%`),
			),
		);
	}

	return ctx.db
		.select({
			taskCode: tasks.taskCode,
			title: tasks.title,
			projectName: projects.name,
			assigneeName: user.name,
			assigneeCode: user.userCode,
			departmentName: departments.name,
			taskType: tasks.taskType,
			priority: tasks.priority,
			state: tasks.state,
			progressPercentage: tasks.progressPercentage,
			startDate: tasks.startDate,
			endDate: tasks.endDate,
			isOverdue: tasks.isOverdue,
			createdAt: tasks.createdAt,
		})
		.from(tasks)
		.leftJoin(projects, eq(projects.id, tasks.projectId))
		.leftJoin(user, eq(user.id, tasks.assignedTo))
		.leftJoin(departments, eq(departments.id, tasks.departmentId))
		.where(and(...conditions))
		.orderBy(desc(tasks.createdAt));
}

const TASK_EXPORT_COLUMNS: ColumnSpec[] = [
	{ header: "Task code", key: "taskCode", width: 16 },
	{ header: "Title", key: "title", width: 34 },
	{ header: "Project", key: "project", width: 22 },
	{ header: "Assignee", key: "assignee", width: 24 },
	{ header: "Department", key: "department", width: 20 },
	{ header: "Type", key: "type", width: 12 },
	{ header: "Priority", key: "priority", width: 12 },
	{ header: "State", key: "state", width: 12 },
	{ header: "Progress %", key: "progress", width: 12 },
	{ header: "Start", key: "start", width: 12 },
	{ header: "Due", key: "due", width: 12 },
	{ header: "Overdue", key: "overdue", width: 10 },
	{ header: "Created", key: "created", width: 18 },
];

function taskListRecord(row: TaskListRow): Record<string, unknown> {
	return {
		taskCode: row.taskCode,
		title: row.title,
		project: row.projectName ?? "",
		assignee: row.assigneeName
			? `${row.assigneeName} (${row.assigneeCode ?? ""})`
			: "",
		department: row.departmentName ?? "",
		type: row.taskType,
		priority: row.priority,
		state: row.state,
		progress: row.progressPercentage,
		start: formatDateOnly(row.startDate),
		due: formatDateOnly(row.endDate),
		overdue: row.isOverdue ? "Yes" : "No",
		created: formatDateTime(row.createdAt),
	};
}

export async function exportTasks(
	ctx: ViewerContext,
	args: ExportTasksArgs,
): Promise<ExportArtifactRow> {
	const scope = authorize(ctx, "exportTasks");
	const format = normalizeFormat(args.format, "XLSX");
	const rows = await loadScopedTaskList(ctx, scope, args.filter);

	if (format === "CSV") {
		const csv = toCsv(
			TASK_EXPORT_COLUMNS.map((column) => column.header),
			rows.map((row) =>
				TASK_EXPORT_COLUMNS.map(
					(column) => taskListRecord(row)[column.key] as string | number,
				),
			),
		);
		return persistArtifact(ctx, {
			baseName: "task-list",
			format: "CSV",
			data: csv,
		});
	}

	const workbook = new ExcelJS.Workbook();
	addWorksheet(
		workbook,
		"Task List",
		TASK_EXPORT_COLUMNS,
		rows.map(taskListRecord),
	);
	return persistArtifact(ctx, {
		baseName: "task-list",
		format: "XLSX",
		data: await excelBytes(workbook),
	});
}

/* ------------------------------------------------------------------ */
/* Planning reports                                                    */
/* ------------------------------------------------------------------ */

export async function printLeaveRequest(
	ctx: ViewerContext,
	args: PrintLeaveRequestArgs,
): Promise<ExportArtifactRow> {
	const scope = authorize(ctx, "printLeaveRequest");

	const [request] = await ctx.db
		.select()
		.from(leaveRequests)
		.where(eq(leaveRequests.id, args.leaveRequestId))
		.limit(1);
	if (!request) {
		throw errors.notFound(
			`Leave request ${args.leaveRequestId} was not found.`,
		);
	}

	const owner = await loadUserSummary(ctx, request.userId);
	if (scope === "PERSONAL" && request.userId !== viewerId(ctx)) {
		throw errors.notFound(
			`Leave request ${args.leaveRequestId} was not found.`,
		);
	}
	if (
		scope === "DEPARTMENT_ONLY" &&
		owner?.departmentId !== scopedDepartmentId(ctx, scope)
	) {
		throw errors.notFound(
			`Leave request ${args.leaveRequestId} was not found.`,
		);
	}

	const [code] = await ctx.db
		.select({ name: leaveCodes.name, category: leaveCodes.category })
		.from(leaveCodes)
		.where(eq(leaveCodes.code, request.leaveCode))
		.limit(1);
	const handover = request.handoverUserId
		? await loadUserSummary(ctx, request.handoverUserId)
		: null;
	const approver = request.approvedBy
		? await loadUserSummary(ctx, request.approvedBy)
		: null;
	const department = await departmentName(ctx, owner?.departmentId ?? null);

	const report = await createPdf(A4_PORTRAIT);
	report.heading("LEAVE REQUEST");
	report.muted(`Generated ${formatDateTime(new Date())}`);
	report.spacer(6);

	report.subheading("Employee");
	report.field("Name", owner?.name ?? "-");
	report.field("Employee code", owner?.userCode ?? "-");
	report.field("Department", department || "-");
	report.spacer(6);

	report.subheading("Request");
	report.field(
		"Leave code",
		code ? `${request.leaveCode} - ${code.name}` : request.leaveCode,
	);
	report.field("Category", code?.category ?? "-");
	report.field("Start date", formatDateOnly(request.startDate));
	report.field("End date", formatDateOnly(request.endDate));
	report.field("Total days", formatNumber(request.totalDays));
	report.field(
		"Handover to",
		handover ? `${handover.name} (${handover.userCode})` : "-",
	);
	report.field("Status", request.status);
	report.field("Submitted", formatDateTime(request.createdAt));
	if (request.approvedAt) {
		report.field("Decided", formatDateTime(request.approvedAt));
		report.field(
			"Decided by",
			approver ? `${approver.name} (${approver.userCode})` : "-",
		);
	}
	report.spacer(4);
	report.subheading("Reason");
	report.paragraph(request.reason || "-");

	report.spacer(18);
	report.subheading("Signatures");
	report.line("Employee signature: ______________________________");
	report.spacer(6);
	report.line("Approver signature: ______________________________");
	report.spacer(6);
	report.line("Date: ____________________");

	const bytes = await report.finish();
	return persistArtifact(ctx, {
		baseName: `leave-request-${request.leaveCode}-${formatDateOnly(request.startDate)}`,
		format: "PDF",
		data: bytes,
	});
}

function enumerateDays(from: Date, to: Date, maxDays = 62): Date[] {
	const days: Date[] = [];
	const cursor = new Date(
		Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
	);
	const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
	while (cursor.getTime() <= end && days.length < maxDays) {
		days.push(new Date(cursor));
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return days;
}

const PRIORITY_RANK: Record<string, number> = {
	LOW: 1,
	MEDIUM: 2,
	HIGH: 3,
	URGENT: 4,
};

export async function printAttendanceCalendar(
	ctx: ViewerContext,
	args: PrintAttendanceCalendarArgs,
): Promise<ExportArtifactRow> {
	const scope = authorize(ctx, "printAttendanceCalendar");
	const from = parseDate(args.input.fromDate);
	const to = parseDate(args.input.toDate);
	if (!from || !to || to.getTime() < from.getTime()) {
		throw errors.validation(
			"A valid from/to date range is required to print the calendar.",
		);
	}

	const ids = await effectiveUserIds(
		ctx,
		scope,
		args.input.departmentId ?? null,
	);
	const users = await loadUserSummaries(ctx, ids);
	const userIds = users.map((row) => row.id);
	const days = enumerateDays(from, to);

	const fromKey = dayKeyOf(from);
	const toKey = dayKeyOf(to);

	const attendanceByKey = new Map<
		string,
		{ leaveCode: string | null; isLate: boolean; isEarlyLeave: boolean }
	>();
	if (userIds.length > 0) {
		const records = await ctx.db
			.select({
				userId: attendanceRecords.userId,
				workDate: attendanceRecords.workDate,
				leaveCode: attendanceRecords.leaveCode,
				isLate: attendanceRecords.isLate,
				isEarlyLeave: attendanceRecords.isEarlyLeave,
			})
			.from(attendanceRecords)
			.where(
				and(
					inArray(attendanceRecords.userId, userIds),
					gte(attendanceRecords.workDate, fromKey),
					lte(attendanceRecords.workDate, toKey),
				),
			);
		for (const record of records) {
			attendanceByKey.set(`${record.userId}|${record.workDate}`, {
				leaveCode: record.leaveCode,
				isLate: record.isLate,
				isEarlyLeave: record.isEarlyLeave,
			});
		}
	}

	const taskByKey = new Map<string, { state: string; rank: number }>();
	if (userIds.length > 0) {
		const taskRows = await ctx.db
			.select({
				userId: tasks.assignedTo,
				state: tasks.state,
				priority: tasks.priority,
				startDate: tasks.startDate,
				endDate: tasks.endDate,
			})
			.from(tasks)
			.where(and(inArray(tasks.assignedTo, userIds), isNull(tasks.deletedAt)));
		for (const task of taskRows) {
			if (!task.userId) continue;
			const start = task.startDate ?? task.endDate ?? null;
			const end = task.endDate ?? task.startDate ?? null;
			if (!start || !end) continue;
			const startKey = dayKeyOf(start);
			const endKey = dayKeyOf(end);
			const rank = PRIORITY_RANK[task.priority] ?? 0;
			for (const day of days) {
				const key = dayKeyOf(day);
				if (key < startKey || key > endKey) continue;
				const mapKey = `${task.userId}|${key}`;
				const existing = taskByKey.get(mapKey);
				if (!existing || rank > existing.rank) {
					taskByKey.set(mapKey, { state: task.state, rank });
				}
			}
		}
	}

	const report = await createPdf(A4_LANDSCAPE);
	report.heading("ATTENDANCE CALENDAR");
	report.muted(
		`${formatDateOnly(from)} to ${formatDateOnly(to)} · ${users.length} employee(s) · generated ${formatDateTime(new Date())}`,
	);
	report.spacer(4);

	if (args.input.departmentId) {
		report.line(
			`Department: ${await departmentName(ctx, args.input.departmentId)}`,
		);
		report.spacer(2);
	}

	const nameWidth = 120;
	const available = A4_LANDSCAPE[0] - PDF_MARGIN * 2 - nameWidth;
	const columnWidth = days.length > 0 ? available / days.length : 0;

	const header = ["Employee", ...days.map((day) => String(day.getUTCDate()))];
	const widths = [nameWidth, ...days.map(() => columnWidth)];
	const rows = users.map((row) => {
		const cells = days.map((day) => {
			const key = `${row.id}|${dayKeyOf(day)}`;
			const record = attendanceByKey.get(key);
			if (record?.leaveCode) return record.leaveCode;
			if (record) {
				if (record.isLate && record.isEarlyLeave) return "L/E";
				if (record.isLate) return "L";
				if (record.isEarlyLeave) return "E";
				return "P";
			}
			const task = taskByKey.get(key);
			return task ? task.state : "";
		});
		return [`${row.name} (${row.userCode})`, ...cells];
	});

	if (rows.length === 0) {
		report.muted("No employees are in scope for this range.");
	} else {
		report.table(header, rows, widths, 7);
	}

	report.spacer(6);
	report.muted(
		"Legend: P = present, L = late, E = early leave, L/E = late and early, leave codes (AL/UAL/SL/…), REQ/ACT/PEN/APP/REJ/CAN/OVERDUE = task state; blank = no record.",
	);

	const bytes = await report.finish();
	return persistArtifact(ctx, {
		baseName: `attendance-calendar-${formatDateOnly(from)}-${formatDateOnly(to)}`,
		format: "PDF",
		data: bytes,
	});
}

async function loadLeaveBalances(
	ctx: ViewerContext,
	userIds: string[] | null,
): Promise<Map<string, number>> {
	if (userIds !== null && userIds.length === 0) return new Map();
	const conditions = [
		inArray(leaveBalanceEntries.leaveCode, [...BALANCE_TRACKED]),
	];
	if (userIds !== null) {
		conditions.push(inArray(leaveBalanceEntries.userId, userIds));
	}
	const rows = await ctx.db
		.select({
			userId: leaveBalanceEntries.userId,
			leaveCode: leaveBalanceEntries.leaveCode,
			deltaDays: leaveBalanceEntries.deltaDays,
		})
		.from(leaveBalanceEntries)
		.where(and(...conditions));

	const balances = new Map<string, number>();
	for (const row of rows) {
		const key = `${row.userId}|${row.leaveCode}`;
		balances.set(key, (balances.get(key) ?? 0) + row.deltaDays);
	}
	return balances;
}

const ATTENDANCE_COLUMNS: ColumnSpec[] = [
	{ header: "Work date", key: "workDate", width: 12 },
	{ header: "Employee code", key: "userCode", width: 14 },
	{ header: "Employee", key: "employee", width: 24 },
	{ header: "Department", key: "department", width: 20 },
	{ header: "Check in", key: "checkIn", width: 18 },
	{ header: "Check out", key: "checkOut", width: 18 },
	{ header: "Hours", key: "hours", width: 10 },
	{ header: "Late", key: "late", width: 8 },
	{ header: "Early leave", key: "earlyLeave", width: 12 },
	{ header: "Leave code", key: "leaveCode", width: 12 },
];

export async function exportAttendance(
	ctx: ViewerContext,
	args: ExportAttendanceArgs,
): Promise<ExportArtifactRow> {
	const scope = authorize(ctx, "exportAttendance");
	const format = normalizeFormat(args.format, "XLSX");
	const filter = args.filter ?? {};

	let userIds = await effectiveUserIds(ctx, scope, filter.departmentId ?? null);
	if (filter.userId) {
		userIds =
			userIds === null
				? [filter.userId]
				: userIds.filter((id) => id === filter.userId);
	}

	const conditions: SQL[] = [];
	if (userIds !== null) {
		if (userIds.length === 0) {
			conditions.push(sql`1 = 0`);
		} else {
			conditions.push(inArray(attendanceRecords.userId, userIds));
		}
	}
	const fromDate = parseDate(filter.fromDate ?? null);
	if (fromDate)
		conditions.push(gte(attendanceRecords.workDate, toDateOnly(fromDate)));
	const toDate = parseDate(filter.toDate ?? null);
	if (toDate)
		conditions.push(lte(attendanceRecords.workDate, toDateOnly(toDate)));
	if (filter.isLate !== null && filter.isLate !== undefined) {
		conditions.push(eq(attendanceRecords.isLate, filter.isLate));
	}
	if (filter.isEarlyLeave !== null && filter.isEarlyLeave !== undefined) {
		conditions.push(eq(attendanceRecords.isEarlyLeave, filter.isEarlyLeave));
	}
	if (filter.leaveCode) {
		conditions.push(eq(attendanceRecords.leaveCode, filter.leaveCode));
	}

	const records =
		conditions.length > 0
			? await ctx.db
					.select({
						workDate: attendanceRecords.workDate,
						userCode: user.userCode,
						employee: user.name,
						department: departments.name,
						checkIn: attendanceRecords.checkIn,
						checkOut: attendanceRecords.checkOut,
						hours: attendanceRecords.workingHours,
						late: attendanceRecords.isLate,
						earlyLeave: attendanceRecords.isEarlyLeave,
						leaveCode: attendanceRecords.leaveCode,
					})
					.from(attendanceRecords)
					.innerJoin(user, eq(user.id, attendanceRecords.userId))
					.leftJoin(departments, eq(departments.id, user.departmentId))
					.where(and(...conditions))
					.orderBy(asc(attendanceRecords.workDate), asc(user.userCode))
			: [];

	if (format === "CSV") {
		const csv = toCsv(
			ATTENDANCE_COLUMNS.map((column) => column.header),
			records.map((record) =>
				ATTENDANCE_COLUMNS.map((column) => {
					switch (column.key) {
						case "checkIn":
							return formatDateTime(record.checkIn);
						case "checkOut":
							return formatDateTime(record.checkOut);
						case "hours":
							return formatNumber(record.hours);
						case "late":
							return record.late ? "Yes" : "No";
						case "earlyLeave":
							return record.earlyLeave ? "Yes" : "No";
						default:
							return (record as Record<string, unknown>)[column.key] as string;
					}
				}),
			),
		);
		return persistArtifact(ctx, {
			baseName: "attendance",
			format: "CSV",
			data: csv,
		});
	}

	const balances = await loadLeaveBalances(ctx, userIds);
	const balanceUsers =
		userIds === null
			? await loadUserSummaries(ctx, null)
			: await loadUserSummaries(ctx, userIds);

	const workbook = new ExcelJS.Workbook();
	addWorksheet(
		workbook,
		"Attendance",
		ATTENDANCE_COLUMNS,
		records.map((record) => ({
			workDate: record.workDate,
			userCode: record.userCode,
			employee: record.employee,
			department: record.department ?? "",
			checkIn: formatDateTime(record.checkIn),
			checkOut: formatDateTime(record.checkOut),
			hours: record.hours,
			late: record.late ? "Yes" : "No",
			earlyLeave: record.earlyLeave ? "Yes" : "No",
			leaveCode: record.leaveCode ?? "",
		})),
	);
	addWorksheet(
		workbook,
		"Leave Balances",
		[
			{ header: "Employee code", key: "userCode", width: 16 },
			{ header: "Employee", key: "employee", width: 26 },
			{ header: "AL (days)", key: "al", width: 14 },
			{ header: "TOIL (days)", key: "toil", width: 14 },
		],
		balanceUsers.map((row) => ({
			userCode: row.userCode,
			employee: row.name,
			al: balances.get(`${row.id}|AL`) ?? 0,
			toil: balances.get(`${row.id}|TOIL`) ?? 0,
		})),
	);

	return persistArtifact(ctx, {
		baseName: "attendance",
		format: "XLSX",
		data: await excelBytes(workbook),
	});
}

/* ------------------------------------------------------------------ */
/* Performance reports                                                 */
/* ------------------------------------------------------------------ */

export async function printKpiReport(
	ctx: ViewerContext,
	args: KpiPeriodArgs,
): Promise<ExportArtifactRow> {
	const scope = authorize(ctx, "printKpiReport");
	const userId = scopedPersonalUserId(ctx, scope);
	const { periodYear, periodMonth } = args.input;

	const [summary] = await ctx.db
		.select()
		.from(kpiMonthlySummaries)
		.where(
			and(
				eq(kpiMonthlySummaries.userId, userId),
				eq(kpiMonthlySummaries.periodYear, periodYear),
				eq(kpiMonthlySummaries.periodMonth, periodMonth),
			),
		)
		.limit(1);

	const events = await ctx.db
		.select()
		.from(kpiScoreEvents)
		.where(
			and(
				eq(kpiScoreEvents.userId, userId),
				eq(kpiScoreEvents.periodYear, periodYear),
				eq(kpiScoreEvents.periodMonth, periodMonth),
			),
		)
		.orderBy(desc(kpiScoreEvents.occurredAt));

	const employee = await loadUserSummary(ctx, userId);
	const department = await departmentName(ctx, employee?.departmentId ?? null);
	const balances = await loadLeaveBalances(ctx, [userId]);
	const totalScore = summary?.totalKpiScore ?? 0;

	const report = await createPdf(A4_PORTRAIT);
	report.heading("KPI EVALUATION REPORT");
	report.muted(
		`Period ${periodYear}-${String(periodMonth).padStart(2, "0")} · generated ${formatDateTime(new Date())}`,
	);
	report.spacer(6);

	report.subheading("Employee");
	report.field("Name", employee?.name ?? "-");
	report.field("Employee code", employee?.userCode ?? "-");
	report.field("Department", department || "-");
	report.spacer(6);

	report.subheading("Score");
	report.field("Total KPI score", String(totalScore));
	report.spacer(4);

	report.subheading("Monthly summary");
	if (!summary) {
		report.muted("No monthly summary has been computed for this period.");
	} else {
		report.field("Tasks assigned", String(summary.totalTasksAssigned));
		report.field("Completed on time", String(summary.completedOnTime));
		report.field(
			"Completed urgent on time",
			String(summary.completedUrgentOnTime),
		);
		report.field("Approved first time", String(summary.approvedFirstTime));
		report.field("Overdue tasks", String(summary.overdueTasks));
		report.field("Returned tasks", String(summary.rejectedTasks));
		report.field("Extension requests", String(summary.extensionRequestsCount));
		report.field("Attendance rate", `${formatNumber(summary.attendanceRate)}%`);
		report.field(
			"Perfect attendance bonus",
			String(summary.perfectAttendanceBonus),
		);
		report.field("Unapproved leave", String(summary.unapprovedLeaveCount));
		report.field("Late / early occurrences", String(summary.lateEarlyCount));
	}

	report.spacer(6);
	report.subheading("Leave balances");
	report.field(
		"AL (annual leave)",
		`${formatNumber(balances.get(`${userId}|AL`) ?? 0)} days`,
	);
	report.field(
		"TOIL (time off in lieu)",
		`${formatNumber(balances.get(`${userId}|TOIL`) ?? 0)} days`,
	);

	report.spacer(6);
	report.subheading("KPI events");
	if (events.length === 0) {
		report.muted("No KPI events were recorded for this period.");
	} else {
		report.table(
			["Occurred at", "Rule", "Points"],
			events.map((event) => [
				formatDateTime(event.occurredAt),
				event.ruleCode,
				event.points > 0 ? `+${event.points}` : String(event.points),
			]),
			[150, 300, 73],
		);
	}

	const bytes = await report.finish();
	return persistArtifact(ctx, {
		baseName: `kpi-report-${periodYear}-${String(periodMonth).padStart(2, "0")}`,
		format: "PDF",
		data: bytes,
	});
}

/** `printKpiReport` is a personal operation for every role. */
function scopedPersonalUserId(ctx: ViewerContext, scope: DataScope): string {
	if (scope !== "PERSONAL") {
		throw errors.internal("The KPI report is a personal export.");
	}
	return viewerId(ctx);
}

/* ------------------------------------------------------------------ */
/* Performance audit workbook                                          */
/* ------------------------------------------------------------------ */

interface AuditSummaryRow {
	periodYear: number;
	periodMonth: number;
	userId: string;
	userCode: string;
	userName: string;
	departmentId: string | null;
	departmentName: string | null;
	totalTasksAssigned: number;
	completedOnTime: number;
	overdueTasks: number;
	unapprovedLeaveCount: number;
	perfectAttendanceBonus: number;
	attendanceRate: number;
	totalKpiScore: number;
	approvedFirstTime: number;
	rejectedTasks: number;
}

export async function exportAuditWorkbook(
	ctx: ViewerContext,
	args: ExportAuditWorkbookArgs,
): Promise<ExportArtifactRow> {
	const scope = authorize(ctx, "exportAuditWorkbook");
	const filter = args.filter;
	const ids = await effectiveUserIds(ctx, scope, filter.departmentId ?? null);

	const conditions = [eq(kpiMonthlySummaries.periodYear, filter.periodYear)];
	if (filter.periodMonth) {
		conditions.push(eq(kpiMonthlySummaries.periodMonth, filter.periodMonth));
	}
	if (ids !== null) {
		if (ids.length === 0) {
			conditions.push(sql`1 = 0`);
		} else {
			conditions.push(inArray(kpiMonthlySummaries.userId, ids));
		}
	}

	const summaries: AuditSummaryRow[] = await ctx.db
		.select({
			periodYear: kpiMonthlySummaries.periodYear,
			periodMonth: kpiMonthlySummaries.periodMonth,
			userId: kpiMonthlySummaries.userId,
			userCode: user.userCode,
			userName: user.name,
			departmentId: user.departmentId,
			departmentName: departments.name,
			totalTasksAssigned: kpiMonthlySummaries.totalTasksAssigned,
			completedOnTime: kpiMonthlySummaries.completedOnTime,
			overdueTasks: kpiMonthlySummaries.overdueTasks,
			unapprovedLeaveCount: kpiMonthlySummaries.unapprovedLeaveCount,
			perfectAttendanceBonus: kpiMonthlySummaries.perfectAttendanceBonus,
			attendanceRate: kpiMonthlySummaries.attendanceRate,
			totalKpiScore: kpiMonthlySummaries.totalKpiScore,
			approvedFirstTime: kpiMonthlySummaries.approvedFirstTime,
			rejectedTasks: kpiMonthlySummaries.rejectedTasks,
		})
		.from(kpiMonthlySummaries)
		.innerJoin(user, eq(user.id, kpiMonthlySummaries.userId))
		.leftJoin(departments, eq(departments.id, user.departmentId))
		.where(and(...conditions))
		.orderBy(
			asc(kpiMonthlySummaries.periodYear),
			asc(kpiMonthlySummaries.periodMonth),
			desc(kpiMonthlySummaries.totalKpiScore),
		);

	const period = (year: number, month: number) =>
		`${year}-${String(month).padStart(2, "0")}`;

	const level1Rows = summaries.map((row) => ({
		period: period(row.periodYear, row.periodMonth),
		year: row.periodYear,
		month: row.periodMonth,
		userCode: row.userCode,
		employee: row.userName,
		department: row.departmentName ?? "",
		tasksAssigned: row.totalTasksAssigned,
		completedOnTime: row.completedOnTime,
		overdue: row.overdueTasks,
		unapprovedLeave: row.unapprovedLeaveCount,
		perfectAttendance: row.perfectAttendanceBonus,
		attendanceRate: row.attendanceRate,
		totalScore: row.totalKpiScore,
	}));

	const departmentAggregates = new Map<
		string,
		{
			periodYear: number;
			periodMonth: number;
			departmentName: string;
			employees: Set<string>;
			tasksAssigned: number;
			attendanceSum: number;
			scoreSum: number;
			count: number;
		}
	>();
	for (const row of summaries) {
		const key = `${row.periodYear}|${row.periodMonth}|${row.departmentId ?? "none"}`;
		const bucket = departmentAggregates.get(key) ?? {
			periodYear: row.periodYear,
			periodMonth: row.periodMonth,
			departmentName: row.departmentName ?? "",
			employees: new Set<string>(),
			tasksAssigned: 0,
			attendanceSum: 0,
			scoreSum: 0,
			count: 0,
		};
		bucket.employees.add(row.userId);
		bucket.tasksAssigned += row.totalTasksAssigned;
		bucket.attendanceSum += row.attendanceRate;
		bucket.scoreSum += row.totalKpiScore;
		bucket.count += 1;
		departmentAggregates.set(key, bucket);
	}
	const level2Rows = [...departmentAggregates.values()].map((bucket) => ({
		period: period(bucket.periodYear, bucket.periodMonth),
		year: bucket.periodYear,
		month: bucket.periodMonth,
		department: bucket.departmentName,
		employees: bucket.employees.size,
		tasksAssigned: bucket.tasksAssigned,
		avgAttendanceRate:
			bucket.count > 0
				? Number((bucket.attendanceSum / bucket.count).toFixed(2))
				: 0,
		avgKpiScore:
			bucket.count > 0
				? Number((bucket.scoreSum / bucket.count).toFixed(2))
				: 0,
	}));

	const level3Rows = summaries.map((row) => ({
		year: row.periodYear,
		month: row.periodMonth,
		department: row.departmentName ?? "",
		userCode: row.userCode,
		employee: row.userName,
		tasksAssigned: row.totalTasksAssigned,
		completedOnTime: row.completedOnTime,
		overdue: row.overdueTasks,
		immediateApprovals: row.approvedFirstTime,
		returned: row.rejectedTasks,
		perfectAttendance: row.perfectAttendanceBonus,
		attendanceRate: row.attendanceRate,
		totalScore: row.totalKpiScore,
	}));

	const rankingByUser = new Map<
		string,
		{ userCode: string; employee: string; department: string; score: number }
	>();
	for (const row of summaries) {
		const existing = rankingByUser.get(row.userId) ?? {
			userCode: row.userCode,
			employee: row.userName,
			department: row.departmentName ?? "",
			score: 0,
		};
		existing.score += row.totalKpiScore;
		rankingByUser.set(row.userId, existing);
	}
	const rankingRows = [...rankingByUser.values()]
		.sort((a, b) => b.score - a.score)
		.map((row, index) => ({
			rank: index + 1,
			userCode: row.userCode,
			employee: row.employee,
			department: row.department,
			totalScore: row.score,
		}));

	const workbook = new ExcelJS.Workbook();
	if (scope === "ALL" || scope === "COMPANY_WIDE") {
		addWorksheet(
			workbook,
			"Level 1 - Company",
			[
				{ header: "Period", key: "period", width: 12 },
				{ header: "Year", key: "year", width: 8 },
				{ header: "Month", key: "month", width: 8 },
				{ header: "Employee code", key: "userCode", width: 14 },
				{ header: "Employee", key: "employee", width: 24 },
				{ header: "Department", key: "department", width: 20 },
				{ header: "Tasks assigned", key: "tasksAssigned", width: 14 },
				{ header: "Completed on time", key: "completedOnTime", width: 16 },
				{ header: "Overdue", key: "overdue", width: 10 },
				{ header: "Unapproved leave", key: "unapprovedLeave", width: 16 },
				{ header: "Perfect attendance", key: "perfectAttendance", width: 18 },
				{ header: "Attendance rate", key: "attendanceRate", width: 14 },
				{ header: "Total KPI score", key: "totalScore", width: 14 },
			],
			level1Rows,
		);
		addWorksheet(
			workbook,
			"Level 2 - Department",
			[
				{ header: "Period", key: "period", width: 12 },
				{ header: "Year", key: "year", width: 8 },
				{ header: "Month", key: "month", width: 8 },
				{ header: "Department", key: "department", width: 24 },
				{ header: "Employees", key: "employees", width: 12 },
				{ header: "Tasks assigned", key: "tasksAssigned", width: 14 },
				{ header: "Avg attendance rate", key: "avgAttendanceRate", width: 18 },
				{ header: "Avg KPI score", key: "avgKpiScore", width: 14 },
			],
			level2Rows,
		);
	}
	addWorksheet(
		workbook,
		"Level 3 - Employee",
		[
			{ header: "Year", key: "year", width: 8 },
			{ header: "Month", key: "month", width: 8 },
			{ header: "Department", key: "department", width: 20 },
			{ header: "Employee code", key: "userCode", width: 14 },
			{ header: "Employee", key: "employee", width: 24 },
			{ header: "Tasks assigned", key: "tasksAssigned", width: 14 },
			{ header: "Completed on time", key: "completedOnTime", width: 16 },
			{ header: "Overdue", key: "overdue", width: 10 },
			{ header: "Immediate approvals", key: "immediateApprovals", width: 18 },
			{ header: "Returned", key: "returned", width: 10 },
			{ header: "Perfect attendance", key: "perfectAttendance", width: 18 },
			{ header: "Attendance rate", key: "attendanceRate", width: 14 },
			{ header: "Total KPI score", key: "totalScore", width: 14 },
		],
		level3Rows,
	);
	addWorksheet(
		workbook,
		"Performance Ranking",
		[
			{ header: "Rank", key: "rank", width: 8 },
			{ header: "Employee code", key: "userCode", width: 14 },
			{ header: "Employee", key: "employee", width: 24 },
			{ header: "Department", key: "department", width: 20 },
			{ header: "Total KPI score", key: "totalScore", width: 14 },
		],
		rankingRows,
	);

	return persistArtifact(ctx, {
		baseName: `audit-workbook-${filter.periodYear}${
			filter.periodMonth
				? `-${String(filter.periodMonth).padStart(2, "0")}`
				: ""
		}`,
		format: "XLSX",
		data: await excelBytes(workbook),
	});
}
