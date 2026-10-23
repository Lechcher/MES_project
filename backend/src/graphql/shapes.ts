/**
 * Row-to-shape mapping and object-type field resolution.
 *
 * Domain layers return persisted rows. This module maps them onto the contract's
 * shapes, converts SQLite representations to the contract's scalars (Unix
 * milliseconds to `DateTime`, `YYYY-MM-DD` text to `DateTime`, JSON text to
 * `JSON`), and resolves nested relations lazily through the per-request cache.
 */

import { and, asc, eq } from "drizzle-orm";
import { GraphQLScalarType, Kind } from "graphql";
import type {
	AppSettingRow,
	AttendanceRecordRow,
	DepartmentRow,
	ExportArtifactRow,
	KpiMonthlySummaryRow,
	KpiPointRuleRow,
	KpiScoreEventRow,
	LeaveBalanceEntryRow,
	LeaveCodeRow,
	LeaveRequestRow,
	NotificationRow,
	OvertimeRecordRow,
	ProjectRow,
	RoleRow,
	SystemAuditLogRow,
	TaskCompletionRequestRow,
	TaskProgressLogRow,
	TaskRequestRow,
	TaskRow,
	TaskStateTransitionRow,
	TicketStateRow,
	UserRow,
} from "../db/schema";
import {
	appSettings,
	attachments,
	departments,
	exportArtifacts,
	kpiMonthlySummaries,
	kpiPointRules,
	kpiScoreEvents,
	leaveCodes,
	notifications,
	projects,
	roles,
	systemAuditLogs,
	taskCompletionRequests,
	taskProgressLogs,
	taskRequests,
	taskStateTransitions,
	tasks,
	ticketStates,
	user,
} from "../db/schema";
import { cached, type ViewerContext } from "./context";

/* ------------------------------------------------------------------ */
/* Scalars                                                             */
/* ------------------------------------------------------------------ */

export const dateTimeScalar = new GraphQLScalarType({
	name: "DateTime",
	description: "ISO-8601 timestamp (UTC).",
	serialize(value) {
		if (value instanceof Date) return value.toISOString();
		if (typeof value === "string") return value;
		if (typeof value === "number") return new Date(value).toISOString();
		return null;
	},
	parseValue(value) {
		if (value instanceof Date) return value;
		if (typeof value === "string") return new Date(value);
		if (typeof value === "number") return new Date(value);
		throw new TypeError("DateTime must be an ISO-8601 string.");
	},
	parseLiteral(ast) {
		if (ast.kind === Kind.STRING || ast.kind === Kind.INT) {
			return new Date(ast.kind === Kind.INT ? Number(ast.value) : ast.value);
		}
		throw new TypeError("DateTime must be an ISO-8601 string.");
	},
});

export const jsonScalar = new GraphQLScalarType({
	name: "JSON",
	description: "Arbitrary JSON value; stored as text in SQLite.",
	serialize(value) {
		if (typeof value === "string") {
			try {
				return JSON.parse(value);
			} catch {
				return value;
			}
		}
		return value ?? null;
	},
	parseValue(value) {
		return value;
	},
	parseLiteral(ast) {
		switch (ast.kind) {
			case Kind.STRING:
				return ast.value;
			case Kind.INT:
				return Number.parseInt(ast.value, 10);
			case Kind.FLOAT:
				return Number.parseFloat(ast.value);
			case Kind.BOOLEAN:
				return ast.value;
			case Kind.NULL:
				return null;
			default:
				return null;
		}
	},
});

