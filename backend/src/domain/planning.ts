/**
 * Planning & Attendance domain service.
 *
 * Owns the matrix work calendar, attendance, leave, leave-fund and overtime
 * behavior described by the API contract (§6.2) and the Planning process flow.
 * Authorization and record scoping are enforced here, before any read is
 * returned or any write is committed, so a direct API call cannot bypass the
 * rules the UI applies.
 *
 * Business rules encoded here:
 * - Leave registration is limited to `AL, SL, PL, ML, CL, EL, LWP, TOIL, VTO`;
 *   the penalty codes `UAL`/`USL` are assigned only by `SUPER_ADMIN`/`HR_MANAGER`.
 * - Approving balance-tracked leave (`AL`, `TOIL`) appends a negative `USAGE`
 *   row to `leave_balance_entries`; balance reads sum the ledger.
 * - Assigning a penalty code deducts 100% of the daily wage (recorded on the
 *   attendance note and audit event; there is no payroll ledger table) and
 *   records a `KPI_UNAPPROVED_LEAVE` (`-10`) KPI score event.
 * - Approved overtime feeds the `TOIL` fund at 1 TOIL day per 8 approved hours.
 * - Date-only columns are `YYYY-MM-DD` text (`toDateOnly`), while `DateTime`
 *   values are `Date` objects (`parseDate`).
 *
 * Multi-row state changes run in a synchronous SQLite transaction so the status
 * change, its ledger entry and its scoring side effect commit together or not
 * at all.
 */

import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	lte,
	type SQL,
	sql,
} from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import {
	BALANCE_TRACKED_LEAVE_CODES,
	LEAVE_CODE_VALUES,
	type LeaveCodeValue,
	PENALTY_LEAVE_CODES,
	REGISTRABLE_LEAVE_CODES,
	type TicketStateCode,
} from "../db/enums";
import {
	attachments as attachmentsTable,
	attendanceRecords as attendanceTable,
	kpiPointRules as kpiPointRuleTable,
	kpiScoreEvents as kpiScoreEventTable,
	leaveBalanceEntries as leaveBalanceTable,
	leaveCodes as leaveCodeTable,
	leaveRequests as leaveRequestTable,
	overtimeRecords as overtimeTable,
	tasks as taskTable,
	user as userTable,
} from "../db/schema";
import {
	authorize,
	type DataScope,
	requireViewer,
	scopedDepartmentId,
	scopedUserId,
} from "../graphql/access";
import type { ViewerContext } from "../graphql/context";
import { DomainError } from "../graphql/errors";
import { parseDate, toDateOnly } from "../graphql/shapes";
import { recordAuditEvent } from "./audit";
import { NOTIFICATION_TEMPLATES, notify } from "./notifications";

/* ------------------------------------------------------------------ */
/* Documented constants                                                */
/* ------------------------------------------------------------------ */

/**
 * Penalty leave deducts the whole daily wage. No payroll ledger table exists in
 * this data model, so the rule is recorded on the attendance note and the audit
 * event instead of a payroll transaction.
 */
export const PENALTY_WAGE_DEDUCTION_PERCENT = 100;

/**
 * Approved overtime converts to the Time-Off-In-Lieu fund at one working day
 * per eight approved overtime hours (`deltaDays = hours / 8`).
 */
export const OVERTIME_HOURS_PER_TOIL_DAY = 8;

/** Guard against an unbounded matrix range. */
const MAX_MATRIX_DAYS = 366;

const KPI_UNAPPROVED_LEAVE = "KPI_UNAPPROVED_LEAVE";

const PRIORITY_WEIGHT: Record<string, number> = {
	URGENT: 0,
	HIGH: 1,
	MEDIUM: 2,
	LOW: 3,
};

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isLeaveCode(value: string): value is LeaveCodeValue {
	return (LEAVE_CODE_VALUES as readonly string[]).includes(value);
}

function asDate(value: Date | string, field: string): Date {
	const parsed = parseDate(value);
	if (!parsed) {
		throw new DomainError("VALIDATION_FAILED", `${field} is not a valid date.`);
	}
	return parsed;
}

function dateOnlyToUtc(value: string): Date {
	return new Date(`${value}T00:00:00.000Z`);
}

/** Inclusive calendar-day count between two `YYYY-MM-DD` values. */
function inclusiveDays(fromDay: string, toDay: string): number {
	return (
		Math.floor(
			(dateOnlyToUtc(toDay).getTime() - dateOnlyToUtc(fromDay).getTime()) /
				MS_PER_DAY,
		) + 1
	);
}

function enumerateDays(fromDay: string, toDay: string): string[] {
	const days: string[] = [];
	let cursor = dateOnlyToUtc(fromDay).getTime();
	const end = dateOnlyToUtc(toDay).getTime();
	while (cursor <= end) {
		days.push(new Date(cursor).toISOString().slice(0, 10));
		cursor += MS_PER_DAY;
	}
	return days;
}

