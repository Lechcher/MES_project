/**
 * Deterministic development/test seed.
 *
 * Loads the documented code registries, organization structure, exactly five
 * demo users (one per role), and a coherent set of task, attendance, leave and
 * KPI fixtures anchored to the current date so the yesterday/today/tomorrow
 * views and the current month always show meaningful data.
 *
 * Every row uses a deterministic id and is inserted with `ON CONFLICT DO
 * NOTHING`, so running the seed repeatedly is a no-op and row counts stay
 * stable. Demo credentials and sample records are refused outright in
 * production.
 *
 * Run for development/test with `bun run db:seed`.
 */

import { count, eq } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { type Auth, createAuth } from "../auth";
import { type AppConfig, loadConfig } from "../config";
import { createDatabase, type DatabaseHandle } from "./index";
import { runMigrations } from "./migrate";
import {
	attachments as attachmentsTable,
	attendanceRecords,
	departments,
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
					permission.moduleCode !== "audit-log",
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
		autoForkingEnabled: true,
	},
	{
		id: "dept-hq",
		code: "HQ",
		name: "Headquarters",
		departmentType: "DEPARTMENT",
		parentId: null,
		autoForkingEnabled: true,
	},
	{
		id: "dept-eng-core",
		code: "ENG-CORE",
		name: "Engineering Core",
		departmentType: "DIVISION",
		parentId: "dept-eng",
		autoForkingEnabled: true,
	},
	{
		id: "dept-hq-ops",
		code: "HQ-OPS",
		name: "Headquarters Operations",
		departmentType: "DIVISION",
		parentId: "dept-hq",
		autoForkingEnabled: true,
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
] as const;

interface DemoUserSpec {
	email: string;
	name: string;
	userCode: string;
	role: string;
	departmentId: string;
}

/** Exactly five demo accounts, one per documented role. */
export const DEMO_USERS: readonly DemoUserSpec[] = [
	{
		email: "super.admin@mes.local",
		name: "Alex Morgan",
		userCode: "SA-001",
		role: "SUPER_ADMIN",
		departmentId: "dept-hq",
	},
	{
		email: "tech.lead@mes.local",
		name: "Priya Raman",
		userCode: "TL-001",
		role: "TECH_LEAD",
		departmentId: "dept-hq",
	},
	{
		email: "hr.manager@mes.local",
		name: "Hana Suzuki",
		userCode: "HR-001",
		role: "HR_MANAGER",
		departmentId: "dept-hq",
	},
	{
		email: "dept.head@mes.local",
		name: "Diego Alvarez",
		userCode: "DH-001",
		role: "DEPT_HEAD",
		departmentId: "dept-eng",
	},
	{
		email: "employee@mes.local",
		name: "Mina Park",
		userCode: "EM-001",
		role: "EMPLOYEE",
		departmentId: "dept-eng",
	},
];

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

	for (const spec of DEMO_USERS) {
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
					isActive: true,
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
			DEMO_USERS.map((spec) => ({
				id: `ur-${spec.role}`,
				userId: userIdByEmail.get(spec.email) as string,
				roleId: `role-${spec.role}`,
			})),
		)
		.onConflictDoNothing();

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
		attendanceRecords: await countRows(db, attendanceRecords),
		leaveRequests: await countRows(db, leaveRequests),
		leaveBalanceEntries: await countRows(db, leaveBalanceEntries),
		overtimeRecords: await countRows(db, overtimeRecords),
		kpiScoreEvents: await countRows(db, kpiScoreEvents),
		attachments: await countRows(db, attachmentsTable),
	};

	return { seeded: true, counts };
}

async function countRows(
	db: DatabaseHandle,
	table: SQLiteTable,
): Promise<number> {
	const [row] = await db.select({ value: count() }).from(table);
	return row?.value ?? 0;
}

/* ------------------------------------------------------------------ */
/* Development/test entry point                                        */
/* ------------------------------------------------------------------ */

if (import.meta.main) {
	const config = loadConfig();
	runMigrations({ databasePath: config.databasePath });
	const db = createDatabase(config.databasePath);
	const result = await seedDatabase({ db, config });
	console.log(
		`Seeded ${result.counts.users} demo users, ${result.counts.tasks} tasks and ${result.counts.attendanceRecords} attendance rows into ${config.databasePath}.`,
	);
	console.log(`Demo password: ${DEV_SEED_PASSWORD} (development/test only).`);
	db.$client.close();
}