export const decimalScalar = new GraphQLScalarType({
	name: "Decimal",
	description: "Arbitrary-precision decimal, serialized as a number.",
	serialize(value) {
		if (value === null || value === undefined) return null;
		const n = typeof value === "number" ? value : Number(value);
		return Number.isFinite(n) ? n : null;
	},
	parseValue(value) {
		const n = typeof value === "number" ? value : Number(value);
		if (!Number.isFinite(n)) throw new TypeError("Decimal must be numeric.");
		return n;
	},
	parseLiteral(ast) {
		if (ast.kind === Kind.FLOAT || ast.kind === Kind.INT) {
			return Number.parseFloat(ast.value);
		}
		throw new TypeError("Decimal must be numeric.");
	},
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** `YYYY-MM-DD` (and ISO strings) to a UTC `Date`. */
export function parseDate(
	value: string | Date | null | undefined,
): Date | null {
	if (value === null || value === undefined) return null;
	if (value instanceof Date) return value;
	const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
		? `${value}T00:00:00.000Z`
		: value;
	const parsed = new Date(dateOnly);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** `Date`/ISO input to the `YYYY-MM-DD` text SQLite stores. */
export function toDateOnly(value: string | Date): string {
	if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
		return value;
	return new Date(value).toISOString().slice(0, 10);
}

export function pagination(
	offset: number,
	limit: number,
	totalCount: number,
): { offset: number; limit: number; totalCount: number; hasNextPage: boolean } {
	return {
		offset,
		limit,
		totalCount,
		hasNextPage: offset + limit < totalCount,
	};
}

export function parseJsonText(value: string | null): unknown {
	if (value === null) return null;
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

/* ------------------------------------------------------------------ */
/* Relation loaders (memoized per request)                             */
/* ------------------------------------------------------------------ */

export function loadUser(
	ctx: ViewerContext,
	id: string | null,
): Promise<UserRow | null> {
	if (!id) return Promise.resolve(null);
	return cached(ctx, `user:${id}`, async () => {
		const [row] = await ctx.db
			.select()
			.from(user)
			.where(eq(user.id, id))
			.limit(1);
		return row ?? null;
	});
}

export function loadDepartment(
	ctx: ViewerContext,
	id: string | null,
): Promise<DepartmentRow | null> {
	if (!id) return Promise.resolve(null);
	return cached(ctx, `department:${id}`, async () => {
		const [row] = await ctx.db
			.select()
			.from(departments)
			.where(eq(departments.id, id))
			.limit(1);
		return row ?? null;
	});
}

export function loadProject(
	ctx: ViewerContext,
	id: string | null,
): Promise<ProjectRow | null> {
	if (!id) return Promise.resolve(null);
	return cached(ctx, `project:${id}`, async () => {
		const [row] = await ctx.db
			.select()
			.from(projects)
			.where(eq(projects.id, id))
			.limit(1);
		return row ?? null;
	});
}

/* ------------------------------------------------------------------ */
/* Mappers                                                             */
/* ------------------------------------------------------------------ */

export function toUser(row: UserRow) {
	return {
		id: row.id,
		userCode: row.userCode,
		fullName: row.name,
		email: row.email,
		isActive: row.isActive,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		departmentId: row.departmentId ?? null,
	};
}

export function toDepartment(row: DepartmentRow) {
	return {
		id: row.id,
		code: row.code,
		name: row.name,
		departmentType: row.departmentType,
		autoForkingEnabled: row.autoForkingEnabled,
		isActive: row.isActive,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		parentId: row.parentId ?? null,
		managerId: row.managerId ?? null,
	};
}

export function toRole(row: RoleRow) {
	return {
		id: row.id,
		code: row.code,
		name: row.name,
		description: row.description ?? null,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export function toProject(row: ProjectRow) {
	return {
		id: row.id,
		code: row.code,
		name: row.name,
		description: row.description ?? null,
		isActive: row.isActive,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		departmentId: row.departmentId ?? null,
	};
}

/** `ACT` secondary badges, derived from the ticket's flags and requests. */
export function taskBadges(
	row: TaskRow,
	pendingRequestTypes: readonly string[] = [],
): string[] {
	const badges: string[] = [];
	if (row.state !== "ACT") return badges;
	if (row.isUrgentHourly) badges.push("URGENT_PROCESSING");
	if (row.taskType === "MULTI_DAY" && row.progressPercentage > 0) {
		badges.push("PROGRESS_UPDATE");
	}
	if (row.isExtensionRequested || pendingRequestTypes.includes("EXTENSION")) {
		badges.push("AWAITING_EXTENSION_APPROVAL");
	}
	if (row.progressPercentage >= 100)
		badges.push("AWAITING_PROGRESS_VERIFICATION");
	return badges;
}

export function toTask(row: TaskRow) {
	return {
		id: row.id,
		taskCode: row.taskCode,
		title: row.title,
		description: row.description ?? null,
		taskType: row.taskType,
		priority: row.priority,
		state: row.state,
		startDate: row.startDate ?? null,
		endDate: row.endDate ?? null,
		extendedDeadline: row.extendedDeadline ?? null,
		progressPercentage: row.progressPercentage,
		isUrgentHourly: row.isUrgentHourly,
		isExtensionRequested: row.isExtensionRequested,
		isOverdue: row.isOverdue,
		plannedStageCount: row.plannedStageCount ?? null,
		approvedAt: row.approvedAt ?? null,
		reviewedAt: row.reviewedAt ?? null,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		projectId: row.projectId ?? null,
		createdById: row.createdBy ?? null,
		assignedToId: row.assignedTo ?? null,
		departmentId: row.departmentId ?? null,
		approvedById: row.approvedBy ?? null,
		reviewedById: row.reviewedBy ?? null,
	};
}

export function toAttachment(row: typeof attachments.$inferSelect) {
	return {
		id: row.id,
		ownerType: row.ownerType,
		ownerId: row.ownerId,
		url: row.url,
		fileName: row.fileName ?? null,
		mimeType: row.mimeType ?? null,
		sizeBytes: row.sizeBytes ?? null,
		createdAt: row.createdAt,
		uploadedById: row.uploadedBy ?? null,
	};
}

export function toTaskProgressLog(row: TaskProgressLogRow) {
	return {
		id: row.id,
		previousPercentage: row.previousPercentage,
		newPercentage: row.newPercentage,
		logComment: row.logComment ?? null,
		isVerifiedByManager: row.isVerifiedByManager,
		createdAt: row.createdAt,
		taskId: row.taskId,
		userId: row.userId,
	};
}

export function toTaskStateTransition(row: TaskStateTransitionRow) {
	return {
		id: row.id,
		fromState: row.fromState ?? null,
		toState: row.toState,
		reason: row.reason ?? null,
		createdAt: row.createdAt,
		taskId: row.taskId,
		actorId: row.actorId ?? null,
	};
}

export function toTaskRequest(row: TaskRequestRow) {
	return {
		id: row.id,
		requestType: row.requestType,
		requestedDeadline: row.requestedDeadline ?? null,
		reason: row.reason,
		status: row.status,
		reviewComment: row.reviewComment ?? null,
		reviewedAt: row.reviewedAt ?? null,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		taskId: row.taskId,
		userId: row.userId,
		reviewedById: row.reviewedBy ?? null,
	};
}

/**
 * Map a completion request onto the contract's shape.
 *
 * `state` keeps the ticket code it was stored with (`PEN`, `APP`, `REJ`), and
 * `reviewComment`/`reviewedAt` read from the decision columns so the review
 * surface sees the same names it sees on `TaskRequest`.
 */
export function toTaskCompletionRequest(row: TaskCompletionRequestRow) {
	return {
		id: row.id,
		scope: row.scope,
		title: row.title,
		description: row.description ?? null,
		declaredProgress: row.declaredProgress ?? null,
		plannedStageCount: row.plannedStageCount ?? null,
		state: row.state,
		reviewComment: row.decisionReason ?? null,
		reviewedAt: row.decidedAt ?? null,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		taskId: row.taskId,
		userId: row.requestedBy,
		reviewedById: row.decidedBy ?? null,
	};
}

export function toAttendanceRecord(row: AttendanceRecordRow) {
	return {
		id: row.id,
		workDate: row.workDate,
		checkIn: row.checkIn ?? null,
		checkOut: row.checkOut ?? null,
		isLate: row.isLate,
		isEarlyLeave: row.isEarlyLeave,
		leaveCode: row.leaveCode ?? null,
		workingHours: row.workingHours,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		userId: row.userId,
	};
}

export function toLeaveRequest(row: LeaveRequestRow) {
	return {
		id: row.id,
		leaveCode: row.leaveCode,
		startDate: row.startDate,
		endDate: row.endDate,
		totalDays: row.totalDays,
		reason: row.reason,
		status: row.status,
		approvedAt: row.approvedAt ?? null,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		userId: row.userId,
		handoverUserId: row.handoverUserId ?? null,
		approvedById: row.approvedBy ?? null,
	};
}

export function toLeaveBalanceEntry(row: LeaveBalanceEntryRow) {
	return {
		id: row.id,
		leaveCode: row.leaveCode,
		entryType: row.entryType,
		deltaDays: row.deltaDays,
		periodYear: row.periodYear,
		referenceType: row.referenceType ?? null,
		referenceId: row.referenceId ?? null,
		note: row.note ?? null,
		createdAt: row.createdAt,
		userId: row.userId,
		createdById: row.createdBy ?? null,
	};
}

export function toOvertimeRecord(row: OvertimeRecordRow) {
	return {
		id: row.id,
		workDate: row.workDate,
		hours: row.hours,
		isApproved: row.isApproved,
		approvedAt: row.approvedAt ?? null,
		note: row.note ?? null,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		userId: row.userId,
		approvedById: row.approvedBy ?? null,
	};
}

export function toKpiScoreEvent(row: KpiScoreEventRow) {
	return {
		id: row.id,
		ruleCode: row.ruleCode,
		points: row.points,
		periodYear: row.periodYear,
		periodMonth: row.periodMonth,
		occurredAt: row.occurredAt,
		userId: row.userId,
		taskId: row.taskId ?? null,
	};
}

export function toKpiMonthlySummary(row: KpiMonthlySummaryRow) {
	return {
		id: row.id,
		periodMonth: row.periodMonth,
		periodYear: row.periodYear,
		totalTasksAssigned: row.totalTasksAssigned,
		completedOnTime: row.completedOnTime,
		completedUrgentOnTime: row.completedUrgentOnTime,
		approvedFirstTime: row.approvedFirstTime,
		overdueTasks: row.overdueTasks,
		rejectedTasks: row.rejectedTasks,
		extensionRequestsCount: row.extensionRequestsCount,
		attendanceRate: row.attendanceRate,
		perfectAttendanceBonus: row.perfectAttendanceBonus,
		unapprovedLeaveCount: row.unapprovedLeaveCount,
		lateEarlyCount: row.lateEarlyCount,
		totalKpiScore: row.totalKpiScore,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		userId: row.userId,
	};
}

export function toKpiPointRule(row: KpiPointRuleRow) {
	return {
		code: row.code,
		event: row.event,
		points: row.points,
		description: row.description ?? null,
		isActive: row.isActive,
		sortOrder: row.sortOrder,
	};
}

export function toSystemAuditLog(row: SystemAuditLogRow) {
	return {
		id: row.id,
		action: row.action,
		resourceType: row.resourceType,
		resourceId: row.resourceId ?? null,
		oldData: parseJsonText(row.oldData),
		newData: parseJsonText(row.newData),
		ipAddress: row.ipAddress ?? null,
		userAgent: row.userAgent ?? null,
		createdAt: row.createdAt,
		userId: row.userId ?? null,
	};
}

export function toAppSetting(row: AppSettingRow) {
	return {
		id: row.id,
		moduleCode: row.moduleCode,
		key: row.key,
		value: row.isSecret ? null : parseJsonText(row.value),
		isSecret: row.isSecret,
		description: row.description ?? null,
	};
}

export function toNotification(row: NotificationRow) {
	return {
		id: row.id,
		channel: row.channel,
		template: row.template ?? null,
		recipient: row.recipient ?? null,
		payload: parseJsonText(row.payload),
		status: row.status,
		attempts: row.attempts,
		relatedType: row.relatedType ?? null,
		relatedId: row.relatedId ?? null,
		errorMessage: row.errorMessage ?? null,
		sentAt: row.sentAt ?? null,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export function toTicketState(row: TicketStateRow) {
	return {
		code: row.code,
		name: row.name,
		color: row.color,
		description: row.description ?? null,
		isTerminal: row.isTerminal,
		sortOrder: row.sortOrder,
	};
}

export function toLeaveCodeInfo(row: LeaveCodeRow) {
	return {
		code: row.code,
		name: row.name,
		category: row.category,
		isPaid: row.isPaid,
		payrollRule: row.payrollRule,
		deductsWage: row.deductsWage,
		isPenalty: row.isPenalty,
		isBalanceTracked: row.isBalanceTracked,
		sortOrder: row.sortOrder,
	};
}

export function toExportResult(row: ExportArtifactRow) {
	return {
		id: row.id,
		fileName: row.fileName,
		mimeType: row.mimeType,
		format: row.format,
		url: `/api/v1/exports/${row.id}`,
		createdAt: row.createdAt,
	};
}

/* ------------------------------------------------------------------ */
/* Object-type field resolvers (nested relations)                      */
/* ------------------------------------------------------------------ */

type AnyShape = Record<string, unknown>;

export const objectResolvers = {
	Viewer: {
		user: (parent: AnyShape) => parent.user,
		session: (parent: AnyShape) => parent.session,
	},
	User: {
		department: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadDepartment(ctx, parent.departmentId as string | null).then((row) =>
				row ? toDepartment(row) : null,
			),
		roles: async (parent: AnyShape, _a: unknown, ctx: ViewerContext) => {
			const { userRoles } = await import("../db/schema");
			const rows = await ctx.db
				.select({ role: roles })
				.from(userRoles)
				.innerJoin(roles, eq(roles.id, userRoles.roleId))
				.where(eq(userRoles.userId, parent.id as string));
			return rows.map((r) => toRole(r.role));
		},
	},
	Department: {
		parent: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadDepartment(ctx, parent.parentId as string | null).then((row) =>
				row ? toDepartment(row) : null,
			),
		manager: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.managerId as string | null).then((row) =>
				row ? toUser(row) : null,
			),
	},
	Role: {
		permissions: async (parent: AnyShape, _a: unknown, ctx: ViewerContext) => {
			const { permissions, rolePermissions } = await import("../db/schema");
			const rows = await ctx.db
				.select({
					id: permissions.id,
					code: permissions.code,
					moduleCode: permissions.moduleCode,
					description: permissions.description,
				})
				.from(rolePermissions)
				.innerJoin(
					permissions,
					eq(permissions.id, rolePermissions.permissionId),
				)
				.where(eq(rolePermissions.roleId, parent.id as string));
			return rows;
		},
	},
	Project: {
		department: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadDepartment(ctx, parent.departmentId as string | null).then((row) =>
				row ? toDepartment(row) : null,
			),
	},
	Task: {
		project: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadProject(ctx, parent.projectId as string | null).then((row) =>
				row ? toProject(row) : null,
			),
		createdBy: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.createdById as string | null).then((row) =>
				row ? toUser(row) : null,
			),
		assignedTo: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.assignedToId as string | null).then((row) =>
				row ? toUser(row) : null,
			),
		department: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadDepartment(ctx, parent.departmentId as string | null).then((row) =>
				row ? toDepartment(row) : null,
			),
		approvedBy: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.approvedById as string | null).then((row) =>
				row ? toUser(row) : null,
			),
		reviewedBy: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.reviewedById as string | null).then((row) =>
				row ? toUser(row) : null,
			),
		progressLogs: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			ctx.db
				.select()
				.from(taskProgressLogs)
				.where(eq(taskProgressLogs.taskId, parent.id as string))
				.then((rows) => rows.map(toTaskProgressLog)),
		stateTransitions: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			ctx.db
				.select()
				.from(taskStateTransitions)
				.where(eq(taskStateTransitions.taskId, parent.id as string))
				.then((rows) => rows.map(toTaskStateTransition)),
		requests: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			ctx.db
				.select()
				.from(taskRequests)
				.where(eq(taskRequests.taskId, parent.id as string))
				.then((rows) => rows.map(toTaskRequest)),
		// The journey is the ticket's stage ledger, oldest first.
		journey: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			ctx.db
				.select()
				.from(taskCompletionRequests)
				.where(eq(taskCompletionRequests.taskId, parent.id as string))
				.orderBy(asc(taskCompletionRequests.createdAt))
				.then((rows) => rows.map(toTaskCompletionRequest)),
		attachments: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			ctx.db
				.select()
				.from(attachments)
				.where(eq(attachments.ownerId, parent.id as string))
				.then((rows) => rows.map(toAttachment)),
		badges: async (parent: AnyShape, _a: unknown, ctx: ViewerContext) => {
			const [row] = await ctx.db
				.select()
				.from(tasks)
				.where(eq(tasks.id, parent.id as string))
				.limit(1);
			if (!row) return [];
			const pending = await ctx.db
				.select({ requestType: taskRequests.requestType })
				.from(taskRequests)
				.where(eq(taskRequests.taskId, row.id));
			return taskBadges(
				row,
				pending.map((p) => p.requestType),
			);
		},
	},
	TaskStateTransition: {
		task: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			cached(ctx, `taskShape:${parent.taskId as string}`, () =>
				loadTaskShape(ctx, parent.taskId as string),
			),
		actor: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.actorId as string | null).then((row) =>
				row ? toUser(row) : null,
			),
	},
	TaskProgressLog: {
		task: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadTaskShape(ctx, parent.taskId as string),
		user: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.userId as string).then((row) =>
				row ? toUser(row) : (null as never),
			),
	},
	TaskRequest: {
		task: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadTaskShape(ctx, parent.taskId as string),
		user: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.userId as string).then((row) =>
				row ? toUser(row) : (null as never),
			),
		reviewedBy: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.reviewedById as string | null).then((row) =>
				row ? toUser(row) : null,
			),
	},
	TaskCompletionRequest: {
		task: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadTaskShape(ctx, parent.taskId as string),
		user: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.userId as string).then((row) =>
				row ? toUser(row) : (null as never),
			),
		reviewedBy: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.reviewedById as string | null).then((row) =>
				row ? toUser(row) : null,
			),
		// An entry's evidence is the requester's own uploads; the required-fix
		// files an approver attached to a rejection are the decision's.
		attachments: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			ctx.db
				.select()
				.from(attachments)
				.where(
					and(
						eq(attachments.ownerId, parent.id as string),
						eq(attachments.ownerType, "TASK_COMPLETION_REQUEST"),
					),
				)
				.then((rows) => rows.map(toAttachment)),
		decisionAttachments: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			ctx.db
				.select()
				.from(attachments)
				.where(
					and(
						eq(attachments.ownerId, parent.id as string),
						eq(attachments.ownerType, "TASK_COMPLETION_DECISION"),
					),
				)
				.then((rows) => rows.map(toAttachment)),
	},
	Attachment: {
		uploadedBy: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.uploadedById as string | null).then((row) =>
				row ? toUser(row) : null,
			),
	},
	AttendanceRecord: {
		user: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.userId as string).then((row) =>
				row ? toUser(row) : (null as never),
			),
	},
	LeaveRequest: {
		user: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.userId as string).then((row) =>
				row ? toUser(row) : (null as never),
			),
		handoverUser: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.handoverUserId as string | null).then((row) =>
				row ? toUser(row) : null,
			),
		approvedBy: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.approvedById as string | null).then((row) =>
				row ? toUser(row) : null,
			),
		attachments: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			ctx.db
				.select()
				.from(attachments)
				.where(eq(attachments.ownerId, parent.id as string))
				.then((rows) => rows.map(toAttachment)),
	},
	LeaveBalanceEntry: {
		user: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.userId as string).then((row) =>
				row ? toUser(row) : (null as never),
			),
		createdBy: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.createdById as string | null).then((row) =>
				row ? toUser(row) : null,
			),
	},
	LeaveBalance: {
		user: (parent: AnyShape) => parent.user,
	},
	OvertimeRecord: {
		user: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.userId as string).then((row) =>
				row ? toUser(row) : (null as never),
			),
		approvedBy: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.approvedById as string | null).then((row) =>
				row ? toUser(row) : null,
			),
	},
	KpiScoreEvent: {
		user: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.userId as string).then((row) =>
				row ? toUser(row) : (null as never),
			),
		task: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			parent.taskId ? loadTaskShape(ctx, parent.taskId as string) : null,
	},
	KpiMonthlySummary: {
		user: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.userId as string).then((row) =>
				row ? toUser(row) : (null as never),
			),
	},
	SystemAuditLog: {
		user: (parent: AnyShape, _a: unknown, ctx: ViewerContext) =>
			loadUser(ctx, parent.userId as string | null).then((row) =>
				row ? toUser(row) : null,
			),
	},
	TelegramWebhookConfig: {
		botToken: (parent: AnyShape) => parent.botToken,
		alertGroupChatId: (parent: AnyShape) => parent.alertGroupChatId,
		webhookUrl: (parent: AnyShape) => parent.webhookUrl,
		isEnabled: (parent: AnyShape) => parent.isEnabled,
	},
} as const;

/** Load a task as a contract shape, or `null`. */
export async function loadTaskShape(
	ctx: ViewerContext,
	id: string,
): Promise<Record<string, unknown> | null> {
	return cached(ctx, `task:shape:${id}`, async () => {
		const [row] = await ctx.db
			.select()
			.from(tasks)
			.where(eq(tasks.id, id))
			.limit(1);
		return row ? toTask(row) : null;
	});
}

/** Re-export the registry tables used by the shared queries. */
export const registryTables = {
	ticketStates,
	leaveCodes,
	kpiPointRules,
	kpiScoreEvents,
	kpiMonthlySummaries,
	systemAuditLogs,
	notifications,
	appSettings,
	exportArtifacts,
};