function yearOf(value: string | Date): number {
	return (
		typeof value === "string" ? dateOnlyToUtc(value) : value
	).getUTCFullYear();
}

function monthOf(value: string | Date): number {
	return (
		(typeof value === "string" ? dateOnlyToUtc(value) : value).getUTCMonth() + 1
	);
}

/** Resolve the caller's permitted user ids and the requested department. */
async function resolveScope(
	ctx: ViewerContext,
	scope: DataScope,
	requestedDepartmentId: string | null = null,
): Promise<{ userIds: string[] | null; departmentId: string | null }> {
	const personalId = scopedUserId(ctx, scope);
	if (personalId) {
		return { userIds: [personalId], departmentId: null };
	}

	const scopedDept = scopedDepartmentId(ctx, scope);
	if (
		scopedDept &&
		requestedDepartmentId &&
		requestedDepartmentId !== scopedDept
	) {
		// A department-scoped caller may never widen their view.
		return { userIds: [], departmentId: scopedDept };
	}

	const departmentId = scopedDept ?? requestedDepartmentId ?? null;
	if (!departmentId) {
		return { userIds: null, departmentId: null };
	}

	const rows = await ctx.db
		.select({ id: userTable.id })
		.from(userTable)
		.where(
			and(
				eq(userTable.departmentId, departmentId),
				isNull(userTable.deletedAt),
			),
		);
	return { userIds: rows.map((row) => row.id), departmentId };
}

/** Membership condition for the caller's permitted user ids. */
function scopeCondition(
	column: SQLiteColumn,
	userIds: string[] | null,
): SQL | undefined {
	if (userIds === null) return undefined;
	if (userIds.length === 0) return sql`0 = 1`;
	return inArray(column, userIds);
}

