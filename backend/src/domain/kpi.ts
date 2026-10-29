/**
 * Deterministic KPI engine.
 *
 * Every point is traceable to a recorded, append-only `kpi_score_events` row,
 * and the monthly summary is a derived snapshot rebuilt from those events plus
 * attendance/leave data. Recomputing the same month from the same source rows
 * always produces the same totals, so the personal dashboard and the audit
 * levels cannot disagree.
 *
 * Point values live in `kpi_point_rules`; the seeded rules are the documented
 * bonus/penalty table, and the engine falls back to those values when a rule
 * row is missing.
 *
 * Rule codes are domain vocabulary and must never be renamed or translated.
 */

import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	lt,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { BALANCE_TRACKED_LEAVE_CODES, type KpiRuleCode } from "../db/enums";
import type {
	KpiMonthlySummaryRow,
	KpiPointRuleRow,
	KpiScoreEventRow,
} from "../db/schema";
import {
	attendanceRecords,
	departments,
	kpiMonthlySummaries,
	kpiPointRules,
	kpiScoreEvents,
	leaveBalanceEntries,
	leaveCodes,
	tasks,
	user,
} from "../db/schema";
import { hasRole } from "../graphql/access";
import type { ViewerContext } from "../graphql/context";
import { DomainError } from "../graphql/errors";

/* ------------------------------------------------------------------ */
/* Rule catalogue                                                      */
/* ------------------------------------------------------------------ */

export const KPI_ON_TIME_TICKET = "KPI_ON_TIME_TICKET" as const;
export const KPI_ON_TIME_URGENT = "KPI_ON_TIME_URGENT" as const;
export const KPI_FIRST_TIME_APPROVAL = "KPI_FIRST_TIME_APPROVAL" as const;
export const KPI_PERFECT_ATTENDANCE = "KPI_PERFECT_ATTENDANCE" as const;
export const KPI_OVERDUE_TICKET = "KPI_OVERDUE_TICKET" as const;
export const KPI_RETURNED_TICKET = "KPI_RETURNED_TICKET" as const;
export const KPI_EXTENSION_REQUEST = "KPI_EXTENSION_REQUEST" as const;
export const KPI_UNAPPROVED_LEAVE = "KPI_UNAPPROVED_LEAVE" as const;

export interface KpiRuleDefinition {
	readonly code: KpiRuleCode;
	readonly event: string;
	readonly points: number;
	readonly description: string;
	readonly sortOrder: number;
}

/** The documented rule table, in display order. */
export const KPI_RULES: readonly KpiRuleDefinition[] = [
	{
		code: KPI_ON_TIME_TICKET,
		event: "On-time ticket (APP)",
		points: 10,
		description: "Awarded when an assigned ticket is approved on time.",
		sortOrder: 10,
	},
	{
		code: KPI_ON_TIME_URGENT,
		event: "On-time urgent ticket (APP)",
		points: 20,
		description: "Awarded when an urgent ticket is approved on time.",
		sortOrder: 20,
	},
	{
		code: KPI_FIRST_TIME_APPROVAL,
		event: "Approved immediately without edits",
		points: 5,
		description: "Awarded when a report is approved without a return.",
		sortOrder: 30,
	},
	{
		code: KPI_PERFECT_ATTENDANCE,
		event: "Month of excellent attendance",
		points: 50,
		description: "Awarded for a month with perfect attendance.",
		sortOrder: 40,
	},
	{
		code: KPI_OVERDUE_TICKET,
		event: "Overdue ticket (OVERDUE)",
		points: -15,
		description: "Deducted when an assigned ticket becomes overdue.",
		sortOrder: 50,
	},
	{
		code: KPI_RETURNED_TICKET,
		event: "Instance returned (REJ)",
		points: -5,
		description: "Deducted when a submitted report is returned.",
		sortOrder: 60,
	},
	{
		code: KPI_EXTENSION_REQUEST,
		event: "Extension request",
		points: -2,
		description: "Deducted for each extension request.",
		sortOrder: 70,
	},
	{
		code: KPI_UNAPPROVED_LEAVE,
		event: "Late, early leave or unapproved leave (UAL/USL)",
		points: -10,
		description: "Deducted per late/early occurrence or UAL/USL instance.",
		sortOrder: 80,
	},
] as const;

/** Documented point value per rule code. */
export const KPI_POINTS = KPI_RULES.reduce<Record<KpiRuleCode, number>>(
	(acc, rule) => {
		acc[rule.code] = rule.points;
		return acc;
	},
	{} as Record<KpiRuleCode, number>,
);

const DEFAULT_RULE_BY_CODE = new Map<KpiRuleCode, KpiRuleDefinition>(
	KPI_RULES.map((rule) => [rule.code, rule]),
);

/** How many recent events the personal dashboard shows. */
export const RECENT_KPI_EVENTS_LIMIT = 20;

const PENALTY_FREE_LEAVE_CODES = ["UAL", "USL"] as const;

