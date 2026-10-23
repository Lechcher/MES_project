/**
 * Jobs domain service.
 *
 * Owns the project and task read surface and the ticket lifecycle documented in
 * `API_CONTACT_SPECIFICATION.md` §6.1: projects, task list/detail reads with
 * role scoping and filters, and the ten Jobs mutations.
 *
 * Every write records an actor-attributed entry in `task_state_transitions`,
 * the required KPI ledger event, and a `system_audit_logs` event. Delivery of
 * Telegram notifications is attempted after the domain change and its outcome is
 * recorded separately (see `./notifications`), so an external outage cannot roll
 * back or falsely report a state change.
 *
 * State machine: `REQ → ACT → PEN → {APP | REJ}`; passing a deadline moves the
 * ticket to `OVERDUE`, which needs an approved late-submission explanation before
 * it can move to `PEN`; `CAN` is reachable at any non-terminal time and requires a
 * non-empty reason. Deadline defaults: HOURLY tasks use the urgent slots
 * 10:30/14:00/16:30, DAILY tasks use 17:00/18:00 the same day, MULTI_DAY tasks
 * track 0→100 with milestones 25/50/75/100.
 */

import type { SQL } from "drizzle-orm";
import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	inArray,
	isNull,
	like,
	lt,
	or,
	sql,
} from "drizzle-orm";
import type {
	CompletionScopeValue,
	KpiRuleCode,
	Priority,
	TaskTypeValue,
	TicketStateCode,
} from "../db/enums";
import type {
	ProjectRow,
	TaskCompletionRequestRow,
	TaskRequestRow,
	TaskRow,
} from "../db/schema";
import {
	attachments,
	departments,
	kpiPointRules,
	kpiScoreEvents,
	projects,
	taskCompletionRequests,
	taskProgressLogs,
	taskRequests,
	taskStateTransitions,
	tasks,
	user,
} from "../db/schema";
import {
	type DataScope,
	scopedDepartmentId,
	scopedUserId,
} from "../graphql/access";
import type { ViewerContext } from "../graphql/context";
import { DomainError } from "../graphql/errors";
import { pagination, parseDate } from "../graphql/shapes";
import { recordAuditEvent } from "./audit";
import { recomputeMonthlySummary } from "./kpi";
import { NOTIFICATION_TEMPLATES, notify } from "./notifications";

const MODULE = "jobs" as const;
const APPROVER_ROLES = ["SUPER_ADMIN", "TECH_LEAD", "HR_MANAGER", "DEPT_HEAD"];
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 200;

/* ------------------------------------------------------------------ */
/* Input types                                                         */
/* ------------------------------------------------------------------ */

export interface ProjectFilterInput {
	departmentId?: string | null;
	isActive?: boolean | null;
	search?: string | null;
}

export type ProjectOrderByValue = "NAME_ASC" | "NAME_DESC" | "CREATED_AT_DESC";

export interface TaskFilterInput {
	projectId?: string | null;
	departmentId?: string | null;
	assignedToId?: string | null;
	state?: TicketStateCode | null;
	taskType?: TaskTypeValue | null;
	priority?: Priority | null;
	isOverdue?: boolean | null;
	isUrgentHourly?: boolean | null;
	endDateBefore?: string | Date | null;
	endDateAfter?: string | Date | null;
	search?: string | null;
}

export type TaskOrderByValue =
	| "CREATED_AT_DESC"
	| "END_DATE_ASC"
	| "PRIORITY_DESC"
	| "STATE_ASC";

export interface ProjectListArgs {
	filter?: ProjectFilterInput | null;
	orderBy?: ProjectOrderByValue | null;
	offset?: number | null;
	limit?: number | null;
}

export interface TaskListArgs {
	filter?: TaskFilterInput | null;
	orderBy?: TaskOrderByValue | null;
	offset?: number | null;
	limit?: number | null;
}

export interface CreateTaskInput {
	title: string;
	description?: string | null;
	projectId?: string | null;
	taskType: TaskTypeValue;
	priority: Priority;
	assignedToId?: string | null;
	departmentId?: string | null;
	startDate?: string | Date | null;
	endDate?: string | Date | null;
	isUrgentHourly?: boolean | null;
}

export interface LogTaskProgressInput {
	taskId: string;
	newPercentage: number;
	logComment?: string | null;
	attachmentIds?: string[] | null;
}

export interface SubmitTaskReportInput {
	taskId: string;
	reportComment?: string | null;
	attachmentIds?: string[] | null;
}

export interface RequestExtensionInput {
	taskId: string;
	requestedDeadline: string | Date;
	reason: string;
	attachmentIds?: string[] | null;
}

export interface ExplainLateSubmissionInput {
	taskId: string;
	reason: string;
	attachmentIds?: string[] | null;
}

export interface ReviewTaskRequestInput {
	requestId: string;
	decision: "PENDING" | "APPROVED" | "REJECTED";
	reviewComment?: string | null;
}

export interface SubmitTaskCompletionRequestInput {
	taskId: string;
	scope: CompletionScopeValue;
	title: string;
	description?: string | null;
	declaredProgress?: number | null;
	plannedStageCount?: number | null;
	attachmentIds?: string[] | null;
}

export interface ReviewTaskCompletionRequestInput {
	requestId: string;
	decision: "APPROVED" | "REJECTED";
	reviewComment?: string | null;
	attachmentIds?: string[] | null;
}

export interface CancelTaskInput {
	taskId: string;
	reason: string;
}