/** Load a user and confirm the caller may act on their records. */
async function assertUserInScope(
	ctx: ViewerContext,
	scope: DataScope,
	targetUserId: string,
): Promise<void> {
	const [target] = await ctx.db
		.select({ id: userTable.id, departmentId: userTable.departmentId })
		.from(userTable)
		.where(eq(userTable.id, targetUserId))
		.limit(1);

	if (!target) {
		throw new DomainError("NOT_FOUND", "User not found.");
	}

	const personalId = scopedUserId(ctx, scope);
	if (personalId && personalId !== targetUserId) {
		throw new DomainError(
			"FORBIDDEN",
			"You do not have access to this user's records.",
		);
	}

	const scopedDept = scopedDepartmentId(ctx, scope);
	if (scopedDept && target.departmentId !== scopedDept) {
		throw new DomainError(
			"FORBIDDEN",
			"You do not have access to this user's records.",
		);
	}
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export interface MatrixCalendarInput {
	departmentId?: string | null;
	fromDate: Date | string;
	toDate: Date | string;
}

export interface MatrixCalendarDayView {
	workDate: Date;
	state: TicketStateCode | null;
	progressPercentage: number | null;
	leaveCode: LeaveCodeValue | null;
	isLate: boolean;
	isEarlyLeave: boolean;
}

export interface MatrixCalendarRowView {
	userId: string;
	days: MatrixCalendarDayView[];
}

export interface MatrixCalendarView {
	departmentId: string | null;
	fromDate: Date;
	toDate: Date;
	rows: MatrixCalendarRowView[];
}

/**
 * The department matrix calendar: one row per in-scope user and one cell per
 * day, carrying the day's ticket state/progress plus any attendance or leave
 * badge. Records are always restricted to the caller's scope.
 */
export async function matrixCalendar(
	ctx: ViewerContext,
	input: MatrixCalendarInput,
): Promise<MatrixCalendarView> {
	const scope = authorize(ctx, "matrixCalendar");

	const from = asDate(input.fromDate, "fromDate");
	const to = asDate(input.toDate, "toDate");
	const fromDay = toDateOnly(from);
	const toDay = toDateOnly(to);

	if (fromDay > toDay) {
		throw new DomainError(
			"VALIDATION_FAILED",
			"fromDate must be on or before toDate.",
		);
	}

	const days = enumerateDays(fromDay, toDay);
	if (days.length === 0 || days.length > MAX_MATRIX_DAYS) {
		throw new DomainError(
			"VALIDATION_FAILED",
			`The calendar range must cover between 1 and ${MAX_MATRIX_DAYS} days.`,
		);
	}

	const { userIds, departmentId } = await resolveScope(
		ctx,
		scope,
		input.departmentId ?? null,
	);

	if (userIds !== null && userIds.length === 0) {
		return { departmentId, fromDate: from, toDate: to, rows: [] };
	}

	const members = await ctx.db
		.select({ id: userTable.id })
		.from(userTable)
		.where(
			and(
				isNull(userTable.deletedAt),
				eq(userTable.isActive, true),
				scopeCondition(userTable.id, userIds),
			),
		)
		.orderBy(asc(userTable.userCode));

	if (members.length === 0) {
		return { departmentId, fromDate: from, toDate: to, rows: [] };
	}

	const memberIds = members.map((row) => row.id);
	const rangeStartMs = dateOnlyToUtc(fromDay).getTime();
	const rangeEndMs = dateOnlyToUtc(toDay).getTime() + MS_PER_DAY - 1;

	const taskRows = await ctx.db
		.select({
			assignedTo: taskTable.assignedTo,
			state: taskTable.state,
			progressPercentage: taskTable.progressPercentage,
			priority: taskTable.priority,
			taskCode: taskTable.taskCode,
			startDate: taskTable.startDate,
			endDate: taskTable.endDate,
			extendedDeadline: taskTable.extendedDeadline,
		})
		.from(taskTable)
		.where(
			and(
				isNull(taskTable.deletedAt),
				inArray(taskTable.assignedTo, memberIds),
				sql`(${taskTable.startDate} is null or ${taskTable.startDate} <= ${rangeEndMs})`,
				sql`(coalesce(${taskTable.extendedDeadline}, ${taskTable.endDate}) is null or coalesce(${taskTable.extendedDeadline}, ${taskTable.endDate}) >= ${rangeStartMs})`,
			),
		);

	const tasksByUser = new Map<string, typeof taskRows>();
	for (const row of taskRows) {
		if (!row.assignedTo) continue;
		const bucket = tasksByUser.get(row.assignedTo) ?? [];
		bucket.push(row);
		tasksByUser.set(row.assignedTo, bucket);
	}

	const attendanceRows = await ctx.db
		.select({
			userId: attendanceTable.userId,
			workDate: attendanceTable.workDate,
			leaveCode: attendanceTable.leaveCode,
			isLate: attendanceTable.isLate,
			isEarlyLeave: attendanceTable.isEarlyLeave,
		})
		.from(attendanceTable)
		.where(
			and(
				inArray(attendanceTable.userId, memberIds),
				gte(attendanceTable.workDate, fromDay),
				lte(attendanceTable.workDate, toDay),
			),
		);

	const attendanceByKey = new Map(
		attendanceRows.map((row) => [`${row.userId}|${row.workDate}`, row]),
	);

	const rows: MatrixCalendarRowView[] = members.map((member) => {
		const assignedTasks = (tasksByUser.get(member.id) ?? []).slice();
		assignedTasks.sort((a, b) => {
			const weight =
				(PRIORITY_WEIGHT[a.priority] ?? 99) -
				(PRIORITY_WEIGHT[b.priority] ?? 99);
			return weight !== 0 ? weight : a.taskCode.localeCompare(b.taskCode);
		});

		const cells: MatrixCalendarDayView[] = days.map((day) => {
			const dayStart = dateOnlyToUtc(day).getTime();
			const dayEnd = dayStart + MS_PER_DAY - 1;

			const covering = assignedTasks.find((task) => {
				const start = task.startDate?.getTime() ?? Number.NEGATIVE_INFINITY;
				const end =
					task.extendedDeadline?.getTime() ??
					task.endDate?.getTime() ??
					Number.POSITIVE_INFINITY;
				return start <= dayEnd && end >= dayStart;
			});

			const attendance = attendanceByKey.get(`${member.id}|${day}`);
			const leaveCode =
				attendance?.leaveCode && isLeaveCode(attendance.leaveCode)
					? attendance.leaveCode
					: null;

			return {
				workDate: dateOnlyToUtc(day),
				state: covering ? (covering.state as TicketStateCode) : null,
				progressPercentage: covering ? covering.progressPercentage : null,
				leaveCode,
				isLate: attendance?.isLate ?? false,
				isEarlyLeave: attendance?.isEarlyLeave ?? false,
			};
		});

		return { userId: member.id, days: cells };
	});

	return { departmentId, fromDate: from, toDate: to, rows };
}

export interface AttendanceFilterInput {
	userId?: string | null;
	departmentId?: string | null;
	fromDate?: Date | string | null;
	toDate?: Date | string | null;
	isLate?: boolean | null;
	isEarlyLeave?: boolean | null;
	leaveCode?: LeaveCodeValue | null;
}

export interface PagedInput {
	offset?: number | null;
	limit?: number | null;
}

function normalizePaging(input: PagedInput): { offset: number; limit: number } {
	const offset = Math.max(0, Math.trunc(input.offset ?? 0));
	const limit = Math.max(1, Math.trunc(input.limit ?? 20));
	return { offset, limit };
}

export async function attendanceRecords(
	ctx: ViewerContext,
	input: { filter?: AttendanceFilterInput | null } & PagedInput = {},
): Promise<{
	rows: (typeof attendanceTable.$inferSelect)[];
	totalCount: number;
}> {
	const scope = authorize(ctx, "attendanceRecords");
	const filter = input.filter ?? {};
	const { offset, limit } = normalizePaging(input);

	const { userIds } = await resolveScope(
		ctx,
		scope,
		filter.departmentId ?? null,
	);

	const conditions: (SQL | undefined)[] = [
		scopeCondition(attendanceTable.userId, userIds),
		filter.userId ? eq(attendanceTable.userId, filter.userId) : undefined,
		filter.fromDate
			? gte(
					attendanceTable.workDate,
					toDateOnly(asDate(filter.fromDate, "fromDate")),
				)
			: undefined,
		filter.toDate
			? lte(
					attendanceTable.workDate,
					toDateOnly(asDate(filter.toDate, "toDate")),
				)
			: undefined,
		filter.isLate !== null && filter.isLate !== undefined
			? eq(attendanceTable.isLate, filter.isLate)
			: undefined,
		filter.isEarlyLeave !== null && filter.isEarlyLeave !== undefined
			? eq(attendanceTable.isEarlyLeave, filter.isEarlyLeave)
			: undefined,
		filter.leaveCode
			? eq(attendanceTable.leaveCode, filter.leaveCode)
			: undefined,
	];
	const where = and(...conditions);

	const [{ value: totalCount }] = await ctx.db
		.select({ value: count() })
		.from(attendanceTable)
		.where(where);

	const rows = await ctx.db
		.select()
		.from(attendanceTable)
		.where(where)
		.orderBy(desc(attendanceTable.workDate), asc(attendanceTable.userId))
		.limit(limit)
		.offset(offset);

	return { rows, totalCount };
}

export interface LeaveRequestFilterInput {
	userId?: string | null;
	departmentId?: string | null;
	leaveCode?: LeaveCodeValue | null;
	status?: "PENDING" | "APPROVED" | "REJECTED" | null;
	fromDate?: Date | string | null;
	toDate?: Date | string | null;
}

export async function leaveRequests(
	ctx: ViewerContext,
	input: { filter?: LeaveRequestFilterInput | null } & PagedInput = {},
): Promise<{
	rows: (typeof leaveRequestTable.$inferSelect)[];
	totalCount: number;
}> {
	const scope = authorize(ctx, "leaveRequests");
	const filter = input.filter ?? {};
	const { offset, limit } = normalizePaging(input);

	const { userIds } = await resolveScope(
		ctx,
		scope,
		filter.departmentId ?? null,
	);

	const conditions: (SQL | undefined)[] = [
		scopeCondition(leaveRequestTable.userId, userIds),
		filter.userId ? eq(leaveRequestTable.userId, filter.userId) : undefined,
		// A date window selects requests whose interval overlaps it.
		filter.fromDate
			? gte(
					leaveRequestTable.endDate,
					toDateOnly(asDate(filter.fromDate, "fromDate")),
				)
			: undefined,
		filter.toDate
			? lte(
					leaveRequestTable.startDate,
					toDateOnly(asDate(filter.toDate, "toDate")),
				)
			: undefined,
		filter.leaveCode
			? eq(leaveRequestTable.leaveCode, filter.leaveCode)
			: undefined,
		filter.status ? eq(leaveRequestTable.status, filter.status) : undefined,
	];
	const where = and(...conditions);

	const [{ value: totalCount }] = await ctx.db
		.select({ value: count() })
		.from(leaveRequestTable)
		.where(where);

	const rows = await ctx.db
		.select()
		.from(leaveRequestTable)
		.where(where)
		.orderBy(desc(leaveRequestTable.startDate), asc(leaveRequestTable.userId))
		.limit(limit)
		.offset(offset);

	return { rows, totalCount };
}

export interface LeaveBalanceView {
	userId: string;
	leaveCode: LeaveCodeValue;
	leaveName: string;
	balanceDays: number;
}

/**
 * Remaining leave fund, summed from the `leave_balance_entries` ledger. Only the
 * balance-tracked codes are reported; an `EMPLOYEE` (personal scope) sees `AL`
 * and `TOIL` for their own ledger only.
 */
export async function leaveBalances(
	ctx: ViewerContext,
	input: { userId?: string | null } = {},
): Promise<LeaveBalanceView[]> {
	const scope = authorize(ctx, "leaveBalances");
	const viewer = requireViewer(ctx);
	const personalId = scopedUserId(ctx, scope);
	const targetUserId = input.userId ?? viewer.id;

	if (personalId && targetUserId !== personalId) {
		throw new DomainError(
			"FORBIDDEN",
			"You can only read your own leave balances.",
		);
	}
	await assertUserInScope(ctx, scope, targetUserId);

	const codes: LeaveCodeValue[] = personalId
		? ["AL", "TOIL"]
		: [...BALANCE_TRACKED_LEAVE_CODES];

	const sums = await ctx.db
		.select({
			leaveCode: leaveBalanceTable.leaveCode,
			balanceDays: sql<number>`coalesce(sum(${leaveBalanceTable.deltaDays}), 0)`,
		})
		.from(leaveBalanceTable)
		.where(
			and(
				eq(leaveBalanceTable.userId, targetUserId),
				inArray(leaveBalanceTable.leaveCode, codes),
			),
		)
		.groupBy(leaveBalanceTable.leaveCode);

	const balanceByCode = new Map(
		sums.map((row) => [row.leaveCode, Number(row.balanceDays)]),
	);

	const registry = await ctx.db
		.select({ code: leaveCodeTable.code, name: leaveCodeTable.name })
		.from(leaveCodeTable);
	const nameByCode = new Map(registry.map((row) => [row.code, row.name]));

	return codes.map((code) => ({
		userId: targetUserId,
		leaveCode: code,
		leaveName: nameByCode.get(code) ?? code,
		balanceDays: balanceByCode.get(code) ?? 0,
	}));
}

export async function overtimeRecords(
	ctx: ViewerContext,
	input: PagedInput = {},
): Promise<{
	rows: (typeof overtimeTable.$inferSelect)[];
	totalCount: number;
}> {
	const scope = authorize(ctx, "overtimeRecords");
	const { offset, limit } = normalizePaging(input);

	const { userIds } = await resolveScope(ctx, scope);
	const where = and(scopeCondition(overtimeTable.userId, userIds));

	const [{ value: totalCount }] = await ctx.db
		.select({ value: count() })
		.from(overtimeTable)
		.where(where);

	const rows = await ctx.db
		.select()
		.from(overtimeTable)
		.where(where)
		.orderBy(desc(overtimeTable.workDate), asc(overtimeTable.userId))
		.limit(limit)
		.offset(offset);

	return { rows, totalCount };
}

/* ------------------------------------------------------------------ */
/* Leave mutations                                                     */
/* ------------------------------------------------------------------ */

export interface RegisterLeaveInput {
	leaveCode: LeaveCodeValue;
	startDate: Date | string;
	endDate: Date | string;
	reason: string;
	handoverUserId?: string | null;
	attachmentIds?: string[] | null;
}

/** Register a leave request for the acting user in `PENDING` status. */
export async function registerLeave(
	ctx: ViewerContext,
	input: RegisterLeaveInput,
): Promise<typeof leaveRequestTable.$inferSelect> {
	authorize(ctx, "registerLeave");
	const viewer = requireViewer(ctx);

	if (!isLeaveCode(input.leaveCode)) {
		throw new DomainError("VALIDATION_FAILED", "Unknown leave code.");
	}
	if (
		!(REGISTRABLE_LEAVE_CODES as readonly string[]).includes(input.leaveCode)
	) {
		throw new DomainError(
			"VALIDATION_FAILED",
			`The ${input.leaveCode} leave code can only be assigned as a penalty by an authorized manager.`,
		);
	}

	const reason = input.reason?.trim() ?? "";
	if (reason.length === 0) {
		throw new DomainError("VALIDATION_FAILED", "A leave reason is required.");
	}

	const startDay = toDateOnly(asDate(input.startDate, "startDate"));
	const endDay = toDateOnly(asDate(input.endDate, "endDate"));
	if (endDay < startDay) {
		throw new DomainError(
			"VALIDATION_FAILED",
			"endDate must be on or after startDate.",
		);
	}

	if (input.handoverUserId) {
		const [handover] = await ctx.db
			.select({ id: userTable.id })
			.from(userTable)
			.where(eq(userTable.id, input.handoverUserId))
			.limit(1);
		if (!handover) {
			throw new DomainError("NOT_FOUND", "Handover user not found.");
		}
	}

	const id = crypto.randomUUID();
	const totalDays = inclusiveDays(startDay, endDay);
	const now = new Date();
	const attachmentIds = (input.attachmentIds ?? []).filter(Boolean);

	ctx.db.transaction((tx) => {
		tx.insert(leaveRequestTable)
			.values({
				id,
				userId: viewer.id,
				leaveCode: input.leaveCode,
				startDate: startDay,
				endDate: endDay,
				totalDays,
				reason,
				handoverUserId: input.handoverUserId ?? null,
				status: "PENDING",
				createdAt: now,
				updatedAt: now,
			})
			.run();

		if (attachmentIds.length > 0) {
			tx.update(attachmentsTable)
				.set({ ownerType: "LEAVE_REQUEST", ownerId: id })
				.where(inArray(attachmentsTable.id, attachmentIds))
				.run();
		}
	});

	const [row] = await ctx.db
		.select()
		.from(leaveRequestTable)
		.where(eq(leaveRequestTable.id, id))
		.limit(1);
	if (!row) {
		throw new DomainError(
			"INTERNAL",
			"The leave request could not be created.",
		);
	}

	await recordAuditEvent(ctx, {
		action: "leave.register",
		moduleCode: "planning",
		resourceType: "leave_request",
		resourceId: row.id,
		newData: {
			userId: row.userId,
			leaveCode: row.leaveCode,
			startDate: row.startDate,
			endDate: row.endDate,
			totalDays: row.totalDays,
			status: row.status,
		},
	});
	await notify(ctx, {
		template: NOTIFICATION_TEMPLATES.LEAVE_REGISTERED,
		payload: {
			leaveRequestId: row.id,
			leaveCode: row.leaveCode,
			startDate: row.startDate,
			endDate: row.endDate,
		},
		relatedType: "leave_request",
		relatedId: row.id,
	});

	return row;
}

export interface ReviewLeaveInput {
	leaveRequestId: string;
	decision: "PENDING" | "APPROVED" | "REJECTED";
	reviewComment?: string | null;
}

/**
 * Approve or reject a pending leave request. Approval of a balance-tracked code
 * (`AL`, `TOIL`) appends the matching negative `USAGE` ledger entry in the same
 * transaction as the status change.
 */
export async function reviewLeave(
	ctx: ViewerContext,
	input: ReviewLeaveInput,
): Promise<typeof leaveRequestTable.$inferSelect> {
	const scope = authorize(ctx, "reviewLeave");
	const viewer = requireViewer(ctx);

	if (input.decision === "PENDING") {
		throw new DomainError(
			"VALIDATION_FAILED",
			"decision must be APPROVED or REJECTED.",
		);
	}

	const [existing] = await ctx.db
		.select()
		.from(leaveRequestTable)
		.where(eq(leaveRequestTable.id, input.leaveRequestId))
		.limit(1);
	if (!existing) {
		throw new DomainError("NOT_FOUND", "Leave request not found.");
	}
	await assertUserInScope(ctx, scope, existing.userId);

	if (existing.status !== "PENDING") {
		throw new DomainError(
			"CONFLICT",
			`This leave request has already been ${existing.status.toLowerCase()}.`,
		);
	}
	if (!isLeaveCode(existing.leaveCode)) {
		throw new DomainError(
			"RULE_VIOLATION",
			"The leave code is not recognized.",
		);
	}

	const now = new Date();
	const approved = input.decision === "APPROVED";
	const isTracked = (BALANCE_TRACKED_LEAVE_CODES as readonly string[]).includes(
		existing.leaveCode,
	);

	ctx.db.transaction((tx) => {
		tx.update(leaveRequestTable)
			.set({
				status: input.decision,
				approvedBy: viewer.id,
				approvedAt: now,
				updatedAt: now,
			})
			.where(eq(leaveRequestTable.id, existing.id))
			.run();

		if (approved && isTracked) {
			tx.insert(leaveBalanceTable)
				.values({
					id: crypto.randomUUID(),
					userId: existing.userId,
					leaveCode: existing.leaveCode,
					entryType: "USAGE",
					// Approval draws the requested days from the tracked fund.
					deltaDays: -existing.totalDays,
					periodYear: yearOf(existing.startDate),
					referenceType: "LEAVE_REQUEST",
					referenceId: existing.id,
					note: `Approved ${existing.leaveCode} leave (${existing.totalDays} day(s)).`,
					createdBy: viewer.id,
					createdAt: now,
				})
				.run();
		}
	});

	const [row] = await ctx.db
		.select()
		.from(leaveRequestTable)
		.where(eq(leaveRequestTable.id, existing.id))
		.limit(1);
	if (!row) {
		throw new DomainError(
			"INTERNAL",
			"The leave request could not be updated.",
		);
	}

	await recordAuditEvent(ctx, {
		action: approved ? "leave.approve" : "leave.reject",
		moduleCode: "planning",
		resourceType: "leave_request",
		resourceId: row.id,
		oldData: { status: existing.status },
		newData: {
			status: row.status,
			approvedBy: row.approvedBy,
			reviewComment: input.reviewComment ?? null,
		},
	});
	await notify(ctx, {
		template: approved
			? NOTIFICATION_TEMPLATES.LEAVE_APPROVED
			: NOTIFICATION_TEMPLATES.LEAVE_REJECTED,
		payload: {
			leaveRequestId: row.id,
			leaveCode: row.leaveCode,
			status: row.status,
			reviewComment: input.reviewComment ?? null,
		},
		relatedType: "leave_request",
		relatedId: row.id,
	});

	return row;
}

export interface AssignPenaltyLeaveInput {
	userId: string;
	leaveCode: LeaveCodeValue;
	workDate: Date | string;
	note?: string | null;
}

/**
 * Assign a penalty leave code (`UAL`, `USL`) to a day.
 *
 * Records an attendance row for the day and a `KPI_UNAPPROVED_LEAVE` (`-10`)
 * score event. The 100% daily-wage deduction required by the payroll rule is
 * recorded on the attendance note and audit event because no payroll ledger
 * table exists. Only `SUPER_ADMIN`/`HR_MANAGER` pass the `assignPenaltyLeave`
 * access check enforced by the shared authorization layer.
 */
export async function assignPenaltyLeave(
	ctx: ViewerContext,
	input: AssignPenaltyLeaveInput,
): Promise<typeof attendanceTable.$inferSelect> {
	const scope = authorize(ctx, "assignPenaltyLeave");
	const viewer = requireViewer(ctx);

	if (!(PENALTY_LEAVE_CODES as readonly string[]).includes(input.leaveCode)) {
		throw new DomainError(
			"VALIDATION_FAILED",
			"Only the UAL and USL penalty codes can be assigned.",
		);
	}
	await assertUserInScope(ctx, scope, input.userId);

	const workDay = toDateOnly(asDate(input.workDate, "workDate"));

	const [codeRow] = await ctx.db
		.select()
		.from(leaveCodeTable)
		.where(eq(leaveCodeTable.code, input.leaveCode))
		.limit(1);
	if (!codeRow?.isPenalty || !codeRow?.deductsWage) {
		throw new DomainError(
			"RULE_VIOLATION",
			`The ${input.leaveCode} code is not configured as a wage-deducting penalty.`,
		);
	}

	const [kpiRule] = await ctx.db
		.select()
		.from(kpiPointRuleTable)
		.where(eq(kpiPointRuleTable.code, KPI_UNAPPROVED_LEAVE))
		.limit(1);
	if (!kpiRule) {
		throw new DomainError(
			"INTERNAL",
			`The ${KPI_UNAPPROVED_LEAVE} KPI rule is not configured.`,
		);
	}

	const [existing] = await ctx.db
		.select()
		.from(attendanceTable)
		.where(
			and(
				eq(attendanceTable.userId, input.userId),
				eq(attendanceTable.workDate, workDay),
			),
		)
		.limit(1);

	if (existing && existing.leaveCode === input.leaveCode) {
		throw new DomainError(
			"CONFLICT",
			`A ${input.leaveCode} penalty is already recorded for ${workDay}.`,
		);
	}

	const id = existing?.id ?? crypto.randomUUID();
	const now = new Date();
	const note = [
		`Penalty leave ${input.leaveCode}: deducts ${PENALTY_WAGE_DEDUCTION_PERCENT}% of the daily wage (${codeRow.payrollRule}).`,
		input.note?.trim() ? input.note.trim() : null,
	]
		.filter(Boolean)
		.join(" ");

	ctx.db.transaction((tx) => {
		if (existing) {
			tx.update(attendanceTable)
				.set({
					leaveCode: input.leaveCode,
					isLate: false,
					isEarlyLeave: false,
					workingHours: 0,
					note,
					updatedAt: now,
				})
				.where(eq(attendanceTable.id, id))
				.run();
		} else {
			tx.insert(attendanceTable)
				.values({
					id,
					userId: input.userId,
					workDate: workDay,
					checkIn: null,
					checkOut: null,
					isLate: false,
					isEarlyLeave: false,
					leaveCode: input.leaveCode,
					workingHours: 0,
					note,
					createdAt: now,
					updatedAt: now,
				})
				.run();
		}

		tx.insert(kpiScoreEventTable)
			.values({
				id: crypto.randomUUID(),
				userId: input.userId,
				taskId: null,
				ruleCode: KPI_UNAPPROVED_LEAVE,
				points: kpiRule.points,
				periodYear: yearOf(workDay),
				periodMonth: monthOf(workDay),
				occurredAt: now,
				note: `Penalty leave ${input.leaveCode} assigned for ${workDay}.`,
			})
			.run();
	});

	const [row] = await ctx.db
		.select()
		.from(attendanceTable)
		.where(eq(attendanceTable.id, id))
		.limit(1);
	if (!row) {
		throw new DomainError(
			"INTERNAL",
			"The penalty attendance record could not be saved.",
		);
	}

	await recordAuditEvent(ctx, {
		action: "leave.assign_penalty",
		moduleCode: "planning",
		resourceType: "attendance_record",
		resourceId: row.id,
		oldData: existing
			? { leaveCode: existing.leaveCode, note: existing.note }
			: null,
		newData: {
			userId: row.userId,
			workDate: row.workDate,
			leaveCode: row.leaveCode,
			wageDeductionPercent: PENALTY_WAGE_DEDUCTION_PERCENT,
			kpiRuleCode: KPI_UNAPPROVED_LEAVE,
			kpiPoints: kpiRule.points,
			assignedBy: viewer.id,
		},
	});
	await notify(ctx, {
		template: NOTIFICATION_TEMPLATES.PENALTY_LEAVE_ASSIGNED,
		payload: {
			userId: row.userId,
			workDate: row.workDate,
			leaveCode: row.leaveCode,
		},
		relatedType: "attendance_record",
		relatedId: row.id,
	});

	return row;
}

/* ------------------------------------------------------------------ */
/* Overtime mutations                                                  */
/* ------------------------------------------------------------------ */

export interface RecordOvertimeInput {
	userId: string;
	workDate: Date | string;
	hours: number;
	note?: string | null;
}

/** Record overtime for a user; it feeds the `TOIL` fund only once approved. */
export async function recordOvertime(
	ctx: ViewerContext,
	input: RecordOvertimeInput,
): Promise<typeof overtimeTable.$inferSelect> {
	const scope = authorize(ctx, "recordOvertime");
	await assertUserInScope(ctx, scope, input.userId);

	const hours = Number(input.hours);
	if (!Number.isFinite(hours) || hours <= 0) {
		throw new DomainError(
			"VALIDATION_FAILED",
			"Overtime hours must be greater than zero.",
		);
	}

	const workDay = toDateOnly(asDate(input.workDate, "workDate"));
	const id = crypto.randomUUID();
	const now = new Date();

	ctx.db.transaction((tx) => {
		tx.insert(overtimeTable)
			.values({
				id,
				userId: input.userId,
				workDate: workDay,
				hours,
				isApproved: false,
				approvedBy: null,
				approvedAt: null,
				note: input.note?.trim() ? input.note.trim() : null,
				createdAt: now,
				updatedAt: now,
			})
			.run();
	});

	const [row] = await ctx.db
		.select()
		.from(overtimeTable)
		.where(eq(overtimeTable.id, id))
		.limit(1);
	if (!row) {
		throw new DomainError(
			"INTERNAL",
			"The overtime record could not be saved.",
		);
	}

	await recordAuditEvent(ctx, {
		action: "overtime.record",
		moduleCode: "planning",
		resourceType: "overtime_record",
		resourceId: row.id,
		newData: {
			userId: row.userId,
			workDate: row.workDate,
			hours: row.hours,
			isApproved: row.isApproved,
		},
	});

	return row;
}

export interface ReviewOvertimeInput {
	overtimeId: string;
	decision: "PENDING" | "APPROVED" | "REJECTED";
	reviewComment?: string | null;
}

/**
 * Approve or reject recorded overtime. Approval appends an `ACCRUAL` row for
 * `TOIL` at `hours / OVERTIME_HOURS_PER_TOIL_DAY` days in the same transaction.
 */
export async function reviewOvertime(
	ctx: ViewerContext,
	input: ReviewOvertimeInput,
): Promise<typeof overtimeTable.$inferSelect> {
	const scope = authorize(ctx, "reviewOvertime");
	const viewer = requireViewer(ctx);

	if (input.decision === "PENDING") {
		throw new DomainError(
			"VALIDATION_FAILED",
			"decision must be APPROVED or REJECTED.",
		);
	}

	const [existing] = await ctx.db
		.select()
		.from(overtimeTable)
		.where(eq(overtimeTable.id, input.overtimeId))
		.limit(1);
	if (!existing) {
		throw new DomainError("NOT_FOUND", "Overtime record not found.");
	}
	await assertUserInScope(ctx, scope, existing.userId);

	if (existing.isApproved) {
		throw new DomainError(
			"CONFLICT",
			"This overtime record has already been approved.",
		);
	}

	const now = new Date();
	const approved = input.decision === "APPROVED";
	const toilDays = approved ? existing.hours / OVERTIME_HOURS_PER_TOIL_DAY : 0;

	ctx.db.transaction((tx) => {
		tx.update(overtimeTable)
			.set({
				isApproved: approved,
				approvedBy: viewer.id,
				approvedAt: now,
				updatedAt: now,
			})
			.where(eq(overtimeTable.id, existing.id))
			.run();

		if (approved) {
			tx.insert(leaveBalanceTable)
				.values({
					id: crypto.randomUUID(),
					userId: existing.userId,
					leaveCode: "TOIL",
					entryType: "ACCRUAL",
					deltaDays: toilDays,
					periodYear: yearOf(existing.workDate),
					referenceType: "OVERTIME_RECORD",
					referenceId: existing.id,
					note: `Approved overtime: ${existing.hours}h / ${OVERTIME_HOURS_PER_TOIL_DAY}h per TOIL day.`,
					createdBy: viewer.id,
					createdAt: now,
				})
				.run();
		}
	});

	const [row] = await ctx.db
		.select()
		.from(overtimeTable)
		.where(eq(overtimeTable.id, existing.id))
		.limit(1);
	if (!row) {
		throw new DomainError(
			"INTERNAL",
			"The overtime record could not be updated.",
		);
	}

	await recordAuditEvent(ctx, {
		action: approved ? "overtime.approve" : "overtime.reject",
		moduleCode: "planning",
		resourceType: "overtime_record",
		resourceId: row.id,
		oldData: { isApproved: existing.isApproved },
		newData: {
			isApproved: row.isApproved,
			approvedBy: row.approvedBy,
			toilDaysAccrued: approved ? toilDays : 0,
			reviewComment: input.reviewComment ?? null,
		},
	});

	return row;
}
