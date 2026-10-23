/**
 * Planning schedule domain service.
 *
 * Owns the schedule read and the planner task edits documented in
 * `API_CONTACT_SPECIFICATION.md` §6.2: `scheduledTasks` returns, in the
 * caller's scope, every non-deleted ticket whose start-to-end interval
 * overlaps the requested range; `updateTask` patches a ticket, `deleteTask`
 * soft-deletes it, and `duplicateTask` copies it as a fresh `REQ` ticket.
 *
 * Writes are gated by the operation table (`graphql/access.ts`) — planners
 * are `SUPER_ADMIN`, `TECH_LEAD`, `HR_MANAGER` and `DEPT_HEAD`; everyone may
 * read. The resolvers authorize; this service additionally enforces the
 * `DEPT_HEAD` department scope on both the current task and the target
 * assignee, records an audit event (plus a state transition for a duplicated
 * ticket), and the `tickets` live area is published through
 * `graphql/change-areas.ts`.
 */

import type { SQL } from "drizzle-orm";
import { and, asc, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Priority, TaskTypeValue, TicketStateCode } from "../db/enums";
import type { TaskRow } from "../db/schema";
import { tasks } from "../db/schema";
import { type DataScope, scopedDepartmentId } from "../graphql/access";
import type { ViewerContext } from "../graphql/context";
import { DomainError } from "../graphql/errors";
import { parseDate } from "../graphql/shapes";
import { recordAuditEvent } from "./audit";
import {
	appendScope,
	insertTask,
	loadTaskRow,
	nextTaskCode,
	requireActiveUser,
	requireActor,
	requireDepartment,
	requireTaskRow,
	writeTransition,
} from "./tasks";

const MODULE = "jobs" as const;

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export interface ScheduleInput {
	departmentId?: string | null;
	fromDate: string | Date;
	toDate: string | Date;
	state?: TicketStateCode | null;
}

export interface UpdateTaskInput {
	taskId: string;
	title?: string | null;
	description?: string | null;
	taskType?: TaskTypeValue | null;
	priority?: Priority | null;
	assignedToId?: string | null;
	departmentId?: string | null;
	startDate?: string | Date | null;
	endDate?: string | Date | null;
	isUrgentHourly?: boolean | null;
}

export interface DuplicateTaskInput {
	taskId: string;
	assignedToId?: string | null;
	startDate?: string | Date | null;
}

/* ------------------------------------------------------------------ */
/* Shared read conditions                                              */
/* ------------------------------------------------------------------ */

/**
 * Conditions every schedule read shares: non-deleted tickets, the caller's
 * scope, the optional department/state filters, and the overlap of the
 * ticket's interval with `[fromDate, toDate)`.
 *
 * A ticket without an end date is open-ended and only has to start before
 * `toDate`; a ticket without a start date is anchored on its end date. A
 * ticket without either date has no interval and is excluded.
 */