export interface ListResult<T> {
	nodes: T[];
	pageInfo: {
		offset: number;
		limit: number;
		totalCount: number;
		hasNextPage: boolean;
	};
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

export function requireActor(ctx: ViewerContext) {
	if (!ctx.viewer) {
		throw new DomainError("UNAUTHENTICATED", "Authentication is required.");
	}
	return ctx.viewer;
}

function isApprover(ctx: ViewerContext): boolean {
	return Boolean(
		ctx.viewer?.roleCodes.some((role) =>
			(APPROVER_ROLES as readonly string[]).includes(role),
		),
	);
}

function notFoundTask(id: string): DomainError {
	return new DomainError("NOT_FOUND", `Task ${id} was not found.`);
}

function normalizePage(offset?: number | null, limit?: number | null) {
	const safeOffset =
		typeof offset === "number" && Number.isFinite(offset) && offset > 0
			? Math.floor(offset)
			: 0;
	const safeLimit =
		typeof limit === "number" && Number.isFinite(limit) && limit > 0
			? Math.min(Math.floor(limit), MAX_PAGE_LIMIT)
			: DEFAULT_PAGE_LIMIT;
	return { offset: safeOffset, limit: safeLimit };
}

/** The row is visible to the caller's data scope. */
function taskInScope(
	ctx: ViewerContext,
	scope: DataScope,
	row: TaskRow,
): boolean {
	const departmentId = scopedDepartmentId(ctx, scope);
	if (departmentId && row.departmentId !== departmentId) return false;
	const userId = scopedUserId(ctx, scope);
	if (userId && row.assignedTo !== userId) return false;
	return true;
}

export function appendScope(
	conditions: SQL[],
	ctx: ViewerContext,
	scope: DataScope,
) {
	const departmentId = scopedDepartmentId(ctx, scope);
	if (departmentId) conditions.push(eq(tasks.departmentId, departmentId));
	const userId = scopedUserId(ctx, scope);
	if (userId) conditions.push(eq(tasks.assignedTo, userId));
}

/* ------------------------------------------------------------------ */
/* Project reads                                                       */
/* ------------------------------------------------------------------ */

function buildProjectFilter(filter?: ProjectFilterInput | null): SQL[] {
	const conditions: SQL[] = [];
	if (!filter) return conditions;
	if (filter.departmentId)
		conditions.push(eq(projects.departmentId, filter.departmentId));
	if (filter.isActive !== null && filter.isActive !== undefined) {
		conditions.push(eq(projects.isActive, filter.isActive));
	}
	if (filter.search && filter.search.trim().length > 0) {
		const term = `%${filter.search.trim()}%`;
		const match = or(like(projects.name, term), like(projects.code, term));
		if (match) conditions.push(match);
	}
	return conditions;
}

function projectOrder(orderBy?: ProjectOrderByValue | null) {
	switch (orderBy) {
		case "NAME_ASC":
			return [asc(projects.name)];
		case "NAME_DESC":
			return [desc(projects.name)];
		default:
			return [desc(projects.createdAt)];
	}
}

export async function listProjects(
	ctx: ViewerContext,
	scope: DataScope,
	args: ProjectListArgs = {},
): Promise<ListResult<ProjectRow>> {
	const { offset, limit } = normalizePage(args.offset, args.limit);
	const conditions: SQL[] = [
		isNull(projects.deletedAt),
		...buildProjectFilter(args.filter),
	];
	const departmentId = scopedDepartmentId(ctx, scope);
	if (departmentId) conditions.push(eq(projects.departmentId, departmentId));
	const where = and(...conditions);

	const [totalRow] = await ctx.db
		.select({ value: count() })
		.from(projects)
		.where(where);
	const totalCount = totalRow?.value ?? 0;

	const nodes = await ctx.db
		.select()
		.from(projects)
		.where(where)
		.orderBy(...projectOrder(args.orderBy))
		.limit(limit)
		.offset(offset);

	return { nodes, pageInfo: pagination(offset, limit, totalCount) };
}

export async function getProject(
	ctx: ViewerContext,
	scope: DataScope,
	id: string,
): Promise<ProjectRow> {
	const [row] = await ctx.db
		.select()
		.from(projects)
		.where(and(eq(projects.id, id), isNull(projects.deletedAt)))
		.limit(1);
	const departmentId = scopedDepartmentId(ctx, scope);
	if (!row || (departmentId && row.departmentId !== departmentId)) {
		throw new DomainError("NOT_FOUND", `Project ${id} was not found.`);
	}
	return row;
}

/* ------------------------------------------------------------------ */
/* Task reads                                                          */
/* ------------------------------------------------------------------ */

function buildTaskFilter(filter?: TaskFilterInput | null): SQL[] {
	const conditions: SQL[] = [];
	if (!filter) return conditions;
	if (filter.projectId) conditions.push(eq(tasks.projectId, filter.projectId));
	if (filter.departmentId)
		conditions.push(eq(tasks.departmentId, filter.departmentId));
	if (filter.assignedToId)
		conditions.push(eq(tasks.assignedTo, filter.assignedToId));
	if (filter.state) conditions.push(eq(tasks.state, filter.state));
	if (filter.taskType) conditions.push(eq(tasks.taskType, filter.taskType));
	if (filter.priority) conditions.push(eq(tasks.priority, filter.priority));
	if (filter.isOverdue !== null && filter.isOverdue !== undefined) {
		conditions.push(eq(tasks.isOverdue, filter.isOverdue));
	}
	if (filter.isUrgentHourly !== null && filter.isUrgentHourly !== undefined) {
		conditions.push(eq(tasks.isUrgentHourly, filter.isUrgentHourly));
	}
	const before = parseDate(filter.endDateBefore ?? null);
	if (before) conditions.push(lt(tasks.endDate, before));
	const after = parseDate(filter.endDateAfter ?? null);
	if (after) conditions.push(gt(tasks.endDate, after));
	if (filter.search && filter.search.trim().length > 0) {
		const term = `%${filter.search.trim()}%`;
		const match = or(like(tasks.title, term), like(tasks.taskCode, term));
		if (match) conditions.push(match);
	}
	return conditions;
}

const priorityRank = sql`case ${tasks.priority} when 'URGENT' then 4 when 'HIGH' then 3 when 'MEDIUM' then 2 else 1 end`;

function taskOrder(orderBy?: TaskOrderByValue | null) {
	switch (orderBy) {
		case "END_DATE_ASC":
			return [asc(tasks.endDate), desc(tasks.createdAt)];
		case "PRIORITY_DESC":
			return [desc(priorityRank), desc(tasks.createdAt)];
		case "STATE_ASC":
			return [asc(tasks.state), desc(tasks.createdAt)];
		default:
			return [desc(tasks.createdAt)];
	}
}

export async function listTasks(
	ctx: ViewerContext,
	scope: DataScope,
	args: TaskListArgs = {},
): Promise<ListResult<TaskRow>> {
	const { offset, limit } = normalizePage(args.offset, args.limit);
	const conditions: SQL[] = [
		isNull(tasks.deletedAt),
		...buildTaskFilter(args.filter),
	];
	appendScope(conditions, ctx, scope);
	const where = and(...conditions);

	const [totalRow] = await ctx.db
		.select({ value: count() })
		.from(tasks)
		.where(where);
	const totalCount = totalRow?.value ?? 0;

	const nodes = await ctx.db
		.select()
		.from(tasks)
		.where(where)
		.orderBy(...taskOrder(args.orderBy))
		.limit(limit)
		.offset(offset);

	return { nodes, pageInfo: pagination(offset, limit, totalCount) };
}

export async function loadTaskRow(
	ctx: ViewerContext,
	id: string,
): Promise<TaskRow | null> {
	const [row] = await ctx.db
		.select()
		.from(tasks)
		.where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
		.limit(1);
	return row ?? null;
}

export async function requireTaskRow(
	ctx: ViewerContext,
	scope: DataScope,
	id: string,
): Promise<TaskRow> {
	const row = await loadTaskRow(ctx, id);
	if (!row || !taskInScope(ctx, scope, row)) throw notFoundTask(id);
	return row;
}

export async function getTask(
	ctx: ViewerContext,
	scope: DataScope,
	id: string,
): Promise<TaskRow> {
	return requireTaskRow(ctx, scope, id);
}

/* ------------------------------------------------------------------ */
/* Reference-data lookups                                              */
/* ------------------------------------------------------------------ */

export async function requireDepartment(ctx: ViewerContext, id: string) {
	const [row] = await ctx.db
		.select()
		.from(departments)
		.where(and(eq(departments.id, id), isNull(departments.deletedAt)))
		.limit(1);
	if (!row) {
		throw new DomainError(
			"VALIDATION_FAILED",
			`Department ${id} was not found.`,
		);
	}
	return row;
}

export async function requireActiveUser(ctx: ViewerContext, id: string) {
	const [row] = await ctx.db
		.select()
		.from(user)
		.where(
			and(eq(user.id, id), eq(user.isActive, true), isNull(user.deletedAt)),
		)
		.limit(1);
	if (!row) {
		throw new DomainError("VALIDATION_FAILED", `User ${id} was not found.`);
	}
	return row;
}

/* ------------------------------------------------------------------ */
/* Write helpers                                                       */
/* ------------------------------------------------------------------ */

export async function writeTransition(
	ctx: ViewerContext,
	input: {
		taskId: string;
		from: TicketStateCode | null;
		to: TicketStateCode;
		actorId: string | null;
		reason?: string | null;
	},
): Promise<void> {
	await ctx.db.insert(taskStateTransitions).values({
		id: crypto.randomUUID(),
		taskId: input.taskId,
		fromState: input.from,
		toState: input.to,
		actorId: input.actorId,
		reason: input.reason ?? null,
	});
}

/**
 * Record a KPI ledger event when the rule is configured.
 *
 * The point value is read from `kpi_point_rules` (the registry is the source of
 * truth for scoring); an unconfigured rule records nothing rather than failing
 * the state change, and the ledger remains reproducible from the registry.
 */
async function awardKpi(
	ctx: ViewerContext,
	input: {
		userId: string;
		taskId: string | null;
		ruleCode: KpiRuleCode;
		occurredAt: Date;
		note?: string | null;
	},
): Promise<void> {
	const [rule] = await ctx.db
		.select()
		.from(kpiPointRules)
		.where(eq(kpiPointRules.code, input.ruleCode))
		.limit(1);
	if (!rule?.isActive) return;

	await ctx.db.insert(kpiScoreEvents).values({
		id: crypto.randomUUID(),
		userId: input.userId,
		taskId: input.taskId,
		ruleCode: input.ruleCode,
		points: rule.points,
		periodYear: input.occurredAt.getUTCFullYear(),
		periodMonth: input.occurredAt.getUTCMonth() + 1,
		occurredAt: input.occurredAt,
		note: input.note ?? null,
	});
}

export async function linkAttachments(
	ctx: ViewerContext,
	ids: string[] | null | undefined,
	ownerId: string,
	ownerType: string,
): Promise<void> {
	if (!ids || ids.length === 0) return;
	await ctx.db
		.update(attachments)
		.set({ ownerType, ownerId })
		.where(inArray(attachments.id, ids));
}

export async function nextTaskCode(ctx: ViewerContext): Promise<string> {
	const now = new Date();
	const prefix = `T${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
	const [row] = await ctx.db
		.select({ value: count() })
		.from(tasks)
		.where(like(tasks.taskCode, `${prefix}%`));
	const sequence = (row?.value ?? 0) + 1;
	return `${prefix}-${String(sequence).padStart(4, "0")}`;
}

function atLocalTime(base: Date, hhmm: string): Date {
	const [hours, minutes] = hhmm.split(":").map((part) => Number(part));
	const date = new Date(base);
	date.setHours(hours ?? 0, minutes ?? 0, 0, 0);
	return date;
}

/** Default deadline by task type: HOURLY urgent slots, DAILY 17:00/18:00. */
function defaultEndDate(taskType: TaskTypeValue, now: Date): Date | null {
	if (taskType === "MULTI_DAY") return null;
	if (taskType === "HOURLY") {
		for (const slot of ["10:30", "14:00", "16:30"]) {
			const candidate = atLocalTime(now, slot);
			if (candidate.getTime() > now.getTime()) return candidate;
		}
		const tomorrow = new Date(now);
		tomorrow.setDate(tomorrow.getDate() + 1);
		return atLocalTime(tomorrow, "10:30");
	}
	const seventeen = atLocalTime(now, "17:00");
	if (seventeen.getTime() > now.getTime()) return seventeen;
	const eighteen = atLocalTime(now, "18:00");
	if (eighteen.getTime() > now.getTime()) return eighteen;
	const tomorrow = new Date(now);
	tomorrow.setDate(tomorrow.getDate() + 1);
	return atLocalTime(tomorrow, "17:00");
}

function effectiveDeadline(row: TaskRow): Date | null {
	return row.extendedDeadline ?? row.endDate ?? null;
}

async function hasPriorReturn(
	ctx: ViewerContext,
	taskId: string,
): Promise<boolean> {
	const [row] = await ctx.db
		.select({ id: taskStateTransitions.id })
		.from(taskStateTransitions)
		.where(
			and(
				eq(taskStateTransitions.taskId, taskId),
				eq(taskStateTransitions.toState, "REJ"),
			),
		)
		.limit(1);
	return Boolean(row);
}

async function hasApprovedLateExplanation(
	ctx: ViewerContext,
	taskId: string,
): Promise<boolean> {
	const [row] = await ctx.db
		.select({ id: taskRequests.id })
		.from(taskRequests)
		.where(
			and(
				eq(taskRequests.taskId, taskId),
				eq(taskRequests.requestType, "LATE_EXPLANATION"),
				eq(taskRequests.status, "APPROVED"),
			),
		)
		.limit(1);
	return Boolean(row);
}

/**
 * Move an active ticket to `OVERDUE` when its effective deadline has passed,
 * recording the transition, its audit event and the overdue penalty once.
 */
async function refreshOverdue(
	ctx: ViewerContext,
	task: TaskRow,
): Promise<TaskRow> {
	if (task.state !== "REQ" && task.state !== "ACT") return task;
	if (task.isOverdue) return task;
	const deadline = effectiveDeadline(task);
	if (!deadline) return task;
	const now = new Date();
	if (now.getTime() <= deadline.getTime()) return task;

	await ctx.db
		.update(tasks)
		.set({ state: "OVERDUE", isOverdue: true, updatedAt: now })
		.where(eq(tasks.id, task.id));
	await writeTransition(ctx, {
		taskId: task.id,
		from: task.state,
		to: "OVERDUE",
		actorId: ctx.viewer?.id ?? null,
		reason: "The effective deadline passed without a submitted report.",
	});
	await recordAuditEvent(ctx, {
		action: "task.overdue",
		moduleCode: MODULE,
		resourceType: "Task",
		resourceId: task.id,
		oldData: { state: task.state, isOverdue: false },
		newData: { state: "OVERDUE", isOverdue: true },
	});
	if (task.assignedTo) {
		await awardKpi(ctx, {
			userId: task.assignedTo,
			taskId: task.id,
			ruleCode: "KPI_OVERDUE_TICKET",
			occurredAt: now,
			note: "Ticket became overdue.",
		});
		await recomputeMonthlySummary(
			ctx,
			task.assignedTo,
			now.getUTCFullYear(),
			now.getUTCMonth() + 1,
		);
	}

	return { ...task, state: "OVERDUE", isOverdue: true, updatedAt: now };
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

export async function insertTask(
	ctx: ViewerContext,
	input: {
		taskCode: string;
		title: string;
		description: string | null;
		projectId: string | null;
		taskType: TaskTypeValue;
		priority: Priority;
		createdBy: string;
		assignedTo: string | null;
		departmentId: string | null;
		startDate: Date | null;
		endDate: Date | null;
		isUrgentHourly: boolean;
	},
): Promise<TaskRow> {
	const id = crypto.randomUUID();
	const now = new Date();
	await ctx.db.insert(tasks).values({
		id,
		taskCode: input.taskCode,
		title: input.title,
		description: input.description,
		projectId: input.projectId,
		taskType: input.taskType,
		priority: input.priority,
		state: "REQ",
		createdBy: input.createdBy,
		assignedTo: input.assignedTo,
		departmentId: input.departmentId,
		startDate: input.startDate,
		endDate: input.endDate,
		progressPercentage: 0,
		isUrgentHourly: input.isUrgentHourly,
		isExtensionRequested: false,
		isOverdue: false,
		isLateSubmission: false,
		createdAt: now,
		updatedAt: now,
	});
	const row = await loadTaskRow(ctx, id);
	if (!row)
		throw new DomainError(
			"INTERNAL",
			"The created task could not be read back.",
		);
	return row;
}

/**
 * Create a `REQ` ticket. Employees are denied by the resolver's authorization
 * gate. When the target department has Auto-forking enabled, the ticket is
 * replicated to each other active department member as its own `REQ` ticket
 * (excluding the primary assignee and the creator).
 */
export async function createTask(
	ctx: ViewerContext,
	scope: DataScope,
	input: CreateTaskInput,
): Promise<TaskRow> {
	const actor = requireActor(ctx);
	const title = (input.title ?? "").trim();
	if (title.length === 0) {
		throw new DomainError("VALIDATION_FAILED", "Task title is required.");
	}

	const project = input.projectId
		? await getProject(ctx, scope, input.projectId)
		: null;

	const scopedDepartmentIdValue = scopedDepartmentId(ctx, scope);
	const departmentId =
		input.departmentId ??
		project?.departmentId ??
		scopedDepartmentIdValue ??
		actor.departmentId ??
		null;

	const departmentRow = departmentId
		? await requireDepartment(ctx, departmentId)
		: null;
	if (
		scopedDepartmentIdValue &&
		departmentId &&
		departmentId !== scopedDepartmentIdValue
	) {
		throw new DomainError(
			"FORBIDDEN",
			"You can only create tasks within your department.",
		);
	}

	const assigneeId = input.assignedToId ?? null;
	if (assigneeId) {
		const assignee = await requireActiveUser(ctx, assigneeId);
		if (
			scopedDepartmentIdValue &&
			assignee.departmentId !== scopedDepartmentIdValue
		) {
			throw new DomainError(
				"FORBIDDEN",
				"You can only assign tasks to members of your department.",
			);
		}
	}

	const startDate = parseDate(input.startDate ?? null);
	const endDate =
		parseDate(input.endDate ?? null) ??
		defaultEndDate(input.taskType, new Date());
	if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
		throw new DomainError(
			"VALIDATION_FAILED",
			"endDate must not be before startDate.",
		);
	}

	const isUrgentHourly =
		input.taskType === "HOURLY" && input.isUrgentHourly === true;

	const primary = await insertTask(ctx, {
		taskCode: await nextTaskCode(ctx),
		title,
		description: input.description?.trim() || null,
		projectId: project?.id ?? null,
		taskType: input.taskType,
		priority: input.priority,
		createdBy: actor.id,
		assignedTo: assigneeId,
		departmentId,
		startDate,
		endDate,
		isUrgentHourly,
	});

	await writeTransition(ctx, {
		taskId: primary.id,
		from: null,
		to: "REQ",
		actorId: actor.id,
		reason: "Task created.",
	});
	await recordAuditEvent(ctx, {
		action: "task.create",
		moduleCode: MODULE,
		resourceType: "Task",
		resourceId: primary.id,
		newData: {
			taskCode: primary.taskCode,
			title: primary.title,
			state: "REQ",
			assignedTo: assigneeId,
			departmentId,
		},
	});

	if (departmentRow?.autoForkingEnabled) {
		const members = await ctx.db
			.select()
			.from(user)
			.where(
				and(
					eq(user.departmentId, departmentRow.id),
					eq(user.isActive, true),
					isNull(user.deletedAt),
				),
			);
		for (const member of members) {
			if (member.id === assigneeId || member.id === actor.id) continue;
			const fork = await insertTask(ctx, {
				taskCode: await nextTaskCode(ctx),
				title,
				description: input.description?.trim() || null,
				projectId: project?.id ?? null,
				taskType: input.taskType,
				priority: input.priority,
				createdBy: actor.id,
				assignedTo: member.id,
				departmentId,
				startDate,
				endDate,
				isUrgentHourly,
			});
			await writeTransition(ctx, {
				taskId: fork.id,
				from: null,
				to: "REQ",
				actorId: actor.id,
				reason: "Auto-forked task.",
			});
			await recordAuditEvent(ctx, {
				action: "task.create",
				moduleCode: MODULE,
				resourceType: "Task",
				resourceId: fork.id,
				newData: {
					taskCode: fork.taskCode,
					state: "REQ",
					assignedTo: member.id,
					autoForkedFrom: primary.id,
				},
			});
		}
	}

	return primary;
}

export async function acceptTask(
	ctx: ViewerContext,
	scope: DataScope,
	taskId: string,
): Promise<TaskRow> {
	const actor = requireActor(ctx);
	const current = await requireTaskRow(ctx, scope, taskId);
	const task = await refreshOverdue(ctx, current);
	if (task.state !== "REQ") {
		throw new DomainError(
			"STATE_TRANSITION_INVALID",
			`A task in ${task.state} cannot be accepted.`,
		);
	}

	const now = new Date();
	await ctx.db
		.update(tasks)
		.set({ state: "ACT", updatedAt: now })
		.where(eq(tasks.id, task.id));
	await writeTransition(ctx, {
		taskId: task.id,
		from: "REQ",
		to: "ACT",
		actorId: actor.id,
	});
	await recordAuditEvent(ctx, {
		action: "task.accept",
		moduleCode: MODULE,
		resourceType: "Task",
		resourceId: task.id,
		oldData: { state: "REQ" },
		newData: { state: "ACT" },
	});
	await notify(ctx, {
		template: NOTIFICATION_TEMPLATES.TASK_ACCEPTED,
		relatedType: "Task",
		relatedId: task.id,
		payload: { taskId: task.id, taskCode: task.taskCode, actorId: actor.id },
	});

	const row = await loadTaskRow(ctx, task.id);
	if (!row) throw notFoundTask(task.id);
	return row;
}

export async function logTaskProgress(
	ctx: ViewerContext,
	scope: DataScope,
	input: LogTaskProgressInput,
): Promise<TaskRow> {
	const actor = requireActor(ctx);
	const current = await requireTaskRow(ctx, scope, input.taskId);
	const task = await refreshOverdue(ctx, current);
	if (task.state !== "ACT") {
		throw new DomainError(
			"STATE_TRANSITION_INVALID",
			`Progress can only be logged while a task is ACT (current: ${task.state}).`,
		);
	}

	const percentage = input.newPercentage;
	if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
		throw new DomainError(
			"VALIDATION_FAILED",
			"newPercentage must be an integer between 0 and 100.",
		);
	}
	if (task.taskType === "MULTI_DAY" && percentage < task.progressPercentage) {
		throw new DomainError(
			"RULE_VIOLATION",
			"Multi-day progress cannot decrease.",
		);
	}

	const now = new Date();
	await ctx.db.insert(taskProgressLogs).values({
		id: crypto.randomUUID(),
		taskId: task.id,
		userId: actor.id,
		previousPercentage: task.progressPercentage,
		newPercentage: percentage,
		logComment: input.logComment?.trim() || null,
		isVerifiedByManager: false,
		createdAt: now,
	});
	await ctx.db
		.update(tasks)
		.set({ progressPercentage: percentage, updatedAt: now })
		.where(eq(tasks.id, task.id));
	await linkAttachments(ctx, input.attachmentIds, task.id, "TASK");
	await recordAuditEvent(ctx, {
		action: "task.progress",
		moduleCode: MODULE,
		resourceType: "Task",
		resourceId: task.id,
		oldData: { progressPercentage: task.progressPercentage },
		newData: { progressPercentage: percentage },
	});

	const row = await loadTaskRow(ctx, task.id);
	if (!row) throw notFoundTask(task.id);
	return row;
}

export async function submitTaskReport(
	ctx: ViewerContext,
	scope: DataScope,
	input: SubmitTaskReportInput,
): Promise<TaskRow> {
	const actor = requireActor(ctx);
	const current = await requireTaskRow(ctx, scope, input.taskId);
	const task = await refreshOverdue(ctx, current);

	if (task.state === "OVERDUE") {
		const explained = await hasApprovedLateExplanation(ctx, task.id);
		if (!explained) {
			throw new DomainError(
				"STATE_TRANSITION_INVALID",
				"An OVERDUE ticket requires an approved late-submission explanation before it can move to PEN.",
			);
		}
	} else if (task.state !== "ACT") {
		throw new DomainError(
			"STATE_TRANSITION_INVALID",
			`A report can only be submitted while a task is ACT or OVERDUE (current: ${task.state}).`,
		);
	}

	const fromState = task.state as TicketStateCode;
	const now = new Date();
	const deadline = effectiveDeadline(task);
	const isLate =
		task.isOverdue || (deadline ? now.getTime() > deadline.getTime() : false);

	await ctx.db
		.update(tasks)
		.set({ state: "PEN", isLateSubmission: isLate, updatedAt: now })
		.where(eq(tasks.id, task.id));
	await writeTransition(ctx, {
		taskId: task.id,
		from: fromState,
		to: "PEN",
		actorId: actor.id,
		reason: input.reportComment?.trim() || "Task report submitted.",
	});
	await linkAttachments(ctx, input.attachmentIds, task.id, "TASK");
	await recordAuditEvent(ctx, {
		action: "task.submit",
		moduleCode: MODULE,
		resourceType: "Task",
		resourceId: task.id,
		oldData: { state: fromState },
		newData: { state: "PEN", isLateSubmission: isLate },
	});
	await notify(ctx, {
		template: NOTIFICATION_TEMPLATES.TASK_SUBMITTED,
		relatedType: "Task",
		relatedId: task.id,
		payload: {
			taskId: task.id,
			taskCode: task.taskCode,
			actorId: actor.id,
			isLate,
		},
	});

	const row = await loadTaskRow(ctx, task.id);
	if (!row) throw notFoundTask(task.id);
	return row;
}

export async function approveTask(
	ctx: ViewerContext,
	scope: DataScope,
	taskId: string,
): Promise<TaskRow> {
	const actor = requireActor(ctx);
	const task = await requireTaskRow(ctx, scope, taskId);
	if (task.state !== "PEN") {
		throw new DomainError(
			"STATE_TRANSITION_INVALID",
			`Only a PEN task can be approved (current: ${task.state}).`,
		);
	}

	const now = new Date();
	const deadline = effectiveDeadline(task);
	const onTime =
		!task.isOverdue && (!deadline || now.getTime() <= deadline.getTime());
	const firstTime = !(await hasPriorReturn(ctx, task.id));

	await ctx.db
		.update(tasks)
		.set({
			state: "APP",
			approvedBy: actor.id,
			approvedAt: now,
			reviewedBy: actor.id,
			reviewedAt: now,
			updatedAt: now,
		})
		.where(eq(tasks.id, task.id));
	await writeTransition(ctx, {
		taskId: task.id,
		from: "PEN",
		to: "APP",
		actorId: actor.id,
	});

	if (task.assignedTo) {
		if (onTime) {
			await awardKpi(ctx, {
				userId: task.assignedTo,
				taskId: task.id,
				ruleCode:
					task.priority === "URGENT"
						? "KPI_ON_TIME_URGENT"
						: "KPI_ON_TIME_TICKET",
				occurredAt: now,
				note: "Task approved on time.",
			});
		}
		if (firstTime) {
			await awardKpi(ctx, {
				userId: task.assignedTo,
				taskId: task.id,
				ruleCode: "KPI_FIRST_TIME_APPROVAL",
				occurredAt: now,
				note: "Task approved without a prior return.",
			});
		}
		await recomputeMonthlySummary(
			ctx,
			task.assignedTo,
			now.getUTCFullYear(),
			now.getUTCMonth() + 1,
		);
	}

	await recordAuditEvent(ctx, {
		action: "task.approve",
		moduleCode: MODULE,
		resourceType: "Task",
		resourceId: task.id,
		oldData: { state: "PEN" },
		newData: { state: "APP", onTime, firstTime },
	});
	await notify(ctx, {
		template: NOTIFICATION_TEMPLATES.TASK_APPROVED,
		relatedType: "Task",
		relatedId: task.id,
		payload: { taskId: task.id, taskCode: task.taskCode, actorId: actor.id },
	});

	const row = await loadTaskRow(ctx, task.id);
	if (!row) throw notFoundTask(task.id);
	return row;
}

export async function returnTask(
	ctx: ViewerContext,
	scope: DataScope,
	taskId: string,
	reason: string,
): Promise<TaskRow> {
	const actor = requireActor(ctx);
	const trimmedReason = (reason ?? "").trim();
	if (trimmedReason.length === 0) {
		throw new DomainError("RULE_VIOLATION", "A return reason is required.");
	}

	const task = await requireTaskRow(ctx, scope, taskId);
	if (task.state !== "PEN") {
		throw new DomainError(
			"STATE_TRANSITION_INVALID",
			`Only a PEN task can be returned (current: ${task.state}).`,
		);
	}

	const now = new Date();
	await ctx.db
		.update(tasks)
		.set({
			state: "REJ",
			reviewedBy: actor.id,
			reviewedAt: now,
			updatedAt: now,
		})
		.where(eq(tasks.id, task.id));
	await writeTransition(ctx, {
		taskId: task.id,
		from: "PEN",
		to: "REJ",
		actorId: actor.id,
		reason: trimmedReason,
	});

	if (task.assignedTo) {
		await awardKpi(ctx, {
			userId: task.assignedTo,
			taskId: task.id,
			ruleCode: "KPI_RETURNED_TICKET",
			occurredAt: now,
			note: "Task report returned.",
		});
		await recomputeMonthlySummary(
			ctx,
			task.assignedTo,
			now.getUTCFullYear(),
			now.getUTCMonth() + 1,
		);
	}

	await recordAuditEvent(ctx, {
		action: "task.return",
		moduleCode: MODULE,
		resourceType: "Task",
		resourceId: task.id,
		oldData: { state: "PEN" },
		newData: { state: "REJ", reason: trimmedReason },
	});
	await notify(ctx, {
		template: NOTIFICATION_TEMPLATES.TASK_RETURNED,
		relatedType: "Task",
		relatedId: task.id,
		payload: {
			taskId: task.id,
			taskCode: task.taskCode,
			actorId: actor.id,
			reason: trimmedReason,
		},
	});

	const row = await loadTaskRow(ctx, task.id);
	if (!row) throw notFoundTask(task.id);
	return row;
}

export async function cancelTask(
	ctx: ViewerContext,
	scope: DataScope,
	input: CancelTaskInput,
): Promise<TaskRow> {
	const actor = requireActor(ctx);
	const reason = (input.reason ?? "").trim();
	if (reason.length === 0) {
		throw new DomainError(
			"RULE_VIOLATION",
			"A cancellation reason is required.",
		);
	}

	const task = await requireTaskRow(ctx, scope, input.taskId);
	if (task.state === "APP" || task.state === "CAN") {
		throw new DomainError(
			"STATE_TRANSITION_INVALID",
			`A ${task.state} task cannot be cancelled.`,
		);
	}
	if (!isApprover(ctx) && task.assignedTo !== actor.id) {
		throw new DomainError("FORBIDDEN", "You can only cancel your own ticket.");
	}

	const fromState = task.state as TicketStateCode;
	const now = new Date();
	await ctx.db
		.update(tasks)
		.set({ state: "CAN", updatedAt: now })
		.where(eq(tasks.id, task.id));
	await writeTransition(ctx, {
		taskId: task.id,
		from: fromState,
		to: "CAN",
		actorId: actor.id,
		reason,
	});
	await recordAuditEvent(ctx, {
		action: "task.cancel",
		moduleCode: MODULE,
		resourceType: "Task",
		resourceId: task.id,
		oldData: { state: fromState },
		newData: { state: "CAN", reason },
	});
	await notify(ctx, {
		template: NOTIFICATION_TEMPLATES.TASK_CANCELLED,
		relatedType: "Task",
		relatedId: task.id,
		payload: {
			taskId: task.id,
			taskCode: task.taskCode,
			actorId: actor.id,
			reason,
		},
	});

	const row = await loadTaskRow(ctx, task.id);
	if (!row) throw notFoundTask(task.id);
	return row;
}

async function loadTaskRequestRow(
	ctx: ViewerContext,
	id: string,
): Promise<TaskRequestRow | null> {
	const [row] = await ctx.db
		.select()
		.from(taskRequests)
		.where(eq(taskRequests.id, id))
		.limit(1);
	return row ?? null;
}

async function requireTaskRequestRow(
	ctx: ViewerContext,
	id: string,
): Promise<TaskRequestRow> {
	const row = await loadTaskRequestRow(ctx, id);
	if (!row) {
		throw new DomainError("NOT_FOUND", `Task request ${id} was not found.`);
	}
	return row;
}

export async function requestExtension(
	ctx: ViewerContext,
	scope: DataScope,
	input: RequestExtensionInput,
): Promise<TaskRequestRow> {
	const actor = requireActor(ctx);
	const reason = (input.reason ?? "").trim();
	if (reason.length === 0) {
		throw new DomainError("RULE_VIOLATION", "An extension reason is required.");
	}
	const requestedDeadline = parseDate(input.requestedDeadline);
	if (!requestedDeadline) {
		throw new DomainError(
			"VALIDATION_FAILED",
			"requestedDeadline must be a valid date.",
		);
	}

	const task = await requireTaskRow(ctx, scope, input.taskId);
	if (task.state === "APP" || task.state === "CAN") {
		throw new DomainError(
			"STATE_TRANSITION_INVALID",
			`A ${task.state} task can no longer request an extension.`,
		);
	}

	const id = crypto.randomUUID();
	const now = new Date();
	await ctx.db.insert(taskRequests).values({
		id,
		taskId: task.id,
		userId: actor.id,
		requestType: "EXTENSION",
		requestedDeadline,
		reason,
		status: "PENDING",
		createdAt: now,
		updatedAt: now,
	});
	await ctx.db
		.update(tasks)
		.set({ isExtensionRequested: true, updatedAt: now })
		.where(eq(tasks.id, task.id));
	await linkAttachments(ctx, input.attachmentIds, id, "TASK_REQUEST");

	const chargedUserId = task.assignedTo ?? actor.id;
	await awardKpi(ctx, {
		userId: chargedUserId,
		taskId: task.id,
		ruleCode: "KPI_EXTENSION_REQUEST",
		occurredAt: now,
		note: "Extension requested.",
	});
	await recomputeMonthlySummary(
		ctx,
		chargedUserId,
		now.getUTCFullYear(),
		now.getUTCMonth() + 1,
	);

	await recordAuditEvent(ctx, {
		action: "task.extension.request",
		moduleCode: MODULE,
		resourceType: "TaskRequest",
		resourceId: id,
		newData: {
			taskId: task.id,
			requestType: "EXTENSION",
			requestedDeadline: requestedDeadline.toISOString(),
			reason,
		},
	});
	await notify(ctx, {
		template: NOTIFICATION_TEMPLATES.EXTENSION_REQUESTED,
		relatedType: "Task",
		relatedId: task.id,
		payload: {
			taskId: task.id,
			taskCode: task.taskCode,
			requestedDeadline: requestedDeadline.toISOString(),
			reason,
		},
	});

	return requireTaskRequestRow(ctx, id);
}

export async function explainLateSubmission(
	ctx: ViewerContext,
	scope: DataScope,
	input: ExplainLateSubmissionInput,
): Promise<TaskRequestRow> {
	const actor = requireActor(ctx);
	const reason = (input.reason ?? "").trim();
	if (reason.length === 0) {
		throw new DomainError(
			"RULE_VIOLATION",
			"A late-submission explanation is required.",
		);
	}

	const task = await requireTaskRow(ctx, scope, input.taskId);
	if (task.state !== "OVERDUE") {
		throw new DomainError(
			"STATE_TRANSITION_INVALID",
			`A late-submission explanation is only valid for an OVERDUE ticket (current: ${task.state}).`,
		);
	}

	const id = crypto.randomUUID();
	const now = new Date();
	await ctx.db.insert(taskRequests).values({
		id,
		taskId: task.id,
		userId: actor.id,
		requestType: "LATE_EXPLANATION",
		requestedDeadline: null,
		reason,
		status: "PENDING",
		createdAt: now,
		updatedAt: now,
	});
	await linkAttachments(ctx, input.attachmentIds, id, "TASK_REQUEST");

	await recordAuditEvent(ctx, {
		action: "task.late.explanation",
		moduleCode: MODULE,
		resourceType: "TaskRequest",
		resourceId: id,
		newData: { taskId: task.id, requestType: "LATE_EXPLANATION", reason },
	});
	await notify(ctx, {
		template: NOTIFICATION_TEMPLATES.LATE_SUBMISSION_EXPLAINED,
		relatedType: "Task",
		relatedId: task.id,
		payload: { taskId: task.id, taskCode: task.taskCode, reason },
	});

	return requireTaskRequestRow(ctx, id);
}

/* ------------------------------------------------------------------ */
/* Completion requests — one submitted stage per journey entry         */
/* ------------------------------------------------------------------ */

async function loadCompletionRequest(
	ctx: ViewerContext,
	id: string,
): Promise<TaskCompletionRequestRow | null> {
	const [row] = await ctx.db
		.select()
		.from(taskCompletionRequests)
		.where(eq(taskCompletionRequests.id, id))
		.limit(1);
	return row ?? null;
}

async function requireCompletionRequest(
	ctx: ViewerContext,
	id: string,
): Promise<TaskCompletionRequestRow> {
	const row = await loadCompletionRequest(ctx, id);
	if (!row) {
		throw new DomainError(
			"NOT_FOUND",
			`Completion request ${id} was not found.`,
		);
	}
	return row;
}

/** Journey entries for one ticket, oldest first — the order they happened. */
export async function listJourney(
	ctx: ViewerContext,
	scope: DataScope,
	taskId: string,
): Promise<TaskCompletionRequestRow[]> {
	await requireTaskRow(ctx, scope, taskId);
	return ctx.db
		.select()
		.from(taskCompletionRequests)
		.where(eq(taskCompletionRequests.taskId, taskId))
		.orderBy(asc(taskCompletionRequests.createdAt));
}

/** True when a `PEN` completion request already exists for the ticket. */
async function hasPendingCompletionRequest(
	ctx: ViewerContext,
	taskId: string,
): Promise<boolean> {
	const [row] = await ctx.db
		.select({ id: taskCompletionRequests.id })
		.from(taskCompletionRequests)
		.where(
			and(
				eq(taskCompletionRequests.taskId, taskId),
				eq(taskCompletionRequests.state, "PEN"),
			),
		)
		.limit(1);
	return Boolean(row);
}

/**
 * True when a stage of the ticket has been approved and nothing is pending.
 *
 * That is the state a multi-day ticket sits in between stages: it stays `PEN`
 * with no pending request, which is exactly when the next stage may be opened.
 */
async function hasApprovedMilestoneStage(
	ctx: ViewerContext,
	taskId: string,
): Promise<boolean> {
	const [row] = await ctx.db
		.select({ id: taskCompletionRequests.id })
		.from(taskCompletionRequests)
		.where(
			and(
				eq(taskCompletionRequests.taskId, taskId),
				eq(taskCompletionRequests.scope, "MILESTONE"),
				eq(taskCompletionRequests.state, "APP"),
			),
		)
		.limit(1);
	return Boolean(row);
}

/**
 * Count the ticket's approved `MILESTONE` entries.
 *
 * Callers pass the ledger as it stands *after* the current entry's decision, so
 * the entry being decided is already counted by the time this runs.
 */
async function countApprovedMilestones(
	ctx: ViewerContext,
	taskId: string,
): Promise<number> {
	const [row] = await ctx.db
		.select({ value: count() })
		.from(taskCompletionRequests)
		.where(
			and(
				eq(taskCompletionRequests.taskId, taskId),
				eq(taskCompletionRequests.scope, "MILESTONE"),
				eq(taskCompletionRequests.state, "APP"),
			),
		);
	return row?.value ?? 0;
}

/**
 * Recompute a multi-day ticket's progress from its stage ledger.
 *
 * `approved * 100 / planned` when the assignee planned a number of stages,
 * otherwise the entry's declared estimate (falling back to the current value).
 * Progress never decreases: a recomputation that lands below the recorded value
 * keeps the recorded value, exactly as `logTaskProgress` behaves.
 */
function computeStageProgress(
	approvedStages: number,
	plannedStages: number | null,
	declaredProgress: number | null,
	currentProgress: number,
): number {
	const computed =
		plannedStages && plannedStages > 0
			? Math.min(100, Math.floor((approvedStages * 100) / plannedStages))
			: (declaredProgress ?? currentProgress);
	return Math.max(currentProgress, computed);
}

/**
 * Submit one work stage for approval.
 *
 * The ticket moves to `PEN` (from `ACT`, or from `REJ` for a resubmission;
 * `OVERDUE` needs an approved late-submission explanation first), the request
 * becomes the ticket's one pending journey entry, and the employee's evidence is
 * re-parented to it. A multi-day request may declare how many stages the job is
 * expected to take, which later approvals use to derive progress.
 */
export async function submitTaskCompletionRequest(
	ctx: ViewerContext,
	scope: DataScope,
	input: SubmitTaskCompletionRequestInput,
): Promise<TaskCompletionRequestRow> {
	const actor = requireActor(ctx);
	const title = (input.title ?? "").trim();
	if (title.length === 0) {
		throw new DomainError(
			"VALIDATION_FAILED",
			"A completion request title is required.",
		);
	}

	const scopeValue = input.scope;
	if (scopeValue !== "MILESTONE" && scopeValue !== "FULL_JOB") {
		throw new DomainError(
			"VALIDATION_FAILED",
			"scope must be MILESTONE or FULL_JOB.",
		);
	}

	const current = await requireTaskRow(ctx, scope, input.taskId);
	const task = await refreshOverdue(ctx, current);

	const pending = await hasPendingCompletionRequest(ctx, task.id);

	if (pending) {
		throw new DomainError(
			"STATE_TRANSITION_INVALID",
			"This ticket already has a completion request awaiting review.",
		);
	}

	// Between stages a multi-day ticket stays `PEN` with its last milestone
	// approved, so opening the next stage is a submission from `PEN`.
	const betweenStages =
		task.state === "PEN" && (await hasApprovedMilestoneStage(ctx, task.id));

	if (task.state === "OVERDUE") {
		const explained = await hasApprovedLateExplanation(ctx, task.id);
		if (!explained) {
			throw new DomainError(
				"STATE_TRANSITION_INVALID",
				"An OVERDUE ticket requires an approved late-submission explanation before a completion request can be submitted.",
			);
		}
	} else if (task.state !== "ACT" && task.state !== "REJ" && !betweenStages) {
		throw new DomainError(
			"STATE_TRANSITION_INVALID",
			`A completion request can only be submitted while a ticket is ACT, REJ, or awaiting its next stage (current: ${task.state}).`,
		);
	}

	if (scopeValue === "MILESTONE" && task.taskType !== "MULTI_DAY") {
		throw new DomainError(
			"VALIDATION_FAILED",
			"Only a MULTI_DAY ticket can be completed stage by stage; DAILY and HOURLY tickets complete as a whole job.",
		);
	}

	const declaredProgress =
		input.declaredProgress === undefined || input.declaredProgress === null
			? null
			: input.declaredProgress;
	if (declaredProgress !== null) {
		if (!Number.isInteger(declaredProgress) || declaredProgress < 0) {
			throw new DomainError(
				"VALIDATION_FAILED",
				"declaredProgress must be an integer between 0 and 100.",
			);
		}
		if (declaredProgress <= task.progressPercentage) {
			throw new DomainError(
				"VALIDATION_FAILED",
				`declaredProgress must be greater than the ticket's current progress (${task.progressPercentage}%).`,
			);
		}
	}

	const plannedStageCount =
		input.plannedStageCount === undefined || input.plannedStageCount === null
			? null
			: input.plannedStageCount;
	if (plannedStageCount !== null) {
		if (!Number.isInteger(plannedStageCount) || plannedStageCount <= 0) {
			throw new DomainError(
				"VALIDATION_FAILED",
				"plannedStageCount must be a positive integer.",
			);
		}
		if (task.taskType !== "MULTI_DAY") {
			throw new DomainError(
				"VALIDATION_FAILED",
				"Only a MULTI_DAY ticket can declare an expected number of stages.",
			);
		}
	}

	const fromState = task.state as TicketStateCode;
	const now = new Date();
	const id = crypto.randomUUID();
	await ctx.db.insert(taskCompletionRequests).values({
		id,
		taskId: task.id,
		requestedBy: actor.id,
		scope: scopeValue,
		title,
		description: input.description?.trim() || null,
		declaredProgress,
		plannedStageCount,
		state: "PEN",
		createdAt: now,
		updatedAt: now,
	});
	await ctx.db
		.update(tasks)
		.set({
			state: "PEN",
			updatedAt: now,
			...(plannedStageCount === null ? {} : { plannedStageCount }),
		})
		.where(eq(tasks.id, task.id));
	await writeTransition(ctx, {
		taskId: task.id,
		from: fromState,
		to: "PEN",
		actorId: actor.id,
		reason: title,
	});
	await linkAttachments(
		ctx,
		input.attachmentIds,
		id,
		"TASK_COMPLETION_REQUEST",
	);
	await recordAuditEvent(ctx, {
		action: "task.completion.request",
		moduleCode: MODULE,
		resourceType: "TaskCompletionRequest",
		resourceId: id,
		oldData: { state: fromState },
		newData: {
			scope: scopeValue,
			title,
			state: "PEN",
			declaredProgress,
			plannedStageCount,
		},
	});
	await notify(ctx, {
		template: NOTIFICATION_TEMPLATES.TASK_COMPLETION_REQUESTED,
		relatedType: "Task",
		relatedId: task.id,
		payload: {
			taskId: task.id,
			taskCode: task.taskCode,
			actorId: actor.id,
			scope: scopeValue,
			title,
		},
	});

	return requireCompletionRequest(ctx, id);
}