/* ------------------------------------------------------------------ */
/* Scope helpers                                                       */
/* ------------------------------------------------------------------ */

type KpiScope =
	| { kind: "ALL" }
	| { kind: "DEPARTMENT"; departmentId: string }
	| { kind: "PERSONAL"; userId: string };

function currentViewer(ctx: ViewerContext) {
	const viewer = ctx.viewer;
	if (!viewer) {
		throw new DomainError("UNAUTHENTICATED", "Authentication is required.");
	}
	return viewer;
}

/**
 * Resolve the caller's effective data scope for the KPI reads. Uses the same
 * role asymmetries as `access.ts`: technical roles and HR are company-wide,
 * a department head is restricted to their own department, and everyone else
 * only sees their own records.
 */
function resolveKpiScope(ctx: ViewerContext): KpiScope {
	const viewer = currentViewer(ctx);
	if (hasRole(ctx, "SUPER_ADMIN", "TECH_LEAD", "HR_MANAGER")) {
		return { kind: "ALL" };
	}
	if (hasRole(ctx, "DEPT_HEAD")) {
		if (!viewer.departmentId) {
			throw new DomainError(
				"FORBIDDEN",
				"Your account has no department, so department-scoped data is unavailable.",
			);
		}
		return { kind: "DEPARTMENT", departmentId: viewer.departmentId };
	}
	return { kind: "PERSONAL", userId: viewer.id };
}

/** Department restriction for the audit levels, or `null` when unrestricted. */
function auditDepartmentScope(ctx: ViewerContext): string | null {
	const scope = resolveKpiScope(ctx);
	return scope.kind === "DEPARTMENT" ? scope.departmentId : null;
}

/* ------------------------------------------------------------------ */
/* Period helpers                                                      */
/* ------------------------------------------------------------------ */

function validatePeriod(periodYear: number, periodMonth?: number | null): void {
	if (!Number.isInteger(periodYear)) {
		throw new DomainError(
			"VALIDATION_FAILED",
			"periodYear is required and must be an integer.",
		);
	}
	if (periodMonth !== undefined && periodMonth !== null) {
		if (!Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12) {
			throw new DomainError(
				"VALIDATION_FAILED",
				"periodMonth must be an integer between 1 and 12.",
			);
		}
	}
}

/** One month a Performance read covers. */
export interface KpiMonth {
	periodYear: number;
	periodMonth: number;
}

/** The key a month is addressed by inside a selection. */
function monthKey(periodYear: number, periodMonth: number): string {
	return `${periodYear}-${periodMonth}`;
}

/**
 * Validate a month selection and drop duplicate months.
 *
 * A selection must name at least one month, and every month must name a real
 * calendar month. Duplicates are dropped rather than rejected, so a client that
 * lists the same month twice still reads one month's data.
 */
export function validateMonthSelection(months: KpiMonth[]): KpiMonth[] {
	if (!Array.isArray(months) || months.length === 0) {
		throw new DomainError(
			"VALIDATION_FAILED",
			"At least one month must be selected.",
		);
	}

	const seen = new Set<string>();
	const unique: KpiMonth[] = [];
	for (const month of months) {
		validatePeriod(month.periodYear, month.periodMonth);
		const key = monthKey(month.periodYear, month.periodMonth);
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push({
			periodYear: month.periodYear,
			periodMonth: month.periodMonth,
		});
	}
	return unique;
}

/**
 * A condition matching any of the selected months.
 *
 * The report engine builds the same condition so a printed or exported
 * artifact covers exactly the months the screen selected.
 */
export function selectedMonthsCondition(
	yearColumn: SQLiteColumn,
	monthColumn: SQLiteColumn,
	months: KpiMonth[],
): SQL {
	const conditions = months.map((month) =>
		and(eq(yearColumn, month.periodYear), eq(monthColumn, month.periodMonth)),
	);
	// A validated selection always names at least one month, so the fallback is
	// unreachable; it keeps the condition a plain `SQL` for the caller.
	return or(...conditions) ?? sql`1 = 0`;
}

/**
 * Accept either an explicit `(periodYear, periodMonth)` pair or a single
 * occurrence date, so action handlers can refresh the month a task event
 * happened in without recomputing the calendar math themselves.
 */
function normalizePeriod(
	periodYearOrDate: number | Date,
	periodMonth?: number,
): { year: number; month: number } {
	if (periodYearOrDate instanceof Date) {
		return {
			year: periodYearOrDate.getUTCFullYear(),
			month: periodYearOrDate.getUTCMonth() + 1,
		};
	}
	if (periodMonth === undefined) {
		throw new DomainError(
			"VALIDATION_FAILED",
			"periodMonth is required when recomputing by period year.",
		);
	}
	return { year: periodYearOrDate, month: periodMonth };
}

