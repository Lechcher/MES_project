/**
 * Deterministic development/test seed.
 *
 * Loads the documented code registries, a populated organization tree
 * (departments, divisions and projects), and 15 accounts: the five demo users
 * (one per role) plus a staff pool so department-scoped views carry multiple
 * rows. The operational data is sized to exercise the screens rather than to
 * prove each registry once:
 *
 * - 55 tickets covering every state × task type, spanning -14…+5 days, with
 *   transition history, progress logs, extension/late-explanation requests
 *   and completion requests in each decision state;
 * - a full current month of attendance for every active account (present,
 *   late, early-leave and half-day patterns, leave badges and `UAL`/`USL`
 *   penalty days), weekends excluded;
 * - leave requests in every status, leave ledger entries in every entry type,
 *   and overtime records whose approved 8-hour rows each feed one TOIL day;
 * - KPI score events for both the current and previous month, after which
 *   each account's monthly summary is rebuilt by the application's own
 *   `recomputeMonthlySummary` engine rather than authored here;
 * - a representative system audit activity stream across the modules.
 *
 * Everything is anchored to the caller's local "today", so yesterday/today/
 * tomorrow views, the current month and the overdue examples always show
 * meaningful data. Every row uses a deterministic id and is inserted with
 * `ON CONFLICT DO NOTHING`, so running the seed repeatedly is a no-op and row
 * counts stay stable; on an existing database the already-present days and
 * tickets keep their original rows. Demo credentials and sample records are
 * refused outright in production.
 *
 * Run for development/test with `bun run db:seed`.
 */