/**
 * Approve or reject a completion request.
 *
 * Approving a `FULL_JOB` request closes the ticket (`APP`, with the approval and
 * review metadata) and awards the documented on-time and first-time-approval
 * rules — the approval itself is the completion signal, with no 100% gate.
 * Approving a `MILESTONE` request approves one stage and leaves the ticket open
 * for the next, recomputing progress from the ledger. Rejecting sends the ticket
 * back to `REJ` with the reviewer's reason and required-fix files.
 */
export async function reviewTaskCompletionRequest(
	ctx: ViewerContext,
	scope: DataScope,
	input: ReviewTaskCompletionRequestInput,
): Promise<TaskCompletionRequestRow> {
	const actor = requireActor(ctx);

	const request = await requireCompletionRequest(ctx, input.requestId);
	if (request.state !== "PEN") {
		throw new DomainError(
			"STATE_TRANSITION_INVALID",
			`Completion request ${request.id} was already ${request.state}.`,
		);
	}

	const task = await requireTaskRow(ctx, scope, request.taskId);
	const approved = input.decision === "APPROVED";
	const reviewComment = input.reviewComment?.trim() || null;
	if (!approved && reviewComment === null) {
		throw new DomainError("RULE_VIOLATION", "A rejection reason is required.");
	}

	const now = new Date();
	await ctx.db
		.update(taskCompletionRequests)
		.set({
			state: approved ? "APP" : "REJ",
			decidedBy: actor.id,
			decidedAt: now,
			decisionReason: reviewComment,
			updatedAt: now,
		})
		.where(eq(taskCompletionRequests.id, request.id));

	if (approved) {
		if (request.scope === "FULL_JOB") {
			const deadline = effectiveDeadline(task);
			const onTime =
				!task.isOverdue && (!deadline || now.getTime() <= deadline.getTime());
			const firstTime = !(await hasPriorReturn(ctx, task.id));

			await ctx.db
				.update(tasks)
				.set({
					state: "APP",
					approvedBy: actor.id,
					approvedAt: now,
					reviewedBy: actor.id,
					reviewedAt: now,
					progressPercentage: Math.max(
						task.progressPercentage,
						computeStageProgress(
							await countApprovedMilestones(ctx, task.id),
							task.plannedStageCount,
							request.declaredProgress,
							task.progressPercentage,
						),
					),
					updatedAt: now,
				})
				.where(eq(tasks.id, task.id));
			await writeTransition(ctx, {
				taskId: task.id,
				from: "PEN",
				to: "APP",
				actorId: actor.id,
				reason: request.title,
			});

			if (task.assignedTo) {
				if (onTime) {
					await awardKpi(ctx, {
						userId: task.assignedTo,
						taskId: task.id,
						ruleCode:
							task.priority === "URGENT"
								? "KPI_ON_TIME_URGENT"
								: "KPI_ON_TIME_TICKET",
						occurredAt: now,
						note: "Completion request approved on time.",
					});
				}
				if (firstTime) {
					await awardKpi(ctx, {
						userId: task.assignedTo,
						taskId: task.id,
						ruleCode: "KPI_FIRST_TIME_APPROVAL",
						occurredAt: now,
						note: "Completion request approved without a prior return.",
					});
				}
				await recomputeMonthlySummary(
					ctx,
					task.assignedTo,
					now.getUTCFullYear(),
					now.getUTCMonth() + 1,
				);
			}
		} else {
			// A milestone keeps the ticket open for the next stage: the ledger is
			// the progress, and the ticket stays `PEN` by design.
			const progressPercentage = computeStageProgress(
				await countApprovedMilestones(ctx, task.id),
				task.plannedStageCount,
				request.declaredProgress,
				task.progressPercentage,
			);
			await ctx.db
				.update(tasks)
				.set({ progressPercentage, updatedAt: now })
				.where(eq(tasks.id, task.id));
		}
	} else {
		await ctx.db
			.update(tasks)
			.set({
				state: "REJ",
				reviewedBy: actor.id,
				reviewedAt: now,
				updatedAt: now,
			})
			.where(eq(tasks.id, task.id));
		await writeTransition(ctx, {
			taskId: task.id,
			from: "PEN",
			to: "REJ",
			actorId: actor.id,
			reason: reviewComment ?? undefined,
		});
		await linkAttachments(
			ctx,
			input.attachmentIds,
			request.id,
			"TASK_COMPLETION_DECISION",
		);

		if (task.assignedTo) {
			await awardKpi(ctx, {
				userId: task.assignedTo,
				taskId: task.id,
				ruleCode: "KPI_RETURNED_TICKET",
				occurredAt: now,
				note: "Completion request returned for rework.",
			});
			await recomputeMonthlySummary(
				ctx,
				task.assignedTo,
				now.getUTCFullYear(),
				now.getUTCMonth() + 1,
			);
		}
	}

	await recordAuditEvent(ctx, {
		action: "task.completion.review",
		moduleCode: MODULE,
		resourceType: "TaskCompletionRequest",
		resourceId: request.id,
		oldData: { state: "PEN" },
		newData: {
			state: approved ? "APP" : "REJ",
			scope: request.scope,
			decisionReason: reviewComment,
			taskState: approved && request.scope === "FULL_JOB" ? "APP" : undefined,
		},
	});
	await notify(ctx, {
		template: approved
			? NOTIFICATION_TEMPLATES.TASK_COMPLETION_APPROVED
			: NOTIFICATION_TEMPLATES.TASK_COMPLETION_REJECTED,
		relatedType: "Task",
		relatedId: task.id,
		payload: {
			taskId: task.id,
			taskCode: task.taskCode,
			actorId: actor.id,
			scope: request.scope,
			title: request.title,
			decisionReason: reviewComment,
		},
	});

	return requireCompletionRequest(ctx, request.id);
}

