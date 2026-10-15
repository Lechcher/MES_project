/**
 * Jobs & Projects mock service — role-scoped reads and lifecycle-enforcing
 * mutations, all in memory. Mirrors `API_CONTACT_SPECIFICATION.md` §6.1 and the
 * state lifecycle `REQ → ACT → PEN → {APP | REJ}`, `CAN` anytime, `OVERDUE`
 * requiring a late-submission explanation before `PEN`.
 */

import {
  CURRENT_MONTH,
  CURRENT_YEAR,
  demoUsers,
  departmentById,
  nextId,
  state,
} from "../db";
import { primaryRole } from "../permissions";
import type {
  CancelTaskInput,
  Connection,
  CreateTaskInput,
  ExplainLateSubmissionInput,
  ExportFormat,
  LogTaskProgressInput,
  Project,
  RequestExtensionInput,
  ReviewTaskRequestInput,
  SubmitTaskReportInput,
  Task,
  TaskFilter,
  TaskOrderBy,
  TaskRequest,
  User,
} from "../types";
import { MockError } from "../types";
import {
  appendAudit,
  applyKpiEvent,
  buildExportResult,
  type MockExportDescriptor,
  departmentMembers,
  isOnTime,
  nextTaskCode,
  nowIso,
  paginate,
  requirePermission,
  syncTaskBadges,
  visibleTasks,
} from "./shared";

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export function listTasks(
  viewer: User | null,
  filter: TaskFilter = {},
  orderBy: TaskOrderBy = "CREATED_AT_DESC",
  offset = 0,
  limit = 20,
): Connection<Task> {
  let items = visibleTasks(viewer);
  items = applyTaskFilter(items, filter);
  items = sortTasks(items, orderBy);
  return paginate(items, offset, limit);
}

export function getTask(viewer: User | null, id: string): Task | null {
  const task = visibleTasks(viewer).find((t) => t.id === id);
  return task ?? null;
}

export function tasksForDay(
  viewer: User | null,
  dayIso: string,
  filter: TaskFilter = {},
): Task[] {
  const start = new Date(dayIso);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const items = applyTaskFilter(visibleTasks(viewer), {
    ...filter,
    endDateAfter: start.toISOString(),
    endDateBefore: end.toISOString(),
  });
  return sortTasks(items, "END_DATE_ASC");
}

/** The day's unconfirmed `REQ` tickets for the Daily Quick-add screen. */
export function quickAddTickets(viewer: User | null, dayIso: string): Task[] {
  return tasksForDay(viewer, dayIso, { state: "REQ" });
}

export function listProjects(
  viewer: User | null,
  filter: { departmentId?: string; isActive?: boolean; search?: string } = {},
  orderBy: "NAME_ASC" | "NAME_DESC" | "CREATED_AT_DESC" = "NAME_ASC",
  offset = 0,
  limit = 20,
): Connection<Project> {
  let items = [...state.projects];
  if (filter.isActive !== undefined) {
    items = items.filter((p) => p.isActive === filter.isActive);
  }
  if (filter.departmentId) {
    items = items.filter((p) => p.departmentId === filter.departmentId);
  }
  if (filter.search) {
    const q = filter.search.toLowerCase();
    items = items.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q),
    );
  }
  if (orderBy === "NAME_ASC") items.sort((a, b) => a.name.localeCompare(b.name));
  if (orderBy === "NAME_DESC")
    items.sort((a, b) => b.name.localeCompare(a.name));
  return paginate(items, offset, limit);
}

export function getProject(viewer: User | null, id: string): Project | null {
  void viewer;
  return state.projects.find((p) => p.id === id) ?? null;
}

/** Demo accounts (used by the sign-in page). */
export function listDemoAccounts(): User[] {
  return demoUsers();
}

/* -------------------------------------------------------------------------- */
/* Mutations                                                                  */
/* -------------------------------------------------------------------------- */

function getScopedTask(viewer: User | null, id: string): Task {
  const task = getTask(viewer, id);
  if (!task) {
    throw new MockError("NOT_FOUND", `Task ${id} was not found in scope.`);
  }
  return task;
}

