/**
 * Shared code vocabularies.
 *
 * These tuples are the single TypeScript source for the code values that appear
 * in the API contract, the database check constraints, and the UI. The tokens
 * must never be renamed, translated, or paraphrased.
 */

export const TICKET_STATE_CODES = [
	"REQ",
	"ACT",
	"PEN",
	"APP",
	"REJ",
	"CAN",
	"OVERDUE",
] as const;
export type TicketStateCode = (typeof TICKET_STATE_CODES)[number];

export const TERMINAL_TICKET_STATES = ["APP", "CAN"] as const;

export const LEAVE_CODE_VALUES = [
	"AL",
	"UAL",
	"SL",
	"USL",
	"PL",
	"ML",
	"CL",
	"EL",
	"LWP",
	"TOIL",
	"VTO",
] as const;
export type LeaveCodeValue = (typeof LEAVE_CODE_VALUES)[number];

/** Penalty codes only HR Manager and Super Admin may assign. */
export const PENALTY_LEAVE_CODES = ["UAL", "USL"] as const;

/** Leave codes drawn from a tracked fund. */
export const BALANCE_TRACKED_LEAVE_CODES = ["AL", "TOIL"] as const;

/** Codes an employee may register directly (penalty codes are excluded). */
export const REGISTRABLE_LEAVE_CODES = [
	"AL",
	"SL",
	"PL",
	"ML",
	"CL",
	"EL",
	"LWP",
	"TOIL",
	"VTO",
] as const;

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TASK_TYPES = ["HOURLY", "DAILY", "MULTI_DAY"] as const;
export type TaskTypeValue = (typeof TASK_TYPES)[number];

export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ApprovalStatusValue = (typeof APPROVAL_STATUSES)[number];

export const TASK_REQUEST_TYPES = ["EXTENSION", "LATE_EXPLANATION"] as const;
export type TaskRequestTypeValue = (typeof TASK_REQUEST_TYPES)[number];

/** What a completion request asks the reviewer to accept. */
export const COMPLETION_SCOPES = ["MILESTONE", "FULL_JOB"] as const;
export type CompletionScopeValue = (typeof COMPLETION_SCOPES)[number];

/**
 * States a completion request can be in.
 *
 * They reuse the ticket codes, so `PEN` awaits review, `APP` is approved and
 * `REJ` was sent back — the same three states a ticket passes through while it
 * is open. The journey is the per-stage record of those decisions.
 */
export const COMPLETION_REQUEST_STATES = ["PEN", "APP", "REJ"] as const;
export type CompletionRequestStateValue =
	(typeof COMPLETION_REQUEST_STATES)[number];

/** Owner types an attachment row can carry. */
export const ATTACHMENT_OWNER_TYPES = [
	"TASK",
	"TASK_REQUEST",
	"TASK_COMPLETION_REQUEST",
	"TASK_COMPLETION_DECISION",
	"LEAVE_REQUEST",
] as const;
export type AttachmentOwnerTypeValue = (typeof ATTACHMENT_OWNER_TYPES)[number];

export const NOTIFICATION_STATUSES = ["PENDING", "SENT", "FAILED"] as const;
export type NotificationStatusValue = (typeof NOTIFICATION_STATUSES)[number];

export const DEPARTMENT_TYPES = ["DEPARTMENT", "DIVISION"] as const;
export type DepartmentTypeValue = (typeof DEPARTMENT_TYPES)[number];

export const LEAVE_ENTRY_TYPES = [
	"ACCRUAL",
	"USAGE",
	"ADJUSTMENT",
	"EXPIRY",
	"CARRY_OVER",
] as const;
export type LeaveEntryTypeValue = (typeof LEAVE_ENTRY_TYPES)[number];

export const LEAVE_CATEGORIES = [
	"PAID",
	"UNPAID",
	"INSURANCE",
	"SPECIAL",
] as const;
export type LeaveCategoryValue = (typeof LEAVE_CATEGORIES)[number];

export const EXPORT_FORMATS = ["PDF", "XLSX", "CSV"] as const;
export type ExportFormatValue = (typeof EXPORT_FORMATS)[number];

export const ROLE_CODES = [
	"SUPER_ADMIN",
	"TECH_LEAD",
	"HR_MANAGER",
	"DEPT_HEAD",
	"EMPLOYEE",
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const MODULE_CODES = [
	"jobs",
	"planning",
	"performance",
	"settings",
	"audit-log",
] as const;
export type ModuleCode = (typeof MODULE_CODES)[number];

export const KPI_RULE_CODES = [
	"KPI_ON_TIME_TICKET",
	"KPI_ON_TIME_URGENT",
	"KPI_FIRST_TIME_APPROVAL",
	"KPI_PERFECT_ATTENDANCE",
	"KPI_OVERDUE_TICKET",
	"KPI_RETURNED_TICKET",
	"KPI_EXTENSION_REQUEST",
	"KPI_UNAPPROVED_LEAVE",
] as const;
export type KpiRuleCode = (typeof KPI_RULE_CODES)[number];

/** `ACT` secondary badges with their exact display labels. */
export const TASK_STATE_BADGES = [
	"URGENT_PROCESSING",
	"PROGRESS_UPDATE",
	"AWAITING_EXTENSION_APPROVAL",
	"AWAITING_PROGRESS_VERIFICATION",
] as const;
export type TaskStateBadge = (typeof TASK_STATE_BADGES)[number];

/** Urgent hourly task slots and the daily planning cutoff, in local wall time. */
export const HOURLY_SLOTS = ["10:30", "14:00", "16:30"] as const;
export const DAILY_CUTOFF = "08:30";
export const DAILY_DEFAULT_END_TIMES = ["17:00", "18:00"] as const;
export const MULTI_DAY_MILESTONES = [25, 50, 75, 100] as const;

export function sqlCodeList(values: readonly string[]): string {
	return values.map((value) => `'${value}'`).join(", ");
}
