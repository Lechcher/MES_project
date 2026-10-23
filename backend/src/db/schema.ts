/**
 * Drizzle schema for the MES SQLite database.
 *
 * This file is the source of truth for `backend/drizzle/*` migrations. It
 * adapts `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` (PostgreSQL) to SQLite:
 * enum-like codes become constrained text, ids are application-generated UUID
 * strings, timestamps are Unix milliseconds, `DATE` values are `YYYY-MM-DD`
 * text, and JSON is stored as text. Foreign keys, uniqueness, checks and query
 * indexes are preserved.
 *
 * Better Auth owns the `user`, `session`, `account`, and `verification` tables.
 * The MES profile shares the Better Auth user id (one identity, not two), so
 * `user` carries the MES columns (`user_code`, `department_id`, `is_active`).
 */

import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestampMs = (name: string) => integer(name, { mode: "timestamp_ms" });

/** `DEFAULT (unixepoch() * 1000)` — Unix milliseconds. */
const nowMs = sql`(unixepoch() * 1000)`;

const createdAt = () => timestampMs("created_at").default(nowMs).notNull();
const updatedAt = () => timestampMs("updated_at").default(nowMs).notNull();

/* ------------------------------------------------------------------ */
/* Better Auth                                                         */
/* ------------------------------------------------------------------ */

export const user = sqliteTable(
	"user",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		email: text("email").notNull().unique(),
		emailVerified: integer("email_verified", { mode: "boolean" })
			.default(false)
			.notNull(),
		image: text("image"),
		/** MES profile identity, unique across the directory. */
		userCode: text("user_code").notNull().unique(),
		departmentId: text("department_id").references(() => departments.id, {
			onDelete: "set null",
		}),
		isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
		deletedAt: timestampMs("deleted_at"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		index("idx_users_department").on(table.departmentId),
		index("idx_users_active").on(table.isActive),
	],
);

