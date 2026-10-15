/**
 * services/jobs.ts — Jobs & Projects mock service.
 *
 * Role-scoped paginated reads and lifecycle mutations, all in-memory, zero
 * network calls. Mirrors the GraphQL contract operations in
 * API_CONTACT_SPECIFICATION.md §6.1.
 */

import type {
  Task,
  Project,
  TaskConnection,
  ProjectConnection,
  TaskStateTransition,
  TaskProgressLog,
  TaskRequest,
  Attachment,
  User,
  TicketStateCode,
  TaskType,
  Priority,
  TaskRequestType,
  ApprovalStatus,
  ExportFormat,
} from "../types";
import {
  tasks,
  taskById,
  taskRequestById,
  attachmentById,
  users,
  userById,
  departments,
  projects,
  projectById,
  DEMO_ACCOUNTS,
  id,
  iso,
  now,
  clamp,
} from "../db";
import { can } from "../session";
import { paginate, mockExportResult } from "./shared";
import {
  TICKET_STATE_BY_CODE,
  TICKET_STATE_CODES,
  STATE_COLOR_HEX,
} from "../registries";

/*──────────────────────────── role scopes ────────────────────────────────────*/

const JOB_SCOPES: Record<string, string> = {
  SUPER_ADMIN: "ALL",
  TECH_LEAD: "ALL",
  HR_MANAGER: "COMPANY_WIDE",
  DEPT_HEAD: "DEPARTMENT_ONLY",
  EMPLOYEE: "PERSONAL",
};

function viewerDepartmentId(viewer: User | null): string | null {
  return viewer?.department?.id || null;
}

function scopeTasks(viewer: User | null): Task[] {
  const scope = JOB_SCOPES[viewer?.roles[0]?.code || "EMPLOYEE"];
  switch (scope) {
    case "ALL":
    case "COMPANY_WIDE":
      return tasks;
    case "DEPARTMENT_ONLY": {
      const deptId = viewerDepartmentId(viewer);
      return tasks.filter((t) => t.department?.id === deptId);
    }
    case "PERSONAL":
    default:
      return tasks.filter((t) => t.assignedTo?.id === viewer?.id);
  }
}

/*──────────────────────────── reads ──────────────────────────────────────────*/

export function listProjects(): Project[] {
  return projects.filter((p) => p.isActive);
}

export function getProject(id: string): Project | null {
  return projectById[id] || null;
}