export function scheduleConditions(
	ctx: ViewerContext,
	scope: DataScope,
	input: ScheduleInput,
): SQL[] {
	const from = parseDate(input.fromDate);
	const to = parseDate(input.toDate);
	if (!from || !to) {
		throw new DomainError(
			"VALIDATION_FAILED",
			"The schedule range must be two valid dates.",
		);
	}
	if (to.getTime() <= from.getTime()) {
		throw new DomainError(
			"VALIDATION_FAILED",
			"toDate must be after fromDate.",
		);
	}

	const conditions: SQL[] = [isNull(tasks.deletedAt)];
	appendScope(conditions, ctx, scope);
	if (input.departmentId) {
		conditions.push(eq(tasks.departmentId, input.departmentId));
	}
	if (input.state) {
		conditions.push(eq(tasks.state, input.state));
	}

	const startsBeforeRangeEnd = or(
		and(isNotNull(tasks.startDate), lt(tasks.startDate, to)),
		and(
			isNull(tasks.startDate),
			isNotNull(tasks.endDate),
			lt(tasks.endDate, to),
		),
	);
	const endsAfterRangeStart = or(
		and(isNotNull(tasks.endDate), gt(tasks.endDate, from)),
		and(isNull(tasks.endDate), isNotNull(tasks.startDate)),
	);
	if (startsBeforeRangeEnd) conditions.push(startsBeforeRangeEnd);
	if (endsAfterRangeStart) conditions.push(endsAfterRangeStart);

	return conditions;
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

export async function listScheduledTasks(
	ctx: ViewerContext,
	scope: DataScope,
	input: ScheduleInput,
): Promise<TaskRow[]> {
	return ctx.db
		.select()
		.from(tasks)
		.where(and(...scheduleConditions(ctx, scope, input)))
		.orderBy(
			sql`${tasks.startDate} is null`,
			asc(tasks.startDate),
			asc(tasks.endDate),
			asc(tasks.taskCode),
		);
}

/* ------------------------------------------------------------------ */
/* Edits                                                               */
/* ------------------------------------------------------------------ */

/** Parse a provided date input, or `null` to clear it. `undefined` = keep. */
function requireDate(
	value: string | Date | null | undefined,
	label: string,
): Date | null {
	if (value === null || value === undefined) return null;
	const parsed = parseDate(value);
	if (!parsed) {
		throw new DomainError("VALIDATION_FAILED", `${label} is not a valid date.`);
	}
	return parsed;
}

export async function updateTask(
	ctx: ViewerContext,
	scope: DataScope,
	input: UpdateTaskInput,
): Promise<TaskRow> {
	requireActor(ctx);
	const row = await requireTaskRow(ctx, scope, input.taskId);
	const scopedDeptId = scopedDepartmentId(ctx, scope);

	const now = new Date();
	const changes: Record<string, unknown> = { updatedAt: now };

	if (input.title !== undefined) {
		const title = (input.title ?? "").trim();
		if (title.length === 0) {
			throw new DomainError("VALIDATION_FAILED", "Task title is required.");
		}
		changes.title = title;
	}
	if (input.description !== undefined) {
		changes.description = input.description?.trim() || null;
	}

	const taskType = input.taskType ?? row.taskType;
	if (input.taskType !== undefined && input.taskType !== null) {
		changes.taskType = taskType;
	}
	if (input.priority !== undefined && input.priority !== null) {
		changes.priority = input.priority;
	}
	if (input.isUrgentHourly !== undefined && input.isUrgentHourly !== null) {
		changes.isUrgentHourly = taskType === "HOURLY" && input.isUrgentHourly;
	} else if (input.taskType !== undefined && taskType !== "HOURLY") {
		// Leaving the urgent-hourly category clears the marker.
		changes.isUrgentHourly = false;
	}

	let assignedTo = row.assignedTo;
	if (input.assignedToId !== undefined) {
		if (input.assignedToId === null || input.assignedToId === "") {
			assignedTo = null;
		} else {
			const assignee = await requireActiveUser(ctx, input.assignedToId);
			if (scopedDeptId && assignee.departmentId !== scopedDeptId) {
				throw new DomainError(
					"FORBIDDEN",
					"You can only assign tasks to members of your department.",
				);
			}
			assignedTo = assignee.id;
		}
		changes.assignedTo = assignedTo;
	}

	if (input.departmentId !== undefined && input.departmentId !== null) {
		if (input.departmentId !== row.departmentId) {
			await requireDepartment(ctx, input.departmentId);
			if (scopedDeptId && input.departmentId !== scopedDeptId) {
				throw new DomainError(
					"FORBIDDEN",
					"You can only manage tasks within your department.",
				);
			}
		}
		changes.departmentId = input.departmentId;
	}

	const startDate =
		input.startDate === undefined
			? row.startDate
			: requireDate(input.startDate, "startDate");
	const endDate =
		input.endDate === undefined
			? row.endDate
			: requireDate(input.endDate, "endDate");
	if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
		throw new DomainError(
			"VALIDATION_FAILED",
			"endDate must not be before startDate.",
		);
	}
	if (input.startDate !== undefined) changes.startDate = startDate;
	if (input.endDate !== undefined) changes.endDate = endDate;

	await ctx.db.update(tasks).set(changes).where(eq(tasks.id, row.id));

	await recordAuditEvent(ctx, {
		action: "task.update",
		moduleCode: MODULE,
		resourceType: "Task",
		resourceId: row.id,
		oldData: {
			title: row.title,
			description: row.description,
			taskType: row.taskType,
			priority: row.priority,
			assignedTo: row.assignedTo,
			departmentId: row.departmentId,
			startDate: row.startDate,
			endDate: row.endDate,
			isUrgentHourly: row.isUrgentHourly,
		},
		newData: {
			title: changes.title ?? row.title,
			description: changes.description ?? row.description,
			taskType: changes.taskType ?? row.taskType,
			priority: changes.priority ?? row.priority,
			assignedTo,
			departmentId: changes.departmentId ?? row.departmentId,
			startDate,
			endDate,
			isUrgentHourly:
				(changes.isUrgentHourly as boolean | undefined) ?? row.isUrgentHourly,
		},
	});

	const refreshed = await loadTaskRow(ctx, row.id);
	if (!refreshed) {
		throw new DomainError(
			"INTERNAL",
			"The updated task could not be read back.",
		);
	}
	return refreshed;
}

