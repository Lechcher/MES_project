/**
 * Drizzle schema for the MES PostgreSQL database.
 *
 * This file is the source of truth for `backend/drizzle/*` migrations. It
 * implements the model documented in `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql`
 * (the PostgreSQL reference schema): enum-like codes remain constrained text,
 * ids are application-generated UUID strings, timestamps are timezone-aware
 * (`timestamptz`) values, `DATE` values are `YYYY-MM-DD` text, and JSON is
 * stored as text. Foreign keys, uniqueness, checks and query indexes are
 * preserved.
 *
 * Better Auth owns the `user`, `session`, `account`, and `verification` tables.
 * The MES profile shares the Better Auth user id (one identity, not two), so
 * `user` carries the MES columns (`user_code`, `department_id`, `is_active`).
 */

import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	check,
	doublePrecision,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

const timestampMs = (name: string) =>
	timestamp(name, { mode: "date", precision: 3, withTimezone: true });

const createdAt = () => timestampMs("created_at").defaultNow().notNull();
const updatedAt = () => timestampMs("updated_at").defaultNow().notNull();

/* ------------------------------------------------------------------ */
/* Better Auth                                                         */
/* ------------------------------------------------------------------ */

export const user = pgTable(
	"user",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		email: text("email").notNull().unique(),
		emailVerified: boolean("email_verified").default(false).notNull(),
		image: text("image"),
		/** MES profile identity, unique across the directory. */
		userCode: text("user_code").notNull().unique(),
		departmentId: text("department_id").references(() => departments.id, {
			onDelete: "set null",
		}),
		isActive: boolean("is_active").default(true).notNull(),
		deletedAt: timestampMs("deleted_at"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		index("idx_users_department").on(table.departmentId),
		index("idx_users_active").on(table.isActive),
	],
);

export const session = pgTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: timestampMs("expires_at").notNull(),
		token: text("token").notNull().unique(),
		// Better Auth supplies these values on insert.
		createdAt: timestampMs("created_at").notNull(),
		updatedAt: timestampMs("updated_at").notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [index("idx_session_user").on(table.userId)],
);

export const account = pgTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestampMs("access_token_expires_at"),
		refreshTokenExpiresAt: timestampMs("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		// Better Auth supplies these values on insert.
		createdAt: timestampMs("created_at").notNull(),
		updatedAt: timestampMs("updated_at").notNull(),
	},
	(table) => [index("idx_account_user").on(table.userId)],
);

export const verification = pgTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestampMs("expires_at").notNull(),
		// Better Auth supplies these values on insert.
		createdAt: timestampMs("created_at").notNull(),
		updatedAt: timestampMs("updated_at").notNull(),
	},
	(table) => [index("idx_verification_identifier").on(table.identifier)],
);

/* ------------------------------------------------------------------ */
/* Organization, identity, RBAC                                        */
/* ------------------------------------------------------------------ */

export const departments = pgTable(
	"departments",
	{
		id: text("id").primaryKey(),
		code: text("code").notNull().unique(),
		name: text("name").notNull(),
		departmentType: text("department_type").default("DEPARTMENT").notNull(),
		parentId: text("parent_id"),
		managerId: text("manager_id"),
		autoForkingEnabled: boolean("auto_forking_enabled").default(true).notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		deletedAt: timestampMs("deleted_at"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"ck_departments_type",
			sql`department_type in ('DEPARTMENT', 'DIVISION')`,
		),
		check("ck_departments_code", sql`length(trim(code)) > 0`),
		index("idx_departments_parent").on(table.parentId),
		index("idx_departments_manager").on(table.managerId),
		index("idx_departments_type").on(table.departmentType),
	],
);

