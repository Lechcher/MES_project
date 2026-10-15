/**
 * Shared mock-service plumbing: pagination, scoping, audit + KPI append helpers,
 * badge recomputation, and the mock export-result descriptor.
 */

import { CURRENT_MONTH, CURRENT_YEAR, nextId, state } from "../db";
import { KPI_POINT_RULE_BY_CODE } from "../registries";
import { primaryRole } from "../permissions";
import type {
  Connection,
  ExportFormat,
  ExportResult,
  KpiMonthlySummary,
  KpiScoreEvent,
  ModuleCode,
  SystemAuditLog,
  Task,
  TaskStateBadge,
  User,
} from "../types";
import { MockError } from "../types";

export function nowIso(): string {
  return new Date().toISOString();
}

export function paginate<T>(
  items: T[],
  offset = 0,
  limit = 20,
): Connection<T> {
  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.max(1, limit);
  const nodes = items.slice(safeOffset, safeOffset + safeLimit);
  return {
    nodes,
    pageInfo: {
      offset: safeOffset,
      limit: safeLimit,
      totalCount: items.length,
      hasNextPage: safeOffset + safeLimit < items.length,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Mock export descriptor                                                     */
/* -------------------------------------------------------------------------- */

const EXPORT_MIME: Record<ExportFormat, string> = {
  PDF: "application/pdf",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  CSV: "text/csv",
};

/** A mock print/export result: the would-be artifact, never a real file. */
export interface MockExportDescriptor extends ExportResult {
  /** The data scope the artifact was produced for (for the result dialog). */
  scopeNote: string;
  /** Always false — no file is ever generated. */
  generated: false;
}

export function buildExportResult(opts: {
  fileName: string;
  format: ExportFormat;
  scopeNote: string;
  mimeType?: string;
}): MockExportDescriptor {
  return {
    id: nextId("export"),
    fileName: opts.fileName,
    format: opts.format,
    mimeType: opts.mimeType ?? EXPORT_MIME[opts.format],
    url: `mock://exports/${opts.fileName}`,
    scopeNote: opts.scopeNote,
    generated: false,
    createdAt: nowIso(),
  };
}

/* -------------------------------------------------------------------------- */
/* Audit                                                                      */
/* -------------------------------------------------------------------------- */

export function appendAudit(
  actor: User | null,
  entry: {
    moduleCode: ModuleCode;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    oldData?: Record<string, unknown> | null;
    newData?: Record<string, unknown> | null;
  },
): SystemAuditLog {
  const log: SystemAuditLog = {
    id: nextId("audit"),
    user: actor,
    moduleCode: entry.moduleCode,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    oldData: entry.oldData ?? null,
    newData: entry.newData ?? null,
    ipAddress: "203.0.113.24",
    userAgent: "Mozilla/5.0 (mock)",
    createdAt: nowIso(),
  };
  state.systemAuditLogs.push(log);
  return log;
}

/* -------------------------------------------------------------------------- */
/* KPI                                                                        */
/* -------------------------------------------------------------------------- */

export function currentSummary(user: User): KpiMonthlySummary {
  const existing = state.kpiMonthlySummaries.find(
    (s) =>
      s.user.id === user.id &&
      s.periodYear === CURRENT_YEAR &&
      s.periodMonth === CURRENT_MONTH,
  );
  if (existing) return existing;
  const created: KpiMonthlySummary = {
    id: nextId("sum"),
    user,
    periodYear: CURRENT_YEAR,
    periodMonth: CURRENT_MONTH,
    totalTasksAssigned: 0,
    completedOnTime: 0,
    completedUrgentOnTime: 0,
    approvedFirstTime: 0,
    overdueTasks: 0,
    rejectedTasks: 0,
    extensionRequestsCount: 0,
    attendanceRate: 0,
    perfectAttendanceBonus: 0,
    unapprovedLeaveCount: 0,
    lateEarlyCount: 0,
    totalKpiScore: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  state.kpiMonthlySummaries.push(created);
  return created;
}

/** Append a KPI score event and incrementally update the user's monthly summary. */
export function applyKpiEvent(
  user: User,
  ruleCode: string,
  taskId?: string | null,
): KpiScoreEvent {
  const rule = KPI_POINT_RULE_BY_CODE[ruleCode];
  if (!rule) {
    throw new MockError("VALIDATION_FAILED", `Unknown KPI rule ${ruleCode}.`);
  }
  const event: KpiScoreEvent = {
    id: nextId("kpi"),
    userId: user.id,
    user,
    task: taskId ? state.tasks.find((t) => t.id === taskId) ?? null : null,
    ruleCode,
    points: rule.points,
    periodYear: CURRENT_YEAR,
    periodMonth: CURRENT_MONTH,
    occurredAt: nowIso(),
  };
  state.kpiScoreEvents.push(event);

  const summary = currentSummary(user);
  switch (ruleCode) {
    case "KPI_ON_TIME_TICKET":
      summary.completedOnTime += 1;
      break;
    case "KPI_ON_TIME_URGENT":
      summary.completedUrgentOnTime += 1;
      break;
    case "KPI_FIRST_TIME_APPROVAL":
      summary.approvedFirstTime += 1;
      break;
    case "KPI_PERFECT_ATTENDANCE":
      summary.perfectAttendanceBonus = rule.points;
      break;
    case "KPI_OVERDUE_TICKET":
      summary.overdueTasks += 1;
      break;
    case "KPI_RETURNED_TICKET":
      summary.rejectedTasks += 1;
      break;
    case "KPI_EXTENSION_REQUEST":
      summary.extensionRequestsCount += 1;
      break;
    case "KPI_UNAPPROVED_LEAVE":
      summary.unapprovedLeaveCount += 1;
      break;
    default:
      break;
  }
  summary.totalKpiScore += rule.points;
  summary.updatedAt = nowIso();
  return event;
}

/* -------------------------------------------------------------------------- */
/* Badges                                                                     */
/* -------------------------------------------------------------------------- */

export function computeBadges(task: Task): TaskStateBadge[] {
  if (task.state !== "ACT") return [];
  const badges: TaskStateBadge[] = [];
  if (task.isUrgentHourly) badges.push("URGENT_PROCESSING");
  if (task.isExtensionRequested) badges.push("AWAITING_EXTENSION_APPROVAL");
  if (task.progressPercentage > 0) badges.push("PROGRESS_UPDATE");
  return badges;
}

export function syncTaskBadges(task: Task): void {
  task.badges = computeBadges(task);
}

/* -------------------------------------------------------------------------- */
/* Scoping (role-scoped reads, mirroring the future backend)                  */
/* -------------------------------------------------------------------------- */

export function taskInScope(viewer: User | null, task: Task): boolean {
  if (!viewer) return false;
  switch (primaryRole(viewer)) {
    case "EMPLOYEE":
      return task.assignedToId === viewer.id;
    case "DEPT_HEAD":
      return task.departmentId === viewer.departmentId;
    default:
      return true;
  }
}

export function visibleTasks(viewer: User | null): Task[] {
  return state.tasks.filter((task) => taskInScope(viewer, task));
}

export function userInScope(viewer: User | null, user: User): boolean {
  if (!viewer) return false;
  switch (primaryRole(viewer)) {
    case "EMPLOYEE":
      return user.id === viewer.id;
    case "DEPT_HEAD":
      return user.departmentId === viewer.departmentId;
    default:
      return true;
  }
}

export function visibleUsers(viewer: User | null): User[] {
  return state.users.filter((user) => userInScope(viewer, user));
}

export function departmentMembers(
  departmentId: string | null | undefined,
  activeOnly = true,
): User[] {
  if (!departmentId) return [];
  return state.users.filter(
    (u) => u.departmentId === departmentId && (!activeOnly || u.isActive),
  );
}

/* -------------------------------------------------------------------------- */
/* Guards                                                                     */
/* -------------------------------------------------------------------------- */

export function requireViewer(viewer: User | null): User {
  if (!viewer) {
    throw new MockError("UNAUTHENTICATED", "No viewer session is established.");
  }
  return viewer;
}

export function requirePermission(
  viewer: User | null,
  permissionCode: string,
  message: string,
): User {
  const user = requireViewer(viewer);
  const allowed = user.roles.some((role) =>
    role.permissions.some((p) => p.code === permissionCode),
  );
  if (!allowed) {
    throw new MockError("FORBIDDEN", message, {
      requiredPermission: permissionCode,
    });
  }
  return user;
}

export function requireRole(
  viewer: User | null,
  codes: import("../types").RoleCode[],
  message: string,
): User {
  const user = requireViewer(viewer);
  const role = primaryRole(user);
  if (!role || !codes.includes(role)) {
    throw new MockError("FORBIDDEN", message, { requiredRoles: codes });
  }
  return user;
}

export function nextTaskCode(): string {
  const max = state.tasks.reduce((acc, t) => {
    const n = Number(t.taskCode.replace("T-", ""));
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 1000);
  return `T-${max + 1}`;
}

export function isOnTime(task: Task, at: string): boolean {
  const deadline = task.extendedDeadline ?? task.endDate;
  if (!deadline) return true;
  return new Date(at).getTime() <= new Date(deadline).getTime();
}