export const session = sqliteTable(
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

export const account = sqliteTable(
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

export const verification = sqliteTable(
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

export const departments = sqliteTable(
	"departments",
	{
		id: text("id").primaryKey(),
		code: text("code").notNull().unique(),
		name: text("name").notNull(),
		departmentType: text("department_type").default("DEPARTMENT").notNull(),
		parentId: text("parent_id"),
		managerId: text("manager_id"),
		autoForkingEnabled: integer("auto_forking_enabled", { mode: "boolean" })
			.default(true)
			.notNull(),
		isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
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

export const roles = sqliteTable(
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

export const permissions = sqliteTable(
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
			sql`module_code in ('jobs', 'planning', 'performance', 'settings', 'audit-log')`,
		),
		index("idx_permissions_module").on(table.moduleCode),
	],
);

export const userRoles = sqliteTable(
	"user_roles",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		roleId: text("role_id")
			.notNull()
			.references(() => roles.id, { onDelete: "cascade" }),
		assignedAt: timestampMs("assigned_at").default(nowMs).notNull(),
	},
	(table) => [
		uniqueIndex("uq_user_roles").on(table.userId, table.roleId),
		index("idx_user_roles_role").on(table.roleId),
	],
);

export const rolePermissions = sqliteTable(
	"role_permissions",
	{
		id: text("id").primaryKey(),
		roleId: text("role_id")
			.notNull()
			.references(() => roles.id, { onDelete: "cascade" }),
		permissionId: text("permission_id")
			.notNull()
			.references(() => permissions.id, { onDelete: "cascade" }),
		grantedAt: timestampMs("granted_at").default(nowMs).notNull(),
	},
	(table) => [
		uniqueIndex("uq_role_permissions").on(table.roleId, table.permissionId),
		index("idx_role_permissions_permission").on(table.permissionId),
	],
);

/* ------------------------------------------------------------------ */
/* Code registries                                                     */
/* ------------------------------------------------------------------ */

export const modules = sqliteTable(
	"modules",
	{
		code: text("code").primaryKey(),
		name: text("name").notNull(),
		description: text("description"),
		isEnabled: integer("is_enabled", { mode: "boolean" })
			.default(true)
			.notNull(),
		sortOrder: integer("sort_order").default(0).notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	() => [
		check(
			"ck_modules_code",
			sql`code in ('jobs', 'planning', 'performance', 'settings', 'audit-log')`,
		),
	],
);

export const ticketStates = sqliteTable(
	"ticket_states",
	{
		code: text("code").primaryKey(),
		name: text("name").notNull(),
		color: text("color").notNull(),
		description: text("description"),
		isTerminal: integer("is_terminal", { mode: "boolean" })
			.default(false)
			.notNull(),
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

export const leaveCodes = sqliteTable(
	"leave_codes",
	{
		code: text("code").primaryKey(),
		name: text("name").notNull(),
		category: text("category").notNull(),
		isPaid: integer("is_paid", { mode: "boolean" }).default(false).notNull(),
		payrollRule: text("payroll_rule").notNull(),
		deductsWage: integer("deducts_wage", { mode: "boolean" })
			.default(false)
			.notNull(),
		isPenalty: integer("is_penalty", { mode: "boolean" })
			.default(false)
			.notNull(),
		isBalanceTracked: integer("is_balance_tracked", { mode: "boolean" })
			.default(false)
			.notNull(),
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

export const systemAuditLogs = sqliteTable(
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
			sql`module_code is null or module_code in ('jobs', 'planning', 'performance', 'settings', 'audit-log')`,
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

export const projects = sqliteTable(
	"projects",
	{
		id: text("id").primaryKey(),
		code: text("code").notNull().unique(),
		name: text("name").notNull(),
		description: text("description"),
		departmentId: text("department_id").references(() => departments.id, {
			onDelete: "set null",
		}),
		isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
		deletedAt: timestampMs("deleted_at"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [index("idx_projects_department").on(table.departmentId)],
);

export const tasks = sqliteTable(
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
		isUrgentHourly: integer("is_urgent_hourly", { mode: "boolean" })
			.default(false)
			.notNull(),
		isExtensionRequested: integer("is_extension_requested", { mode: "boolean" })
			.default(false)
			.notNull(),
		isOverdue: integer("is_overdue", { mode: "boolean" })
			.default(false)
			.notNull(),
		isLateSubmission: integer("is_late_submission", { mode: "boolean" })
			.default(false)
			.notNull(),
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

export const taskStateTransitions = sqliteTable(
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

export const taskProgressLogs = sqliteTable(
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
		isVerifiedByManager: integer("is_verified_by_manager", { mode: "boolean" })
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

export const taskRequests = sqliteTable(
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
export const taskCompletionRequests = sqliteTable(
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

export const attachments = sqliteTable(
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

export const leaveRequests = sqliteTable(
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
		totalDays: real("total_days").notNull(),
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

export const attendanceRecords = sqliteTable(
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
		isLate: integer("is_late", { mode: "boolean" }).default(false).notNull(),
		isEarlyLeave: integer("is_early_leave", { mode: "boolean" })
			.default(false)
			.notNull(),
		leaveCode: text("leave_code"),
		workingHours: real("working_hours").default(0).notNull(),
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

export const leaveBalanceEntries = sqliteTable(
	"leave_balance_entries",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		leaveCode: text("leave_code").notNull(),
		entryType: text("entry_type").notNull(),
		deltaDays: real("delta_days").notNull(),
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

export const overtimeRecords = sqliteTable(
	"overtime_records",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		/** `YYYY-MM-DD`. */
		workDate: text("work_date").notNull(),
		hours: real("hours").notNull(),
		isApproved: integer("is_approved", { mode: "boolean" })
			.default(false)
			.notNull(),
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

export const kpiPointRules = sqliteTable("kpi_point_rules", {
	code: text("code").primaryKey(),
	event: text("event").notNull(),
	points: integer("points").notNull(),
	description: text("description"),
	isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

export const kpiScoreEvents = sqliteTable(
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
		occurredAt: timestampMs("occurred_at").default(nowMs).notNull(),
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

export const kpiMonthlySummaries = sqliteTable(
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
		attendanceRate: real("attendance_rate").default(100).notNull(),
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

export const appSettings = sqliteTable(
	"app_settings",
	{
		id: text("id").primaryKey(),
		moduleCode: text("module_code").notNull(),
		key: text("key").notNull(),
		value: text("value"),
		isSecret: integer("is_secret", { mode: "boolean" })
			.default(false)
			.notNull(),
		description: text("description"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"ck_app_settings_module",
			sql`module_code in ('jobs', 'planning', 'performance', 'settings', 'audit-log')`,
		),
		uniqueIndex("uq_app_settings_module_key").on(table.moduleCode, table.key),
		index("idx_app_settings_module").on(table.moduleCode),
	],
);

export const telegramWebhookConfig = sqliteTable("telegram_webhook_config", {
	id: text("id").primaryKey(),
	botToken: text("bot_token"),
	alertGroupChatId: text("alert_group_chat_id"),
	webhookUrl: text("webhook_url"),
	isEnabled: integer("is_enabled", { mode: "boolean" })
		.default(false)
		.notNull(),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

export const notifications = sqliteTable(
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

export const exportArtifacts = sqliteTable(
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
export type TicketStateRow = typeof ticketStates.$inferSelect;
export type LeaveCodeRow = typeof leaveCodes.$inferSelect;
export type ModuleRow = typeof modules.$inferSelect;