function recordTransition(
  task: Task,
  from: Task["state"] | null,
  to: Task["state"],
  actor: User | null,
  reason?: string,
): void {
  task.stateTransitions.push({
    id: nextId("trans"),
    taskId: task.id,
    fromState: from,
    toState: to,
    actor,
    reason: reason ?? null,
    createdAt: nowIso(),
  });
}

function defaultDeadline(input: CreateTaskInput): {
  startDate: string | null;
  endDate: string;
} {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (input.taskType === "HOURLY") {
    const deadline = input.endDate
      ? new Date(input.endDate)
      : new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14, 0, 0, 0);
    return { startDate: input.startDate ?? null, endDate: deadline.toISOString() };
  }
  if (input.taskType === "DAILY") {
    const deadline = input.endDate
      ? new Date(input.endDate)
      : new Date(today.getFullYear(), today.getMonth(), today.getDate(), 17, 0, 0, 0);
    return { startDate: input.startDate ?? null, endDate: deadline.toISOString() };
  }
  const start = input.startDate
    ? new Date(input.startDate)
    : new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 30, 0, 0);
  const end = input.endDate
    ? new Date(input.endDate)
    : new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3, 17, 0, 0, 0);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

function buildTask(
  creator: User,
  input: CreateTaskInput,
  assignee: User | null,
): Task {
  const { startDate, endDate } = defaultDeadline(input);
  const project =
    state.projects.find((p) => p.id === input.projectId) ??
    state.projects.find((p) => p.code === "PRJ-GEN") ??
    null;
  const department =
    departmentById(input.departmentId ?? assignee?.departmentId ?? null) ??
    assignee?.department ??
    null;
  const task: Task = {
    id: nextId("task"),
    taskCode: nextTaskCode(),
    title: input.title,
    description: input.description ?? null,
    projectId: project?.id ?? null,
    project,
    taskType: input.taskType,
    priority: input.priority ?? "MEDIUM",
    state: "REQ",
    createdBy: creator,
    assignedTo: assignee,
    assignedToId: assignee?.id ?? null,
    departmentId: department?.id ?? null,
    department,
    startDate,
    endDate,
    extendedDeadline: null,
    progressPercentage: 0,
    isUrgentHourly: input.isUrgentHourly ?? false,
    isExtensionRequested: false,
    isOverdue: false,
    isLateSubmission: false,
    badges: [],
    approvedBy: null,
    approvedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    progressLogs: [],
    stateTransitions: [],
    requests: [],
    attachments: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  recordTransition(task, null, "REQ", creator);
  state.tasks.push(task);
  return task;
}

export function createTask(viewer: User | null, input: CreateTaskInput): Task {
  const creator = requirePermission(
    viewer,
    "jobs.ticket.create",
    "You do not have permission to create tickets.",
  );
  if (!input.title.trim()) {
    throw new MockError("VALIDATION_FAILED", "A ticket title is required.", {
      field: "title",
    });
  }

  const assignee = input.assignedToId
    ? state.users.find((u) => u.id === input.assignedToId) ?? null
    : creator;

  const department = departmentById(
    input.departmentId ?? assignee?.departmentId ?? null,
  );

  // Auto-forking Engine: replicate to the department's active members.
  if (input.autoForking && department?.autoForkingEnabled) {
    const members = departmentMembers(department.id);
    if (members.length > 0) {
      const created = members.map((member) =>
        buildTask(creator, { ...input, departmentId: department.id }, member),
      );
      appendAudit(creator, {
        moduleCode: "jobs",
        action: "TASK_CREATE",
        resourceType: "TASK",
        resourceId: created[0].id,
        newData: {
          taskCode: created[0].taskCode,
          autoForked: created.length,
          department: department.code,
        },
      });
      return created[0];
    }
  }

  const task = buildTask(creator, input, assignee);
  appendAudit(creator, {
    moduleCode: "jobs",
    action: "TASK_CREATE",
    resourceType: "TASK",
    resourceId: task.id,
    newData: { taskCode: task.taskCode, state: task.state },
  });
  return task;
}

export function acceptTask(viewer: User | null, taskId: string): Task {
  const actor = requirePermission(
    viewer,
    "jobs.ticket.accept_report",
    "You do not have permission to accept tasks.",
  );
  const task = getScopedTask(viewer, taskId);
  if (task.state !== "REQ") {
    throw new MockError(
      "STATE_TRANSITION_INVALID",
      `Only a REQ ticket can be accepted (current state ${task.state}).`,
    );
  }
  task.state = "ACT";
  task.updatedAt = nowIso();
  recordTransition(task, "REQ", "ACT", actor);
  syncTaskBadges(task);
  appendAudit(actor, {
    moduleCode: "jobs",
    action: "TASK_ACCEPT",
    resourceType: "TASK",
    resourceId: task.id,
    oldData: { state: "REQ" },
    newData: { state: "ACT" },
  });
  return task;
}

export function logTaskProgress(
  viewer: User | null,
  input: LogTaskProgressInput,
): Task {
  const actor = requirePermission(
    viewer,
    "jobs.ticket.accept_report",
    "You do not have permission to log progress.",
  );
  const task = getScopedTask(viewer, input.taskId);
  if (task.state !== "ACT") {
    throw new MockError(
      "STATE_TRANSITION_INVALID",
      `Progress can only be logged on an ACT ticket (current state ${task.state}).`,
    );
  }
  if (input.newPercentage < 0 || input.newPercentage > 100) {
    throw new MockError(
      "VALIDATION_FAILED",
      "Progress must be between 0 and 100.",
    );
  }
  const previous = task.progressPercentage;
  task.progressLogs.push({
    id: nextId("plog"),
    taskId: task.id,
    user: actor,
    previousPercentage: previous,
    newPercentage: input.newPercentage,
    logComment: input.logComment ?? null,
    isVerifiedByManager: false,
    createdAt: nowIso(),
  });
  task.progressPercentage = input.newPercentage;
  task.updatedAt = nowIso();
  syncTaskBadges(task);
  appendAudit(actor, {
    moduleCode: "jobs",
    action: "TASK_PROGRESS_LOG",
    resourceType: "TASK",
    resourceId: task.id,
    oldData: { progressPercentage: previous },
    newData: { progressPercentage: input.newPercentage },
  });
  return task;
}

export function submitTaskReport(
  viewer: User | null,
  input: SubmitTaskReportInput,
): Task {
  const actor = requirePermission(
    viewer,
    "jobs.ticket.accept_report",
    "You do not have permission to submit a report.",
  );
  const task = getScopedTask(viewer, input.taskId);
  if (task.state === "OVERDUE") {
    throw new MockError(
      "STATE_TRANSITION_INVALID",
      "Complete is locked on an OVERDUE ticket; report a late submission instead.",
    );
  }
  if (task.state !== "ACT") {
    throw new MockError(
      "STATE_TRANSITION_INVALID",
      `Only an ACT ticket can be submitted (current state ${task.state}).`,
    );
  }
  task.state = "PEN";
  task.progressPercentage = 100;
  task.updatedAt = nowIso();
  recordTransition(task, "ACT", "PEN", actor, input.reportComment);
  syncTaskBadges(task);
  appendAudit(actor, {
    moduleCode: "jobs",
    action: "TASK_SUBMIT_REPORT",
    resourceType: "TASK",
    resourceId: task.id,
    oldData: { state: "ACT" },
    newData: { state: "PEN" },
  });
  return task;
}

export function approveTask(viewer: User | null, taskId: string): Task {
  const actor = requirePermission(
    viewer,
    "jobs.ticket.approve_return",
    "You do not have permission to approve reports.",
  );
  const task = getScopedTask(viewer, taskId);
  if (task.state !== "PEN") {
    throw new MockError(
      "STATE_TRANSITION_INVALID",
      `Only a PEN ticket can be approved (current state ${task.state}).`,
    );
  }
  const approvedAt = nowIso();
  const onTime = isOnTime(task, approvedAt);
  task.state = "APP";
  task.approvedBy = actor;
  task.approvedAt = approvedAt;
  task.updatedAt = approvedAt;
  recordTransition(task, "PEN", "APP", actor);
  syncTaskBadges(task);

  const assignee = task.assignedTo;
  if (assignee) {
    if (onTime) {
      applyKpiEvent(
        assignee,
        task.priority === "URGENT" || task.isUrgentHourly
          ? "KPI_ON_TIME_URGENT"
          : "KPI_ON_TIME_TICKET",
        task.id,
      );
    }
    const wasReturned = task.stateTransitions.some((t) => t.toState === "REJ");
    if (!wasReturned) {
      applyKpiEvent(assignee, "KPI_FIRST_TIME_APPROVAL", task.id);
    }
  }

  appendAudit(actor, {
    moduleCode: "jobs",
    action: "TASK_APPROVE",
    resourceType: "TASK",
    resourceId: task.id,
    oldData: { state: "PEN" },
    newData: { state: "APP", onTime },
  });
  return task;
}

export function returnTask(
  viewer: User | null,
  taskId: string,
  reason: string,
): Task {
  const actor = requirePermission(
    viewer,
    "jobs.ticket.approve_return",
    "You do not have permission to return reports.",
  );
  if (!reason.trim()) {
    throw new MockError("RULE_VIOLATION", "A return reason is required.");
  }
  const task = getScopedTask(viewer, taskId);
  if (task.state !== "PEN") {
    throw new MockError(
      "STATE_TRANSITION_INVALID",
      `Only a PEN ticket can be returned (current state ${task.state}).`,
    );
  }
  task.state = "REJ";
  task.reviewedBy = actor;
  task.reviewedAt = nowIso();
  task.updatedAt = task.reviewedAt;
  recordTransition(task, "PEN", "REJ", actor, reason);
  syncTaskBadges(task);

  if (task.assignedTo) {
    applyKpiEvent(task.assignedTo, "KPI_RETURNED_TICKET", task.id);
  }

  appendAudit(actor, {
    moduleCode: "jobs",
    action: "TASK_RETURN",
    resourceType: "TASK",
    resourceId: task.id,
    oldData: { state: "PEN" },
    newData: { state: "REJ", reason },
  });
  return task;
}

export function cancelTask(viewer: User | null, input: CancelTaskInput): Task {
  const actor = requirePermission(
    viewer,
    "jobs.ticket.cancel",
    "You do not have permission to cancel tickets.",
  );
  if (!input.reason.trim()) {
    throw new MockError("RULE_VIOLATION", "A cancellation reason is required.");
  }
  const task = getScopedTask(viewer, input.taskId);
  if (task.state === "APP" || task.state === "CAN") {
    throw new MockError(
      "STATE_TRANSITION_INVALID",
      `A ${task.state} ticket cannot be cancelled.`,
    );
  }
  const from = task.state;
  task.state = "CAN";
  task.updatedAt = nowIso();
  recordTransition(task, from, "CAN", actor, input.reason);
  syncTaskBadges(task);
  appendAudit(actor, {
    moduleCode: "jobs",
    action: "TASK_CANCEL",
    resourceType: "TASK",
    resourceId: task.id,
    oldData: { state: from },
    newData: { state: "CAN", reason: input.reason },
  });
  return task;
}

export function requestExtension(
  viewer: User | null,
  input: RequestExtensionInput,
): TaskRequest {
  const actor = requirePermission(
    viewer,
    "jobs.ticket.request_extension",
    "You do not have permission to request an extension.",
  );
  const task = getScopedTask(viewer, input.taskId);
  if (task.state !== "ACT") {
    throw new MockError(
      "STATE_TRANSITION_INVALID",
      "An extension can only be requested on an ACT ticket.",
    );
  }
  if (task.endDate && new Date(input.requestedDeadline) <= new Date(task.endDate)) {
    throw new MockError(
      "RULE_VIOLATION",
      "The requested deadline must be after the current deadline.",
    );
  }
  if (task.endDate && new Date() > new Date(task.endDate)) {
    throw new MockError(
      "RULE_VIOLATION",
      "An extension must be requested before the deadline passes.",
    );
  }
  if (!input.reason.trim()) {
    throw new MockError("RULE_VIOLATION", "An extension reason is required.");
  }
  const request: TaskRequest = {
    id: nextId("req"),
    taskId: task.id,
    user: actor,
    requestType: "EXTENSION",
    requestedDeadline: input.requestedDeadline,
    reason: input.reason,
    status: "PENDING",
    reviewedBy: null,
    reviewComment: null,
    reviewedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  task.requests.push(request);
  task.isExtensionRequested = true;
  task.updatedAt = nowIso();
  syncTaskBadges(task);

  if (task.assignedTo) {
    applyKpiEvent(task.assignedTo, "KPI_EXTENSION_REQUEST", task.id);
  }
  appendAudit(actor, {
    moduleCode: "jobs",
    action: "TASK_EXTENSION_REQUEST",
    resourceType: "TASK_REQUEST",
    resourceId: request.id,
    newData: { requestedDeadline: input.requestedDeadline },
  });
  return request;
}

export function explainLateSubmission(
  viewer: User | null,
  input: ExplainLateSubmissionInput,
): TaskRequest {
  const actor = requirePermission(
    viewer,
    "jobs.ticket.request_extension",
    "You do not have permission to explain a late submission.",
  );
  const task = getScopedTask(viewer, input.taskId);
  if (task.state !== "OVERDUE") {
    throw new MockError(
      "STATE_TRANSITION_INVALID",
      "A late submission can only be reported on an OVERDUE ticket.",
    );
  }
  if (!input.reason.trim()) {
    throw new MockError("RULE_VIOLATION", "An explanation is required.");
  }
  const request: TaskRequest = {
    id: nextId("req"),
    taskId: task.id,
    user: actor,
    requestType: "LATE_EXPLANATION",
    requestedDeadline: null,
    reason: input.reason,
    status: "PENDING",
    reviewedBy: null,
    reviewComment: null,
    reviewedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  task.requests.push(request);
  task.state = "PEN";
  task.isLateSubmission = true;
  task.isOverdue = false;
  task.updatedAt = nowIso();
  recordTransition(task, "OVERDUE", "PEN", actor, "Late Submission");
  syncTaskBadges(task);
  appendAudit(actor, {
    moduleCode: "jobs",
    action: "TASK_LATE_EXPLANATION",
    resourceType: "TASK_REQUEST",
    resourceId: request.id,
    newData: { state: "PEN", lateSubmission: true },
  });
  return request;
}

export function findTaskRequest(requestId: string): {
  request: TaskRequest;
  task: Task;
} | null {
  for (const task of state.tasks) {
    const request = task.requests.find((r) => r.id === requestId);
    if (request) return { request, task };
  }
  return null;
}

export function reviewTaskRequest(
  viewer: User | null,
  input: ReviewTaskRequestInput,
): TaskRequest {
  const actor = requirePermission(
    viewer,
    "jobs.ticket.approve_return",
    "You do not have permission to review requests.",
  );
  const found = findTaskRequest(input.requestId);
  if (!found) {
    throw new MockError("NOT_FOUND", `Request ${input.requestId} not found.`);
  }
  const { request, task } = found;
  if (request.status !== "PENDING") {
    throw new MockError("CONFLICT", "This request has already been reviewed.");
  }
  request.status = input.decision;
  request.reviewedBy = actor;
  request.reviewedAt = nowIso();
  request.reviewComment = input.reviewComment ?? null;
  request.updatedAt = nowIso();

  if (request.requestType === "EXTENSION") {
    if (input.decision === "APPROVED" && request.requestedDeadline) {
      task.extendedDeadline = request.requestedDeadline;
      task.endDate = request.requestedDeadline;
    }
    task.isExtensionRequested = false;
    task.updatedAt = nowIso();
    syncTaskBadges(task);
  }

  appendAudit(actor, {
    moduleCode: "jobs",
    action: "TASK_REQUEST_REVIEW",
    resourceType: "TASK_REQUEST",
    resourceId: request.id,
    newData: { decision: input.decision },
  });
  return request;
}

/* -------------------------------------------------------------------------- */
/* Print / export (mock results)                                              */
/* -------------------------------------------------------------------------- */

export function printTaskSlip(
  viewer: User | null,
  taskId: string,
): MockExportDescriptor {
  const actor = requirePermission(
    viewer,
    "jobs.ticket.print_export",
    "You do not have permission to print ticket slips.",
  );
  const task = getScopedTask(viewer, taskId);
  appendAudit(actor, {
    moduleCode: "jobs",
    action: "TASK_PRINT_SLIP",
    resourceType: "TASK",
    resourceId: task.id,
  });
  return buildExportResult({
    fileName: `assignment-slip-${task.taskCode}.pdf`,
    format: "PDF",
    scopeNote:
      primaryRole(viewer) === "EMPLOYEE"
        ? "Personal ticket"
        : `Ticket ${task.taskCode}`,
  });
}

export function exportTasks(
  viewer: User | null,
  filter: TaskFilter = {},
  format: ExportFormat = "XLSX",
): MockExportDescriptor {
  const actor = requirePermission(
    viewer,
    "jobs.ticket.print_export",
    "You do not have permission to export task data.",
  );
  const items = sortTasks(
    applyTaskFilter(visibleTasks(viewer), filter),
    "CREATED_AT_DESC",
  );
  appendAudit(actor, {
    moduleCode: "jobs",
    action: "TASK_EXPORT",
    resourceType: "TASK",
    newData: { count: items.length, format },
  });
  const role = primaryRole(viewer);
  const scopeNote =
    role === "EMPLOYEE"
      ? "Personal tickets only"
      : role === "DEPT_HEAD"
        ? "Department tickets"
        : "Company tickets";
  return buildExportResult({
    fileName: `task-list-${CURRENT_YEAR}-${String(CURRENT_MONTH).padStart(2, "0")}.${format.toLowerCase()}`,
    format,
    scopeNote: `${scopeNote} (${items.length} rows)`,
  });
}

/* -------------------------------------------------------------------------- */
/* Filtering / sorting helpers                                                */
/* -------------------------------------------------------------------------- */

function applyTaskFilter(items: Task[], filter: TaskFilter): Task[] {
  let result = items;
  if (filter.projectId) {
    result = result.filter((t) => t.projectId === filter.projectId);
  }
  if (filter.departmentId) {
    result = result.filter((t) => t.departmentId === filter.departmentId);
  }
  if (filter.assignedToId) {
    result = result.filter((t) => t.assignedToId === filter.assignedToId);
  }
  if (filter.state) {
    result = result.filter((t) => t.state === filter.state);
  }
  if (filter.taskType) {
    result = result.filter((t) => t.taskType === filter.taskType);
  }
  if (filter.priority) {
    result = result.filter((t) => t.priority === filter.priority);
  }
  if (filter.isOverdue !== undefined) {
    result = result.filter((t) => t.isOverdue === filter.isOverdue);
  }
  if (filter.isUrgentHourly !== undefined) {
    result = result.filter((t) => t.isUrgentHourly === filter.isUrgentHourly);
  }
  if (filter.endDateBefore) {
    result = result.filter(
      (t) => t.endDate !== null && new Date(t.endDate) < new Date(filter.endDateBefore!),
    );
  }
  if (filter.endDateAfter) {
    result = result.filter(
      (t) => t.endDate !== null && new Date(t.endDate) >= new Date(filter.endDateAfter!),
    );
  }
  if (filter.search) {
    const q = filter.search.toLowerCase();
    result = result.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.taskCode.toLowerCase().includes(q),
    );
  }
  return result;
}

const PRIORITY_RANK: Record<Task["priority"], number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function sortTasks(items: Task[], orderBy: TaskOrderBy): Task[] {
  const sorted = [...items];
  switch (orderBy) {
    case "END_DATE_ASC":
      sorted.sort(
        (a, b) => new Date(a.endDate ?? 0).getTime() - new Date(b.endDate ?? 0).getTime(),
      );
      break;
    case "PRIORITY_DESC":
      sorted.sort(
        (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
      );
      break;
    case "STATE_ASC":
      sorted.sort((a, b) => a.state.localeCompare(b.state));
      break;
    default:
      sorted.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }
  return sorted;
}