export function listTasks(viewer: User | null, filter: {
  projectId?: string;
  departmentId?: string;
  assignedToId?: string;
  state?: TicketStateCode;
  taskType?: TaskType;
  priority?: Priority;
  isOverdue?: boolean;
  isUrgentHourly?: boolean;
  endDateBefore?: string;
  endDateAfter?: string;
  search?: string;
  offset?: number;
  limit?: number;
  orderBy?: string;
} = {}): TaskConnection {
  const {
    offset = 0,
    limit = 20,
    orderBy = "CREATED_AT_DESC",
  } = filter;

  const scoped = scopeTasks(viewer);

  let result = scoped.filter((t) => {
    if (filter.projectId && t.project?.id !== filter.projectId) return false;
    if (filter.departmentId && t.department?.id !== filter.departmentId)
      return false;
    if (filter.assignedToId && t.assignedTo?.id !== filter.assignedToId)
      return false;
    if (filter.state && t.state !== filter.state) return false;
    if (filter.taskType && t.taskType !== filter.taskType) return false;
    if (filter.priority && t.priority !== filter.priority) return false;
    if (filter.isUrgentHourly !== undefined && t.isUrgentHourly !== filter.isUrgentHourly)
      return false;
    if (filter.isOverdue !== undefined && t.isOverdue !== filter.isOverdue)
      return false;
    if (filter.endDateBefore && t.endDate && t.endDate < filter.endDateBefore)
      return false;
    if (filter.endDateAfter && t.endDate && t.endDate > filter.endDateAfter)
      return false;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      const haystack = [
        t.taskCode,
        t.title,
        t.description,
        t.assignedTo?.fullName,
        t.department?.name,
        t.project?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  result.sort((a, b) => {
    switch (orderBy) {
      case "END_DATE_ASC":
        return (a.endDate || "").localeCompare(b.endDate || "");
      case "PRIORITY_DESC": {
        const rank: Record<string, number> = { URGENT: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
        return rank[b.priority] - rank[a.priority];
      }
      case "STATE_ASC":
        return a.state.localeCompare(b.state);
      case "CREATED_AT_DESC":
      default:
        return (b.createdAt || "").localeCompare(a.createdAt || "");
    }
  });

  return paginate(result, offset, limit);
}

export function getTask(viewer: User | null, id: string): Task | null {
  const task = taskById[id];
  if (!task) return null;
  const scope = JOB_SCOPES[viewer?.roles[0]?.code || "EMPLOYEE"];
  if (scope === "PERSONAL" && task.assignedTo?.id !== viewer?.id) return null;
  if (scope === "DEPARTMENT_ONLY" && task.department?.id !== viewerDepartmentId(viewer))
    return null;
  return task;
}

export function getTaskStates() {
  return Object.values(TICKET_STATE_BY_CODE);
}

/*──────────────────────────── mutations ──────────────────────────────────────*/

interface TransitionResult {
  task: Task;
  transition: TaskStateTransition;
}

function appendTransition(
  task: Task,
  toState: TicketStateCode,
  actor: User,
  reason: string | null,
): TaskStateTransition {
  const transition: TaskStateTransition = {
    id: id(),
    task,
    fromState: task.state,
    toState,
    actor,
    reason,
    createdAt: iso(now()),
  };
  task.stateTransitions.push(transition);
  task.state = toState;
  task.updatedAt = iso(now());
  return transition;
}

export function acceptTask(taskId: string, actor: User): Task {
  const task = taskById[taskId];
  if (!task) throw new Error("Task not found");
  if (task.state !== "REQ") {
    throw new Error("Only a REQ ticket can be accepted");
  }
  // employee may only accept their own; others may accept any in scope
  if (
    actor.roles.some((r) => r.code === "EMPLOYEE") &&
    task.assignedTo?.id !== actor.id
  ) {
    throw new Error("Employee can only accept their own ticket");
  }
  appendTransition(task, "ACT", actor, "Accepted for implementation");
  return task;
}

export function submitTaskReport(taskId: string, actor: User): Task {
  const task = taskById[taskId];
  if (!task) throw new Error("Task not found");
  if (task.state !== "ACT") {
    throw new Error("Only an ACT ticket can be submitted");
  }
  appendTransition(task, "PEN", actor, "Report submitted");
  return task;
}

export function approveTask(taskId: string, actor: User): Task {
  const task = taskById[taskId];
  if (!task) throw new Error("Task not found");
  if (task.state !== "PEN") {
    throw new Error("Only a PEN ticket can be approved");
  }
  appendTransition(task, "APP", actor, "Approved as-is");
  task.approvedBy = actor;
  task.approvedAt = iso(now());
  return task;
}

export function returnTask(taskId: string, actor: User, reason: string): Task {
  const task = taskById[taskId];
  if (!task) throw new Error("Task not found");
  if (task.state !== "PEN") {
    throw new Error("Only a PEN ticket can be returned");
  }
  if (!reason) throw new Error("Return reason is mandatory");
  appendTransition(task, "REJ", actor, `Returned: ${reason}`);
  task.reviewedBy = actor;
  task.reviewedAt = iso(now());
  return task;
}

export function cancelTask(taskId: string, actor: User, reason: string): Task {
  const task = taskById[taskId];
  if (!task) throw new Error("Task not found");
  if (task.state === "CAN") throw new Error("Ticket already cancelled");
  if (task.state === "APP") {
    throw new Error("Approved tickets cannot be cancelled");
  }
  if (!reason) throw new Error("Cancel reason is mandatory");
  // Employee may only cancel their own ticket
  if (
    actor.roles.some((r) => r.code === "EMPLOYEE") &&
    task.assignedTo?.id !== actor.id
  ) {
    throw new Error("Employee can only cancel their own ticket");
  }
  appendTransition(task, "CAN", actor, `Cancelled: ${reason}`);
  return task;
}

export function logTaskProgress(
  taskId: string,
  actor: User,
  input: { newPercentage: number; logComment?: string; attachmentIds?: string[] },
): Task {
  const task = taskById[taskId];
  if (!task) throw new Error("Task not found");
  const previous = task.progressPercentage;
  const next = clamp(input.newPercentage, 0, 100);
  const log: TaskProgressLog = {
    id: id(),
    task,
    user: actor,
    previousPercentage: previous,
    newPercentage: next,
    logComment: input.logComment ?? null,
    isVerifiedByManager: false,
    createdAt: iso(now()),
  };
  task.progressLogs.push(log);
  task.progressPercentage = next;
  task.updatedAt = iso(now());

  // multi-day badge logic
  if (task.taskType === "MULTI_DAY") {
    if (next >= 25 && next < 50 && !task.badges.includes("PROGRESS_UPDATE"))
      task.badges.push("PROGRESS_UPDATE");
    if (next >= 50 && next < 75 && !task.badges.includes("PROGRESS_UPDATE"))
      task.badges.push("PROGRESS_UPDATE");
    if (next >= 75 && next < 100 && !task.badges.includes("AWAITING_PROGRESS_VERIFICATION"))
      task.badges.push("AWAITING_PROGRESS_VERIFICATION");
    if (next === 100 && !task.badges.includes("AWAITING_PROGRESS_VERIFICATION"))
      task.badges.push("AWAITING_PROGRESS_VERIFICATION");
  }

  if (input.attachmentIds) {
    for (const attId of input.attachmentIds) {
      const att = attachmentById[attId];
      if (att && !task.attachments.includes(att)) task.attachments.push(att);
    }
  }
  return task;
}

export function requestExtension(
  taskId: string,
  actor: User,
  input: { requestedDeadline: string; reason: string; attachmentIds?: string[] },
): TaskRequest {
  const task = taskById[taskId];
  if (!task) throw new Error("Task not found");
  const request: TaskRequest = {
    id: id(),
    task,
    user: actor,
    requestType: "EXTENSION",
    requestedDeadline: input.requestedDeadline,
    reason: input.reason,
    status: "PENDING",
    reviewedBy: null,
    reviewComment: null,
    reviewedAt: null,
    createdAt: iso(now()),
    updatedAt: iso(now()),
  };
  taskRequestById[request.id] = request;
  task.requests.push(request);
  task.isExtensionRequested = true;
  task.updatedAt = iso(now());
  return request;
}

export function explainLateSubmission(
  taskId: string,
  actor: User,
  input: { reason: string; attachmentIds?: string[] },
): TaskRequest {
  const task = taskById[taskId];
  if (!task) throw new Error("Task not found");
  const request: TaskRequest = {
    id: id(),
    task,
    user: actor,
    requestType: "LATE_EXPLANATION",
    requestedDeadline: null,
    reason: input.reason,
    status: "PENDING",
    reviewedBy: null,
    reviewComment: null,
    reviewedAt: null,
    createdAt: iso(now()),
    updatedAt: iso(now()),
  };
  taskRequestById[request.id] = request;
  task.requests.push(request);
  task.updatedAt = iso(now());
  return request;
}

export function reviewTaskRequest(
  requestId: string,
  actor: User,
  input: { decision: ApprovalStatus; reviewComment?: string },
): TaskRequest {
  const request = taskRequestById[requestId];
  if (!request) throw new Error("Request not found");
  if (request.status !== "PENDING") {
    throw new Error("Request already reviewed");
  }
  request.status = input.decision;
  request.reviewedBy = actor;
  request.reviewComment = input.reviewComment ?? null;
  request.reviewedAt = iso(now());
  request.updatedAt = iso(now());

  if (request.requestType === "EXTENSION" && input.decision === "APPROVED") {
    request.task.extendedDeadline = request.requestedDeadline ?? null;
    request.task.isExtensionRequested = false;
  }
  request.task.updatedAt = iso(now());
  return request;
}

export function createTask(
  actor: User,
  input: {
    title: string;
    description?: string;
    projectId?: string;
    taskType: TaskType;
    priority: Priority;
    assignedToId?: string;
    departmentId?: string;
    startDate?: string;
    endDate?: string;
    isUrgentHourly?: boolean;
  },
): Task {
  // Employees cannot create tasks
  if (actor.roles.some((r) => r.code === "EMPLOYEE")) {
    throw new Error("Employee cannot create tickets");
  }
  const project = input.projectId ? projectById[input.projectId] : undefined;
  const department = input.departmentId
    ? departments.find((d) => d.id === input.departmentId) || undefined
    : project?.department;
  const assignedTo = input.assignedToId ? userById[input.assignedToId] : undefined;
  const task: Task = {
    id: id(),
    taskCode: `T-${Math.floor(1000 + Math.random() * 9000)}`,
    title: input.title,
    description: input.description ?? null,
    project: project ?? null,
    taskType: input.taskType,
    priority: input.priority,
    state: "REQ",
    createdBy: actor,
    assignedTo: assignedTo ?? null,
    department: department ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    extendedDeadline: null,
    progressPercentage: 0,
    isUrgentHourly: input.isUrgentHourly ?? false,
    isExtensionRequested: false,
    isOverdue: false,
    badges: [],
    approvedBy: null,
    approvedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    progressLogs: [],
    stateTransitions: [],
    requests: [],
    attachments: [],
    createdAt: iso(now()),
    updatedAt: iso(now()),
  };
  tasks.push(task);
  taskById[task.id] = task;

  // Auto-forking: replicate to department members
  if (department?.autoForkingEnabled && department.manager) {
    const members = users.filter(
      (u) => u.department?.id === department.id && u.id !== actor.id,
    );
    for (const member of members) {
      const replica: Task = { ...task, id: id(), taskCode: `T-${Math.floor(1000 + Math.random() * 9000)}`, assignedTo: member, createdBy: actor, stateTransitions: [], progressLogs: [], requests: [], attachments: [], createdAt: iso(now()), updatedAt: iso(now()) };
      tasks.push(replica);
      taskById[replica.id] = replica;
    }
  }

  appendTransition(task, "REQ", actor, "Allocated");
  return task;
}

export function printTaskSlip(taskId: string) {
  const task = taskById[taskId];
  if (!task) throw new Error("Task not found");
  return mockExportResult(
    `task-slip-${task.taskCode}.pdf`,
    "application/pdf",
    "PDF",
  );
}

export function exportTasks(viewer: User | null, filter: {
  projectId?: string;
  departmentId?: string;
  assignedToId?: string;
  state?: TicketStateCode;
  taskType?: TaskType;
  priority?: Priority;
  isOverdue?: boolean;
  isUrgentHourly?: boolean;
  search?: string;
  format?: ExportFormat;
}): { result: ReturnType<typeof mockExportResult>; count: number } {
  const scoped = scopeTasks(viewer);
  let result = scoped.filter((t) => {
    if (filter.projectId && t.project?.id !== filter.projectId) return false;
    if (filter.departmentId && t.department?.id !== filter.departmentId)
      return false;
    if (filter.assignedToId && t.assignedTo?.id !== filter.assignedToId)
      return false;
    if (filter.state && t.state !== filter.state) return false;
    if (filter.taskType && t.taskType !== filter.taskType) return false;
    if (filter.priority && t.priority !== filter.priority) return false;
    if (filter.isUrgentHourly !== undefined && t.isUrgentHourly !== filter.isUrgentHourly)
      return false;
    if (filter.isOverdue !== undefined && t.isOverdue !== filter.isOverdue)
      return false;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      const haystack = [t.taskCode, t.title, t.description, t.assignedTo?.fullName].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
  return {
    result: mockExportResult(
      `tasks-export.${filter.format === "CSV" ? "csv" : "xlsx"}`,
      filter.format === "CSV" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filter.format ?? "XLSX",
    ),
    count: result.length,
  };
}

/* export a scoped count helper for scratch-page verification */
export function scopedTaskCount(viewer: User | null): number {
  return scopeTasks(viewer).length;
}

export { tasks as allTasks, taskById as allTaskById };