import { count, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { type Auth, createAuth } from "../auth";
import { type AppConfig, loadConfig } from "../config";
import { recomputeMonthlySummary } from "../domain/kpi";
import { createContext, type Viewer } from "../graphql/context";
import type { KpiRuleCode } from "./enums";
import { createDatabase, type DatabaseHandle } from "./index";
import { runMigrations } from "./migrate";
import {
	attachments as attachmentsTable,
	attendanceRecords,
	departments,
	kpiMonthlySummaries,
	kpiPointRules,
	kpiScoreEvents,
	leaveBalanceEntries,
	leaveCodes,
	leaveRequests,
	modules,
	overtimeRecords,
	permissions,
	projects,
	rolePermissions,
	roles,
	systemAuditLogs,
	taskCompletionRequests,
	taskProgressLogs,
	taskRequests,
	taskStateTransitions,
	tasks,
	ticketStates,
	user,
	userRoles,
} from "./schema";

/* ------------------------------------------------------------------ */
/* Documented development credentials                                  */
/* ------------------------------------------------------------------ */

/**
 * Development/test-only password for the five demo accounts. Never use this
 * value in a deployed environment; the seed refuses to run in production.
 */
export const DEV_SEED_PASSWORD = "MES-dev-seed-2026!";

/* ------------------------------------------------------------------ */
/* Code registries (exact values from the reference schema)            */
/* ------------------------------------------------------------------ */

const TICKET_STATE_SEED = [
	{
		code: "REQ",
		name: "Requested",
		color: "White",
		description:
			"Newly allocated ticket, or not confirmed/planned before 08:30.",
		isTerminal: false,
		sortOrder: 1,
	},
	{
		code: "ACT",
		name: "Active",
		color: "Yellow",
		description: "Accepted and in progress.",
		isTerminal: false,
		sortOrder: 2,
	},
	{
		code: "PEN",
		name: "Pending",
		color: "Blue",
		description:
			"Complete pressed, or multi-day task at 100% with report submitted.",
		isTerminal: false,
		sortOrder: 3,
	},
	{
		code: "APP",
		name: "Approved",
		color: "Green",
		description: "Approved by Manager/HR; progress accepted.",
		isTerminal: true,
		sortOrder: 4,
	},
	{
		code: "REJ",
		name: "Rejected",
		color: "Orange",
		description: "Rejected by Manager/HR; progress returned for revision.",
		isTerminal: false,
		sortOrder: 5,
	},
	{
		code: "CAN",
		name: "Cancelled",
		color: "Red",
		description: "Cancelled by the Employee or Manager (reason mandatory).",
		isTerminal: true,
		sortOrder: 6,
	},
	{
		code: "OVERDUE",
		name: "Overdue",
		color: "Red (Warning)",
		description: "Past the hourly/daily/multi-day deadline.",
		isTerminal: false,
		sortOrder: 7,
	},
] as const;

const LEAVE_CODE_SEED = [
	{
		code: "AL",
		name: "Annual Leave",
		category: "PAID",
		isPaid: true,
		payrollRule: "100% paid",
		deductsWage: false,
		isPenalty: false,
		isBalanceTracked: true,
		sortOrder: 1,
	},
	{
		code: "UAL",
		name: "Unapproved / Unpaid Annual Leave",
		category: "UNPAID",
		isPaid: false,
		payrollRule: "Deduct 100% of the daily wage + KPI point deduction",
		deductsWage: true,
		isPenalty: true,
		isBalanceTracked: false,
		sortOrder: 2,
	},
	{
		code: "SL",
		name: "Sick Leave",
		category: "INSURANCE",
		isPaid: true,
		payrollRule: "Social insurance regime / sick pay",
		deductsWage: false,
		isPenalty: false,
		isBalanceTracked: false,
		sortOrder: 3,
	},
	{
		code: "USL",
		name: "Unexcused / Unpaid Sick Leave",
		category: "UNPAID",
		isPaid: false,
		payrollRule: "Deduct 100% of the daily wage + KPI point deduction",
		deductsWage: true,
		isPenalty: true,
		isBalanceTracked: false,
		sortOrder: 4,
	},
	{
		code: "PL",
		name: "Personal Leave",
		category: "PAID",
		isPaid: true,
		payrollRule: "100% paid under the Labor Law",
		deductsWage: false,
		isPenalty: false,
		isBalanceTracked: false,
		sortOrder: 5,
	},
	{
		code: "ML",
		name: "Medical / Maternity Leave",
		category: "INSURANCE",
		isPaid: true,
		payrollRule: "Social insurance regime for maternity/medical",
		deductsWage: false,
		isPenalty: false,
		isBalanceTracked: false,
		sortOrder: 6,
	},
	{
		code: "CL",
		name: "Compassionate Leave",
		category: "SPECIAL",
		isPaid: true,
		payrollRule: "Paid or unpaid depending on policy",
		deductsWage: false,
		isPenalty: false,
		isBalanceTracked: false,
		sortOrder: 7,
	},
	{
		code: "EL",
		name: "Emergency Leave",
		category: "SPECIAL",
		isPaid: true,
		payrollRule: "Prioritized for supplementary approval afterward",
		deductsWage: false,
		isPenalty: false,
		isBalanceTracked: false,
		sortOrder: 8,
	},
	{
		code: "LWP",
		name: "Leave Without Pay",
		category: "UNPAID",
		isPaid: false,
		payrollRule: "No daily wage, no penalty",
		deductsWage: false,
		isPenalty: false,
		isBalanceTracked: false,
		sortOrder: 9,
	},
	{
		code: "TOIL",
		name: "Time Off In Lieu",
		category: "PAID",
		isPaid: true,
		payrollRule: "100% paid (deducted from the OT hours fund)",
		deductsWage: false,
		isPenalty: false,
		isBalanceTracked: true,
		sortOrder: 10,
	},
	{
		code: "VTO",
		name: "Voluntary Time Off",
		category: "UNPAID",
		isPaid: false,
		payrollRule: "Unpaid / support depending on policy",
		deductsWage: false,
		isPenalty: false,
		isBalanceTracked: false,
		sortOrder: 11,
	},
] as const;

const MODULE_SEED = [
	{
		code: "jobs",
		name: "Jobs & Projects",
		description: "Task assignment, progress and acceptance.",
		sortOrder: 1,
	},
	{
		code: "planning",
		name: "Planning & Attendance",
		description: "Matrix calendar, attendance and leave.",
		sortOrder: 2,
	},
	{
		code: "performance",
		name: "Performance & Audit",
		description: "Deterministic KPI scoring and audit tables.",
		sortOrder: 3,
	},
	{
		code: "settings",
		name: "Settings & IAM",
		description: "Authorization, organization and configuration.",
		sortOrder: 4,
	},
	{
		code: "audit-log",
		name: "Audit Log",
		description: "Technical monitoring of system-wide and per-module activity.",
		sortOrder: 5,
	},
	{
		code: "shoptify",
		name: "Shopify Stores",
		description:
			"Multi-store orders, catalog, customers, finance and automation.",
		sortOrder: 6,
	},
] as const;

const ROLE_SEED = [
	{
		code: "SUPER_ADMIN",
		name: "Super Admin",
		description: "Full system administration.",
	},
	{
		code: "TECH_LEAD",
		name: "Manager / Tech Lead",
		description: "Management plus RBAC and webhook configuration.",
	},
	{
		code: "HR_MANAGER",
		name: "HR Manager",
		description: "Company-wide HR: users, leave, reports.",
	},
	{
		code: "DEPT_HEAD",
		name: "Department Head",
		description: "Department-scoped management.",
	},
	{
		code: "EMPLOYEE",
		name: "Employee",
		description: "Personal workspace only.",
	},
] as const;

const PERMISSION_SEED = [
	{
		code: "jobs.ticket.create",
		moduleCode: "jobs",
		description: "Create / allocate a ticket (REQ).",
	},
	{
		code: "jobs.ticket.accept_report",
		moduleCode: "jobs",
		description: "Accept a task (ACT) and report (PEN).",
	},
	{
		code: "jobs.ticket.approve_return",
		moduleCode: "jobs",
		description: "Approve (APP) or return (REJ) a report.",
	},
	{
		code: "jobs.ticket.cancel",
		moduleCode: "jobs",
		description: "Cancel a ticket (CAN).",
	},
	{
		code: "jobs.ticket.request_extension",
		moduleCode: "jobs",
		description: "Request an extension or explain a late submission.",
	},
	{
		code: "jobs.ticket.print_export",
		moduleCode: "jobs",
		description: "Print ticket slips / export task data.",
	},
	{
		code: "planning.calendar.view",
		moduleCode: "planning",
		description: "View the attendance matrix calendar.",
	},
	{
		code: "planning.leave.register",
		moduleCode: "planning",
		description: "Register a leave request.",
	},
	{
		code: "planning.leave.approve",
		moduleCode: "planning",
		description: "Approve leave requests / work.",
	},
	{
		code: "planning.leave.assign_penalty",
		moduleCode: "planning",
		description: "Assign penalty leave codes (UAL, USL).",
	},
	{
		code: "planning.print_export",
		moduleCode: "planning",
		description: "Print leave requests / export attendance data.",
	},
	{
		code: "performance.kpi.view_personal",
		moduleCode: "performance",
		description: "View the personal KPI dashboard.",
	},
	{
		code: "performance.audit.level3_view",
		moduleCode: "performance",
		description: "View Audit Level 3 (employees in a department).",
	},
	{
		code: "performance.audit.level1_2_view",
		moduleCode: "performance",
		description: "View Audit Levels 1 & 2 (company / department).",
	},
	{
		code: "performance.print_export",
		moduleCode: "performance",
		description: "Print / export KPI and audit reports.",
	},
	{
		code: "settings.users.manage",
		moduleCode: "settings",
		description: "Manage accounts (create/edit/reset/lock).",
	},
	{
		code: "settings.rbac.manage",
		moduleCode: "settings",
		description: "Manage RBAC authorization.",
	},
	{
		code: "settings.webhook.manage",
		moduleCode: "settings",
		description: "Manage the Telegram webhook configuration.",
	},
	{
		code: "auditlog.view",
		moduleCode: "audit-log",
		description: "View the system-wide activity stream.",
	},
	{
		code: "auditlog.module.view",
		moduleCode: "audit-log",
		description: "View per-module activity.",
	},
	{
		code: "auditlog.export",
		moduleCode: "audit-log",
		description: "Export filtered audit events.",
	},
	{
		code: "shoptify.store.manage",
		moduleCode: "shoptify",
		description: "Connect / deactivate Shopify stores.",
	},
	{
		code: "shoptify.order.view",
		moduleCode: "shoptify",
		description: "View orders and order detail across stores.",
	},
	{
		code: "shoptify.order.manage",
		moduleCode: "shoptify",
		description: "Flag order exceptions and edit internal annotations.",
	},
	{
		code: "shoptify.fulfillment.create",
		moduleCode: "shoptify",
		description: "Fulfill orders in bulk with tracking details.",
	},
	{
		code: "shoptify.catalog.manage",
		moduleCode: "shoptify",
		description: "Sync catalog and update inventory / prices in bulk.",
	},
	{
		code: "shoptify.customer.manage",
		moduleCode: "shoptify",
		description: "Manage customer blacklist / high-risk flags.",
	},
	{
		code: "shoptify.finance.manage",
		moduleCode: "shoptify",
		description: "Record payouts and per-order expense components.",
	},
	{
		code: "shoptify.automation.manage",
		moduleCode: "shoptify",
		description: "Create / edit automation rules.",
	},
	{
		code: "shoptify.export",
		moduleCode: "shoptify",
		description: "Export order and catalog listings.",
	},
] as const;

const DEPT_HEAD_PERMISSIONS = [
	"jobs.ticket.create",
	"jobs.ticket.accept_report",
	"jobs.ticket.approve_return",
	"jobs.ticket.cancel",
	"jobs.ticket.request_extension",
	"jobs.ticket.print_export",
	"planning.calendar.view",
	"planning.leave.register",
	"planning.leave.approve",
	"planning.print_export",
	"performance.kpi.view_personal",
	"performance.audit.level3_view",
	"performance.print_export",
] as const;

const EMPLOYEE_PERMISSIONS = [
	"jobs.ticket.accept_report",
	"jobs.ticket.request_extension",
	"jobs.ticket.print_export",
	"planning.calendar.view",
	"planning.leave.register",
	"planning.print_export",
	"performance.kpi.view_personal",
	"performance.print_export",
] as const;

/** Mirrors the documented role → permission matrix. */
function permissionsForRole(roleCode: string): string[] {
	switch (roleCode) {
		case "SUPER_ADMIN":
			return PERMISSION_SEED.map((permission) => permission.code);
		case "TECH_LEAD":
			return PERMISSION_SEED.filter(
				(permission) => permission.code !== "settings.users.manage",
			).map((permission) => permission.code);
		case "HR_MANAGER":
			return PERMISSION_SEED.filter(
				(permission) =>
					permission.code !== "settings.rbac.manage" &&
					permission.code !== "settings.webhook.manage" &&
					permission.moduleCode !== "audit-log" &&
					permission.moduleCode !== "shoptify",
			).map((permission) => permission.code);
		case "DEPT_HEAD":
			return [...DEPT_HEAD_PERMISSIONS];
		case "EMPLOYEE":
			return [...EMPLOYEE_PERMISSIONS];
		default:
			return [];
	}
}

const KPI_RULE_SEED = [
	{
		code: "KPI_ON_TIME_TICKET",
		event: "on_time_ticket",
		points: 10,
		description: "+10 per on-time ticket (APP).",
		sortOrder: 1,
	},
	{
		code: "KPI_ON_TIME_URGENT",
		event: "on_time_urgent_ticket",
		points: 20,
		description: "+20 per on-time urgent ticket (APP).",
		sortOrder: 2,
	},
	{
		code: "KPI_FIRST_TIME_APPROVAL",
		event: "first_time_approval",
		points: 5,
		description: "+5 per instance approved immediately without edits.",
		sortOrder: 3,
	},
	{
		code: "KPI_PERFECT_ATTENDANCE",
		event: "perfect_attendance",
		points: 50,
		description: "+50 per month of excellent attendance.",
		sortOrder: 4,
	},
	{
		code: "KPI_OVERDUE_TICKET",
		event: "overdue_ticket",
		points: -15,
		description: "-15 per overdue ticket (OVERDUE).",
		sortOrder: 5,
	},
	{
		code: "KPI_RETURNED_TICKET",
		event: "returned_ticket",
		points: -5,
		description: "-5 per instance returned (REJ).",
		sortOrder: 6,
	},
	{
		code: "KPI_EXTENSION_REQUEST",
		event: "extension_request",
		points: -2,
		description: "-2 per extension request.",
		sortOrder: 7,
	},
	{
		code: "KPI_UNAPPROVED_LEAVE",
		event: "unapproved_leave",
		points: -10,
		description: "-10 per late/early instance or unapproved leave (UAL/USL).",
		sortOrder: 8,
	},
] as const;

/* ------------------------------------------------------------------ */
/* Organization & demo users                                           */
/* ------------------------------------------------------------------ */

const DEPARTMENT_SEED = [
	{
		id: "dept-eng",
		code: "ENG",
		name: "Engineering",
		departmentType: "DEPARTMENT",
		parentId: null,
	},
	{
		id: "dept-hq",
		code: "HQ",
		name: "Headquarters",
		departmentType: "DEPARTMENT",
		parentId: null,
	},
	{
		id: "dept-eng-core",
		code: "ENG-CORE",
		name: "Engineering Core",
		departmentType: "DIVISION",
		parentId: "dept-eng",
	},
	{
		id: "dept-hq-ops",
		code: "HQ-OPS",
		name: "Headquarters Operations",
		departmentType: "DIVISION",
		parentId: "dept-hq",
	},
	{
		id: "dept-eng-qa",
		code: "ENG-QA",
		name: "Engineering QA",
		departmentType: "DIVISION",
		parentId: "dept-eng",
	},
	{
		id: "dept-eng-fab",
		code: "ENG-FAB",
		name: "Engineering Fabrication",
		departmentType: "DIVISION",
		parentId: "dept-eng",
	},
] as const;

const PROJECT_SEED = [
	{
		id: "proj-mes",
		code: "PRJ-MES",
		name: "MES Rollout",
		description: "Prototype manufacturing execution system rollout.",
		departmentId: "dept-eng",
		isActive: true,
	},
	{
		id: "proj-qa",
		code: "PRJ-QA",
		name: "Quality Gates",
		description: "Line qualification and release checks.",
		departmentId: "dept-eng",
		isActive: true,
	},
	{
		id: "proj-fab",
		code: "PRJ-FAB",
		name: "Line Retooling",
		description: "Fabrication cell rework and installation.",
		departmentId: "dept-eng",
		isActive: true,
	},
	{
		id: "proj-ops",
		code: "PRJ-OPS",
		name: "Operations Uplift",
		description: "Warehouse and logistics process improvements.",
		departmentId: "dept-hq",
		isActive: true,
	},
] as const;

/* ------------------------------------------------------------------ */
/* Expanded operational fixtures                                       */
/* ------------------------------------------------------------------ */

interface ExpandedTaskSpec {
	code: string;
	title: string;
	taskType: "HOURLY" | "DAILY" | "MULTI_DAY";
	priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
	state: "REQ" | "ACT" | "PEN" | "APP" | "REJ" | "CAN" | "OVERDUE";
	/** Key into the runtime assignee map (`employee`, `head`, `staff-1`, …). */
	assignee: string;
	/** Key into the same map; also used as the approver/reviewer on decided rows. */
	createdBy: string;
	startOffset: number;
	startAt: readonly [number, number];
	endOffset: number;
	endAt: readonly [number, number];
	progressPercentage: number;
	isUrgentHourly?: boolean;
	isOverdue?: boolean;
	plannedStageCount?: number;
}

/**
 * The expanded schedule: 45 tickets across every state × task type, assigned
 * to the staff pool, spanning -14…+5 days around today so multi-day bars cross
 * week boundaries and yesterday/today/tomorrow views stay populated. Codes use
 * the `T-01##` range, which never collides with app-generated
 * `T<YYYY><MM>-####` codes on an existing development database.
 */
const EXPANDED_TASKS: readonly ExpandedTaskSpec[] = [
	// --- HOURLY ---
	{
		code: "T-0101",
		title: "Confirm the 09:30 handover slot",
		taskType: "HOURLY",
		priority: "URGENT",
		state: "REQ",
		assignee: "employee",
		createdBy: "tech-lead",
		startOffset: 0,
		startAt: [9, 30],
		endOffset: 0,
		endAt: [10, 30],
		progressPercentage: 0,
		isUrgentHourly: true,
	},
	{
		code: "T-0102",
		title: "Hourly calibration check",
		taskType: "HOURLY",
		priority: "HIGH",
		state: "ACT",
		assignee: "staff-1",
		createdBy: "tech-lead",
		startOffset: -1,
		startAt: [9, 0],
		endOffset: -1,
		endAt: [10, 0],
		progressPercentage: 55,
	},
	{
		code: "T-0103",
		title: "Hourly line audit submitted",
		taskType: "HOURLY",
		priority: "MEDIUM",
		state: "PEN",
		assignee: "staff-2",
		createdBy: "tech-lead",
		startOffset: -2,
		startAt: [14, 0],
		endOffset: -2,
		endAt: [15, 0],
		progressPercentage: 100,
	},
	{
		code: "T-0104",
		title: "Hourly pressure test approved",
		taskType: "HOURLY",
		priority: "MEDIUM",
		state: "APP",
		assignee: "staff-1",
		createdBy: "tech-lead",
		startOffset: -3,
		startAt: [13, 0],
		endOffset: -3,
		endAt: [14, 0],
		progressPercentage: 100,
	},
	{
		code: "T-0105",
		title: "Hourly sample returned for revision",
		taskType: "HOURLY",
		priority: "HIGH",
		state: "REJ",
		assignee: "staff-3",
		createdBy: "tech-lead",
		startOffset: -4,
		startAt: [15, 0],
		endOffset: -4,
		endAt: [16, 0],
		progressPercentage: 60,
	},
	{
		code: "T-0106",
		title: "Hourly walkthrough cancelled",
		taskType: "HOURLY",
		priority: "LOW",
		state: "CAN",
		assignee: "staff-2",
		createdBy: "head",
		startOffset: -5,
		startAt: [11, 0],
		endOffset: -5,
		endAt: [12, 0],
		progressPercentage: 0,
	},
	{
		code: "T-0107",
		title: "Hourly urgent inspection overdue",
		taskType: "HOURLY",
		priority: "URGENT",
		state: "OVERDUE",
		assignee: "staff-3",
		createdBy: "tech-lead",
		startOffset: -6,
		startAt: [16, 0],
		endOffset: -6,
		endAt: [17, 0],
		progressPercentage: 40,
		isUrgentHourly: true,
		isOverdue: true,
	},
	{
		code: "T-0108",
		title: "Hourly slot tomorrow morning",
		taskType: "HOURLY",
		priority: "LOW",
		state: "REQ",
		assignee: "staff-4",
		createdBy: "head",
		startOffset: 1,
		startAt: [8, 30],
		endOffset: 1,
		endAt: [9, 30],
		progressPercentage: 0,
	},
	{
		code: "T-0109",
		title: "Hourly tool check in progress",
		taskType: "HOURLY",
		priority: "MEDIUM",
		state: "ACT",
		assignee: "staff-4",
		createdBy: "tech-lead",
		startOffset: 0,
		startAt: [13, 0],
		endOffset: 0,
		endAt: [14, 0],
		progressPercentage: 25,
	},
	{
		code: "T-0110",
		title: "Hourly gauge report pending",
		taskType: "HOURLY",
		priority: "LOW",
		state: "PEN",
		assignee: "staff-5",
		createdBy: "tech-lead",
		startOffset: -7,
		startAt: [10, 0],
		endOffset: -7,
		endAt: [11, 0],
		progressPercentage: 100,
	},
	{
		code: "T-0111",
		title: "Hourly weld inspection approved",
		taskType: "HOURLY",
		priority: "HIGH",
		state: "APP",
		assignee: "staff-5",
		createdBy: "head",
		startOffset: -8,
		startAt: [15, 0],
		endOffset: -8,
		endAt: [16, 0],
		progressPercentage: 100,
	},
	{
		code: "T-0112",
		title: "Hourly label check returned",
		taskType: "HOURLY",
		priority: "MEDIUM",
		state: "REJ",
		assignee: "staff-6",
		createdBy: "tech-lead",
		startOffset: -9,
		startAt: [9, 30],
		endOffset: -9,
		endAt: [10, 30],
		progressPercentage: 50,
	},
	{
		code: "T-0113",
		title: "Hourly chiller reset cancelled",
		taskType: "HOURLY",
		priority: "MEDIUM",
		state: "CAN",
		assignee: "staff-6",
		createdBy: "head",
		startOffset: -10,
		startAt: [12, 0],
		endOffset: -10,
		endAt: [13, 0],
		progressPercentage: 10,
	},
	{
		code: "T-0114",
		title: "Hourly urgent leak check overdue",
		taskType: "HOURLY",
		priority: "HIGH",
		state: "OVERDUE",
		assignee: "staff-7",
		createdBy: "tech-lead",
		startOffset: -11,
		startAt: [14, 30],
		endOffset: -11,
		endAt: [15, 30],
		progressPercentage: 70,
		isUrgentHourly: true,
		isOverdue: true,
	},
	{
		code: "T-0115",
		title: "Hourly planning review requested",
		taskType: "HOURLY",
		priority: "MEDIUM",
		state: "REQ",
		assignee: "staff-7",
		createdBy: "tech-lead",
		startOffset: 2,
		startAt: [16, 0],
		endOffset: 2,
		endAt: [17, 0],
		progressPercentage: 0,
	},
	// --- DAILY ---
	{
		code: "T-0116",
		title: "Daily shift report requested",
		taskType: "DAILY",
		priority: "HIGH",
		state: "REQ",
		assignee: "employee",
		createdBy: "tech-lead",
		startOffset: 1,
		startAt: [8, 0],
		endOffset: 1,
		endAt: [17, 0],
		progressPercentage: 0,
	},
	{
		code: "T-0117",
		title: "Daily urgent overhaul in progress",
		taskType: "DAILY",
		priority: "URGENT",
		state: "ACT",
		assignee: "staff-8",
		createdBy: "tech-lead",
		startOffset: 0,
		startAt: [8, 0],
		endOffset: 0,
		endAt: [17, 0],
		progressPercentage: 60,
	},
	{
		code: "T-0118",
		title: "Daily consumables order submitted",
		taskType: "DAILY",
		priority: "MEDIUM",
		state: "PEN",
		assignee: "staff-8",
		createdBy: "tech-lead",
		startOffset: -1,
		startAt: [8, 0],
		endOffset: -1,
		endAt: [17, 0],
		progressPercentage: 100,
	},
	{
		code: "T-0119",
		title: "Daily rack audit approved",
		taskType: "DAILY",
		priority: "HIGH",
		state: "APP",
		assignee: "staff-9",
		createdBy: "tech-lead",
		startOffset: -2,
		startAt: [8, 0],
		endOffset: -2,
		endAt: [17, 0],
		progressPercentage: 100,
	},
	{
		code: "T-0120",
		title: "Daily urgent repair returned",
		taskType: "DAILY",
		priority: "URGENT",
		state: "REJ",
		assignee: "staff-9",
		createdBy: "tech-lead",
		startOffset: -3,
		startAt: [8, 0],
		endOffset: -3,
		endAt: [17, 0],
		progressPercentage: 65,
	},
	{
		code: "T-0121",
		title: "Daily deep clean cancelled",
		taskType: "DAILY",
		priority: "LOW",
		state: "CAN",
		assignee: "staff-10",
		createdBy: "tech-lead",
		startOffset: -4,
		startAt: [8, 0],
		endOffset: -4,
		endAt: [17, 0],
		progressPercentage: 20,
	},
	{
		code: "T-0122",
		title: "Daily urgent export blocked overdue",
		taskType: "DAILY",
		priority: "URGENT",
		state: "OVERDUE",
		assignee: "staff-10",
		createdBy: "head",
		startOffset: -5,
		startAt: [8, 0],
		endOffset: -5,
		endAt: [17, 0],
		progressPercentage: 45,
		isOverdue: true,
	},
	{
		code: "T-0123",
		title: "Daily stock count requested",
		taskType: "DAILY",
		priority: "MEDIUM",
		state: "REQ",
		assignee: "staff-1",
		createdBy: "tech-lead",
		startOffset: 3,
		startAt: [8, 0],
		endOffset: 3,
		endAt: [17, 0],
		progressPercentage: 0,
	},
	{
		code: "T-0124",
		title: "Daily signage update in progress",
		taskType: "DAILY",
		priority: "LOW",
		state: "ACT",
		assignee: "staff-2",
		createdBy: "head",
		startOffset: 2,
		startAt: [8, 0],
		endOffset: 2,
		endAt: [17, 0],
		progressPercentage: 15,
	},
	{
		code: "T-0125",
		title: "Daily cost sheet submitted",
		taskType: "DAILY",
		priority: "HIGH",
		state: "PEN",
		assignee: "staff-3",
		createdBy: "tech-lead",
		startOffset: -6,
		startAt: [8, 0],
		endOffset: -6,
		endAt: [17, 0],
		progressPercentage: 100,
	},
	{
		code: "T-0126",
		title: "Daily toolbox checklist approved",
		taskType: "DAILY",
		priority: "MEDIUM",
		state: "APP",
		assignee: "staff-3",
		createdBy: "tech-lead",
		startOffset: -7,
		startAt: [8, 0],
		endOffset: -7,
		endAt: [17, 0],
		progressPercentage: 100,
	},
	{
		code: "T-0127",
		title: "Daily 5S round returned",
		taskType: "DAILY",
		priority: "LOW",
		state: "REJ",
		assignee: "staff-4",
		createdBy: "tech-lead",
		startOffset: -8,
		startAt: [8, 0],
		endOffset: -8,
		endAt: [17, 0],
		progressPercentage: 40,
	},
	{
		code: "T-0128",
		title: "Daily urgent gate fix cancelled",
		taskType: "DAILY",
		priority: "URGENT",
		state: "CAN",
		assignee: "staff-4",
		createdBy: "head",
		startOffset: -9,
		startAt: [8, 0],
		endOffset: -9,
		endAt: [17, 0],
		progressPercentage: 5,
	},
	{
		code: "T-0129",
		title: "Daily urgent conveyor stop overdue",
		taskType: "DAILY",
		priority: "HIGH",
		state: "OVERDUE",
		assignee: "staff-5",
		createdBy: "head",
		startOffset: -10,
		startAt: [8, 0],
		endOffset: -10,
		endAt: [17, 0],
		progressPercentage: 55,
		isOverdue: true,
	},
	{
		code: "T-0130",
		title: "Daily battery swap in progress",
		taskType: "DAILY",
		priority: "MEDIUM",
		state: "ACT",
		assignee: "staff-6",
		createdBy: "tech-lead",
		startOffset: 4,
		startAt: [8, 0],
		endOffset: 4,
		endAt: [17, 0],
		progressPercentage: 30,
	},
	// --- MULTI_DAY ---
	{
		code: "T-0131",
		title: "Multi-day supervisor training requested",
		taskType: "MULTI_DAY",
		priority: "MEDIUM",
		state: "REQ",
		assignee: "staff-7",
		createdBy: "tech-lead",
		startOffset: -3,
		startAt: [8, 0],
		endOffset: 1,
		endAt: [17, 0],
		progressPercentage: 0,
		plannedStageCount: 3,
	},
	{
		code: "T-0132",
		title: "Multi-day urgent cell rebuild",
		taskType: "MULTI_DAY",
		priority: "URGENT",
		state: "ACT",
		assignee: "staff-8",
		createdBy: "head",
		startOffset: -1,
		startAt: [8, 0],
		endOffset: 2,
		endAt: [17, 0],
		progressPercentage: 25,
		plannedStageCount: 4,
	},
	{
		code: "T-0133",
		title: "Multi-day fixture realignment submitted",
		taskType: "MULTI_DAY",
		priority: "HIGH",
		state: "PEN",
		assignee: "staff-9",
		createdBy: "tech-lead",
		startOffset: -5,
		startAt: [8, 0],
		endOffset: -2,
		endAt: [17, 0],
		progressPercentage: 80,
		plannedStageCount: 4,
	},
	{
		code: "T-0134",
		title: "Multi-day layout migration approved",
		taskType: "MULTI_DAY",
		priority: "MEDIUM",
		state: "APP",
		assignee: "staff-10",
		createdBy: "head",
		startOffset: -7,
		startAt: [8, 0],
		endOffset: -4,
		endAt: [17, 0],
		progressPercentage: 100,
		plannedStageCount: 3,
	},
	{
		code: "T-0135",
		title: "Multi-day cabinet assembly returned",
		taskType: "MULTI_DAY",
		priority: "LOW",
		state: "REJ",
		assignee: "staff-1",
		createdBy: "tech-lead",
		startOffset: -9,
		startAt: [8, 0],
		endOffset: -6,
		endAt: [17, 0],
		progressPercentage: 50,
		plannedStageCount: 3,
	},
	{
		code: "T-0136",
		title: "Multi-day forklift service cancelled",
		taskType: "MULTI_DAY",
		priority: "LOW",
		state: "CAN",
		assignee: "staff-2",
		createdBy: "tech-lead",
		startOffset: -12,
		startAt: [8, 0],
		endOffset: -8,
		endAt: [17, 0],
		progressPercentage: 20,
		plannedStageCount: 4,
	},
	{
		code: "T-0137",
		title: "Multi-day urgent press repair overdue",
		taskType: "MULTI_DAY",
		priority: "URGENT",
		state: "OVERDUE",
		assignee: "staff-3",
		createdBy: "head",
		startOffset: -13,
		startAt: [8, 0],
		endOffset: -6,
		endAt: [17, 0],
		progressPercentage: 60,
		plannedStageCount: 5,
		isOverdue: true,
	},
	{
		code: "T-0138",
		title: "Multi-day packaging line upgrade",
		taskType: "MULTI_DAY",
		priority: "HIGH",
		state: "REQ",
		assignee: "staff-4",
		createdBy: "tech-lead",
		startOffset: 2,
		startAt: [8, 0],
		endOffset: 5,
		endAt: [17, 0],
		progressPercentage: 0,
		plannedStageCount: 4,
	},
	{
		code: "T-0139",
		title: "Multi-day bay retrofit in progress",
		taskType: "MULTI_DAY",
		priority: "MEDIUM",
		state: "ACT",
		assignee: "staff-5",
		createdBy: "head",
		startOffset: 1,
		startAt: [8, 0],
		endOffset: 4,
		endAt: [17, 0],
		progressPercentage: 30,
		plannedStageCount: 4,
	},
	{
		code: "T-0140",
		title: "Multi-day safety course submitted",
		taskType: "MULTI_DAY",
		priority: "URGENT",
		state: "PEN",
		assignee: "staff-6",
		createdBy: "tech-lead",
		startOffset: -11,
		startAt: [8, 0],
		endOffset: -7,
		endAt: [17, 0],
		progressPercentage: 70,
		plannedStageCount: 3,
	},
	{
		code: "T-0141",
		title: "Multi-day ERP dry run approved",
		taskType: "MULTI_DAY",
		priority: "LOW",
		state: "APP",
		assignee: "staff-7",
		createdBy: "tech-lead",
		startOffset: -14,
		startAt: [8, 0],
		endOffset: -11,
		endAt: [17, 0],
		progressPercentage: 100,
		plannedStageCount: 3,
	},
	{
		code: "T-0142",
		title: "Multi-day network pull returned",
		taskType: "MULTI_DAY",
		priority: "MEDIUM",
		state: "REJ",
		assignee: "staff-8",
		createdBy: "tech-lead",
		startOffset: -12,
		startAt: [8, 0],
		endOffset: -9,
		endAt: [17, 0],
		progressPercentage: 40,
		plannedStageCount: 3,
	},
	{
		code: "T-0143",
		title: "Multi-day banner install cancelled",
		taskType: "MULTI_DAY",
		priority: "HIGH",
		state: "CAN",
		assignee: "staff-9",
		createdBy: "head",
		startOffset: -13,
		startAt: [8, 0],
		endOffset: -10,
		endAt: [17, 0],
		progressPercentage: 15,
		plannedStageCount: 4,
	},
	{
		code: "T-0144",
		title: "Multi-day urgent sample run overdue",
		taskType: "MULTI_DAY",
		priority: "MEDIUM",
		state: "OVERDUE",
		assignee: "staff-10",
		createdBy: "head",
		startOffset: -14,
		startAt: [8, 0],
		endOffset: -13,
		endAt: [17, 0],
		progressPercentage: 80,
		plannedStageCount: 2,
		isOverdue: true,
	},
	{
		code: "T-0145",
		title: "Multi-day department kick-off",
		taskType: "MULTI_DAY",
		priority: "LOW",
		state: "ACT",
		assignee: "head",
		createdBy: "tech-lead",
		startOffset: -2,
		startAt: [8, 0],
		endOffset: 0,
		endAt: [17, 0],
		progressPercentage: 45,
		plannedStageCount: 3,
	},
];

/** Engineering projects the schedule rows rotate across. */
const ENGINEERING_PROJECTS = ["proj-mes", "proj-qa", "proj-fab"] as const;

interface DemoUserSpec {
	email: string;
	name: string;
	userCode: string;
	role: string;
	departmentId: string;
	/** Inactive accounts stay listed for IAM filtering checks (default true). */
	isActive?: boolean;
}

/** Exactly five demo accounts, one per documented role. */
export const DEMO_USERS: readonly DemoUserSpec[] = [
	{
		email: "super.admin@mes.local",
		name: "Alex Morgan",
		userCode: "V0000000",
		role: "SUPER_ADMIN",
		departmentId: "dept-hq",
	},
	{
		email: "tech.lead@mes.local",
		name: "Priya Raman",
		userCode: "V0000001",
		role: "TECH_LEAD",
		departmentId: "dept-hq",
	},
	{
		email: "hr.manager@mes.local",
		name: "Hana Suzuki",
		userCode: "V0000002",
		role: "HR_MANAGER",
		departmentId: "dept-hq",
	},
	{
		email: "dept.head@mes.local",
		name: "Diego Alvarez",
		userCode: "V0000003",
		role: "DEPT_HEAD",
		departmentId: "dept-eng",
	},
	{
		email: "employee@mes.local",
		name: "Mina Park",
		userCode: "V0000004",
		role: "EMPLOYEE",
		departmentId: "dept-eng",
	},
];

/**
 * Supplementary development staff — `EMPLOYEE` role only, spread across the
 * engineering divisions and HQ operations so department-scoped calendars,
 * task lists, leave ledgers and KPI views carry multiple rows. The five
 * documented demo accounts (one per role) stay exactly as they are; these
 * accounts only add population. One account is inactive so activation
 * filtering can be exercised on a fresh database.
 */
export const STAFF_USERS: readonly DemoUserSpec[] = [
	{
		email: "linh.tran@mes.local",
		name: "Linh Tran",
		userCode: "V0000005",
		role: "EMPLOYEE",
		departmentId: "dept-eng-core",
	},
	{
		email: "bao.nguyen@mes.local",
		name: "Bao Nguyen",
		userCode: "V0000006",
		role: "EMPLOYEE",
		departmentId: "dept-eng-core",
	},
	{
		email: "quang.pham@mes.local",
		name: "Quang Pham",
		userCode: "V0000007",
		role: "EMPLOYEE",
		departmentId: "dept-eng-core",
	},
	{
		email: "mai.le@mes.local",
		name: "Mai Le",
		userCode: "V0000008",
		role: "EMPLOYEE",
		departmentId: "dept-eng-qa",
	},
	{
		email: "duc.vo@mes.local",
		name: "Duc Vo",
		userCode: "V0000009",
		role: "EMPLOYEE",
		departmentId: "dept-eng-qa",
	},
	{
		email: "hoa.do@mes.local",
		name: "Hoa Do",
		userCode: "V0000010",
		role: "EMPLOYEE",
		departmentId: "dept-eng-fab",
	},
	{
		email: "nam.hoang@mes.local",
		name: "Nam Hoang",
		userCode: "V0000011",
		role: "EMPLOYEE",
		departmentId: "dept-eng-fab",
	},
	{
		email: "thu.dang@mes.local",
		name: "Thu Dang",
		userCode: "V0000012",
		role: "EMPLOYEE",
		departmentId: "dept-hq-ops",
	},
	{
		email: "son.bui@mes.local",
		name: "Son Bui",
		userCode: "V0000013",
		role: "EMPLOYEE",
		departmentId: "dept-hq-ops",
	},
	{
		email: "minh.ngo@mes.local",
		name: "Minh Ngo",
		userCode: "V0000014",
		role: "EMPLOYEE",
		departmentId: "dept-hq",
		isActive: false,
	},
];

/** Every seeded account: the documented demo accounts first, then staff. */
const ALL_SEED_USERS: readonly DemoUserSpec[] = [...DEMO_USERS, ...STAFF_USERS];

/* ------------------------------------------------------------------ */
/* Date helpers (anchored to the caller's local calendar day)          */
/* ------------------------------------------------------------------ */

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

function dayStart(now: Date, offset: number): Date {
	return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
}

/** Local wall-clock instant on `today + offset`. */
function at(now: Date, offset: number, hours: number, minutes = 0): Date {
	return new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate() + offset,
		hours,
		minutes,
	);
}