export const roles = pgTable(
	"roles",
	{
		id: text("id").primaryKey(),
		code: text("code").notNull().unique(),
		name: text("name").notNull(),
		description: text("description"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	() => [
		check(
			"ck_roles_code",
			sql`code in ('SUPER_ADMIN', 'TECH_LEAD', 'HR_MANAGER', 'DEPT_HEAD', 'EMPLOYEE')`,
		),
	],
);

export const permissions = pgTable(
	"permissions",
	{
		id: text("id").primaryKey(),
		code: text("code").notNull().unique(),
		moduleCode: text("module_code").notNull(),
		description: text("description"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"ck_permissions_module",
			sql`module_code in ('jobs', 'planning', 'performance', 'settings', 'audit-log', 'shoptify')`,
		),
		index("idx_permissions_module").on(table.moduleCode),
	],
);

export const userRoles = pgTable(
	"user_roles",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		roleId: text("role_id")
			.notNull()
			.references(() => roles.id, { onDelete: "cascade" }),
		assignedAt: timestampMs("assigned_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("uq_user_roles").on(table.userId, table.roleId),
		index("idx_user_roles_role").on(table.roleId),
	],
);

export const rolePermissions = pgTable(
	"role_permissions",
	{
		id: text("id").primaryKey(),
		roleId: text("role_id")
			.notNull()
			.references(() => roles.id, { onDelete: "cascade" }),
		permissionId: text("permission_id")
			.notNull()
			.references(() => permissions.id, { onDelete: "cascade" }),
		grantedAt: timestampMs("granted_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("uq_role_permissions").on(table.roleId, table.permissionId),
		index("idx_role_permissions_permission").on(table.permissionId),
	],
);

/* ------------------------------------------------------------------ */
/* Code registries                                                     */
/* ------------------------------------------------------------------ */

export const modules = pgTable(
	"modules",
	{
		code: text("code").primaryKey(),
		name: text("name").notNull(),
		description: text("description"),
		isEnabled: boolean("is_enabled").default(true).notNull(),
		sortOrder: integer("sort_order").default(0).notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	() => [
		check(
			"ck_modules_code",
			sql`code in ('jobs', 'planning', 'performance', 'settings', 'audit-log', 'shoptify')`,
		),
	],
);

export const ticketStates = pgTable(
	"ticket_states",
	{
		code: text("code").primaryKey(),
		name: text("name").notNull(),
		color: text("color").notNull(),
		description: text("description"),
		isTerminal: boolean("is_terminal").default(false).notNull(),
		sortOrder: integer("sort_order").default(0).notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	() => [
		check(
			"ck_ticket_states_code",
			sql`code in ('REQ', 'ACT', 'PEN', 'APP', 'REJ', 'CAN', 'OVERDUE')`,
		),
	],
);

export const leaveCodes = pgTable(
	"leave_codes",
	{
		code: text("code").primaryKey(),
		name: text("name").notNull(),
		category: text("category").notNull(),
		isPaid: boolean("is_paid").default(false).notNull(),
		payrollRule: text("payroll_rule").notNull(),
		deductsWage: boolean("deducts_wage").default(false).notNull(),
		isPenalty: boolean("is_penalty").default(false).notNull(),
		isBalanceTracked: boolean("is_balance_tracked").default(false).notNull(),
		sortOrder: integer("sort_order").default(0).notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	() => [
		check(
			"ck_leave_codes_code",
			sql`code in ('AL', 'UAL', 'SL', 'USL', 'PL', 'ML', 'CL', 'EL', 'LWP', 'TOIL', 'VTO')`,
		),
		check(
			"ck_leave_codes_category",
			sql`category in ('PAID', 'UNPAID', 'INSURANCE', 'SPECIAL')`,
		),
	],
);

/* ------------------------------------------------------------------ */
/* Audit trail                                                         */
/* ------------------------------------------------------------------ */

export const systemAuditLogs = pgTable(
	"system_audit_logs",
	{
		id: text("id").primaryKey(),
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
		action: text("action").notNull(),
		moduleCode: text("module_code"),
		resourceType: text("resource_type").notNull(),
		resourceId: text("resource_id"),
		oldData: text("old_data"),
		newData: text("new_data"),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		createdAt: createdAt(),
	},
	(table) => [
		check(
			"ck_audit_module",
			sql`module_code is null or module_code in ('jobs', 'planning', 'performance', 'settings', 'audit-log', 'shoptify')`,
		),
		index("idx_audit_user").on(table.userId),
		index("idx_audit_resource").on(table.resourceType, table.resourceId),
		index("idx_audit_created").on(table.createdAt),
		index("idx_audit_module").on(table.moduleCode),
		index("idx_audit_module_created").on(table.moduleCode, table.createdAt),
	],
);

/* ------------------------------------------------------------------ */
/* Jobs & Projects                                                     */
/* ------------------------------------------------------------------ */

export const projects = pgTable(
	"projects",
	{
		id: text("id").primaryKey(),
		code: text("code").notNull().unique(),
		name: text("name").notNull(),
		description: text("description"),
		departmentId: text("department_id").references(() => departments.id, {
			onDelete: "set null",
		}),
		isActive: boolean("is_active").default(true).notNull(),
		deletedAt: timestampMs("deleted_at"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [index("idx_projects_department").on(table.departmentId)],
);

export const tasks = pgTable(
	"tasks",
	{
		id: text("id").primaryKey(),
		taskCode: text("task_code").notNull().unique(),
		title: text("title").notNull(),
		description: text("description"),
		projectId: text("project_id").references(() => projects.id, {
			onDelete: "set null",
		}),
		taskType: text("task_type").default("DAILY").notNull(),
		priority: text("priority").default("MEDIUM").notNull(),
		state: text("state").default("REQ").notNull(),
		createdBy: text("created_by").references(() => user.id, {
			onDelete: "set null",
		}),
		assignedTo: text("assigned_to").references(() => user.id, {
			onDelete: "set null",
		}),
		departmentId: text("department_id").references(() => departments.id, {
			onDelete: "set null",
		}),
		startDate: timestampMs("start_date"),
		endDate: timestampMs("end_date"),
		extendedDeadline: timestampMs("extended_deadline"),
		progressPercentage: integer("progress_percentage").default(0).notNull(),
		/** `MULTI_DAY` only: how many stages the assignee expects the job to take. */
		plannedStageCount: integer("planned_stage_count"),
		isUrgentHourly: boolean("is_urgent_hourly").default(false).notNull(),
		isExtensionRequested: boolean("is_extension_requested")
			.default(false)
			.notNull(),
		isOverdue: boolean("is_overdue").default(false).notNull(),
		isLateSubmission: boolean("is_late_submission").default(false).notNull(),
		approvedBy: text("approved_by").references(() => user.id, {
			onDelete: "set null",
		}),
		approvedAt: timestampMs("approved_at"),
		reviewedBy: text("reviewed_by").references(() => user.id, {
			onDelete: "set null",
		}),
		reviewedAt: timestampMs("reviewed_at"),
		deletedAt: timestampMs("deleted_at"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"ck_tasks_state",
			sql`state in ('REQ', 'ACT', 'PEN', 'APP', 'REJ', 'CAN', 'OVERDUE')`,
		),
		check(
			"ck_tasks_task_type",
			sql`task_type in ('HOURLY', 'DAILY', 'MULTI_DAY')`,
		),
		check(
			"ck_tasks_priority",
			sql`priority in ('LOW', 'MEDIUM', 'HIGH', 'URGENT')`,
		),
		check("ck_tasks_progress", sql`progress_percentage between 0 and 100`),
		index("idx_tasks_project").on(table.projectId),
		index("idx_tasks_state").on(table.state),
		index("idx_tasks_assigned").on(table.assignedTo),
		index("idx_tasks_created_by").on(table.createdBy),
		index("idx_tasks_department").on(table.departmentId),
		index("idx_tasks_end_date").on(table.endDate),
	],
);

export const taskStateTransitions = pgTable(
	"task_state_transitions",
	{
		id: text("id").primaryKey(),
		taskId: text("task_id")
			.notNull()
			.references(() => tasks.id, { onDelete: "cascade" }),
		fromState: text("from_state"),
		toState: text("to_state").notNull(),
		actorId: text("actor_id").references(() => user.id, {
			onDelete: "set null",
		}),
		reason: text("reason"),
		createdAt: createdAt(),
	},
	(table) => [
		check(
			"ck_task_transitions_to",
			sql`to_state in ('REQ', 'ACT', 'PEN', 'APP', 'REJ', 'CAN', 'OVERDUE')`,
		),
		check(
			"ck_task_transitions_from",
			sql`from_state is null or from_state in ('REQ', 'ACT', 'PEN', 'APP', 'REJ', 'CAN', 'OVERDUE')`,
		),
		index("idx_task_transitions_task").on(table.taskId),
		index("idx_task_transitions_state").on(table.toState),
	],
);

export const taskProgressLogs = pgTable(
	"task_progress_logs",
	{
		id: text("id").primaryKey(),
		taskId: text("task_id")
			.notNull()
			.references(() => tasks.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		previousPercentage: integer("previous_percentage").default(0).notNull(),
		newPercentage: integer("new_percentage").notNull(),
		logComment: text("log_comment"),
		isVerifiedByManager: boolean("is_verified_by_manager")
			.default(false)
			.notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		check(
			"ck_task_progress_range",
			sql`previous_percentage between 0 and 100 and new_percentage between 0 and 100`,
		),
		index("idx_task_progress_task").on(table.taskId),
		index("idx_task_progress_user").on(table.userId),
	],
);

export const taskRequests = pgTable(
	"task_requests",
	{
		id: text("id").primaryKey(),
		taskId: text("task_id")
			.notNull()
			.references(() => tasks.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		requestType: text("request_type").notNull(),
		requestedDeadline: timestampMs("requested_deadline"),
		reason: text("reason").notNull(),
		status: text("status").default("PENDING").notNull(),
		reviewedBy: text("reviewed_by").references(() => user.id, {
			onDelete: "set null",
		}),
		reviewComment: text("review_comment"),
		reviewedAt: timestampMs("reviewed_at"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"ck_task_requests_type",
			sql`request_type in ('EXTENSION', 'LATE_EXPLANATION')`,
		),
		check(
			"ck_task_requests_status",
			sql`status in ('PENDING', 'APPROVED', 'REJECTED')`,
		),
		index("idx_task_requests_task").on(table.taskId),
		index("idx_task_requests_status").on(table.status),
	],
);

/**
 * A completion request — one work stage submitted for approval.
 *
 * The journey list is the progress ledger: `APP` `MILESTONE` entries decide a
 * multi-day ticket's derived progress, and a `FULL_JOB` entry carries the
 * ticket's own terminal decision. `state` reuses the ticket codes, so `PEN`
 * means "awaiting review", `APP` "approved" and `REJ` "sent back".
 */
export const taskCompletionRequests = pgTable(
	"task_completion_requests",
	{
		id: text("id").primaryKey(),
		taskId: text("task_id")
			.notNull()
			.references(() => tasks.id, { onDelete: "cascade" }),
		requestedBy: text("requested_by")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		scope: text("scope").notNull(),
		title: text("title").notNull(),
		description: text("description"),
		/** The assignee's optional estimate at request time (0–100). */
		declaredProgress: integer("declared_progress"),
		/** `MULTI_DAY` only: the stage count this request plans for. */
		plannedStageCount: integer("planned_stage_count"),
		/** `PEN`, `APP` or `REJ` — the ticket codes. */
		state: text("state").default("PEN").notNull(),
		decidedBy: text("decided_by").references(() => user.id, {
			onDelete: "set null",
		}),
		decidedAt: timestampMs("decided_at"),
		/** Mandatory on `REJ`: what has to change. */
		decisionReason: text("decision_reason"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check("ck_task_completion_scope", sql`scope in ('MILESTONE', 'FULL_JOB')`),
		check("ck_task_completion_state", sql`state in ('PEN', 'APP', 'REJ')`),
		check(
			"ck_task_completion_progress",
			sql`declared_progress is null or declared_progress between 0 and 100`,
		),
		check(
			"ck_task_completion_stages",
			sql`planned_stage_count is null or planned_stage_count > 0`,
		),
		index("idx_task_completion_task").on(table.taskId),
		index("idx_task_completion_state").on(table.state),
		// A reopened ticket keeps its earlier decisions: only one entry may be
		// PEN, so a second submission is refused even under a race.
		uniqueIndex("uq_task_completion_pending")
			.on(table.taskId)
			.where(sql`state = 'PEN'`),
	],
);

export const attachments = pgTable(
	"attachments",
	{
		id: text("id").primaryKey(),
		ownerType: text("owner_type").notNull(),
		ownerId: text("owner_id").notNull(),
		url: text("url").notNull(),
		fileName: text("file_name"),
		mimeType: text("mime_type"),
		sizeBytes: integer("size_bytes"),
		uploadedBy: text("uploaded_by").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: createdAt(),
	},
	(table) => [
		index("idx_attachments_owner").on(table.ownerType, table.ownerId),
	],
);

/* ------------------------------------------------------------------ */
/* Planning, attendance & leave funds                                  */
/* ------------------------------------------------------------------ */

export const leaveRequests = pgTable(
	"leave_requests",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		leaveCode: text("leave_code").notNull(),
		/** `YYYY-MM-DD`. */
		startDate: text("start_date").notNull(),
		/** `YYYY-MM-DD`. */
		endDate: text("end_date").notNull(),
		totalDays: doublePrecision("total_days").notNull(),
		reason: text("reason").notNull(),
		handoverUserId: text("handover_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		status: text("status").default("PENDING").notNull(),
		approvedBy: text("approved_by").references(() => user.id, {
			onDelete: "set null",
		}),
		approvedAt: timestampMs("approved_at"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"ck_leave_requests_code",
			sql`leave_code in ('AL', 'UAL', 'SL', 'USL', 'PL', 'ML', 'CL', 'EL', 'LWP', 'TOIL', 'VTO')`,
		),
		check(
			"ck_leave_requests_status",
			sql`status in ('PENDING', 'APPROVED', 'REJECTED')`,
		),
		check("ck_leave_requests_days", sql`total_days >= 0`),
		check("ck_leave_requests_dates", sql`end_date >= start_date`),
		index("idx_leave_requests_user").on(table.userId),
		index("idx_leave_requests_status").on(table.status),
		index("idx_leave_requests_code").on(table.leaveCode),
	],
);

export const attendanceRecords = pgTable(
	"attendance_records",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		/** `YYYY-MM-DD`. */
		workDate: text("work_date").notNull(),
		checkIn: timestampMs("check_in"),
		checkOut: timestampMs("check_out"),
		isLate: boolean("is_late").default(false).notNull(),
		isEarlyLeave: boolean("is_early_leave").default(false).notNull(),
		leaveCode: text("leave_code"),
		workingHours: doublePrecision("working_hours").default(0).notNull(),
		note: text("note"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"ck_attendance_leave_code",
			sql`leave_code is null or leave_code in ('AL', 'UAL', 'SL', 'USL', 'PL', 'ML', 'CL', 'EL', 'LWP', 'TOIL', 'VTO')`,
		),
		check("ck_attendance_hours", sql`working_hours >= 0`),
		uniqueIndex("uq_attendance_user_date").on(table.userId, table.workDate),
		index("idx_attendance_leave_code").on(table.leaveCode),
	],
);

export const leaveBalanceEntries = pgTable(
	"leave_balance_entries",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		leaveCode: text("leave_code").notNull(),
		entryType: text("entry_type").notNull(),
		deltaDays: doublePrecision("delta_days").notNull(),
		periodYear: integer("period_year").notNull(),
		referenceType: text("reference_type"),
		referenceId: text("reference_id"),
		note: text("note"),
		createdBy: text("created_by").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: createdAt(),
	},
	(table) => [
		check(
			"ck_leave_balance_code",
			sql`leave_code in ('AL', 'UAL', 'SL', 'USL', 'PL', 'ML', 'CL', 'EL', 'LWP', 'TOIL', 'VTO')`,
		),
		check(
			"ck_leave_balance_entry_type",
			sql`entry_type in ('ACCRUAL', 'USAGE', 'ADJUSTMENT', 'EXPIRY', 'CARRY_OVER')`,
		),
		index("idx_leave_balance_user").on(table.userId),
		index("idx_leave_balance_code").on(table.leaveCode),
		index("idx_leave_balance_period").on(table.periodYear),
	],
);

export const overtimeRecords = pgTable(
	"overtime_records",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		/** `YYYY-MM-DD`. */
		workDate: text("work_date").notNull(),
		hours: doublePrecision("hours").notNull(),
		isApproved: boolean("is_approved").default(false).notNull(),
		approvedBy: text("approved_by").references(() => user.id, {
			onDelete: "set null",
		}),
		approvedAt: timestampMs("approved_at"),
		note: text("note"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check("ck_overtime_hours", sql`hours > 0`),
		index("idx_overtime_user_date").on(table.userId, table.workDate),
	],
);

/* ------------------------------------------------------------------ */
/* Performance & KPI                                                   */
/* ------------------------------------------------------------------ */

export const kpiPointRules = pgTable("kpi_point_rules", {
	code: text("code").primaryKey(),
	event: text("event").notNull(),
	points: integer("points").notNull(),
	description: text("description"),
	isActive: boolean("is_active").default(true).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

export const kpiScoreEvents = pgTable(
	"kpi_score_events",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		taskId: text("task_id").references(() => tasks.id, {
			onDelete: "set null",
		}),
		ruleCode: text("rule_code")
			.notNull()
			.references(() => kpiPointRules.code, { onDelete: "restrict" }),
		points: integer("points").notNull(),
		periodYear: integer("period_year").notNull(),
		periodMonth: integer("period_month").notNull(),
		occurredAt: timestampMs("occurred_at").defaultNow().notNull(),
		note: text("note"),
	},
	(table) => [
		check("ck_kpi_events_period_month", sql`period_month between 1 and 12`),
		index("idx_kpi_events_user_period").on(
			table.userId,
			table.periodYear,
			table.periodMonth,
		),
		index("idx_kpi_events_rule").on(table.ruleCode),
	],
);

export const kpiMonthlySummaries = pgTable(
	"kpi_monthly_summaries",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		periodYear: integer("period_year").notNull(),
		periodMonth: integer("period_month").notNull(),
		totalTasksAssigned: integer("total_tasks_assigned").default(0).notNull(),
		completedOnTime: integer("completed_on_time").default(0).notNull(),
		completedUrgentOnTime: integer("completed_urgent_on_time")
			.default(0)
			.notNull(),
		approvedFirstTime: integer("approved_first_time").default(0).notNull(),
		overdueTasks: integer("overdue_tasks").default(0).notNull(),
		rejectedTasks: integer("rejected_tasks").default(0).notNull(),
		extensionRequestsCount: integer("extension_requests_count")
			.default(0)
			.notNull(),
		attendanceRate: doublePrecision("attendance_rate").default(100).notNull(),
		perfectAttendanceBonus: integer("perfect_attendance_bonus")
			.default(0)
			.notNull(),
		unapprovedLeaveCount: integer("unapproved_leave_count")
			.default(0)
			.notNull(),
		lateEarlyCount: integer("late_early_count").default(0).notNull(),
		totalKpiScore: integer("total_kpi_score").default(0).notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check("ck_kpi_summary_month", sql`period_month between 1 and 12`),
		uniqueIndex("uq_kpi_summary_user_period").on(
			table.userId,
			table.periodYear,
			table.periodMonth,
		),
		index("idx_kpi_summary_period").on(table.periodYear, table.periodMonth),
	],
);

/* ------------------------------------------------------------------ */
/* Platform settings, notifications, exports                           */
/* ------------------------------------------------------------------ */

export const appSettings = pgTable(
	"app_settings",
	{
		id: text("id").primaryKey(),
		moduleCode: text("module_code").notNull(),
		key: text("key").notNull(),
		value: text("value"),
		isSecret: boolean("is_secret").default(false).notNull(),
		description: text("description"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"ck_app_settings_module",
			sql`module_code in ('jobs', 'planning', 'performance', 'settings', 'audit-log', 'shoptify')`,
		),
		uniqueIndex("uq_app_settings_module_key").on(table.moduleCode, table.key),
		index("idx_app_settings_module").on(table.moduleCode),
	],
);

export const telegramWebhookConfig = pgTable("telegram_webhook_config", {
	id: text("id").primaryKey(),
	botToken: text("bot_token"),
	alertGroupChatId: text("alert_group_chat_id"),
	webhookUrl: text("webhook_url"),
	isEnabled: boolean("is_enabled").default(false).notNull(),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

export const notifications = pgTable(
	"notifications",
	{
		id: text("id").primaryKey(),
		channel: text("channel").default("TELEGRAM").notNull(),
		template: text("template"),
		recipient: text("recipient"),
		payload: text("payload"),
		status: text("status").default("PENDING").notNull(),
		attempts: integer("attempts").default(0).notNull(),
		relatedType: text("related_type"),
		relatedId: text("related_id"),
		errorMessage: text("error_message"),
		sentAt: timestampMs("sent_at"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"ck_notifications_status",
			sql`status in ('PENDING', 'SENT', 'FAILED')`,
		),
		index("idx_notifications_status").on(table.status),
		index("idx_notifications_related").on(table.relatedType, table.relatedId),
		index("idx_notifications_created").on(table.createdAt),
	],
);

export const exportArtifacts = pgTable(
	"export_artifacts",
	{
		id: text("id").primaryKey(),
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
		fileName: text("file_name").notNull(),
		mimeType: text("mime_type").notNull(),
		format: text("format").notNull(),
		storagePath: text("storage_path").notNull(),
		byteSize: integer("byte_size").default(0).notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		check("ck_export_artifacts_format", sql`format in ('PDF', 'XLSX', 'CSV')`),
		index("idx_export_artifacts_user").on(table.userId),
	],
);

/* ------------------------------------------------------------------ */
/* Inbound Telegram bot (openspec/changes/add-telegram-bot)            */
/* ------------------------------------------------------------------ */

/**
 * Singleton website-level bot configuration.
 *
 * Website values override the environment bootstrap (see
 * `backend/src/telegram/settings.ts` for the precedence ladder); the old
 * `telegram_webhook_config.bot_token` remains the fallback token source for
 * deployments that already configured the outbound webhook.
 */
export const telegramBotSettings = pgTable("telegram_bot_settings", {
	id: text("id").primaryKey(),
	botToken: text("bot_token"),
	isEnabled: boolean("is_enabled").default(false).notNull(),
	aiBaseUrl: text("ai_base_url"),
	aiApiKey: text("ai_api_key"),
	aiDefaultModel: text("ai_default_model"),
	pushAlertsEnabled: boolean("push_alerts_enabled").default(false).notNull(),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

/**
 * The bot session: one Telegram identity linked to one MES user.
 *
 * The link *is* the authenticated session on this surface — revocable by
 * flipping `is_active`, and automatically dead when the MES account is
 * deactivated or deleted (the viewer lookup rejects inactive accounts, so a
 * revoked or deactivated user behaves exactly like an unlinked identity).
 */
export const telegramLinks = pgTable(
	"telegram_links",
	{
		id: text("id").primaryKey(),
		telegramUserId: text("telegram_user_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		telegramChatId: text("telegram_chat_id").notNull(),
		telegramUsername: text("telegram_username"),
		isActive: boolean("is_active").default(true).notNull(),
		lastSeenAt: timestampMs("last_seen_at"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex("uq_telegram_links_telegram_user").on(table.telegramUserId),
		index("idx_telegram_links_user").on(table.userId),
	],
);

/**
 * Single-use website-generated link codes.
 *
 * Only the code's hash is stored — a leaked table must not be enough to take
 * over a link. Expiry and consumption are enforced on lookup, not by a sweep.
 */
export const telegramLinkCodes = pgTable(
	"telegram_link_codes",
	{
		codeHash: text("code_hash").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		expiresAt: timestampMs("expires_at").notNull(),
		consumedAt: timestampMs("consumed_at"),
		createdAt: createdAt(),
	},
	(table) => [
		index("idx_telegram_link_codes_user").on(table.userId),
		index("idx_telegram_link_codes_expiry").on(table.expiresAt),
	],
);

/**
 * Cached model catalog from the configured OpenAI-compatible endpoint.
 *
 * A failed refresh keeps the previous rows: a temporarily unreachable
 * endpoint must not leave users without a model list.
 */
export const telegramAiModels = pgTable(
	"telegram_ai_models",
	{
		modelId: text("model_id").primaryKey(),
		displayName: text("display_name"),
		fetchedAt: timestampMs("fetched_at").notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [index("idx_telegram_ai_models_fetched").on(table.fetchedAt)],
);

/**
 * Per-user AI query budget usage.
 *
 * One row per viewer: the window start of the current rolling 30-day window
 * and the count used inside it. Persisted so the budget survives restarts and
 * across processes; an in-memory counter would reset on every deploy.
 */
export const telegramAiUsage = pgTable("telegram_ai_usage", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	windowStart: timestampMs("window_start").notNull(),
	queryCount: integer("query_count").default(0).notNull(),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

/** Per-user preference overrides for the bot (currently the AI model). */
export const telegramUserPrefs = pgTable("telegram_user_prefs", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	selectedModel: text("selected_model"),
	updatedAt: updatedAt(),
});

/**
 * One of a viewer's own Telegram accounts, linked through the browser MTProto
 * module (`telegram_accounts`, distinct from the bot's `telegram_links`).
 *
 * The embedded Telegram Web client's session blob (its `account<N>`
 * localStorage JSON — per-DC auth keys and server salts) is a bearer
 * credential for the Telegram account, so it is stored only as AES-256-GCM
 * ciphertext with its IV and auth tag, decryptable solely by the server-side
 * key. `phone_number` holds the masked form (`+84••••••42`).
 *
 * `web_slot` is the stable slot the embedded client keeps the account under
 * (its `?account=N` scheme). The backend assigns it once at link time — a
 * random integer above the client's default slot 1, unique across all
 * viewers — because the client's storage is per-origin: two viewers sharing
 * one browser must never claim the same slot. It is nullable so rows linked
 * before the column existed keep their shape; those rows have no session
 * material either (migration `0002` cleared the GramJS-era sessions) and
 * surface as disconnected until re-linked.
 */
export const telegramAccounts = pgTable(
	"telegram_accounts",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		telegramUserId: text("telegram_user_id").notNull(),
		phoneNumber: text("phone_number"),
		username: text("username"),
		firstName: text("first_name").notNull(),
		lastName: text("last_name"),
		avatarUrl: text("avatar_url"),
		encryptedSession: text("encrypted_session"),
		sessionIv: text("session_iv"),
		sessionAuthTag: text("session_auth_tag"),
		deviceFingerprint: text("device_fingerprint"),
		webSlot: integer("web_slot"),
		isActive: boolean("is_active").default(true).notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex("uq_telegram_accounts_user_tg").on(
			table.userId,
			table.telegramUserId,
		),
		uniqueIndex("uq_telegram_accounts_web_slot").on(table.webSlot),
		index("idx_telegram_accounts_user").on(table.userId),
	],
);

/* Shopify commerce module (`shoptify` app)                            */
/* ------------------------------------------------------------------ */

/**
 * Shopify session storage — the backing table for
 * `DrizzleSessionStoragePostgres` (`@shopify/shopify-app-session-storage-drizzle`).
 * Column names follow the adapter's contract exactly (it reads the table's
 * property names); `expires`/`refreshTokenExpires` are timestamps because
 * the adapter serializes Dates itself.
 */
export const shoptifySessions = pgTable(
	"shoptify_sessions",
	{
		id: text("id").primaryKey(),
		shop: text("shop").notNull(),
		state: text("state").notNull(),
		isOnline: boolean("is_online").default(false).notNull(),
		scope: text("scope"),
		expires: timestampMs("expires"),
		accessToken: text("access_token").notNull(),
		userId: bigint("user_id", { mode: "number" }),
		firstName: text("first_name"),
		lastName: text("last_name"),
		email: text("email"),
		accountOwner: boolean("account_owner"),
		locale: text("locale"),
		collaborator: boolean("collaborator"),
		emailVerified: boolean("email_verified"),
		refreshToken: text("refresh_token"),
		refreshTokenExpires: timestampMs("refresh_token_expires"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex("uq_shoptify_sessions_shop_state").on(table.shop, table.state),
		index("idx_shoptify_sessions_shop").on(table.shop),
	],
);

/** A connected Shopify store. `accessToken` is AES-256-GCM encrypted at rest. */
export const shoptifyStores = pgTable("shoptify_stores", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	shopDomain: text("shop_domain").notNull().unique(),
	accessToken: text("access_token").notNull(),
	webhookSecret: text("webhook_secret"),
	/** Webhook topics registered for this store, as a JSON array in text. */
	scopes: text("scopes"),
	currency: text("currency").default("USD").notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	lastSyncAt: timestampMs("last_sync_at"),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

/** A synced Shopify order. Totals are integer minor units in `currency`. */
export const shoptifyOrders = pgTable(
	"shoptify_orders",
	{
		id: text("id").primaryKey(),
		storeId: text("store_id")
			.notNull()
			.references(() => shoptifyStores.id, { onDelete: "cascade" }),
		shopifyOrderId: text("shopify_order_id").notNull(),
		orderNumber: text("order_number"),
		customerEmail: text("customer_email"),
		customerPhone: text("customer_phone"),
		/** JSON object (shipping address) serialized into text. */
		shippingAddress: text("shipping_address"),
		financialStatus: text("financial_status"),
		fulfillmentStatus: text("fulfillment_status"),
		totalPrice: integer("total_price").notNull(),
		currency: text("currency").default("USD").notNull(),
		tags: text("tags"),
		note: text("note"),
		hasException: boolean("has_exception").default(false).notNull(),
		exceptionReason: text("exception_reason"),
		shopifyCreatedAt: timestampMs("shopify_created_at"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"ck_shoptify_orders_exception_reason",
			sql`exception_reason is null or exception_reason in ('ADDRESS_INVALID', 'PAYMENT_HELD', 'OUT_OF_STOCK', 'FRAUD_RISK', 'CUSTOMER_EDIT', 'OTHER')`,
		),
		uniqueIndex("uq_shoptify_orders_store_shopify").on(
			table.storeId,
			table.shopifyOrderId,
		),
		index("idx_shoptify_orders_store").on(table.storeId),
		index("idx_shoptify_orders_status").on(
			table.storeId,
			table.fulfillmentStatus,
		),
		index("idx_shoptify_orders_exception").on(table.hasException),
	],
);

/** A fulfillment created for an order, with tracking details. */
export const shoptifyFulfillments = pgTable(
	"shoptify_fulfillments",
	{
		id: text("id").primaryKey(),
		orderId: text("order_id")
			.notNull()
			.references(() => shoptifyOrders.id, { onDelete: "cascade" }),
		shopifyFulfillmentId: text("shopify_fulfillment_id"),
		trackingCompany: text("tracking_company"),
		trackingNumber: text("tracking_number"),
		trackingUrl: text("tracking_url"),
		shipmentStatus: text("shipment_status"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex("uq_shoptify_fulfillments_shopify").on(
			table.orderId,
			table.shopifyFulfillmentId,
		),
	],
);

/** A refund received from a store's refund webhooks. Amount is minor units. */
export const shoptifyRefunds = pgTable(
	"shoptify_refunds",
	{
		id: text("id").primaryKey(),
		orderId: text("order_id")
			.notNull()
			.references(() => shoptifyOrders.id, { onDelete: "cascade" }),
		shopifyRefundId: text("shopify_refund_id").notNull(),
		amount: integer("amount").notNull(),
		currency: text("currency").default("USD").notNull(),
		reason: text("reason"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex("uq_shoptify_refunds_order_shopify").on(
			table.orderId,
			table.shopifyRefundId,
		),
	],
);

/** A synced Shopify product. */
export const shoptifyProducts = pgTable(
	"shoptify_products",
	{
		id: text("id").primaryKey(),
		storeId: text("store_id")
			.notNull()
			.references(() => shoptifyStores.id, { onDelete: "cascade" }),
		shopifyProductId: text("shopify_product_id").notNull(),
		title: text("title").notNull(),
		status: text("status"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex("uq_shoptify_products_store_shopify").on(
			table.storeId,
			table.shopifyProductId,
		),
	],
);

/**
 * A synced product variant. `masterSku` maps the variant to its counterparts
 * in other stores for cross-store inventory synchronization; `costOfGoods`
 * feeds net-profit calculation. Prices are integer minor units.
 */
export const shoptifyVariants = pgTable(
	"shoptify_variants",
	{
		id: text("id").primaryKey(),
		productId: text("product_id")
			.notNull()
			.references(() => shoptifyProducts.id, { onDelete: "cascade" }),
		storeId: text("store_id")
			.notNull()
			.references(() => shoptifyStores.id, { onDelete: "cascade" }),
		shopifyVariantId: text("shopify_variant_id").notNull(),
		sku: text("sku"),
		masterSku: text("master_sku"),
		price: integer("price"),
		costOfGoods: integer("cost_of_goods"),
		availableQuantity: integer("available_quantity").default(0).notNull(),
		minStockLevel: integer("min_stock_level"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex("uq_shoptify_variants_store_shopify").on(
			table.storeId,
			table.shopifyVariantId,
		),
		index("idx_shoptify_variants_master_sku").on(table.masterSku),
		index("idx_shoptify_variants_product").on(table.productId),
	],
);

/** A customer aggregated across stores, keyed by contact identifiers. */
export const shoptifyCustomers = pgTable(
	"shoptify_customers",
	{
		id: text("id").primaryKey(),
		email: text("email"),
		phone: text("phone"),
		totalOrdersCount: integer("total_orders_count").default(0).notNull(),
		totalSpent: integer("total_spent").default(0).notNull(),
		isBlacklisted: boolean("is_blacklisted").default(false).notNull(),
		isHighRisk: boolean("is_high_risk").default(false).notNull(),
		notes: text("notes"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"ck_shoptify_customers_contact",
			sql`email is not null or phone is not null`,
		),
		index("idx_shoptify_customers_email").on(table.email),
		index("idx_shoptify_customers_blacklist").on(table.isBlacklisted),
	],
);

/** A Shopify Payments payout for a store. Amount is minor units. */
export const shoptifyPayouts = pgTable(
	"shoptify_payouts",
	{
		id: text("id").primaryKey(),
		storeId: text("store_id")
			.notNull()
			.references(() => shoptifyStores.id, { onDelete: "cascade" }),
		shopifyPayoutId: text("shopify_payout_id").notNull(),
		amount: integer("amount").notNull(),
		currency: text("currency").default("USD").notNull(),
		status: text("status").default("SCHEDULED").notNull(),
		payoutDate: timestampMs("payout_date"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"ck_shoptify_payouts_status",
			sql`status in ('SCHEDULED', 'IN_TRANSIT', 'PAID', 'FAILED')`,
		),
		uniqueIndex("uq_shoptify_payouts_store_shopify").on(
			table.storeId,
			table.shopifyPayoutId,
		),
		index("idx_shoptify_payouts_status").on(table.storeId, table.status),
	],
);

/**
 * Per-order net-profit inputs, all minor units. Net profit is
 * `revenue - cogs - shipping - gatewayFee - adSpend`.
 */
export const shoptifyOrderExpenses = pgTable(
	"shoptify_order_expenses",
	{
		id: text("id").primaryKey(),
		orderId: text("order_id")
			.notNull()
			.references(() => shoptifyOrders.id, { onDelete: "cascade" }),
		revenue: integer("revenue").notNull(),
		cogs: integer("cogs").default(0).notNull(),
		shipping: integer("shipping").default(0).notNull(),
		gatewayFee: integer("gateway_fee").default(0).notNull(),
		adSpend: integer("ad_spend").default(0).notNull(),
		netProfit: integer("net_profit").notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex("uq_shoptify_order_expenses_order").on(table.orderId),
	],
);

/** An if-condition-then-action automation rule; `storeId` null = global. */
export const shoptifyAutomationRules = pgTable(
	"shoptify_automation_rules",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		storeId: text("store_id").references(() => shoptifyStores.id, {
			onDelete: "cascade",
		}),
		triggerEvent: text("trigger_event").notNull(),
		/** JSON predicate list on the event row, serialized into text. */
		conditions: text("conditions"),
		/** JSON action list; v1 supports local writes + notifications. */
		actions: text("actions"),
		isActive: boolean("is_active").default(true).notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"ck_shoptify_rules_trigger",
			sql`trigger_event in ('ORDER_CREATED', 'ORDER_UPDATED', 'ORDER_EXCEPTION', 'STOCK_LOW', 'REFUND_CREATED', 'PAYOUT_FAILED')`,
		),
		index("idx_shoptify_rules_trigger").on(table.triggerEvent, table.isActive),
	],
);

/**
 * Execution log for automation rules — the idempotency guard: a rule acts at
 * most once per `eventKey` (e.g. `ORDER_CREATED:<shopifyOrderId>`).
 */
export const shoptifyAutomationLog = pgTable(
	"shoptify_automation_log",
	{
		id: text("id").primaryKey(),
		ruleId: text("rule_id")
			.notNull()
			.references(() => shoptifyAutomationRules.id, { onDelete: "cascade" }),
		eventKey: text("event_key").notNull(),
		targetType: text("target_type"),
		targetId: text("target_id"),
		/** JSON per-action outcome, serialized into text. */
		actionResults: text("action_results"),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("uq_shoptify_automation_log_event").on(
			table.ruleId,
			table.eventKey,
		),
	],
);

/* ------------------------------------------------------------------ */
export type ShoptifySessionRow = typeof shoptifySessions.$inferSelect;
export type ShoptifyStoreRow = typeof shoptifyStores.$inferSelect;
export type ShoptifyOrderRow = typeof shoptifyOrders.$inferSelect;
export type ShoptifyFulfillmentRow = typeof shoptifyFulfillments.$inferSelect;
export type ShoptifyRefundRow = typeof shoptifyRefunds.$inferSelect;
export type ShoptifyProductRow = typeof shoptifyProducts.$inferSelect;
export type ShoptifyVariantRow = typeof shoptifyVariants.$inferSelect;
export type ShoptifyCustomerRow = typeof shoptifyCustomers.$inferSelect;
export type ShoptifyPayoutRow = typeof shoptifyPayouts.$inferSelect;
export type ShoptifyOrderExpenseRow = typeof shoptifyOrderExpenses.$inferSelect;
export type ShoptifyAutomationRuleRow =
	typeof shoptifyAutomationRules.$inferSelect;
export type ShoptifyAutomationLogRow =
	typeof shoptifyAutomationLog.$inferSelect;

/* ------------------------------------------------------------------ */
/* Inferred row types                                                  */
/* ------------------------------------------------------------------ */

export type UserRow = typeof user.$inferSelect;
export type NewUserRow = typeof user.$inferInsert;
export type SessionRow = typeof session.$inferSelect;
export type DepartmentRow = typeof departments.$inferSelect;
export type RoleRow = typeof roles.$inferSelect;
export type PermissionRow = typeof permissions.$inferSelect;
export type SystemAuditLogRow = typeof systemAuditLogs.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
export type TaskStateTransitionRow = typeof taskStateTransitions.$inferSelect;
export type TaskProgressLogRow = typeof taskProgressLogs.$inferSelect;
export type TaskRequestRow = typeof taskRequests.$inferSelect;
export type TaskCompletionRequestRow =
	typeof taskCompletionRequests.$inferSelect;
export type AttachmentRow = typeof attachments.$inferSelect;
export type LeaveRequestRow = typeof leaveRequests.$inferSelect;
export type AttendanceRecordRow = typeof attendanceRecords.$inferSelect;
export type LeaveBalanceEntryRow = typeof leaveBalanceEntries.$inferSelect;
export type OvertimeRecordRow = typeof overtimeRecords.$inferSelect;
export type KpiPointRuleRow = typeof kpiPointRules.$inferSelect;
export type KpiScoreEventRow = typeof kpiScoreEvents.$inferSelect;
export type KpiMonthlySummaryRow = typeof kpiMonthlySummaries.$inferSelect;
export type AppSettingRow = typeof appSettings.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type ExportArtifactRow = typeof exportArtifacts.$inferSelect;
export type TelegramWebhookConfigRow =
	typeof telegramWebhookConfig.$inferSelect;
export type TelegramBotSettingsRow = typeof telegramBotSettings.$inferSelect;
export type TelegramLinkRow = typeof telegramLinks.$inferSelect;
export type TelegramLinkCodeRow = typeof telegramLinkCodes.$inferSelect;
export type TelegramAiModelRow = typeof telegramAiModels.$inferSelect;
export type TelegramUserPrefRow = typeof telegramUserPrefs.$inferSelect;
export type TelegramAiUsageRow = typeof telegramAiUsage.$inferSelect;
export type TelegramAccountRow = typeof telegramAccounts.$inferSelect;
export type NewTelegramAccountRow = typeof telegramAccounts.$inferInsert;
export type TicketStateRow = typeof ticketStates.$inferSelect;
export type LeaveCodeRow = typeof leaveCodes.$inferSelect;
export type ModuleRow = typeof modules.$inferSelect;