export async function reviewTaskRequest(
	ctx: ViewerContext,
	scope: DataScope,
	input: ReviewTaskRequestInput,
): Promise<TaskRequestRow> {
	const actor = requireActor(ctx);
	if (input.decision === "PENDING") {
		throw new DomainError(
			"VALIDATION_FAILED",
			"decision must be APPROVED or REJECTED.",
		);
	}

	const request = await requireTaskRequestRow(ctx, input.requestId);
	const task = await requireTaskRow(ctx, scope, request.taskId);
	if (request.status !== "PENDING") {
		throw new DomainError(
			"STATE_TRANSITION_INVALID",
			`Task request ${request.id} was already ${request.status}.`,
		);
	}

	const now = new Date();
	const approved = input.decision === "APPROVED";
	await ctx.db
		.update(taskRequests)
		.set({
			status: input.decision,
			reviewedBy: actor.id,
			reviewComment: input.reviewComment?.trim() || null,
			reviewedAt: now,
			updatedAt: now,
		})
		.where(eq(taskRequests.id, request.id));

	if (request.requestType === "EXTENSION") {
		if (approved && request.requestedDeadline) {
			await ctx.db
				.update(tasks)
				.set({
					extendedDeadline: request.requestedDeadline,
					isExtensionRequested: false,
					updatedAt: now,
				})
				.where(eq(tasks.id, task.id));
		} else {
			await ctx.db
				.update(tasks)
				.set({ isExtensionRequested: false, updatedAt: now })
				.where(eq(tasks.id, task.id));
		}
	}

	await recordAuditEvent(ctx, {
		action: "task.request.review",
		moduleCode: MODULE,
		resourceType: "TaskRequest",
		resourceId: request.id,
		oldData: { status: "PENDING" },
		newData: {
			status: input.decision,
			requestType: request.requestType,
			extendedDeadline:
				approved && request.requestedDeadline
					? request.requestedDeadline.toISOString()
					: null,
		},
	});

	return requireTaskRequestRow(ctx, request.id);
}