/** Local `YYYY-MM-DD` for `today + offset`. */
function dayKey(now: Date, offset: number): string {
	const day = dayStart(now, offset);
	return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

function periodOf(day: string): { year: number; month: number } {
	return {
		year: Number(day.slice(0, 4)),
		month: Number(day.slice(5, 7)),
	};
}

/* ------------------------------------------------------------------ */
/* Seed                                                                */
/* ------------------------------------------------------------------ */

export interface SeedDependencies {
	db: DatabaseHandle;
	config: AppConfig;
	/** Injectable for tests; defaults to a `createAuth(db, config)` instance. */
	auth?: Auth;
	/** Injectable "today"; defaults to now. */
	now?: Date;
}

export interface SeedResult {
	seeded: boolean;
	counts: Record<string, number>;
}

/**
 * Better Auth's `userCode` additional field is declared `required: true,
 * input: false` with no default (see `auth/index.ts`), so `signUpEmail` rejects
 * the payload with "userCode is required" or "userCode is not allowed to be
 * set". The development seed supplies a per-account default so the account is
 * created through Better Auth's own password hashing.
 */
interface AuthInternals {
	$context: Promise<{
		options?: {
			user?: {
				additionalFields?: Record<string, { defaultValue?: unknown }>;
			};
		};
	}>;
}

export async function seedDatabase(
	deps: SeedDependencies,
): Promise<SeedResult> {
	const { db, config } = deps;

	if (config.isProduction) {
		throw new Error(
			"Refusing to seed: demo credentials and sample records are disabled in production. " +
				"Run the seed against a development/test database (NODE_ENV=development or test).",
		);
	}

	const auth = deps.auth ?? createAuth(db, config);
	const now = deps.now ?? new Date();

	/* ---- Code registries ------------------------------------------ */

	await db
		.insert(modules)
		.values(MODULE_SEED.map((row) => ({ ...row })))
		.onConflictDoNothing();

	await db
		.insert(ticketStates)
		.values(TICKET_STATE_SEED.map((row) => ({ ...row })))
		.onConflictDoNothing();

	await db
		.insert(leaveCodes)
		.values(LEAVE_CODE_SEED.map((row) => ({ ...row })))
		.onConflictDoNothing();

	await db
		.insert(roles)
		.values(ROLE_SEED.map((row) => ({ id: `role-${row.code}`, ...row })))
		.onConflictDoNothing();

	await db
		.insert(permissions)
		.values(PERMISSION_SEED.map((row) => ({ id: `perm-${row.code}`, ...row })))
		.onConflictDoNothing();

	await db
		.insert(rolePermissions)
		.values(
			ROLE_SEED.flatMap((role) =>
				permissionsForRole(role.code).map((permissionCode) => ({
					id: `rp-${role.code}-${permissionCode}`,
					roleId: `role-${role.code}`,
					permissionId: `perm-${permissionCode}`,
				})),
			),
		)
		.onConflictDoNothing();

	await db
		.insert(kpiPointRules)
		.values(KPI_RULE_SEED.map((row) => ({ ...row })))
		.onConflictDoNothing();

	/* ---- Organization & project ----------------------------------- */

	await db
		.insert(departments)
		.values(
			DEPARTMENT_SEED.filter((row) => row.parentId === null).map((row) => ({
				...row,
			})),
		)
		.onConflictDoNothing();

	await db
		.insert(departments)
		.values(
			DEPARTMENT_SEED.filter((row) => row.parentId !== null).map((row) => ({
				...row,
			})),
		)
		.onConflictDoNothing();

	await db
		.insert(projects)
		.values(PROJECT_SEED.map((row) => ({ ...row })))
		.onConflictDoNothing();

	/* ---- Demo users (through Better Auth) ------------------------- */

	const authInternals = auth as unknown as AuthInternals;
	const authContext = await authInternals.$context;
	const additionalFields = authContext.options?.user?.additionalFields;
	const userCodeField = additionalFields?.userCode;
	// Restore any pre-existing default once the demo accounts are created so the
	// mutated default cannot leak into later sign-ups on a shared instance.
	const previousUserCodeDefault = userCodeField?.defaultValue;

	const userIdByEmail = new Map<string, string>();

	for (const spec of ALL_SEED_USERS) {
		const [existing] = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, spec.email))
			.limit(1);

		if (existing) {
			await db
				.update(user)
				.set({
					name: spec.name,
					userCode: spec.userCode,
					departmentId: spec.departmentId,
					isActive: spec.isActive ?? true,
					updatedAt: now,
				})
				.where(eq(user.id, existing.id));
			userIdByEmail.set(spec.email, existing.id);
			continue;
		}

		if (userCodeField) userCodeField.defaultValue = spec.userCode;
		const created = await auth.api.signUpEmail({
			body: {
				email: spec.email,
				password: DEV_SEED_PASSWORD,
				name: spec.name,
			},
		});
		if (!created?.user?.id) {
			throw new Error(`Failed to create demo user ${spec.email}.`);
		}

		await db
			.update(user)
			.set({
				userCode: spec.userCode,
				departmentId: spec.departmentId,
				isActive: spec.isActive ?? true,
			})
			.where(eq(user.id, created.user.id));
		userIdByEmail.set(spec.email, created.user.id);
	}

	if (userCodeField) userCodeField.defaultValue = previousUserCodeDefault;

	const employeeId = userIdByEmail.get("employee@mes.local");
	const headId = userIdByEmail.get("dept.head@mes.local");
	const techLeadId = userIdByEmail.get("tech.lead@mes.local");
	const hrId = userIdByEmail.get("hr.manager@mes.local");
	const superAdminId = userIdByEmail.get("super.admin@mes.local");
	if (!employeeId || !headId || !techLeadId || !hrId || !superAdminId) {
		throw new Error("The five demo users could not all be resolved.");
	}

	await db
		.insert(userRoles)
		.values(
			ALL_SEED_USERS.map((spec) => ({
				id: `ur-${spec.userCode}-${spec.role}`,
				userId: userIdByEmail.get(spec.email) as string,
				roleId: `role-${spec.role}`,
			})),
		)
		.onConflictDoNothing();

	/** Staff ids in fixture order, for the expanded operational data below. */
	const staffIds = STAFF_USERS.map(
		(spec) => userIdByEmail.get(spec.email) as string,
	);

	/** Stable keys the expanded fixtures use to reference accounts. */
	const accountIdByKey = new Map<string, string>([
		["employee", employeeId],
		["head", headId],
		["tech-lead", techLeadId],
		["hr", hrId],
		["super-admin", superAdminId],
		...STAFF_USERS.map((_spec, index): [string, string] => [
			`staff-${index + 1}`,
			staffIds[index],
		]),
	]);
	/** Department of each keyed account, so tickets inherit the assignee's scope. */
	const departmentIdByKey = new Map<string, string>([
		["employee", "dept-eng"],
		["head", "dept-eng"],
		["tech-lead", "dept-hq"],
		["hr", "dept-hq"],
		["super-admin", "dept-hq"],
		...STAFF_USERS.map((spec, index): [string, string] => [
			`staff-${index + 1}`,
			spec.departmentId,
		]),
	]);

	const accountId = (key: string): string => {
		const id = accountIdByKey.get(key);
		if (!id) throw new Error(`Unknown seed account key "${key}".`);
		return id;
	};

	/** Rotate engineering tickets across the engineering projects. */
	const projectIdFor = (departmentId: string, sequence: number): string =>
		departmentId.startsWith("dept-eng")
			? ENGINEERING_PROJECTS[sequence % ENGINEERING_PROJECTS.length]
			: "proj-ops";

	await db
		.update(departments)
		.set({ managerId: headId, updatedAt: now })
		.where(eq(departments.id, "dept-eng"));
	await db
		.update(departments)
		.set({ managerId: techLeadId, updatedAt: now })
		.where(eq(departments.id, "dept-hq"));

	/* ---- Tasks covering every state and type --------------------- */

	const taskRows = [
		{
			id: "task-req-hourly",
			taskCode: "T-0001",
			title: "Confirm the 10:30 handover line",
			description: "Urgent hourly slot awaiting confirmation.",
			taskType: "HOURLY",
			priority: "URGENT",
			state: "REQ",
			assignedTo: employeeId,
			createdBy: techLeadId,
			startDate: at(now, 0, 10, 30),
			endDate: at(now, 0, 11, 30),
			progressPercentage: 0,
			isUrgentHourly: true,
			isOverdue: false,
		},
		{
			id: "task-act-daily",
			taskCode: "T-0002",
			title: "Scheduled maintenance checklist",
			description: "Daily task in progress.",
			taskType: "DAILY",
			priority: "HIGH",
			state: "ACT",
			assignedTo: employeeId,
			createdBy: techLeadId,
			startDate: at(now, 0, 8, 0),
			endDate: at(now, 0, 17, 0),
			progressPercentage: 40,
			isUrgentHourly: false,
			isOverdue: false,
		},
		{
			id: "task-pen-daily",
			taskCode: "T-0003",
			title: "Quality report submitted",
			description: "Report submitted, awaiting approval.",
			taskType: "DAILY",
			priority: "MEDIUM",
			state: "PEN",
			assignedTo: employeeId,
			createdBy: techLeadId,
			startDate: at(now, 0, 8, 0),
			endDate: at(now, 0, 17, 0),
			progressPercentage: 100,
			isUrgentHourly: false,
			isOverdue: false,
		},
		{
			id: "task-app-hourly",
			taskCode: "T-0004",
			title: "Yesterday's approved calibration",
			description: "Approved on time yesterday.",
			taskType: "HOURLY",
			priority: "MEDIUM",
			state: "APP",
			assignedTo: employeeId,
			createdBy: techLeadId,
			startDate: at(now, -1, 14, 0),
			endDate: at(now, -1, 15, 0),
			progressPercentage: 100,
			isUrgentHourly: false,
			isOverdue: false,
			approvedBy: techLeadId,
			approvedAt: at(now, -1, 15, 30),
		},
		{
			id: "task-rej-daily",
			taskCode: "T-0005",
			title: "Returned material request",
			description: "Returned for revision yesterday.",
			taskType: "DAILY",
			priority: "HIGH",
			state: "REJ",
			assignedTo: employeeId,
			createdBy: techLeadId,
			startDate: at(now, -1, 8, 0),
			endDate: at(now, -1, 17, 0),
			progressPercentage: 60,
			isUrgentHourly: false,
			isOverdue: false,
			reviewedBy: techLeadId,
			reviewedAt: at(now, -1, 17, 30),
		},
		{
			id: "task-can-multiday",
			taskCode: "T-0006",
			title: "Cancelled multi-day rework",
			description: "Cancelled by the manager.",
			taskType: "MULTI_DAY",
			priority: "LOW",
			state: "CAN",
			assignedTo: employeeId,
			createdBy: techLeadId,
			startDate: at(now, -2, 8, 0),
			endDate: at(now, 1, 17, 0),
			progressPercentage: 30,
			isUrgentHourly: false,
			isOverdue: false,
		},
		{
			id: "task-overdue-multiday",
			taskCode: "T-0007",
			title: "Overdue urgent multi-day build",
			description: "Passed its multi-day deadline.",
			taskType: "MULTI_DAY",
			priority: "URGENT",
			state: "OVERDUE",
			assignedTo: employeeId,
			createdBy: techLeadId,
			startDate: at(now, -4, 8, 0),
			endDate: at(now, -1, 17, 0),
			progressPercentage: 50,
			isUrgentHourly: false,
			isOverdue: true,
		},
		{
			id: "task-act-multiday",
			taskCode: "T-0008",
			title: "Multi-day prototype assembly",
			description: "Spans yesterday through tomorrow.",
			taskType: "MULTI_DAY",
			priority: "MEDIUM",
			state: "ACT",
			assignedTo: employeeId,
			createdBy: techLeadId,
			startDate: at(now, -1, 8, 0),
			endDate: at(now, 2, 17, 0),
			progressPercentage: 25,
			isUrgentHourly: false,
			isOverdue: false,
		},
		{
			id: "task-head-daily",
			taskCode: "T-0009",
			title: "Department stand-up notes",
			description: "Department head's own daily task.",
			taskType: "DAILY",
			priority: "HIGH",
			state: "ACT",
			assignedTo: headId,
			createdBy: techLeadId,
			startDate: at(now, 0, 8, 0),
			endDate: at(now, 0, 17, 0),
			progressPercentage: 10,
			isUrgentHourly: false,
			isOverdue: false,
		},
		{
			id: "task-hq-req",
			taskCode: "T-0010",
			title: "Roadmap review slot",
			description: "Tomorrow's hourly slot for the technical lead.",
			taskType: "HOURLY",
			priority: "LOW",
			state: "REQ",
			assignedTo: techLeadId,
			createdBy: superAdminId,
			startDate: at(now, 1, 16, 30),
			endDate: at(now, 1, 17, 30),
			progressPercentage: 0,
			isUrgentHourly: false,
			isOverdue: false,
		},
	];

	await db
		.insert(tasks)
		.values(
			taskRows.map((row) => ({
				...row,
				projectId: "proj-mes",
				departmentId: "dept-eng",
				extendedDeadline: null,
				isExtensionRequested: false,
				isLateSubmission: false,
				reviewedBy: "reviewedBy" in row ? row.reviewedBy : null,
				reviewedAt: "reviewedAt" in row ? row.reviewedAt : null,
				approvedBy: "approvedBy" in row ? row.approvedBy : null,
				approvedAt: "approvedAt" in row ? row.approvedAt : null,
				createdAt: at(now, -5, 8, 0),
				updatedAt: now,
			})),
		)
		.onConflictDoNothing();

	await db
		.insert(taskStateTransitions)
		.values(
			taskRows.map((row) => ({
				id: `tst-${row.id}`,
				taskId: row.id,
				fromState: null,
				toState: row.state,
				actorId: row.createdBy,
				reason: "Seeded ticket state.",
				createdAt: at(now, -5, 8, 0),
			})),
		)
		.onConflictDoNothing();

	/* ---- Expanded schedule ---------------------------------------- */

	const expandedTaskRows = EXPANDED_TASKS.map((spec, index) => {
		const assignedTo = accountId(spec.assignee);
		const createdBy = accountId(spec.createdBy);
		const departmentId = departmentIdByKey.get(spec.assignee) as string;
		const endDate = at(now, spec.endOffset, spec.endAt[0], spec.endAt[1]);
		const decidedAt = new Date(endDate.getTime() + 30 * 60 * 1000);
		const isApproved = spec.state === "APP";
		const isReturned = spec.state === "REJ";
		return {
			id: `task-${spec.code.toLowerCase()}`,
			taskCode: spec.code,
			title: spec.title,
			description:
				"Seeded development ticket covering an expanded schedule scenario.",
			projectId: projectIdFor(departmentId, index),
			departmentId,
			taskType: spec.taskType,
			priority: spec.priority,
			state: spec.state,
			createdBy,
			assignedTo,
			startDate: at(now, spec.startOffset, spec.startAt[0], spec.startAt[1]),
			endDate,
			extendedDeadline: null,
			progressPercentage: spec.progressPercentage,
			plannedStageCount: spec.plannedStageCount ?? null,
			isUrgentHourly:
				spec.isUrgentHourly ??
				(spec.taskType === "HOURLY" && spec.priority === "URGENT"),
			isExtensionRequested: false,
			isOverdue: spec.isOverdue ?? spec.state === "OVERDUE",
			isLateSubmission: false,
			approvedBy: isApproved ? createdBy : null,
			approvedAt: isApproved ? decidedAt : null,
			reviewedBy: isReturned ? createdBy : null,
			reviewedAt: isReturned ? decidedAt : null,
			createdAt: at(now, -5, 8, 0),
			updatedAt: now,
		};
	});

	await db.insert(tasks).values(expandedTaskRows).onConflictDoNothing();

	/* ---- Expanded transition history ------------------------------ */

	/** The documented journey that leads to each seeded state. */
	const TRANSITION_PATH_BY_STATE: Record<
		string,
		ReadonlyArray<{ from: string | null; to: string; reason: string }>
	> = {
		REQ: [{ from: null, to: "REQ", reason: "Seeded ticket state." }],
		ACT: [
			{ from: null, to: "REQ", reason: "Seeded ticket state." },
			{ from: "REQ", to: "ACT", reason: "Accepted the allocated ticket." },
		],
		PEN: [
			{ from: null, to: "REQ", reason: "Seeded ticket state." },
			{ from: "REQ", to: "ACT", reason: "Accepted the allocated ticket." },
			{ from: "ACT", to: "PEN", reason: "Progress report submitted." },
		],
		APP: [
			{ from: null, to: "REQ", reason: "Seeded ticket state." },
			{ from: "REQ", to: "ACT", reason: "Accepted the allocated ticket." },
			{ from: "ACT", to: "PEN", reason: "Progress report submitted." },
			{ from: "PEN", to: "APP", reason: "Report approved by the manager." },
		],
		REJ: [
			{ from: null, to: "REQ", reason: "Seeded ticket state." },
			{ from: "REQ", to: "ACT", reason: "Accepted the allocated ticket." },
			{ from: "ACT", to: "PEN", reason: "Progress report submitted." },
			{ from: "PEN", to: "REJ", reason: "Report returned for revision." },
		],
		CAN: [
			{ from: null, to: "REQ", reason: "Seeded ticket state." },
			{ from: "REQ", to: "ACT", reason: "Accepted the allocated ticket." },
			{ from: "ACT", to: "CAN", reason: "Ticket cancelled by the manager." },
		],
		OVERDUE: [
			{ from: null, to: "REQ", reason: "Seeded ticket state." },
			{ from: "REQ", to: "ACT", reason: "Accepted the allocated ticket." },
			{ from: "ACT", to: "OVERDUE", reason: "Deadline passed." },
		],
	};

	const expandedTransitionRows = expandedTaskRows.flatMap((row) =>
		(TRANSITION_PATH_BY_STATE[row.state] ?? []).map((step, stepIndex) => ({
			id: `tst-${row.taskCode.toLowerCase()}-${stepIndex + 1}`,
			taskId: row.id,
			fromState: step.from,
			toState: step.to,
			actorId: row.createdBy,
			reason: step.reason,
			createdAt: at(now, -5, 8, 0),
		})),
	);

	await db
		.insert(taskStateTransitions)
		.values(expandedTransitionRows)
		.onConflictDoNothing();

	/* ---- Expanded progress ledger --------------------------------- */

	// Every multi-day ticket with progress carries a log, plus a sample of the
	// single-day tickets, so progress history reads on a fresh database.
	interface ProgressLogSource {
		id: string;
		taskCode: string;
		assignedTo: string;
		progressPercentage: number;
		taskType: string;
		state: string;
	}

	const progressLogSources: ProgressLogSource[] = [
		...(taskRows as ProgressLogSource[]).filter(
			(row) => row.taskType === "MULTI_DAY" && row.progressPercentage > 0,
		),
		...(expandedTaskRows as ProgressLogSource[]).filter(
			(row) => row.taskType === "MULTI_DAY" && row.progressPercentage > 0,
		),
		...(expandedTaskRows as ProgressLogSource[])
			.filter(
				(row) =>
					row.taskType !== "MULTI_DAY" &&
					row.state !== "REQ" &&
					row.progressPercentage > 0,
			)
			.slice(0, 7),
	];

	const expandedProgressLogRows = progressLogSources.flatMap((row, index) => {
		const final = row.progressPercentage;
		const first = Math.max(0, final - 25);
		const rows = [
			{
				id: `tpl-${row.taskCode.toLowerCase()}-1`,
				taskId: row.id,
				userId: row.assignedTo,
				previousPercentage: 0,
				newPercentage: first,
				logComment: "Started work on the seeded ticket.",
				isVerifiedByManager: false,
				createdAt: at(now, -4, 9, 0),
			},
		];
		if (index % 3 === 0) {
			rows.push({
				id: `tpl-${row.taskCode.toLowerCase()}-2`,
				taskId: row.id,
				userId: row.assignedTo,
				previousPercentage: first,
				newPercentage: final,
				logComment: "Report submitted for manager verification.",
				isVerifiedByManager: true,
				createdAt: at(now, -1, 16, 0),
			});
		}
		return rows;
	});

	await db
		.insert(taskProgressLogs)
		.values(expandedProgressLogRows)
		.onConflictDoNothing();

	/* ---- Expanded extension / late-explanation requests ----------- */

	/** Look up an expanded ticket's row by its seeded code. */
	const expandedTaskByCode = (code: string) => {
		const row = expandedTaskRows.find((item) => item.taskCode === code);
		if (!row) throw new Error(`Unknown seeded ticket code "${code}".`);
		return row;
	};

	const taskRequestRows = [
		{
			id: "tr-ext-pending",
			taskCode: "T-0132",
			requestType: "EXTENSION",
			status: "PENDING",
			reason: "Vendor parts arrive late; requesting two more working days.",
			extensionDays: 2,
			reviewedBy: null,
			reviewComment: null,
			reviewedAt: null,
		},
		{
			id: "tr-ext-approved",
			taskCode: "T-0133",
			requestType: "EXTENSION",
			status: "APPROVED",
			reason: "Fixture alignment needs one extra day for calibration.",
			extensionDays: 1,
			reviewedBy: "tech-lead",
			reviewComment: "Extension granted; deadline extended.",
			reviewedAt: at(now, -2, 10, 0),
		},
		{
			id: "tr-ext-rejected",
			taskCode: "T-0140",
			requestType: "EXTENSION",
			status: "REJECTED",
			reason: "Safety course slides need more time.",
			extensionDays: 1,
			reviewedBy: "tech-lead",
			reviewComment: "No capacity for an extension this week.",
			reviewedAt: at(now, -3, 11, 0),
		},
		{
			id: "tr-late-pending",
			taskCode: "T-0107",
			requestType: "LATE_EXPLANATION",
			status: "PENDING",
			reason: "Inspection equipment was blocked by the prior urgent job.",
			extensionDays: 0,
			reviewedBy: null,
			reviewComment: null,
			reviewedAt: null,
		},
		{
			id: "tr-late-approved",
			taskCode: "T-0122",
			requestType: "LATE_EXPLANATION",
			status: "APPROVED",
			reason: "Export queue was saturated by the nightly batch.",
			extensionDays: 0,
			reviewedBy: "head",
			reviewComment: "Explanation accepted.",
			reviewedAt: at(now, -1, 14, 0),
		},
		{
			id: "tr-late-rejected",
			taskCode: "T-0137",
			requestType: "LATE_EXPLANATION",
			status: "REJECTED",
			reason: "Press parts were not ordered in time.",
			extensionDays: 0,
			reviewedBy: "head",
			reviewComment: "Reason not acceptable; please re-plan.",
			reviewedAt: at(now, -2, 9, 30),
		},
	].map((request) => {
		const task = expandedTaskByCode(request.taskCode);
		return {
			id: request.id,
			taskId: task.id,
			userId: task.assignedTo,
			requestType: request.requestType,
			requestedDeadline:
				request.extensionDays > 0
					? new Date(
							task.endDate.getTime() + request.extensionDays * 86_400_000,
						)
					: null,
			reason: request.reason,
			status: request.status,
			reviewedBy: request.reviewedBy ? accountId(request.reviewedBy) : null,
			reviewComment: request.reviewComment,
			reviewedAt: request.reviewedAt,
			createdAt: at(now, -4, 8, 0),
			updatedAt: request.reviewedAt ?? at(now, -4, 8, 0),
		};
	});

	await db.insert(taskRequests).values(taskRequestRows).onConflictDoNothing();

	/* ---- Expanded completion requests ----------------------------- */

	// One row per work stage: milestones feed multi-day progress, full-job
	// entries carry the terminal decision, and every decision state appears.
	const completionRequestRows = [
		{
			id: "tcr-t-0132-milestone-1",
			taskCode: "T-0132",
			scope: "MILESTONE",
			title: "Cell teardown complete",
			description: "Old cell dismantled and parts catalogued.",
			declaredProgress: 25,
			state: "APP",
			decisionReason: null,
		},
		{
			id: "tcr-t-0139-milestone-1",
			taskCode: "T-0139",
			scope: "MILESTONE",
			title: "Bay measured",
			description: "Retrofit bay measured and marked out.",
			declaredProgress: 30,
			state: "PEN",
			decisionReason: null,
		},
		{
			id: "tcr-t-0145-milestone-1",
			taskCode: "T-0145",
			scope: "MILESTONE",
			title: "Kick-off session held",
			description: "Department kick-off completed with the leads.",
			declaredProgress: 45,
			state: "PEN",
			decisionReason: null,
		},
		{
			id: "tcr-t-0103-full",
			taskCode: "T-0103",
			scope: "FULL_JOB",
			title: "Hourly line audit report",
			description: "Audit findings recorded for the 14:00 slot.",
			declaredProgress: 100,
			state: "PEN",
			decisionReason: null,
		},
		{
			id: "tcr-t-0110-full",
			taskCode: "T-0110",
			scope: "FULL_JOB",
			title: "Gauge report",
			description: "Gauge readings compiled and submitted.",
			declaredProgress: 100,
			state: "PEN",
			decisionReason: null,
		},
		{
			id: "tcr-t-0118-full",
			taskCode: "T-0118",
			scope: "FULL_JOB",
			title: "Consumables order",
			description: "Daily consumables order placed with the supplier.",
			declaredProgress: 100,
			state: "PEN",
			decisionReason: null,
		},
		{
			id: "tcr-t-0104-full",
			taskCode: "T-0104",
			scope: "FULL_JOB",
			title: "Pressure test report",
			description: "Pressure test passed within tolerance.",
			declaredProgress: 100,
			state: "APP",
			decisionReason: null,
		},
		{
			id: "tcr-t-0111-full",
			taskCode: "T-0111",
			scope: "FULL_JOB",
			title: "Weld inspection report",
			description: "Weld seams inspected and signed off.",
			declaredProgress: 100,
			state: "APP",
			decisionReason: null,
		},
		{
			id: "tcr-t-0119-full",
			taskCode: "T-0119",
			scope: "FULL_JOB",
			title: "Rack audit report",
			description: "All racks verified against the checklist.",
			declaredProgress: 100,
			state: "APP",
			decisionReason: null,
		},
		{
			id: "tcr-t-0105-full",
			taskCode: "T-0105",
			scope: "FULL_JOB",
			title: "Sample review",
			description: "Sample submitted for the 15:00 slot.",
			declaredProgress: 100,
			state: "REJ",
			decisionReason: "Photographs are missing; re-submit with evidence.",
		},
		{
			id: "tcr-t-0120-full",
			taskCode: "T-0120",
			scope: "FULL_JOB",
			title: "Urgent repair report",
			description: "Repair completed on the day shift.",
			declaredProgress: 100,
			state: "REJ",
			decisionReason: "Part numbers do not match the work order.",
		},
	].map((request) => {
		const task = expandedTaskByCode(request.taskCode);
		const isDecided = request.state !== "PEN";
		return {
			id: request.id,
			taskId: task.id,
			requestedBy: task.assignedTo,
			scope: request.scope,
			title: request.title,
			description: request.description,
			declaredProgress: request.declaredProgress,
			plannedStageCount:
				task.plannedStageCount ?? (request.scope === "MILESTONE" ? 3 : null),
			state: request.state,
			decidedBy: isDecided ? task.createdBy : null,
			decidedAt: isDecided
				? new Date(task.endDate.getTime() + 15 * 60 * 1000)
				: null,
			decisionReason: request.decisionReason,
			createdAt: at(now, -3, 9, 0),
			updatedAt: at(now, -2, 10, 0),
		};
	});

	await db
		.insert(taskCompletionRequests)
		.values(completionRequestRows)
		.onConflictDoNothing();

	/* ---- Attendance (leave badges, late/early, penalty) ----------- */

	await db
		.insert(attendanceRecords)
		.values([
			{
				id: "att-emp-al-yesterday",
				userId: employeeId,
				workDate: dayKey(now, -1),
				checkIn: null,
				checkOut: null,
				isLate: false,
				isEarlyLeave: false,
				leaveCode: "AL",
				workingHours: 0,
				note: "Approved annual leave.",
			},
			{
				id: "att-emp-al-today",
				userId: employeeId,
				workDate: dayKey(now, 0),
				checkIn: null,
				checkOut: null,
				isLate: false,
				isEarlyLeave: false,
				leaveCode: "AL",
				workingHours: 0,
				note: "Approved annual leave.",
			},
			{
				id: "att-emp-late-3d",
				userId: employeeId,
				workDate: dayKey(now, -3),
				checkIn: at(now, -3, 9, 10),
				checkOut: at(now, -3, 17, 30),
				isLate: true,
				isEarlyLeave: false,
				leaveCode: null,
				workingHours: 8,
				note: "Arrived late.",
			},
			{
				id: "att-emp-present-5d",
				userId: employeeId,
				workDate: dayKey(now, -5),
				checkIn: at(now, -5, 8, 0),
				checkOut: at(now, -5, 17, 0),
				isLate: false,
				isEarlyLeave: false,
				leaveCode: null,
				workingHours: 8,
				note: null,
			},
			{
				id: "att-emp-ual-6d",
				userId: employeeId,
				workDate: dayKey(now, -6),
				checkIn: null,
				checkOut: null,
				isLate: false,
				isEarlyLeave: false,
				leaveCode: "UAL",
				workingHours: 0,
				note: "Penalty leave UAL: deducts 100% of the daily wage (Deduct 100% of the daily wage + KPI point deduction).",
			},
			{
				id: "att-head-late-today",
				userId: headId,
				workDate: dayKey(now, 0),
				checkIn: at(now, 0, 9, 5),
				checkOut: at(now, 0, 17, 0),
				isLate: true,
				isEarlyLeave: false,
				leaveCode: null,
				workingHours: 7.5,
				note: "Arrived late.",
			},
			{
				id: "att-tech-early-today",
				userId: techLeadId,
				workDate: dayKey(now, 0),
				checkIn: at(now, 0, 8, 0),
				checkOut: at(now, 0, 16, 0),
				isLate: false,
				isEarlyLeave: true,
				leaveCode: null,
				workingHours: 8,
				note: "Left early.",
			},
		])
		.onConflictDoNothing();

	/* ---- Attendance: current-month matrix coverage ----------------- */

	/**
	 * Days the original hand-written rows already cover, as (user, day) leave
	 * badges. The generator below skips these so the documented examples stay
	 * exactly as authored.
	 */
	const ORIGINAL_LEAVE_DAYS: ReadonlyArray<{
		userKey: string;
		leaveCode: string;
		startOffset: number;
		endOffset: number;
	}> = [
		{ userKey: "employee", leaveCode: "AL", startOffset: -1, endOffset: 0 },
		{ userKey: "employee", leaveCode: "CL", startOffset: 3, endOffset: 4 },
		{ userKey: "head", leaveCode: "SL", startOffset: 1, endOffset: 2 },
	];

	/**
	 * Additional leave requests (task group 3.2). The generator renders their
	 * days as leave badges, and the ledger group consumes the approved ones.
	 */
	interface LeaveSeedRow {
		id: string;
		userKey: string;
		leaveCode: string;
		startOffset: number;
		endOffset: number;
		reason: string;
		handoverUserKey: string | null;
		status: "PENDING" | "APPROVED" | "REJECTED";
		approvedByKey: string | null;
		approvedAt: Date | null;
		createdAt: Date;
	}

	const LEAVE_SEED: readonly LeaveSeedRow[] = [
		{
			id: "leave-al-staff1",
			userKey: "staff-1",
			leaveCode: "AL",
			startOffset: -6,
			endOffset: -5,
			reason: "Annual leave (seeded).",
			handoverUserKey: "head",
			status: "APPROVED",
			approvedByKey: "hr",
			approvedAt: at(now, -7, 10, 0),
			createdAt: at(now, -8, 9, 0),
		},
		{
			id: "leave-al-staff2",
			userKey: "staff-2",
			leaveCode: "AL",
			startOffset: -14,
			endOffset: -12,
			reason: "Annual leave (seeded).",
			handoverUserKey: "head",
			status: "APPROVED",
			approvedByKey: "hr",
			approvedAt: at(now, -15, 10, 0),
			createdAt: at(now, -16, 9, 0),
		},
		{
			id: "leave-pl-staff3",
			userKey: "staff-3",
			leaveCode: "PL",
			startOffset: -4,
			endOffset: -4,
			reason: "Personal leave (seeded).",
			handoverUserKey: "staff-1",
			status: "APPROVED",
			approvedByKey: "hr",
			approvedAt: at(now, -5, 10, 0),
			createdAt: at(now, -6, 9, 0),
		},
		{
			id: "leave-ml-staff4",
			userKey: "staff-4",
			leaveCode: "ML",
			startOffset: -9,
			endOffset: -7,
			reason: "Medical leave (seeded).",
			handoverUserKey: "staff-2",
			status: "APPROVED",
			approvedByKey: "hr",
			approvedAt: at(now, -10, 10, 0),
			createdAt: at(now, -11, 9, 0),
		},
		{
			id: "leave-el-staff5",
			userKey: "staff-5",
			leaveCode: "EL",
			startOffset: 1,
			endOffset: 1,
			reason: "Emergency leave (seeded).",
			handoverUserKey: "staff-3",
			status: "PENDING",
			approvedByKey: null,
			approvedAt: null,
			createdAt: at(now, 0, 8, 0),
		},
		{
			id: "leave-cl-staff6",
			userKey: "staff-6",
			leaveCode: "CL",
			startOffset: 6,
			endOffset: 7,
			reason: "Compassionate leave (seeded).",
			handoverUserKey: "staff-4",
			status: "PENDING",
			approvedByKey: null,
			approvedAt: null,
			createdAt: at(now, 0, 8, 0),
		},
		{
			id: "leave-lwp-staff7",
			userKey: "staff-7",
			leaveCode: "LWP",
			startOffset: -12,
			endOffset: -11,
			reason: "Leave without pay (seeded).",
			handoverUserKey: "staff-5",
			status: "APPROVED",
			approvedByKey: "head",
			approvedAt: at(now, -13, 10, 0),
			createdAt: at(now, -14, 9, 0),
		},
		{
			id: "leave-toil-staff8",
			userKey: "staff-8",
			leaveCode: "TOIL",
			startOffset: -10,
			endOffset: -10,
			reason: "Time off in lieu (seeded).",
			handoverUserKey: "staff-6",
			status: "APPROVED",
			approvedByKey: "tech-lead",
			approvedAt: at(now, -11, 10, 0),
			createdAt: at(now, -12, 9, 0),
		},
		{
			id: "leave-vto-staff9",
			userKey: "staff-9",
			leaveCode: "VTO",
			startOffset: -13,
			endOffset: -12,
			reason: "Voluntary time off (seeded).",
			handoverUserKey: "staff-7",
			status: "APPROVED",
			approvedByKey: "head",
			approvedAt: at(now, -14, 10, 0),
			createdAt: at(now, -15, 9, 0),
		},
		{
			id: "leave-sl-head-2",
			userKey: "head",
			leaveCode: "SL",
			startOffset: -10,
			endOffset: -9,
			reason: "Sick leave (seeded).",
			handoverUserKey: "employee",
			status: "APPROVED",
			approvedByKey: "hr",
			approvedAt: at(now, -11, 10, 0),
			createdAt: at(now, -12, 9, 0),
		},
		{
			id: "leave-al-tech",
			userKey: "tech-lead",
			leaveCode: "AL",
			startOffset: 5,
			endOffset: 5,
			reason: "Annual leave (seeded).",
			handoverUserKey: "head",
			status: "PENDING",
			approvedByKey: null,
			approvedAt: null,
			createdAt: at(now, 0, 8, 0),
		},
		{
			id: "leave-toil-employee",
			userKey: "employee",
			leaveCode: "TOIL",
			startOffset: 7,
			endOffset: 7,
			reason: "Time off in lieu (seeded).",
			handoverUserKey: "head",
			status: "APPROVED",
			approvedByKey: "tech-lead",
			approvedAt: at(now, -1, 15, 0),
			createdAt: at(now, -2, 9, 0),
		},
		{
			id: "leave-al-rejected",
			userKey: "staff-9",
			leaveCode: "AL",
			startOffset: 3,
			endOffset: 4,
			reason: "Annual leave (seeded).",
			handoverUserKey: "staff-7",
			status: "REJECTED",
			approvedByKey: "hr",
			approvedAt: at(now, 0, 9, 0),
			createdAt: at(now, -1, 9, 0),
		},
		{
			id: "leave-lwp-rejected",
			userKey: "staff-4",
			leaveCode: "LWP",
			startOffset: 8,
			endOffset: 8,
			reason: "Leave without pay (seeded).",
			handoverUserKey: "staff-2",
			status: "REJECTED",
			approvedByKey: "hr",
			approvedAt: at(now, 0, 9, 15),
			createdAt: at(now, -1, 10, 0),
		},
	];

	/** Leave badge per `(userKey, YYYY-MM-DD)`, for the calendar generator. */
	const leaveCodeByUserDay = new Map<string, string>();
	for (const row of [...ORIGINAL_LEAVE_DAYS, ...LEAVE_SEED]) {
		for (let offset = row.startOffset; offset <= row.endOffset; offset++) {
			leaveCodeByUserDay.set(
				`${row.userKey}|${dayKey(now, offset)}`,
				row.leaveCode,
			);
		}
	}

	/** Active accounts, in the order the matrix calendar lists them. */
	const activeUserKeys = [
		"employee",
		"head",
		"tech-lead",
		"hr",
		"super-admin",
		...STAFF_USERS.flatMap((spec, index) =>
			spec.isActive === false ? [] : [`staff-${index + 1}`],
		),
	];

	/** The most recent weekday at or before `fromOffset`. */
	const mostRecentWeekday = (fromOffset: number): number => {
		let offset = fromOffset;
		while (true) {
			const weekday = dayStart(now, offset).getDay();
			if (weekday !== 0 && weekday !== 6) return offset;
			offset -= 1;
		}
	};

	// Penalty leave days assigned by HR/managers to two employees.
	const penaltyDayByUserKey = new Map<string, { offset: number; code: string }>(
		[
			["staff-1", { offset: mostRecentWeekday(-7), code: "UAL" }],
			["staff-2", { offset: mostRecentWeekday(-8), code: "USL" }],
		],
	);

	// Days already carrying a row (original seeds or previous runs) stay as-is.
	const takenAttendance = new Set(
		(
			await db
				.select({
					userId: attendanceRecords.userId,
					workDate: attendanceRecords.workDate,
				})
				.from(attendanceRecords)
		).map((row) => `${row.userId}|${row.workDate}`),
	);

	const generatedAttendanceRows = [];
	const firstDayOffset = 1 - now.getDate();
	for (let userIndex = 0; userIndex < activeUserKeys.length; userIndex++) {
		const userKey = activeUserKeys[userIndex];
		const userId = accountId(userKey);
		const penaltyDay = penaltyDayByUserKey.get(userKey);
		for (let offset = firstDayOffset; offset <= 0; offset++) {
			const workDate = dayKey(now, offset);
			if (takenAttendance.has(`${userId}|${workDate}`)) continue;
			const weekday = dayStart(now, offset).getDay();
			if (weekday === 0 || weekday === 6) continue;

			const leaveCode =
				leaveCodeByUserDay.get(`${userKey}|${workDate}`) ??
				(penaltyDay && penaltyDay.offset === offset ? penaltyDay.code : null);

			if (leaveCode) {
				const isPenalty = leaveCode === "UAL" || leaveCode === "USL";
				generatedAttendanceRows.push({
					id: `att-gen-${userKey}-${workDate}`,
					userId,
					workDate,
					checkIn: null,
					checkOut: null,
					isLate: false,
					isEarlyLeave: false,
					leaveCode,
					workingHours: 0,
					note: isPenalty
						? `Penalty leave ${leaveCode}: deducts 100% of the daily wage.`
						: `Seeded ${leaveCode} leave day.`,
				});
				continue;
			}

			const isToday = offset === 0;
			const pattern = (userIndex * 31 + (offset + 40) * 17) % 23;
			if (pattern % 11 === 0) {
				generatedAttendanceRows.push({
					id: `att-gen-${userKey}-${workDate}`,
					userId,
					workDate,
					checkIn: at(now, offset, 9, 10),
					checkOut: isToday ? null : at(now, offset, 17, 30),
					isLate: true,
					isEarlyLeave: false,
					leaveCode: null,
					workingHours: isToday ? 0 : 7.5,
					note: "Arrived late.",
				});
			} else if (pattern % 7 === 3) {
				generatedAttendanceRows.push({
					id: `att-gen-${userKey}-${workDate}`,
					userId,
					workDate,
					checkIn: at(now, offset, 8, 0),
					checkOut: isToday ? null : at(now, offset, 16, 0),
					isLate: false,
					isEarlyLeave: true,
					leaveCode: null,
					workingHours: isToday ? 0 : 8,
					note: "Left early.",
				});
			} else if (pattern % 5 === 2) {
				generatedAttendanceRows.push({
					id: `att-gen-${userKey}-${workDate}`,
					userId,
					workDate,
					checkIn: at(now, offset, 8, 0),
					checkOut: isToday ? null : at(now, offset, 12, 0),
					isLate: false,
					isEarlyLeave: false,
					leaveCode: null,
					workingHours: isToday ? 0 : 4,
					note: "Half-day shift.",
				});
			} else {
				generatedAttendanceRows.push({
					id: `att-gen-${userKey}-${workDate}`,
					userId,
					workDate,
					checkIn: at(now, offset, 8, 0),
					checkOut: isToday ? null : at(now, offset, 17, 0),
					isLate: false,
					isEarlyLeave: false,
					leaveCode: null,
					workingHours: isToday ? 0 : 8,
					note: null,
				});
			}
		}
	}

	// On a re-run every day is already taken, so the set can legitimately be
	// empty; drizzle refuses an empty insert, so the batch is skipped.
	if (generatedAttendanceRows.length > 0) {
		await db
			.insert(attendanceRecords)
			.values(generatedAttendanceRows)
			.onConflictDoNothing();
	}

	/* ---- Leave requests, balances & overtime --------------------- */

	await db
		.insert(leaveRequests)
		.values([
			{
				id: "leave-al-001",
				userId: employeeId,
				leaveCode: "AL",
				startDate: dayKey(now, -1),
				endDate: dayKey(now, 0),
				totalDays: 2,
				reason: "Annual leave (seeded).",
				handoverUserId: headId,
				status: "APPROVED",
				approvedBy: hrId,
				approvedAt: at(now, -2, 10, 0),
				createdAt: at(now, -3, 9, 0),
				updatedAt: at(now, -2, 10, 0),
			},
			{
				id: "leave-cl-001",
				userId: employeeId,
				leaveCode: "CL",
				startDate: dayKey(now, 3),
				endDate: dayKey(now, 4),
				totalDays: 2,
				reason: "Compassionate leave (seeded).",
				handoverUserId: headId,
				status: "PENDING",
				approvedBy: null,
				approvedAt: null,
				createdAt: at(now, 0, 8, 0),
				updatedAt: at(now, 0, 8, 0),
			},
			{
				id: "leave-sl-head-001",
				userId: headId,
				leaveCode: "SL",
				startDate: dayKey(now, 1),
				endDate: dayKey(now, 2),
				totalDays: 2,
				reason: "Sick leave (seeded).",
				handoverUserId: employeeId,
				status: "PENDING",
				approvedBy: null,
				approvedAt: null,
				createdAt: at(now, 0, 8, 0),
				updatedAt: at(now, 0, 8, 0),
			},
		])
		.onConflictDoNothing();

	await db
		.insert(leaveRequests)
		.values(
			LEAVE_SEED.map((row) => ({
				id: row.id,
				userId: accountId(row.userKey),
				leaveCode: row.leaveCode,
				startDate: dayKey(now, row.startOffset),
				endDate: dayKey(now, row.endOffset),
				totalDays: row.endOffset - row.startOffset + 1,
				reason: row.reason,
				handoverUserId: row.handoverUserKey
					? accountId(row.handoverUserKey)
					: null,
				status: row.status,
				approvedBy: row.approvedByKey ? accountId(row.approvedByKey) : null,
				approvedAt: row.approvedAt,
				createdAt: row.createdAt,
				updatedAt: row.approvedAt ?? row.createdAt,
			})),
		)
		.onConflictDoNothing();

	await db
		.insert(leaveBalanceEntries)
		.values([
			{
				id: `lbe-al-accrual-employee-${now.getFullYear()}`,
				userId: employeeId,
				leaveCode: "AL",
				entryType: "ACCRUAL",
				deltaDays: 12,
				periodYear: now.getFullYear(),
				referenceType: "ANNUAL_ENTITLEMENT",
				referenceId: null,
				note: "Seeded annual leave entitlement.",
				createdBy: hrId,
			},
			{
				id: "lbe-al-usage-leave-al-001",
				userId: employeeId,
				leaveCode: "AL",
				entryType: "USAGE",
				deltaDays: -2,
				periodYear: periodOf(dayKey(now, -1)).year,
				referenceType: "LEAVE_REQUEST",
				referenceId: "leave-al-001",
				note: "Approved AL leave (2 day(s)).",
				createdBy: hrId,
			},
			{
				id: `lbe-al-accrual-head-${now.getFullYear()}`,
				userId: headId,
				leaveCode: "AL",
				entryType: "ACCRUAL",
				deltaDays: 12,
				periodYear: now.getFullYear(),
				referenceType: "ANNUAL_ENTITLEMENT",
				referenceId: null,
				note: "Seeded annual leave entitlement.",
				createdBy: hrId,
			},
			{
				id: "lbe-toil-accrual-ot-001",
				userId: employeeId,
				leaveCode: "TOIL",
				entryType: "ACCRUAL",
				deltaDays: 1,
				periodYear: periodOf(dayKey(now, -2)).year,
				referenceType: "OVERTIME_RECORD",
				referenceId: "ot-001",
				note: "Approved overtime: 8h / 8h per TOIL day.",
				createdBy: techLeadId,
			},
		])
		.onConflictDoNothing();

	await db
		.insert(overtimeRecords)
		.values([
			{
				id: "ot-001",
				userId: employeeId,
				workDate: dayKey(now, -2),
				hours: 8,
				isApproved: true,
				approvedBy: techLeadId,
				approvedAt: at(now, -1, 9, 0),
				note: "Weekend maintenance overtime (seeded).",
			},
			{
				id: "ot-002",
				userId: employeeId,
				workDate: dayKey(now, 0),
				hours: 2,
				isApproved: false,
				approvedBy: null,
				approvedAt: null,
				note: "Evening deployment support (seeded).",
			},
		])
		.onConflictDoNothing();

	/* ---- Expanded ledgers: overtime & balances -------------------- */

	// Approved overtime is seeded at exactly 8 hours so every approved record
	// feeds exactly one TOIL day (documented conversion), and pending records
	// stay open for the approval queue.
	const weekendOffsetAtOrBefore = (
		fromOffset: number,
		target: number,
	): number => {
		let offset = fromOffset;
		while (dayStart(now, offset).getDay() !== target) offset -= 1;
		return offset;
	};

	const saturdayOffset = weekendOffsetAtOrBefore(-6, 6);
	const sundayOffset = weekendOffsetAtOrBefore(-5, 0);
	const saturdayOffset2 = weekendOffsetAtOrBefore(-13, 6);
	const sundayOffset2 = weekendOffsetAtOrBefore(-12, 0);

	const OVERTIME_SEED: ReadonlyArray<{
		id: string;
		userKey: string;
		offset: number;
		hours: number;
		approverKey: string | null;
		note: string;
	}> = [
		{
			id: "ot-003",
			userKey: "staff-1",
			offset: saturdayOffset,
			hours: 8,
			approverKey: "tech-lead",
			note: "Saturday cell commissioning (seeded).",
		},
		{
			id: "ot-004",
			userKey: "staff-2",
			offset: sundayOffset,
			hours: 8,
			approverKey: "tech-lead",
			note: "Sunday line commissioning (seeded).",
		},
		{
			id: "ot-005",
			userKey: "staff-3",
			offset: saturdayOffset2,
			hours: 8,
			approverKey: "tech-lead",
			note: "Weekend gauging support (seeded).",
		},
		{
			id: "ot-006",
			userKey: "staff-4",
			offset: -7,
			hours: 8,
			approverKey: "head",
			note: "Evening maintenance window (seeded).",
		},
		{
			id: "ot-007",
			userKey: "staff-5",
			offset: -8,
			hours: 8,
			approverKey: "head",
			note: "Evening data migration (seeded).",
		},
		{
			id: "ot-008",
			userKey: "staff-6",
			offset: -9,
			hours: 2,
			approverKey: null,
			note: "Evening handover support (seeded).",
		},
		{
			id: "ot-009",
			userKey: "staff-7",
			offset: sundayOffset2,
			hours: 8,
			approverKey: "head",
			note: "Sunday stock take (seeded).",
		},
		{
			id: "ot-010",
			userKey: "staff-8",
			offset: -10,
			hours: 8,
			approverKey: "head",
			note: "Evening deployment support (seeded).",
		},
	];

	const expandedOvertimeRows = OVERTIME_SEED.map((record) => ({
		id: record.id,
		userId: accountId(record.userKey),
		workDate: dayKey(now, record.offset),
		hours: record.hours,
		isApproved: record.approverKey !== null,
		approvedBy: record.approverKey ? accountId(record.approverKey) : null,
		approvedAt: record.approverKey ? at(now, -2, 9, 0) : null,
		note: record.note,
	}));

	await db
		.insert(overtimeRecords)
		.values(expandedOvertimeRows)
		.onConflictDoNothing();

	// Leave ledger: annual accruals for every account, the documented
	// carry-over, TOIL conversions for each approved 8-hour overtime record,
	// usage rows for the approved balance-tracked leave, plus adjustments and
	// an expiry so every entry type is represented.
	const balanceSeedUsers = [
		"tech-lead",
		"hr",
		"super-admin",
		...STAFF_USERS.map((_spec, index) => `staff-${index + 1}`),
	];

	const expandedBalanceRows = [
		...balanceSeedUsers.map((userKey, index) => ({
			id: `lbe-al-accrual-${userKey}-${now.getFullYear()}`,
			userId: accountId(userKey),
			leaveCode: "AL",
			entryType: "ACCRUAL",
			deltaDays: 12,
			periodYear: now.getFullYear(),
			referenceType: "ANNUAL_ENTITLEMENT",
			referenceId: null,
			note: `Seeded annual leave entitlement (account ${index + 2}).`,
			createdBy: hrId,
		})),
		...["employee", "head", "tech-lead", "hr", "super-admin"].map(
			(userKey) => ({
				id: `lbe-al-carryover-${userKey}-${now.getFullYear()}`,
				userId: accountId(userKey),
				leaveCode: "AL",
				entryType: "CARRY_OVER",
				deltaDays: 2,
				periodYear: now.getFullYear(),
				referenceType: "CARRY_OVER",
				referenceId: null,
				note: "Unused days carried over from the previous year.",
				createdBy: hrId,
			}),
		),
		...expandedOvertimeRows
			.filter((record) => record.isApproved && record.hours === 8)
			.map((record) => ({
				id: `lbe-toil-accrual-${record.id}`,
				userId: record.userId,
				leaveCode: "TOIL",
				entryType: "ACCRUAL",
				deltaDays: record.hours / 8,
				periodYear: periodOf(record.workDate).year,
				referenceType: "OVERTIME_RECORD",
				referenceId: record.id,
				note: `Approved overtime: ${record.hours}h / 8h per TOIL day.`,
				createdBy: record.approvedBy,
			})),
		...LEAVE_SEED.filter(
			(row) => row.status === "APPROVED" && row.leaveCode === "AL",
		).map((row) => ({
			id: `lbe-al-usage-${row.id}`,
			userId: accountId(row.userKey),
			leaveCode: "AL",
			entryType: "USAGE",
			deltaDays: -(row.endOffset - row.startOffset + 1),
			periodYear: periodOf(dayKey(now, row.startOffset)).year,
			referenceType: "LEAVE_REQUEST",
			referenceId: row.id,
			note: `Approved AL leave (${row.endOffset - row.startOffset + 1} day(s)).`,
			createdBy: row.approvedByKey ? accountId(row.approvedByKey) : hrId,
		})),
		...LEAVE_SEED.filter(
			(row) => row.status === "APPROVED" && row.leaveCode === "TOIL",
		).map((row) => ({
			id: `lbe-toil-usage-${row.id}`,
			userId: accountId(row.userKey),
			leaveCode: "TOIL",
			entryType: "USAGE",
			deltaDays: -(row.endOffset - row.startOffset + 1),
			periodYear: periodOf(dayKey(now, row.startOffset)).year,
			referenceType: "LEAVE_REQUEST",
			referenceId: row.id,
			note: `Approved TOIL leave (${row.endOffset - row.startOffset + 1} day(s)).`,
			createdBy: row.approvedByKey ? accountId(row.approvedByKey) : techLeadId,
		})),
		{
			id: `lbe-al-adjustment-staff3-${now.getFullYear()}`,
			userId: accountId("staff-3"),
			leaveCode: "AL",
			entryType: "ADJUSTMENT",
			deltaDays: 1,
			periodYear: now.getFullYear(),
			referenceType: null,
			referenceId: null,
			note: "Manual correction after the pay period audit.",
			createdBy: hrId,
		},
		{
			id: `lbe-al-adjustment-employee-${now.getFullYear()}`,
			userId: employeeId,
			leaveCode: "AL",
			entryType: "ADJUSTMENT",
			deltaDays: -0.5,
			periodYear: now.getFullYear(),
			referenceType: null,
			referenceId: null,
			note: "Unlogged absence reconciled by HR.",
			createdBy: hrId,
		},
		{
			id: `lbe-al-expiry-employee-${now.getFullYear()}`,
			userId: employeeId,
			leaveCode: "AL",
			entryType: "EXPIRY",
			deltaDays: -1,
			periodYear: now.getFullYear(),
			referenceType: null,
			referenceId: null,
			note: "Expired unused leave day.",
			createdBy: hrId,
		},
	];

	await db
		.insert(leaveBalanceEntries)
		.values(expandedBalanceRows)
		.onConflictDoNothing();

	/* ---- KPI examples --------------------------------------------- */

	const lateDay = dayKey(now, -3);
	const ualDay = dayKey(now, -6);
	const approvedDay = dayKey(now, -1);

	await db
		.insert(kpiScoreEvents)
		.values([
			{
				id: "kpi-on-time-employee-app",
				userId: employeeId,
				taskId: "task-app-hourly",
				ruleCode: "KPI_ON_TIME_TICKET",
				points: 10,
				periodYear: periodOf(approvedDay).year,
				periodMonth: periodOf(approvedDay).month,
				occurredAt: at(now, -1, 15, 30),
				note: "On-time approved hourly ticket.",
			},
			{
				id: `kpi-ual-employee-${ualDay}`,
				userId: employeeId,
				taskId: null,
				ruleCode: "KPI_UNAPPROVED_LEAVE",
				points: -10,
				periodYear: periodOf(ualDay).year,
				periodMonth: periodOf(ualDay).month,
				occurredAt: at(now, -6, 12, 0),
				note: "Unapproved leave (UAL) assigned.",
			},
			{
				id: `kpi-late-employee-${lateDay}`,
				userId: employeeId,
				taskId: null,
				ruleCode: "KPI_UNAPPROVED_LEAVE",
				points: -10,
				periodYear: periodOf(lateDay).year,
				periodMonth: periodOf(lateDay).month,
				occurredAt: at(now, -3, 9, 10),
				note: "Late arrival.",
			},
		])
		.onConflictDoNothing();

	/* ---- Expanded KPI score events -------------------------------- */

	// Point values come from the seeded rule table, so a documented rule
	// change automatically re-scores these rows.
	const rulePointsByCode = new Map(
		KPI_RULE_SEED.map((rule) => [rule.code, rule.points]),
	);

	/** Always lands inside the previous calendar month. */
	const previousMonthOffset = -now.getDate() - 5;

	const KPI_EVENT_SEED: ReadonlyArray<{
		userKey: string;
		taskCode: string | null;
		ruleCode: KpiRuleCode;
		offset: number;
		note: string;
	}> = [
		// Current month — task bonuses.
		{
			userKey: "staff-1",
			taskCode: "T-0104",
			ruleCode: "KPI_ON_TIME_TICKET",
			offset: -3,
			note: "On-time approved hourly ticket.",
		},
		{
			userKey: "staff-5",
			taskCode: "T-0111",
			ruleCode: "KPI_ON_TIME_TICKET",
			offset: -8,
			note: "On-time approved hourly ticket.",
		},
		{
			userKey: "staff-9",
			taskCode: "T-0119",
			ruleCode: "KPI_ON_TIME_TICKET",
			offset: -2,
			note: "On-time approved daily ticket.",
		},
		{
			userKey: "staff-10",
			taskCode: "T-0134",
			ruleCode: "KPI_ON_TIME_TICKET",
			offset: -7,
			note: "On-time approved multi-day ticket.",
		},
		{
			userKey: "head",
			taskCode: null,
			ruleCode: "KPI_ON_TIME_TICKET",
			offset: -1,
			note: "On-time approved ticket.",
		},
		{
			userKey: "staff-8",
			taskCode: null,
			ruleCode: "KPI_ON_TIME_URGENT",
			offset: -1,
			note: "On-time approved urgent ticket.",
		},
		{
			userKey: "staff-6",
			taskCode: null,
			ruleCode: "KPI_ON_TIME_URGENT",
			offset: -8,
			note: "On-time approved urgent ticket.",
		},
		{
			userKey: "staff-3",
			taskCode: null,
			ruleCode: "KPI_ON_TIME_URGENT",
			offset: -6,
			note: "On-time approved urgent ticket.",
		},
		{
			userKey: "staff-1",
			taskCode: "T-0104",
			ruleCode: "KPI_FIRST_TIME_APPROVAL",
			offset: -3,
			note: "Approved immediately without edits.",
		},
		{
			userKey: "staff-5",
			taskCode: "T-0111",
			ruleCode: "KPI_FIRST_TIME_APPROVAL",
			offset: -8,
			note: "Approved immediately without edits.",
		},
		{
			userKey: "staff-9",
			taskCode: "T-0119",
			ruleCode: "KPI_FIRST_TIME_APPROVAL",
			offset: -2,
			note: "Approved immediately without edits.",
		},
		{
			userKey: "staff-10",
			taskCode: "T-0134",
			ruleCode: "KPI_FIRST_TIME_APPROVAL",
			offset: -7,
			note: "Approved immediately without edits.",
		},
		{
			userKey: "head",
			taskCode: null,
			ruleCode: "KPI_PERFECT_ATTENDANCE",
			offset: 0,
			note: "Month of excellent attendance.",
		},
		// Current month — penalties.
		{
			userKey: "staff-3",
			taskCode: "T-0107",
			ruleCode: "KPI_OVERDUE_TICKET",
			offset: -6,
			note: "Hourly urgent inspection overdue.",
		},
		{
			userKey: "staff-10",
			taskCode: "T-0122",
			ruleCode: "KPI_OVERDUE_TICKET",
			offset: -5,
			note: "Daily urgent export overdue.",
		},
		{
			userKey: "staff-7",
			taskCode: "T-0114",
			ruleCode: "KPI_OVERDUE_TICKET",
			offset: -11,
			note: "Hourly urgent leak check overdue.",
		},
		{
			userKey: "staff-3",
			taskCode: "T-0137",
			ruleCode: "KPI_OVERDUE_TICKET",
			offset: -13,
			note: "Multi-day press repair overdue.",
		},
		{
			userKey: "staff-10",
			taskCode: "T-0144",
			ruleCode: "KPI_OVERDUE_TICKET",
			offset: -14,
			note: "Multi-day sample run overdue.",
		},
		{
			userKey: "staff-3",
			taskCode: "T-0105",
			ruleCode: "KPI_RETURNED_TICKET",
			offset: -4,
			note: "Hourly sample returned for revision.",
		},
		{
			userKey: "staff-6",
			taskCode: "T-0112",
			ruleCode: "KPI_RETURNED_TICKET",
			offset: -9,
			note: "Hourly label check returned.",
		},
		{
			userKey: "staff-9",
			taskCode: "T-0120",
			ruleCode: "KPI_RETURNED_TICKET",
			offset: -3,
			note: "Daily urgent repair returned.",
		},
		{
			userKey: "staff-1",
			taskCode: "T-0135",
			ruleCode: "KPI_RETURNED_TICKET",
			offset: -9,
			note: "Multi-day cabinet assembly returned.",
		},
		{
			userKey: "staff-8",
			taskCode: "T-0142",
			ruleCode: "KPI_RETURNED_TICKET",
			offset: -12,
			note: "Multi-day network pull returned.",
		},
		{
			userKey: "staff-8",
			taskCode: "T-0132",
			ruleCode: "KPI_EXTENSION_REQUEST",
			offset: -4,
			note: "Extension requested for parts delay.",
		},
		{
			userKey: "staff-9",
			taskCode: "T-0133",
			ruleCode: "KPI_EXTENSION_REQUEST",
			offset: -3,
			note: "Extension requested for calibration.",
		},
		{
			userKey: "staff-6",
			taskCode: "T-0140",
			ruleCode: "KPI_EXTENSION_REQUEST",
			offset: -4,
			note: "Extension requested for slides.",
		},
		{
			userKey: "staff-3",
			taskCode: "T-0107",
			ruleCode: "KPI_EXTENSION_REQUEST",
			offset: -5,
			note: "Late explanation submitted.",
		},
		{
			userKey: "staff-10",
			taskCode: "T-0122",
			ruleCode: "KPI_EXTENSION_REQUEST",
			offset: -4,
			note: "Late explanation submitted.",
		},
		{
			userKey: "staff-3",
			taskCode: "T-0137",
			ruleCode: "KPI_EXTENSION_REQUEST",
			offset: -5,
			note: "Late explanation submitted.",
		},
		{
			userKey: "employee",
			taskCode: null,
			ruleCode: "KPI_UNAPPROVED_LEAVE",
			offset: -3,
			note: "Late arrival.",
		},
		{
			userKey: "employee",
			taskCode: null,
			ruleCode: "KPI_UNAPPROVED_LEAVE",
			offset: -6,
			note: "Unapproved leave (UAL) assigned.",
		},
		{
			userKey: "head",
			taskCode: null,
			ruleCode: "KPI_UNAPPROVED_LEAVE",
			offset: 0,
			note: "Late arrival.",
		},
		{
			userKey: "tech-lead",
			taskCode: null,
			ruleCode: "KPI_UNAPPROVED_LEAVE",
			offset: 0,
			note: "Early leave.",
		},
		// Previous month — so dashboards and leaderboards span two periods.
		{
			userKey: "staff-2",
			taskCode: null,
			ruleCode: "KPI_ON_TIME_TICKET",
			offset: previousMonthOffset,
			note: "On-time approved ticket (previous month).",
		},
		{
			userKey: "staff-4",
			taskCode: null,
			ruleCode: "KPI_ON_TIME_URGENT",
			offset: previousMonthOffset,
			note: "On-time urgent ticket (previous month).",
		},
		{
			userKey: "staff-2",
			taskCode: null,
			ruleCode: "KPI_FIRST_TIME_APPROVAL",
			offset: previousMonthOffset,
			note: "Approved without edits (previous month).",
		},
		{
			userKey: "staff-2",
			taskCode: null,
			ruleCode: "KPI_PERFECT_ATTENDANCE",
			offset: previousMonthOffset,
			note: "Month of excellent attendance (previous month).",
		},
		{
			userKey: "staff-7",
			taskCode: null,
			ruleCode: "KPI_OVERDUE_TICKET",
			offset: previousMonthOffset,
			note: "Overdue ticket (previous month).",
		},
		{
			userKey: "staff-8",
			taskCode: null,
			ruleCode: "KPI_RETURNED_TICKET",
			offset: previousMonthOffset,
			note: "Returned ticket (previous month).",
		},
		{
			userKey: "staff-5",
			taskCode: null,
			ruleCode: "KPI_UNAPPROVED_LEAVE",
			offset: previousMonthOffset,
			note: "Late arrival (previous month).",
		},
	];

	const expandedKpiEventRows = KPI_EVENT_SEED.map((event) => {
		const points = rulePointsByCode.get(event.ruleCode);
		if (points === undefined) {
			throw new Error(`Unknown KPI rule code "${event.ruleCode}".`);
		}
		const task = event.taskCode ? expandedTaskByCode(event.taskCode) : null;
		const period = periodOf(dayKey(now, event.offset));
		return {
			id: `kpi-x-${event.userKey}-${event.ruleCode}-${event.offset}`,
			userId: accountId(event.userKey),
			taskId: task ? task.id : null,
			ruleCode: event.ruleCode,
			points,
			periodYear: period.year,
			periodMonth: period.month,
			occurredAt: at(now, event.offset, 10, 0),
			note: event.note,
		};
	});

	await db
		.insert(kpiScoreEvents)
		.values(expandedKpiEventRows)
		.onConflictDoNothing();

	/* ---- Derived monthly KPI summaries ---------------------------- */

	// The monthly summary is a derived snapshot, so the seed rebuilds it with
	// the application's own engine from the seeded events and attendance
	// instead of authoring `kpi_monthly_summaries` rows that could drift.
	const superAdminSpec = DEMO_USERS.find((spec) => spec.role === "SUPER_ADMIN");
	if (!superAdminSpec || !superAdminId) {
		throw new Error("The SUPER_ADMIN demo account could not be resolved.");
	}

	const kpiViewer: Viewer = {
		id: superAdminId,
		userCode: superAdminSpec.userCode,
		fullName: superAdminSpec.name,
		email: superAdminSpec.email,
		departmentId: superAdminSpec.departmentId,
		isActive: true,
		roleCodes: ["SUPER_ADMIN"],
	};
	const kpiContext = createContext({
		db,
		config,
		request: { ipAddress: null, userAgent: null },
		viewer: kpiViewer,
	});

	const currentPeriod = {
		year: now.getFullYear(),
		month: now.getMonth() + 1,
	};
	const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
	const previousPeriod = {
		year: previousMonthStart.getFullYear(),
		month: previousMonthStart.getMonth() + 1,
	};

	for (const spec of ALL_SEED_USERS) {
		const userId = userIdByEmail.get(spec.email);
		if (!userId)
			throw new Error(`Seed user ${spec.email} could not be resolved.`);
		for (const period of [previousPeriod, currentPeriod]) {
			await recomputeMonthlySummary(
				kpiContext,
				userId,
				period.year,
				period.month,
			);
		}
	}

	/* ---- Expanded audit activity ---------------------------------- */

	// A representative slice of the activity stream so the audit module shows
	// data on a fresh database: the same action names the domains record.
	const AUDIT_SEED: ReadonlyArray<{
		actorKey: string;
		action: string;
		moduleCode: string;
		resourceType: string;
		resourceId: string | null;
		offset: number;
		oldData: string | null;
		newData: string | null;
	}> = [
		// jobs
		{
			actorKey: "tech-lead",
			action: "task.create",
			moduleCode: "jobs",
			resourceType: "task",
			resourceId: "T-0132",
			offset: -14,
			oldData: null,
			newData: '{"state":"REQ"}',
		},
		{
			actorKey: "staff-8",
			action: "task.accept",
			moduleCode: "jobs",
			resourceType: "task",
			resourceId: "T-0132",
			offset: -13,
			oldData: '{"state":"REQ"}',
			newData: '{"state":"ACT"}',
		},
		{
			actorKey: "staff-8",
			action: "task.progress",
			moduleCode: "jobs",
			resourceType: "task",
			resourceId: "T-0132",
			offset: -2,
			oldData: '{"progressPercentage":0}',
			newData: '{"progressPercentage":25}',
		},
		{
			actorKey: "staff-9",
			action: "task.submit",
			moduleCode: "jobs",
			resourceType: "task",
			resourceId: "T-0133",
			offset: -2,
			oldData: '{"state":"ACT"}',
			newData: '{"state":"PEN"}',
		},
		{
			actorKey: "tech-lead",
			action: "task.approve",
			moduleCode: "jobs",
			resourceType: "task",
			resourceId: "T-0104",
			offset: -3,
			oldData: '{"state":"PEN"}',
			newData: '{"state":"APP"}',
		},
		{
			actorKey: "tech-lead",
			action: "task.return",
			moduleCode: "jobs",
			resourceType: "task",
			resourceId: "T-0105",
			offset: -4,
			oldData: '{"state":"PEN"}',
			newData: '{"state":"REJ"}',
		},
		{
			actorKey: "head",
			action: "task.cancel",
			moduleCode: "jobs",
			resourceType: "task",
			resourceId: "T-0136",
			offset: -8,
			oldData: '{"state":"ACT"}',
			newData: '{"state":"CAN"}',
		},
		{
			actorKey: "tech-lead",
			action: "task.overdue",
			moduleCode: "jobs",
			resourceType: "task",
			resourceId: "T-0107",
			offset: -6,
			oldData: '{"state":"ACT"}',
			newData: '{"state":"OVERDUE"}',
		},
		{
			actorKey: "staff-8",
			action: "task.extension.request",
			moduleCode: "jobs",
			resourceType: "task",
			resourceId: "T-0132",
			offset: -4,
			oldData: null,
			newData: '{"extensionDays":2}',
		},
		{
			actorKey: "staff-3",
			action: "task.late.explanation",
			moduleCode: "jobs",
			resourceType: "task",
			resourceId: "T-0107",
			offset: -5,
			oldData: null,
			newData: '{"reason":"Inspection equipment blocked."}',
		},
		{
			actorKey: "staff-9",
			action: "task.completion.request",
			moduleCode: "jobs",
			resourceType: "task",
			resourceId: "T-0133",
			offset: -2,
			oldData: null,
			newData: '{"scope":"FULL_JOB","state":"PEN"}',
		},
		{
			actorKey: "tech-lead",
			action: "task.completion.review",
			moduleCode: "jobs",
			resourceType: "task",
			resourceId: "T-0104",
			offset: -3,
			oldData: '{"state":"PEN"}',
			newData: '{"state":"APP"}',
		},
		{
			actorKey: "tech-lead",
			action: "task.request.review",
			moduleCode: "jobs",
			resourceType: "task",
			resourceId: "T-0133",
			offset: -2,
			oldData: '{"status":"PENDING"}',
			newData: '{"status":"APPROVED"}',
		},
		// planning
		{
			actorKey: "staff-1",
			action: "leave.register",
			moduleCode: "planning",
			resourceType: "leave_request",
			resourceId: "leave-al-staff1",
			offset: -8,
			oldData: null,
			newData: '{"leaveCode":"AL","status":"PENDING"}',
		},
		{
			actorKey: "hr",
			action: "leave.approve",
			moduleCode: "planning",
			resourceType: "leave_request",
			resourceId: "leave-al-staff1",
			offset: -7,
			oldData: '{"status":"PENDING"}',
			newData: '{"status":"APPROVED"}',
		},
		{
			actorKey: "hr",
			action: "leave.assign_penalty",
			moduleCode: "planning",
			resourceType: "attendance_record",
			resourceId: "att-gen-staff-1",
			offset: -7,
			oldData: null,
			newData: '{"leaveCode":"UAL"}',
		},
		{
			actorKey: "staff-4",
			action: "leave.register",
			moduleCode: "planning",
			resourceType: "leave_request",
			resourceId: "leave-ml-staff4",
			offset: -11,
			oldData: null,
			newData: '{"leaveCode":"ML","status":"PENDING"}',
		},
		{
			actorKey: "hr",
			action: "leave.approve",
			moduleCode: "planning",
			resourceType: "leave_request",
			resourceId: "leave-ml-staff4",
			offset: -10,
			oldData: '{"status":"PENDING"}',
			newData: '{"status":"APPROVED"}',
		},
		{
			actorKey: "staff-1",
			action: "overtime.record",
			moduleCode: "planning",
			resourceType: "overtime_record",
			resourceId: "ot-003",
			offset: -6,
			oldData: null,
			newData: '{"hours":8,"isApproved":false}',
		},
		{
			actorKey: "tech-lead",
			action: "overtime.record",
			moduleCode: "planning",
			resourceType: "overtime_record",
			resourceId: "ot-003",
			offset: -5,
			oldData: '{"isApproved":false}',
			newData: '{"isApproved":true}',
		},
		// settings
		{
			actorKey: "super-admin",
			action: "user.create",
			moduleCode: "settings",
			resourceType: "user",
			resourceId: "V0000005",
			offset: -20,
			oldData: null,
			newData: '{"role":"EMPLOYEE"}',
		},
		{
			actorKey: "hr",
			action: "user.update",
			moduleCode: "settings",
			resourceType: "user",
			resourceId: "V0000006",
			offset: -3,
			oldData: '{"departmentId":"dept-hq-ops"}',
			newData: '{"departmentId":"dept-eng-core"}',
		},
		{
			actorKey: "super-admin",
			action: "user.deactivate",
			moduleCode: "settings",
			resourceType: "user",
			resourceId: "V0000014",
			offset: -2,
			oldData: '{"isActive":true}',
			newData: '{"isActive":false}',
		},
		{
			actorKey: "super-admin",
			action: "department.create",
			moduleCode: "settings",
			resourceType: "department",
			resourceId: "ENG-QA",
			offset: -18,
			oldData: null,
			newData: '{"departmentType":"DIVISION"}',
		},
		{
			actorKey: "tech-lead",
			action: "role.permissions.update",
			moduleCode: "settings",
			resourceType: "role",
			resourceId: "DEPT_HEAD",
			offset: -9,
			oldData: '{"permissions":13}',
			newData: '{"permissions":14}',
		},
		{
			actorKey: "super-admin",
			action: "app_setting.update",
			moduleCode: "settings",
			resourceType: "app_setting",
			resourceId: "jobs.ticket.create",
			offset: -1,
			oldData: '{"value":"true"}',
			newData: '{"value":"false"}',
		},
		// audit-log
		{
			actorKey: "employee",
			action: "auth.signin",
			moduleCode: "audit-log",
			resourceType: "session",
			resourceId: null,
			offset: 0,
			oldData: null,
			newData: null,
		},
		{
			actorKey: "hr",
			action: "auth.signin",
			moduleCode: "audit-log",
			resourceType: "session",
			resourceId: null,
			offset: 0,
			oldData: null,
			newData: null,
		},
		{
			actorKey: "super-admin",
			action: "audit.log.export",
			moduleCode: "audit-log",
			resourceType: "export_artifact",
			resourceId: null,
			offset: -1,
			oldData: null,
			newData: '{"format":"CSV"}',
		},
		{
			actorKey: "super-admin",
			action: "system.migrate",
			moduleCode: "audit-log",
			resourceType: "system",
			resourceId: null,
			offset: -22,
			oldData: null,
			newData: '{"journal":"0003_drop-auto-forking"}',
		},
	];

	const expandedAuditRows = AUDIT_SEED.map((entry, index) => ({
		id: `audit-x-${String(index + 1).padStart(3, "0")}`,
		userId: accountId(entry.actorKey),
		action: entry.action,
		moduleCode: entry.moduleCode,
		resourceType: entry.resourceType,
		resourceId: entry.resourceId,
		oldData: entry.oldData,
		newData: entry.newData,
		ipAddress: "127.0.0.1",
		userAgent: "MES development seed",
		createdAt: at(now, entry.offset, 10, 0),
	}));

	await db
		.insert(systemAuditLogs)
		.values(expandedAuditRows)
		.onConflictDoNothing();

	/* ---- Result counts -------------------------------------------- */

	const counts: Record<string, number> = {
		ticketStates: await countRows(db, ticketStates),
		leaveCodes: await countRows(db, leaveCodes),
		modules: await countRows(db, modules),
		roles: await countRows(db, roles),
		permissions: await countRows(db, permissions),
		rolePermissions: await countRows(db, rolePermissions),
		kpiPointRules: await countRows(db, kpiPointRules),
		departments: await countRows(db, departments),
		projects: await countRows(db, projects),
		users: await countRows(db, user),
		userRoles: await countRows(db, userRoles),
		tasks: await countRows(db, tasks),
		taskStateTransitions: await countRows(db, taskStateTransitions),
		taskProgressLogs: await countRows(db, taskProgressLogs),
		taskRequests: await countRows(db, taskRequests),
		taskCompletionRequests: await countRows(db, taskCompletionRequests),
		attendanceRecords: await countRows(db, attendanceRecords),
		leaveRequests: await countRows(db, leaveRequests),
		leaveBalanceEntries: await countRows(db, leaveBalanceEntries),
		overtimeRecords: await countRows(db, overtimeRecords),
		kpiScoreEvents: await countRows(db, kpiScoreEvents),
		kpiMonthlySummaries: await countRows(db, kpiMonthlySummaries),
		systemAuditLogs: await countRows(db, systemAuditLogs),
		attachments: await countRows(db, attachmentsTable),
	};

	return { seeded: true, counts };
}

async function countRows(db: DatabaseHandle, table: PgTable): Promise<number> {
	const [row] = await db.select({ value: count() }).from(table);
	return row?.value ?? 0;
}

/* ------------------------------------------------------------------ */
/* Development/test entry point                                        */
/* ------------------------------------------------------------------ */

if (import.meta.main) {
	const config = loadConfig();
	await runMigrations({ databaseUrl: config.databaseUrl });
	const db = createDatabase(config.databaseUrl);
	const result = await seedDatabase({ db, config });
	console.log(
		`Seeded ${result.counts.users} accounts (5 demo + ${result.counts.users - 5} staff), ${result.counts.tasks} tasks and ${result.counts.attendanceRecords} attendance rows into ${config.databaseUrl}.`,
	);
	console.log(`Demo password: ${DEV_SEED_PASSWORD} (development/test only).`);
	await db.$client.end();
}