function monthBounds(periodYear: number, periodMonth: number) {
	const startMs = Date.UTC(periodYear, periodMonth - 1, 1);
	const endMs = Date.UTC(periodYear, periodMonth, 1);
	const startText = `${periodYear}-${String(periodMonth).padStart(2, "0")}-01`;
	// `Date.UTC` rolls December into January of the next year, giving the
	// exclusive upper bound of the month.
	const endText = new Date(endMs).toISOString().slice(0, 10);
	return { startMs, endMs, startText, endText };
}

function round2(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Point rules                                                         */
/* ------------------------------------------------------------------ */

/** The configured point value for a rule, falling back to the documented one. */
export async function pointsForRule(
	ctx: ViewerContext,
	code: KpiRuleCode,
): Promise<number> {
	const [row] = await ctx.db
		.select({ points: kpiPointRules.points })
		.from(kpiPointRules)
		.where(eq(kpiPointRules.code, code))
		.limit(1);
	return row?.points ?? KPI_POINTS[code];
}

/** All point rules as persisted, ordered for display. */
export async function listKpiPointRules(
	ctx: ViewerContext,
): Promise<KpiPointRuleRow[]> {
	return ctx.db
		.select()
		.from(kpiPointRules)
		.orderBy(asc(kpiPointRules.sortOrder), asc(kpiPointRules.code));
}

async function loadRulePoints(
	ctx: ViewerContext,
): Promise<Record<KpiRuleCode, number>> {
	const rows = await ctx.db
		.select({ code: kpiPointRules.code, points: kpiPointRules.points })
		.from(kpiPointRules);
	const points = { ...KPI_POINTS };
	for (const row of rows) {
		if (row.code in points) {
			points[row.code as KpiRuleCode] = row.points;
		}
	}
	return points;
}

async function ensureRuleExists(
	ctx: ViewerContext,
	code: KpiRuleCode,
): Promise<void> {
	const definition = DEFAULT_RULE_BY_CODE.get(code);
	if (!definition) return;
	await ctx.db
		.insert(kpiPointRules)
		.values({
			code: definition.code,
			event: definition.event,
			points: definition.points,
			description: definition.description,
			isActive: true,
			sortOrder: definition.sortOrder,
		})
		.onConflictDoNothing();
}

/** Seed the documented rules that are missing. Idempotent. */
export async function ensurePointRules(ctx: ViewerContext): Promise<void> {
	for (const rule of KPI_RULES) {
		await ensureRuleExists(ctx, rule.code);
	}
}

/* ------------------------------------------------------------------ */
/* Event recording                                                     */
/* ------------------------------------------------------------------ */

export interface RecordKpiEventInput {
	userId: string;
	ruleCode: KpiRuleCode;
	taskId?: string | null;
	periodYear?: number | null;
	periodMonth?: number | null;
	note?: string | null;
}

/**
 * Append a score event for a rule trigger and refresh the affected month.
 *
 * The event's point value is the rule's configured value (falling back to the
 * documented one), so the ledger and the derived summary stay consistent.
 */
export async function recordKpiEvent(
	ctx: ViewerContext,
	input: RecordKpiEventInput,
): Promise<KpiScoreEventRow> {
	if (!DEFAULT_RULE_BY_CODE.has(input.ruleCode)) {
		throw new DomainError(
			"VALIDATION_FAILED",
			`Unknown KPI rule code "${input.ruleCode}".`,
		);
	}

	const now = new Date();
	const periodYear = input.periodYear ?? now.getUTCFullYear();
	const periodMonth = input.periodMonth ?? now.getUTCMonth() + 1;
	validatePeriod(periodYear, periodMonth);

	await ensureRuleExists(ctx, input.ruleCode);
	const points = await pointsForRule(ctx, input.ruleCode);

	const id = crypto.randomUUID();
	await ctx.db.insert(kpiScoreEvents).values({
		id,
		userId: input.userId,
		taskId: input.taskId ?? null,
		ruleCode: input.ruleCode,
		points,
		periodYear,
		periodMonth,
		occurredAt: now,
		note: input.note ?? null,
	});

	await recomputeMonthlySummary(ctx, input.userId, periodYear, periodMonth);

	const [row] = await ctx.db
		.select()
		.from(kpiScoreEvents)
		.where(eq(kpiScoreEvents.id, id))
		.limit(1);
	if (!row) {
		throw new DomainError("INTERNAL", "Failed to persist the KPI score event.");
	}
	return row;
}

/* ------------------------------------------------------------------ */
/* Monthly summary                                                     */
/* ------------------------------------------------------------------ */

export interface MonthlySummaryValues {
	userId: string;
	periodYear: number;
	periodMonth: number;
	totalTasksAssigned: number;
	completedOnTime: number;
	completedUrgentOnTime: number;
	approvedFirstTime: number;
	overdueTasks: number;
	rejectedTasks: number;
	extensionRequestsCount: number;
	attendanceRate: number;
	perfectAttendanceBonus: number;
	unapprovedLeaveCount: number;
	lateEarlyCount: number;
	totalKpiScore: number;
}

/** Upsert one monthly summary keyed by `(user, year, month)`. */
export async function upsertMonthlySummary(
	ctx: ViewerContext,
	values: MonthlySummaryValues,
): Promise<KpiMonthlySummaryRow> {
	validatePeriod(values.periodYear, values.periodMonth);

	const counters = {
		totalTasksAssigned: values.totalTasksAssigned,
		completedOnTime: values.completedOnTime,
		completedUrgentOnTime: values.completedUrgentOnTime,
		approvedFirstTime: values.approvedFirstTime,
		overdueTasks: values.overdueTasks,
		rejectedTasks: values.rejectedTasks,
		extensionRequestsCount: values.extensionRequestsCount,
		attendanceRate: values.attendanceRate,
		perfectAttendanceBonus: values.perfectAttendanceBonus,
		unapprovedLeaveCount: values.unapprovedLeaveCount,
		lateEarlyCount: values.lateEarlyCount,
		totalKpiScore: values.totalKpiScore,
	};

	await ctx.db
		.insert(kpiMonthlySummaries)
		.values({
			id: crypto.randomUUID(),
			userId: values.userId,
			periodYear: values.periodYear,
			periodMonth: values.periodMonth,
			...counters,
		})
		.onConflictDoUpdate({
			target: [
				kpiMonthlySummaries.userId,
				kpiMonthlySummaries.periodYear,
				kpiMonthlySummaries.periodMonth,
			],
			set: { ...counters, updatedAt: new Date() },
		});

	const row = await getMonthlySummary(
		ctx,
		values.userId,
		values.periodYear,
		values.periodMonth,
	);
	if (!row) {
		throw new DomainError("INTERNAL", "Failed to persist the monthly summary.");
	}
	return row;
}

/** Read a single monthly summary row, or `null`. */
export async function getMonthlySummary(
	ctx: ViewerContext,
	userId: string,
	periodYear: number,
	periodMonth: number,
): Promise<KpiMonthlySummaryRow | null> {
	const [row] = await ctx.db
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
	return row ?? null;
}

/**
 * Rebuild the monthly summary for a user from the recorded score events plus
 * the month's attendance/leave data.
 *
 * Task counters are read from the ledger (one KPI event per trigger), while the
 * attendance metrics come from `attendance_records`. The total is the documented
 * bonus sum minus the penalty sum, so the same inputs always yield the same row.
 *
 * Callable with an explicit `(periodYear, periodMonth)` pair, or with a single
 * occurrence date for action handlers that refresh the month an event happened in.
 */
export async function recomputeMonthlySummary(
	ctx: ViewerContext,
	userId: string,
	periodYear: number,
	periodMonth: number,
): Promise<KpiMonthlySummaryRow>;
export async function recomputeMonthlySummary(
	ctx: ViewerContext,
	userId: string,
	occurredAt: Date,
): Promise<KpiMonthlySummaryRow>;
export async function recomputeMonthlySummary(
	ctx: ViewerContext,
	userId: string,
	periodYearOrDate: number | Date,
	periodMonth?: number,
): Promise<KpiMonthlySummaryRow> {
	const { year, month } = normalizePeriod(periodYearOrDate, periodMonth);
	validatePeriod(year, month);

	const { startMs, endMs, startText, endText } = monthBounds(year, month);
	const rulePoints = await loadRulePoints(ctx);

	// Task triggers — one ledger event per trigger.
	const events = await ctx.db
		.select({ ruleCode: kpiScoreEvents.ruleCode })
		.from(kpiScoreEvents)
		.where(
			and(
				eq(kpiScoreEvents.userId, userId),
				eq(kpiScoreEvents.periodYear, year),
				eq(kpiScoreEvents.periodMonth, month),
			),
		);

	const eventCount = (code: KpiRuleCode): number =>
		events.reduce(
			(total, event) => total + (event.ruleCode === code ? 1 : 0),
			0,
		);

	const completedOnTime = eventCount(KPI_ON_TIME_TICKET);
	const completedUrgentOnTime = eventCount(KPI_ON_TIME_URGENT);
	const approvedFirstTime = eventCount(KPI_FIRST_TIME_APPROVAL);
	const overdueTasks = eventCount(KPI_OVERDUE_TICKET);
	const rejectedTasks = eventCount(KPI_RETURNED_TICKET);
	const extensionRequestsCount = eventCount(KPI_EXTENSION_REQUEST);

	// Tasks assigned to the user whose effective date falls in the month.
	const assigned = await ctx.db
		.select({ id: tasks.id })
		.from(tasks)
		.where(
			and(
				eq(tasks.assignedTo, userId),
				sql`coalesce(${tasks.endDate}, ${tasks.startDate}, ${tasks.createdAt}) >= ${startMs}`,
				sql`coalesce(${tasks.endDate}, ${tasks.startDate}, ${tasks.createdAt}) < ${endMs}`,
			),
		);

	// Attendance and leave for the month.
	const attendance = await ctx.db
		.select({
			leaveCode: attendanceRecords.leaveCode,
			isLate: attendanceRecords.isLate,
			isEarlyLeave: attendanceRecords.isEarlyLeave,
		})
		.from(attendanceRecords)
		.where(
			and(
				eq(attendanceRecords.userId, userId),
				gte(attendanceRecords.workDate, startText),
				lt(attendanceRecords.workDate, endText),
			),
		);

	const expectedDays = attendance.length;
	const unapprovedLeaveCount = attendance.reduce(
		(total, record) =>
			total +
			(record.leaveCode !== null &&
			(PENALTY_FREE_LEAVE_CODES as readonly string[]).includes(record.leaveCode)
				? 1
				: 0),
		0,
	);
	const lateEarlyCount = attendance.reduce(
		(total, record) => total + (record.isLate || record.isEarlyLeave ? 1 : 0),
		0,
	);

	const presentDays = Math.max(
		0,
		expectedDays - unapprovedLeaveCount - lateEarlyCount,
	);
	const attendanceRate =
		expectedDays === 0 ? 100 : round2((presentDays / expectedDays) * 100);
	const perfectAttendance =
		expectedDays > 0 && unapprovedLeaveCount === 0 && lateEarlyCount === 0;
	const perfectAttendanceBonus = perfectAttendance
		? rulePoints[KPI_PERFECT_ATTENDANCE]
		: 0;

	// Total Performance Score = Total Bonus Points (+) − Total Penalty Points (−).
	const totalKpiScore =
		completedOnTime * rulePoints[KPI_ON_TIME_TICKET] +
		completedUrgentOnTime * rulePoints[KPI_ON_TIME_URGENT] +
		approvedFirstTime * rulePoints[KPI_FIRST_TIME_APPROVAL] +
		perfectAttendanceBonus +
		overdueTasks * rulePoints[KPI_OVERDUE_TICKET] +
		rejectedTasks * rulePoints[KPI_RETURNED_TICKET] +
		extensionRequestsCount * rulePoints[KPI_EXTENSION_REQUEST] +
		(unapprovedLeaveCount + lateEarlyCount) * rulePoints[KPI_UNAPPROVED_LEAVE];

	return upsertMonthlySummary(ctx, {
		userId,
		periodYear: year,
		periodMonth: month,
		totalTasksAssigned: assigned.length,
		completedOnTime,
		completedUrgentOnTime,
		approvedFirstTime,
		overdueTasks,
		rejectedTasks,
		extensionRequestsCount,
		attendanceRate,
		perfectAttendanceBonus,
		unapprovedLeaveCount,
		lateEarlyCount,
		totalKpiScore,
	});
}

/* ------------------------------------------------------------------ */
/* Personal dashboard                                                  */
/* ------------------------------------------------------------------ */

export interface LeaveBalanceValue {
	leaveCode: string;
	leaveName: string;
	balanceDays: number;
}

export interface PersonalDashboard {
	/** The months the dashboard covers, in the order they were selected. */
	months: KpiMonth[];
	totalKpiScore: number;
	/** One entry per selected month, whether or not it reported a summary. */
	monthlyTotals: KpiMonthlyTotalValue[];
	/** The aggregate of the months that reported a summary. */
	summary: KpiPeriodSummaryValue | null;
	leaveBalances: LeaveBalanceValue[];
	recentEvents: KpiScoreEventRow[];
}

/** One selected month's total KPI score. */
export interface KpiMonthlyTotalValue {
	periodYear: number;
	periodMonth: number;
	totalKpiScore: number;
}

/**
 * The aggregate of the selected months' summaries.
 *
 * The counters sum across the months that reported a summary, and the
 * attendance rate is the mean of those months' rates — a month with no summary
 * contributes nothing rather than pulling the average toward zero.
 */
export interface KpiPeriodSummaryValue {
	totalTasksAssigned: number;
	completedOnTime: number;
	completedUrgentOnTime: number;
	approvedFirstTime: number;
	overdueTasks: number;
	rejectedTasks: number;
	extensionRequestsCount: number;
	attendanceRate: number;
	perfectAttendanceBonus: number;
	unapprovedLeaveCount: number;
	lateEarlyCount: number;
	totalKpiScore: number;
}

/** The event points recorded for the selected months, keyed by month. */
async function sumEventPointsByMonth(
	ctx: ViewerContext,
	userId: string,
	months: KpiMonth[],
): Promise<Map<string, number>> {
	const rows = await ctx.db
		.select({
			periodYear: kpiScoreEvents.periodYear,
			periodMonth: kpiScoreEvents.periodMonth,
			total: sql<number>`coalesce(sum(${kpiScoreEvents.points}), 0)`,
		})
		.from(kpiScoreEvents)
		.where(
			and(
				eq(kpiScoreEvents.userId, userId),
				selectedMonthsCondition(
					kpiScoreEvents.periodYear,
					kpiScoreEvents.periodMonth,
					months,
				),
			),
		)
		.groupBy(kpiScoreEvents.periodYear, kpiScoreEvents.periodMonth);

	return new Map(
		rows.map((row) => [monthKey(row.periodYear, row.periodMonth), row.total]),
	);
}

/** The aggregate of the months that reported a summary, or `null`. */
function aggregateSummaries(
	rows: readonly KpiMonthlySummaryRow[],
): KpiPeriodSummaryValue | null {
	if (rows.length === 0) return null;

	const sum = (pick: (row: KpiMonthlySummaryRow) => number): number =>
		rows.reduce((total, row) => total + pick(row), 0);

	return {
		totalTasksAssigned: sum((row) => row.totalTasksAssigned),
		completedOnTime: sum((row) => row.completedOnTime),
		completedUrgentOnTime: sum((row) => row.completedUrgentOnTime),
		approvedFirstTime: sum((row) => row.approvedFirstTime),
		overdueTasks: sum((row) => row.overdueTasks),
		rejectedTasks: sum((row) => row.rejectedTasks),
		extensionRequestsCount: sum((row) => row.extensionRequestsCount),
		attendanceRate: round2(sum((row) => row.attendanceRate) / rows.length),
		perfectAttendanceBonus: sum((row) => row.perfectAttendanceBonus),
		unapprovedLeaveCount: sum((row) => row.unapprovedLeaveCount),
		lateEarlyCount: sum((row) => row.lateEarlyCount),
		totalKpiScore: sum((row) => row.totalKpiScore),
	};
}

async function loadLeaveBalances(
	ctx: ViewerContext,
	userId: string,
): Promise<LeaveBalanceValue[]> {
	const rows = await ctx.db
		.select({
			leaveCode: leaveBalanceEntries.leaveCode,
			name: leaveCodes.name,
			total: sql<number>`coalesce(sum(${leaveBalanceEntries.deltaDays}), 0)`,
		})
		.from(leaveBalanceEntries)
		.leftJoin(leaveCodes, eq(leaveCodes.code, leaveBalanceEntries.leaveCode))
		.where(eq(leaveBalanceEntries.userId, userId))
		.groupBy(leaveBalanceEntries.leaveCode);

	return BALANCE_TRACKED_LEAVE_CODES.map((code) => {
		const found = rows.find((row) => row.leaveCode === code);
		return {
			leaveCode: code,
			leaveName: found?.name ?? code,
			balanceDays: round2(found?.total ?? 0),
		};
	});
}

/**
 * The caller's own KPI dashboard over the selected months: their total for
 * each month, the aggregate of the months that reported a summary, their
 * tracked leave balances (`AL`, `TOIL`), and the selected months' most recent
 * score events, newest first.
 *
 * A month with no recorded summary falls back to the points its score events
 * recorded, so a month that has activity but no computed summary still
 * contributes to the total.
 */
export async function getPersonalDashboard(
	ctx: ViewerContext,
	months: KpiMonth[],
): Promise<PersonalDashboard> {
	const viewer = currentViewer(ctx);
	const selection = validateMonthSelection(months);

	const summaries = await ctx.db
		.select()
		.from(kpiMonthlySummaries)
		.where(
			and(
				eq(kpiMonthlySummaries.userId, viewer.id),
				selectedMonthsCondition(
					kpiMonthlySummaries.periodYear,
					kpiMonthlySummaries.periodMonth,
					selection,
				),
			),
		)
		.orderBy(
			asc(kpiMonthlySummaries.periodYear),
			asc(kpiMonthlySummaries.periodMonth),
		);

	const [leaveBalances, events, eventPoints] = await Promise.all([
		loadLeaveBalances(ctx, viewer.id),
		ctx.db
			.select()
			.from(kpiScoreEvents)
			.where(
				and(
					eq(kpiScoreEvents.userId, viewer.id),
					selectedMonthsCondition(
						kpiScoreEvents.periodYear,
						kpiScoreEvents.periodMonth,
						selection,
					),
				),
			)
			.orderBy(desc(kpiScoreEvents.occurredAt))
			.limit(RECENT_KPI_EVENTS_LIMIT),
		sumEventPointsByMonth(ctx, viewer.id, selection),
	]);

	const summaryByMonth = new Map(
		summaries.map((row) => [monthKey(row.periodYear, row.periodMonth), row]),
	);

	const monthlyTotals = selection.map((month) => {
		const key = monthKey(month.periodYear, month.periodMonth);
		return {
			periodYear: month.periodYear,
			periodMonth: month.periodMonth,
			totalKpiScore:
				summaryByMonth.get(key)?.totalKpiScore ?? eventPoints.get(key) ?? 0,
		};
	});

	return {
		months: selection,
		totalKpiScore: monthlyTotals.reduce(
			(total, month) => total + month.totalKpiScore,
			0,
		),
		monthlyTotals,
		summary: aggregateSummaries(summaries),
		leaveBalances,
		recentEvents: events,
	};
}

/* ------------------------------------------------------------------ */
/* Score event list                                                    */
/* ------------------------------------------------------------------ */

/**
 * List score events for the selected months, restricted to the caller's scope:
 * own events for employees, department events for a head, and everything else
 * for the company-wide and technical roles.
 */
export async function getKpiScoreEvents(
	ctx: ViewerContext,
	months: KpiMonth[],
	offset = 0,
	limit = 20,
): Promise<{ rows: KpiScoreEventRow[]; totalCount: number }> {
	const selection = validateMonthSelection(months);
	const scope = resolveKpiScope(ctx);

	const conditions = [
		selectedMonthsCondition(
			kpiScoreEvents.periodYear,
			kpiScoreEvents.periodMonth,
			selection,
		),
	];
	if (scope.kind === "PERSONAL") {
		conditions.push(eq(kpiScoreEvents.userId, scope.userId));
	}
	if (scope.kind === "DEPARTMENT") {
		conditions.push(eq(user.departmentId, scope.departmentId));
	}
	const where = and(...conditions);

	const rows = await ctx.db
		.select({ event: kpiScoreEvents })
		.from(kpiScoreEvents)
		.innerJoin(user, eq(user.id, kpiScoreEvents.userId))
		.where(where)
		.orderBy(desc(kpiScoreEvents.occurredAt))
		.limit(limit)
		.offset(offset);

	const [{ value }] = await ctx.db
		.select({ value: count() })
		.from(kpiScoreEvents)
		.innerJoin(user, eq(user.id, kpiScoreEvents.userId))
		.where(where);

	return { rows: rows.map((row) => row.event), totalCount: value };
}

/* ------------------------------------------------------------------ */
/* Audit levels                                                        */
/* ------------------------------------------------------------------ */

export interface KpiAuditFilter {
	/** The months the read covers. */
	months: KpiMonth[];
	departmentId?: string | null;
}

export interface KpiAuditLevel1Row {
	periodYear: number;
	periodMonth: number;
	userId: string;
	totalTasksAssigned: number;
	completedOnTime: number;
	overdueTasks: number;
	unapprovedLeaveCount: number;
	perfectAttendanceBonus: number;
	attendanceRate: number;
	totalKpiScore: number;
}

export interface KpiAuditLevel2Row {
	periodYear: number;
	periodMonth: number;
	departmentId: string;
	totalEmployees: number;
	totalTasksAssigned: number;
	avgAttendanceRate: number;
	avgDepartmentKpiScore: number;
}

export interface KpiAuditLevel3Row {
	periodYear: number;
	periodMonth: number;
	userId: string;
	departmentId: string;
	totalTasksAssigned: number;
	completedOnTime: number;
	overdueTasks: number;
	immediateApprovalCount: number;
	returnedCount: number;
	perfectAttendanceBonus: number;
	attendanceRate: number;
	totalKpiScore: number;
}

function summaryConditions(months: KpiMonth[], departmentId: string | null) {
	const conditions = [
		selectedMonthsCondition(
			kpiMonthlySummaries.periodYear,
			kpiMonthlySummaries.periodMonth,
			months,
		),
	];
	if (departmentId !== null) {
		conditions.push(eq(user.departmentId, departmentId));
	}
	return and(...conditions);
}

/**
 * Level 1 — one row per employee per period, company-wide. Callers are the
 * technical roles and HR; a department head cannot reach this level.
 */
export async function getAuditLevel1(
	ctx: ViewerContext,
	filter: KpiAuditFilter,
	offset = 0,
	limit = 20,
): Promise<{ rows: KpiAuditLevel1Row[]; totalCount: number }> {
	const forced = auditDepartmentScope(ctx);
	const departmentId = forced ?? filter.departmentId ?? null;
	const months = validateMonthSelection(filter.months);
	const where = summaryConditions(months, departmentId);

	const rows = await ctx.db
		.select({ summary: kpiMonthlySummaries })
		.from(kpiMonthlySummaries)
		.innerJoin(user, eq(user.id, kpiMonthlySummaries.userId))
		.where(where)
		.orderBy(
			desc(kpiMonthlySummaries.totalKpiScore),
			asc(kpiMonthlySummaries.periodYear),
			asc(kpiMonthlySummaries.periodMonth),
			asc(user.userCode),
		)
		.limit(limit)
		.offset(offset);

	const [{ value }] = await ctx.db
		.select({ value: count() })
		.from(kpiMonthlySummaries)
		.innerJoin(user, eq(user.id, kpiMonthlySummaries.userId))
		.where(where);

	return {
		rows: rows.map(({ summary }) => ({
			periodYear: summary.periodYear,
			periodMonth: summary.periodMonth,
			userId: summary.userId,
			totalTasksAssigned: summary.totalTasksAssigned,
			completedOnTime: summary.completedOnTime,
			overdueTasks: summary.overdueTasks,
			unapprovedLeaveCount: summary.unapprovedLeaveCount,
			perfectAttendanceBonus: summary.perfectAttendanceBonus,
			attendanceRate: summary.attendanceRate,
			totalKpiScore: summary.totalKpiScore,
		})),
		totalCount: value,
	};
}

/**
 * Level 2 — summaries aggregated by department/division for the period.
 */
export async function getAuditLevel2(
	ctx: ViewerContext,
	filter: KpiAuditFilter,
): Promise<{ rows: KpiAuditLevel2Row[]; totalCount: number }> {
	const forced = auditDepartmentScope(ctx);
	const departmentId = forced ?? filter.departmentId ?? null;
	const months = validateMonthSelection(filter.months);
	const where = summaryConditions(months, departmentId);

	const rows = await ctx.db
		.select({
			periodYear: kpiMonthlySummaries.periodYear,
			periodMonth: kpiMonthlySummaries.periodMonth,
			departmentId: departments.id,
			totalEmployees: sql<number>`count(distinct ${kpiMonthlySummaries.userId})`,
			totalTasksAssigned: sql<number>`coalesce(sum(${kpiMonthlySummaries.totalTasksAssigned}), 0)`,
			avgAttendanceRate: sql<number>`coalesce(round(avg(${kpiMonthlySummaries.attendanceRate}), 2), 0)`,
			avgDepartmentKpiScore: sql<number>`coalesce(round(avg(${kpiMonthlySummaries.totalKpiScore}), 2), 0)`,
		})
		.from(kpiMonthlySummaries)
		.innerJoin(user, eq(user.id, kpiMonthlySummaries.userId))
		.innerJoin(departments, eq(departments.id, user.departmentId))
		.where(where)
		.groupBy(
			kpiMonthlySummaries.periodYear,
			kpiMonthlySummaries.periodMonth,
			departments.id,
		)
		.orderBy(desc(sql`avg(${kpiMonthlySummaries.totalKpiScore})`));

	return {
		rows: rows.map((row) => ({
			periodYear: row.periodYear,
			periodMonth: row.periodMonth,
			departmentId: row.departmentId,
			totalEmployees: row.totalEmployees,
			totalTasksAssigned: row.totalTasksAssigned,
			avgAttendanceRate: round2(row.avgAttendanceRate),
			avgDepartmentKpiScore: round2(row.avgDepartmentKpiScore),
		})),
		totalCount: rows.length,
	};
}

/**
 * Level 3 — one row per employee, within a department. A department head is
 * always restricted to their own department, whatever filter they send.
 */
export async function getAuditLevel3(
	ctx: ViewerContext,
	filter: KpiAuditFilter,
	orderBy?: string | null,
	offset = 0,
	limit = 20,
): Promise<{ rows: KpiAuditLevel3Row[]; totalCount: number }> {
	const forced = auditDepartmentScope(ctx);
	const departmentId = forced ?? filter.departmentId ?? null;
	const months = validateMonthSelection(filter.months);
	const where = summaryConditions(months, departmentId);

	const order = (() => {
		switch (orderBy) {
			case "TOTAL_KPI_SCORE_ASC":
				return [
					asc(kpiMonthlySummaries.totalKpiScore),
					asc(user.userCode),
				] as const;
			case "ATTENDANCE_RATE_DESC":
				return [
					desc(kpiMonthlySummaries.attendanceRate),
					desc(kpiMonthlySummaries.totalKpiScore),
				] as const;
			default:
				return [
					desc(kpiMonthlySummaries.totalKpiScore),
					asc(user.userCode),
				] as const;
		}
	})();

	const rows = await ctx.db
		.select({ summary: kpiMonthlySummaries, departmentId: user.departmentId })
		.from(kpiMonthlySummaries)
		.innerJoin(user, eq(user.id, kpiMonthlySummaries.userId))
		.innerJoin(departments, eq(departments.id, user.departmentId))
		.where(where)
		.orderBy(...order)
		.limit(limit)
		.offset(offset);

	const [{ value }] = await ctx.db
		.select({ value: count() })
		.from(kpiMonthlySummaries)
		.innerJoin(user, eq(user.id, kpiMonthlySummaries.userId))
		.innerJoin(departments, eq(departments.id, user.departmentId))
		.where(where);

	return {
		rows: rows.map(({ summary, departmentId: deptId }) => ({
			periodYear: summary.periodYear,
			periodMonth: summary.periodMonth,
			userId: summary.userId,
			departmentId: deptId as string,
			totalTasksAssigned: summary.totalTasksAssigned,
			completedOnTime: summary.completedOnTime,
			overdueTasks: summary.overdueTasks,
			immediateApprovalCount: summary.approvedFirstTime,
			returnedCount: summary.rejectedTasks,
			perfectAttendanceBonus: summary.perfectAttendanceBonus,
			attendanceRate: summary.attendanceRate,
			totalKpiScore: summary.totalKpiScore,
		})),
		totalCount: value,
	};
}