export async function deleteTask(
	ctx: ViewerContext,
	scope: DataScope,
	taskId: string,
): Promise<boolean> {
	requireActor(ctx);
	const row = await requireTaskRow(ctx, scope, taskId);

	const now = new Date();
	await ctx.db
		.update(tasks)
		.set({ deletedAt: now, updatedAt: now })
		.where(eq(tasks.id, row.id));

	await recordAuditEvent(ctx, {
		action: "task.delete",
		moduleCode: MODULE,
		resourceType: "Task",
		resourceId: row.id,
		oldData: {
			taskCode: row.taskCode,
			title: row.title,
			state: row.state,
			assignedTo: row.assignedTo,
			departmentId: row.departmentId,
		},
	});

	return true;
}

/**
 * Copy a ticket as a new `REQ` ticket at 0% progress with a fresh
 * `taskCode`, optionally onto another assignee and/or a new start date. The
 * duration of the source interval is preserved when both dates exist.
 */
export async function duplicateTask(
	ctx: ViewerContext,
	scope: DataScope,
	input: DuplicateTaskInput,
): Promise<TaskRow> {
	const actor = requireActor(ctx);
	const row = await requireTaskRow(ctx, scope, input.taskId);
	const scopedDeptId = scopedDepartmentId(ctx, scope);

	let assignedTo = row.assignedTo;
	if (
		input.assignedToId !== undefined &&
		input.assignedToId !== null &&
		input.assignedToId !== row.assignedTo
	) {
		const assignee = await requireActiveUser(ctx, input.assignedToId);
		if (scopedDeptId && assignee.departmentId !== scopedDeptId) {
			throw new DomainError(
				"FORBIDDEN",
				"You can only assign tasks to members of your department.",
			);
		}
		assignedTo = assignee.id;
	}

	const newStart =
		input.startDate === undefined || input.startDate === null
			? row.startDate
			: requireDate(input.startDate, "startDate");
	let newEnd = row.endDate;
	if (row.startDate && row.endDate && newStart) {
		const duration = row.endDate.getTime() - row.startDate.getTime();
		if (duration >= 0) {
			newEnd = new Date(newStart.getTime() + duration);
		}
	}

	const copy = await insertTask(ctx, {
		taskCode: await nextTaskCode(ctx),
		title: row.title,
		description: row.description,
		projectId: row.projectId,
		taskType: row.taskType as TaskTypeValue,
		priority: row.priority as Priority,
		createdBy: actor.id,
		assignedTo,
		departmentId: row.departmentId,
		startDate: newStart,
		endDate: newEnd,
		isUrgentHourly: row.isUrgentHourly,
	});

	await writeTransition(ctx, {
		taskId: copy.id,
		from: null,
		to: "REQ",
		actorId: actor.id,
		reason: `Duplicated from ${row.taskCode}.`,
	});
	await recordAuditEvent(ctx, {
		action: "task.duplicate",
		moduleCode: MODULE,
		resourceType: "Task",
		resourceId: copy.id,
		newData: {
			taskCode: copy.taskCode,
			title: copy.title,
			state: "REQ",
			duplicatedFrom: row.taskCode,
			assignedTo,
			departmentId: copy.departmentId,
		},
	});

	return copy;
}
