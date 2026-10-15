/**
 * Module-level in-memory mock store, seeded deterministically relative to the
 * current date so Yesterday/Today/Tomorrow views, the current-month calendar,
 * and overdue examples are always populated.
 *
 * Nothing is persisted: a page reload re-evaluates this module and restores the
 * seed. Mutations go through the services in `./services/*`, which call
 * `notify()` so subscribed React components re-render.
 */

import type {
  AppSetting,
  Attachment,
  AttendanceRecord,
  Department,
  KpiMonthlySummary,
  KpiScoreEvent,
  LeaveBalanceEntry,
  LeaveRequest,
  ModuleCode,
  Notification,
  OvertimeRecord,
  Permission,
  Priority,
  Project,
  Role,
  RoleCode,
  SystemAuditLog,
  Task,
  TaskProgressLog,
  TaskRequest,
  TaskRequestType,
  TaskStateBadge,
  TaskStateTransition,
  TaskType,
  TelegramWebhookConfig,
  TicketStateCode,
  User,
} from "./types";
import { KPI_POINT_RULE_BY_CODE, MODULES } from "./registries";

/* -------------------------------------------------------------------------- */
/* Deterministic ids                                                          */
/* -------------------------------------------------------------------------- */

let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${String(idCounter).padStart(4, "0")}`;
}

/* -------------------------------------------------------------------------- */
/* Date helpers (all anchored to local midnight of the current day)           */
/* -------------------------------------------------------------------------- */

const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

export function day(offsetDays: number, hour = 0, minute = 0): Date {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export function iso(d: Date): string {
  return d.toISOString();
}

/** ISO timestamp at `offsetDays` from today. */
export function isoDay(offsetDays: number, hour = 0, minute = 0): string {
  return iso(day(offsetDays, hour, minute));
}

export const CURRENT_YEAR = TODAY.getFullYear();
export const CURRENT_MONTH = TODAY.getMonth() + 1;
export const PREVIOUS_MONTH = CURRENT_MONTH === 1 ? 12 : CURRENT_MONTH - 1;
export const PREVIOUS_MONTH_YEAR =
  CURRENT_MONTH === 1 ? CURRENT_YEAR - 1 : CURRENT_YEAR;

export function isWeekend(d: Date): boolean {
  const w = d.getDay();
  return w === 0 || w === 6;
}

/* -------------------------------------------------------------------------- */
/* Store shape                                                                */
/* -------------------------------------------------------------------------- */

export interface RolePermissionGrant {
  roleId: string;
  permissionId: string;
  grantedAt: string;
}

export interface MockState {
  modules: { code: ModuleCode; name: string }[];
  departments: Department[];
  users: User[];
  roles: Role[];
  permissions: Permission[];
  rolePermissions: RolePermissionGrant[];
  projects: Project[];
  tasks: Task[];
  attachments: Attachment[];
  attendanceRecords: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  leaveBalanceEntries: LeaveBalanceEntry[];
  overtimeRecords: OvertimeRecord[];
  kpiScoreEvents: KpiScoreEvent[];
  kpiMonthlySummaries: KpiMonthlySummary[];
  systemAuditLogs: SystemAuditLog[];
  appSettings: AppSetting[];
  notifications: Notification[];
  telegramWebhookConfig: TelegramWebhookConfig;
}

/* -------------------------------------------------------------------------- */
/* Permission / role definitions (from the SQL seed)                          */
/* -------------------------------------------------------------------------- */

const PERMISSION_DEFS: { code: string; moduleCode: ModuleCode; description: string }[] =
  [
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
  ];

const DEPT_HEAD_PERMISSIONS = new Set([
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
]);

const EMPLOYEE_PERMISSIONS = new Set([
  "jobs.ticket.accept_report",
  "jobs.ticket.request_extension",
  "jobs.ticket.print_export",
  "planning.calendar.view",
  "planning.leave.register",
  "planning.print_export",
  "performance.kpi.view_personal",
  "performance.print_export",
]);

/** Mirrors the SQL `role_permissions` derivation exactly. */
export function grantApplies(
  roleCode: RoleCode,
  permission: { code: string; moduleCode: ModuleCode },
): boolean {
  switch (roleCode) {
    case "SUPER_ADMIN":
      return true;
    case "TECH_LEAD":
      return permission.code !== "settings.users.manage";
    case "HR_MANAGER":
      return (
        permission.code !== "settings.rbac.manage" &&
        permission.code !== "settings.webhook.manage" &&
        permission.moduleCode !== "audit-log"
      );
    case "DEPT_HEAD":
      return DEPT_HEAD_PERMISSIONS.has(permission.code);
    case "EMPLOYEE":
      return EMPLOYEE_PERMISSIONS.has(permission.code);
  }
}

const ROLE_DEFS: { code: RoleCode; name: string; description: string }[] = [
  { code: "SUPER_ADMIN", name: "Super Admin", description: "Full system administration." },
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
  { code: "EMPLOYEE", name: "Employee", description: "Personal workspace only." },
];

/* -------------------------------------------------------------------------- */
/* Seed factories                                                             */
/* -------------------------------------------------------------------------- */

const NOW_ISO = isoDay(0, 9, 0);
const YEAR_START_ISO = iso(new Date(CURRENT_YEAR, 0, 1, 0, 0));

function buildDepartments(): Department[] {
  const defs: {
    code: string;
    name: string;
    departmentType: Department["departmentType"];
    parentCode: string | null;
    managerCode: string | null;
    autoForkingEnabled: boolean;
  }[] = [
    {
      code: "B-SX",
      name: "Production Department",
      departmentType: "DEPARTMENT",
      parentCode: null,
      managerCode: "NV013",
      autoForkingEnabled: true,
    },
    {
      code: "B-KT",
      name: "Engineering Department",
      departmentType: "DEPARTMENT",
      parentCode: null,
      managerCode: "NV011",
      autoForkingEnabled: true,
    },
    {
      code: "B-QC",
      name: "Quality Control (QC) Department",
      departmentType: "DEPARTMENT",
      parentCode: null,
      managerCode: "NV012",
      autoForkingEnabled: true,
    },
    {
      code: "B-HR",
      name: "Human Resources Department",
      departmentType: "DEPARTMENT",
      parentCode: null,
      managerCode: "NV014",
      autoForkingEnabled: false,
    },
    {
      code: "B-IT",
      name: "IT Division",
      departmentType: "DIVISION",
      parentCode: "B-KT",
      managerCode: "NV016",
      autoForkingEnabled: true,
    },
  ];
  return defs.map((d) => ({
    id: nextId("dept"),
    code: d.code,
    name: d.name,
    departmentType: d.departmentType,
    parent: null,
    parentId: null,
    manager: null,
    managerId: null,
    autoForkingEnabled: d.autoForkingEnabled,
    isActive: true,
    createdAt: YEAR_START_ISO,
    updatedAt: YEAR_START_ISO,
    // preserve raw linkage info for the link pass
    ...({ __parentCode: d.parentCode, __managerCode: d.managerCode } as object),
  })) as Department[];
}

// Raw linkage tables are attached transiently to the seed objects.
interface RawDeptLink {
  __parentCode: string | null;
  __managerCode: string | null;
}

function userDefs(): {
  code: string;
  name: string;
  deptCode: string;
  role: RoleCode;
  email: string;
}[] {
  return [
    { code: "NV001", name: "Nguyen Van A", deptCode: "B-SX", role: "EMPLOYEE", email: "employee@mes.local" },
    { code: "NV002", name: "Tran Thi B", deptCode: "B-SX", role: "EMPLOYEE", email: "tran.thi.b@mes.local" },
    { code: "NV003", name: "Pham Van D", deptCode: "B-SX", role: "EMPLOYEE", email: "pham.van.d@mes.local" },
    { code: "NV004", name: "Hoang Van K", deptCode: "B-SX", role: "EMPLOYEE", email: "hoang.van.k@mes.local" },
    { code: "NV005", name: "Do Minh T", deptCode: "B-KT", role: "EMPLOYEE", email: "do.minh.t@mes.local" },
    { code: "NV006", name: "Le Thi H", deptCode: "B-KT", role: "EMPLOYEE", email: "le.thi.h@mes.local" },
    { code: "NV007", name: "Vu Van M", deptCode: "B-KT", role: "EMPLOYEE", email: "vu.van.m@mes.local" },
    { code: "NV008", name: "Bui Thi N", deptCode: "B-QC", role: "EMPLOYEE", email: "bui.thi.n@mes.local" },
    { code: "NV009", name: "Dang Van O", deptCode: "B-QC", role: "EMPLOYEE", email: "dang.van.o@mes.local" },
    { code: "NV010", name: "Ngo Thi P", deptCode: "B-HR", role: "EMPLOYEE", email: "ngo.thi.p@mes.local" },
    { code: "NV011", name: "Tran Van D", deptCode: "B-KT", role: "DEPT_HEAD", email: "depthead@mes.local" },
    { code: "NV012", name: "Le Thi E", deptCode: "B-QC", role: "DEPT_HEAD", email: "le.thi.e@mes.local" },
    { code: "NV013", name: "Nguyen Van C", deptCode: "B-SX", role: "DEPT_HEAD", email: "nguyen.van.c@mes.local" },
    { code: "NV014", name: "Pham Thi F", deptCode: "B-HR", role: "HR_MANAGER", email: "hr@mes.local" },
    { code: "NV015", name: "Hoang Van G", deptCode: "B-IT", role: "SUPER_ADMIN", email: "admin@mes.local" },
    { code: "NV016", name: "Vu Thi I", deptCode: "B-IT", role: "TECH_LEAD", email: "techlead@mes.local" },
  ];
}

/** Exactly one demo account per role, used by the sign-in page. */
export const DEMO_USER_CODES: Record<RoleCode, string> = {
  SUPER_ADMIN: "NV015",
  TECH_LEAD: "NV016",
  HR_MANAGER: "NV014",
  DEPT_HEAD: "NV011",
  EMPLOYEE: "NV001",
};

/* -------------------------------------------------------------------------- */
/* Build the seed                                                             */
/* -------------------------------------------------------------------------- */

function seed(): MockState {
  const departments = buildDepartments();
  const permissionDefs = PERMISSION_DEFS;

  const permissions: Permission[] = permissionDefs.map((p) => ({
    id: nextId("perm"),
    code: p.code,
    moduleCode: p.moduleCode,
    description: p.description,
  }));

  const roles: Role[] = ROLE_DEFS.map((r) => ({
    id: nextId("role"),
    code: r.code,
    name: r.name,
    description: r.description,
    permissions: permissions.filter((p) => grantApplies(r.code, p)),
    createdAt: YEAR_START_ISO,
    updatedAt: YEAR_START_ISO,
  }));
  const roleByCode = new Map(roles.map((r) => [r.code, r]));

  const rolePermissions: RolePermissionGrant[] = [];
  for (const role of roles) {
    for (const p of role.permissions) {
      rolePermissions.push({
        roleId: role.id,
        permissionId: p.id,
        grantedAt: YEAR_START_ISO,
      });
    }
  }

  const users: User[] = userDefs().map((u) => ({
    id: nextId("user"),
    userCode: u.code,
    fullName: u.name,
    email: u.email,
    departmentId: null,
    department: null,
    isActive: true,
    roles: [roleByCode.get(u.role)!],
    createdAt: YEAR_START_ISO,
    updatedAt: YEAR_START_ISO,
  }));

  const deptByCode = new Map(departments.map((d) => [d.code, d]));
  const userByNVCode = new Map(users.map((u) => [u.userCode, u]));

  // Link departments (parent + manager)
  for (const dept of departments) {
    const link = dept as unknown as RawDeptLink;
    dept.parent = link.__parentCode
      ? deptByCode.get(link.__parentCode) ?? null
      : null;
    dept.parentId = dept.parent?.id ?? null;
    dept.manager = link.__managerCode
      ? userByNVCode.get(link.__managerCode) ?? null
      : null;
    dept.managerId = dept.manager?.id ?? null;
    delete (dept as unknown as Record<string, unknown>).__parentCode;
    delete (dept as unknown as Record<string, unknown>).__managerCode;
  }

  // Link users to departments
  for (const def of userDefs()) {
    const user = userByNVCode.get(def.code)!;
    user.department = deptByCode.get(def.deptCode) ?? null;
    user.departmentId = user.department?.id ?? null;
  }

  const userById = new Map(users.map((u) => [u.id, u]));

  /* ---------------------------------------------------------------- projects */
  const projectDefs: {
    code: string;
    name: string;
    description: string;
    deptCode: string | null;
  }[] = [
    {
      code: "PRJ-GEN",
      name: "General Operations",
      description: "Default group for tickets without a specific project.",
      deptCode: null,
    },
    {
      code: "PRJ-PROD",
      name: "Production Line Upgrade",
      description: "Upgrade of the main production line.",
      deptCode: "B-SX",
    },
    {
      code: "PRJ-ENG",
      name: "Platform Migration",
      description: "Migration of internal tooling to the new platform.",
      deptCode: "B-KT",
    },
    {
      code: "PRJ-QC",
      name: "QC Automation",
      description: "Automated quality-control checks.",
      deptCode: "B-QC",
    },
    {
      code: "PRJ-HR",
      name: "HR Portal Rollout",
      description: "Rollout of the internal HR portal.",
      deptCode: "B-HR",
    },
  ];
  const projects: Project[] = projectDefs.map((p) => {
    const dept = p.deptCode ? deptByCode.get(p.deptCode) ?? null : null;
    return {
      id: nextId("proj"),
      code: p.code,
      name: p.name,
      description: p.description,
      departmentId: dept?.id ?? null,
      department: dept,
      isActive: true,
      createdAt: YEAR_START_ISO,
      updatedAt: YEAR_START_ISO,
    };
  });
  const projectByCode = new Map(projects.map((p) => [p.code, p]));

  /* ------------------------------------------------------------ collections */
  const tasks: Task[] = [];
  const attachments: Attachment[] = [];

  function findUser(id: string): User | null {
    return userById.get(id) ?? null;
  }

  let taskSeq = 1000;

  function makeTask(opts: {
    title: string;
    description?: string;
    projectCode?: string | null;
    taskType: TaskType;
    priority?: Priority;
    state: TicketStateCode;
    createdByNV?: string | null;
    assignedToNV: string;
    deptCode?: string | null;
    startOffset?: number | null;
    endOffset: number;
    endHour?: number;
    endMinute?: number;
    extendedDeadlineOffset?: number | null;
    progress?: number;
    isUrgentHourly?: boolean;
    isExtensionRequested?: boolean;
    isOverdue?: boolean;
    isLateSubmission?: boolean;
    badges?: TaskStateBadge[];
    approvedByNV?: string | null;
    reviewedByNV?: string | null;
    createdOffset?: number;
  }): Task {
    taskSeq += 1;
    const assignedTo = userByNVCode.get(opts.assignedToNV) ?? null;
    const dept = opts.deptCode
      ? deptByCode.get(opts.deptCode) ?? null
      : assignedTo?.department ?? null;
    const project = opts.projectCode
      ? projectByCode.get(opts.projectCode) ?? null
      : projectByCode.get("PRJ-GEN") ?? null;
    const createdBy = opts.createdByNV
      ? userByNVCode.get(opts.createdByNV) ?? null
      : null;
    const approvedBy = opts.approvedByNV
      ? userByNVCode.get(opts.approvedByNV) ?? null
      : null;
    const reviewedBy = opts.reviewedByNV
      ? userByNVCode.get(opts.reviewedByNV) ?? null
      : null;
    const createdAt = isoDay(opts.createdOffset ?? -3, 9, 0);
    const task: Task = {
      id: nextId("task"),
      taskCode: `T-${taskSeq}`,
      title: opts.title,
      description: opts.description ?? null,
      projectId: project?.id ?? null,
      project,
      taskType: opts.taskType,
      priority: opts.priority ?? "MEDIUM",
      state: opts.state,
      createdBy,
      assignedTo,
      assignedToId: assignedTo?.id ?? null,
      departmentId: dept?.id ?? null,
      department: dept,
      startDate:
        opts.startOffset === null || opts.startOffset === undefined
          ? null
          : isoDay(opts.startOffset, 8, 30),
      endDate: isoDay(opts.endOffset, opts.endHour ?? 17, opts.endMinute ?? 0),
      extendedDeadline:
        opts.extendedDeadlineOffset === null ||
        opts.extendedDeadlineOffset === undefined
          ? null
          : isoDay(opts.extendedDeadlineOffset, 17, 0),
      progressPercentage: opts.progress ?? 0,
      isUrgentHourly: opts.isUrgentHourly ?? false,
      isExtensionRequested: opts.isExtensionRequested ?? false,
      isOverdue: opts.isOverdue ?? false,
      isLateSubmission: opts.isLateSubmission ?? false,
      badges: opts.badges ?? [],
      approvedBy,
      approvedAt: approvedBy ? isoDay(opts.endOffset, 16, 0) : null,
      reviewedBy,
      reviewedAt: reviewedBy ? isoDay(opts.createdOffset ?? -2, 15, 0) : null,
      progressLogs: [],
      stateTransitions: [],
      requests: [],
      attachments: [],
      createdAt,
      updatedAt: createdAt,
    };
    tasks.push(task);
    return task;
  }

  function addTransition(
    task: Task,
    fromState: TicketStateCode | null,
    toState: TicketStateCode,
    actorNV: string | null,
    offset: number,
    reason?: string,
  ): TaskStateTransition {
    const t: TaskStateTransition = {
      id: nextId("trans"),
      taskId: task.id,
      fromState,
      toState,
      actor: actorNV ? findUser(userByNVCode.get(actorNV)!.id) : null,
      reason: reason ?? null,
      createdAt: isoDay(offset, 9, 30),
    };
    task.stateTransitions.push(t);
    return t;
  }

  function addProgressLog(
    task: Task,
    userNV: string,
    previous: number,
    next: number,
    offset: number,
    comment: string,
    verified = true,
  ): TaskProgressLog {
    const log: TaskProgressLog = {
      id: nextId("plog"),
      taskId: task.id,
      user: userByNVCode.get(userNV)!,
      previousPercentage: previous,
      newPercentage: next,
      logComment: comment,
      isVerifiedByManager: verified,
      createdAt: isoDay(offset, 14, 0),
    };
    task.progressLogs.push(log);
    return log;
  }

  function addRequest(
    task: Task,
    userNV: string,
    requestType: TaskRequestType,
    reason: string,
    status: Task["requests"][number]["status"],
    offset: number,
    requestedDeadlineOffset?: number,
    reviewedByNV?: string,
    reviewComment?: string,
  ): TaskRequest {
    const req: TaskRequest = {
      id: nextId("req"),
      taskId: task.id,
      user: userByNVCode.get(userNV)!,
      requestType,
      requestedDeadline:
        requestedDeadlineOffset === undefined
          ? null
          : isoDay(requestedDeadlineOffset, 17, 0),
      reason,
      status,
      reviewedBy: reviewedByNV ? userByNVCode.get(reviewedByNV)! : null,
      reviewComment: reviewComment ?? null,
      reviewedAt:
        status === "PENDING" ? null : isoDay(offset, 15, 0),
      createdAt: isoDay(offset, 10, 0),
      updatedAt: isoDay(offset, 10, 0),
    };
    task.requests.push(req);
    return req;
  }

  function addAttachment(
    ownerType: string,
    ownerId: string,
    fileName: string,
    uploadedByNV: string,
    offset: number,
  ): Attachment {
    const att: Attachment = {
      id: nextId("att"),
      ownerType,
      ownerId,
      url: `mock://attachments/${fileName}`,
      fileName,
      mimeType: fileName.endsWith(".pdf")
        ? "application/pdf"
        : fileName.endsWith(".xlsx")
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "image/png",
      uploadedBy: userByNVCode.get(uploadedByNV)!,
      createdAt: isoDay(offset, 11, 0),
    };
    attachments.push(att);
    return att;
  }

  /* ------------------------------------------------------------------ tasks */
  // HOURLY — urgent slots 10:30 / 14:00 / 16:30
  const hourlyReq = makeTask({
    title: "Confirm daily line checklist",
    projectCode: "PRJ-PROD",
    taskType: "HOURLY",
    priority: "URGENT",
    state: "REQ",
    createdByNV: "NV013",
    assignedToNV: "NV001",
    endOffset: 0,
    endHour: 14,
    endMinute: 0,
    isUrgentHourly: true,
    createdOffset: 0,
  });
  addTransition(hourlyReq, null, "REQ", "NV013", 0);

  const hourlyAct = makeTask({
    title: "Handle urgent machine alert",
    projectCode: "PRJ-PROD",
    taskType: "HOURLY",
    priority: "URGENT",
    state: "ACT",
    createdByNV: "NV013",
    assignedToNV: "NV002",
    endOffset: 0,
    endHour: 16,
    endMinute: 30,
    progress: 30,
    isUrgentHourly: true,
    badges: ["URGENT_PROCESSING"],
    createdOffset: -1,
  });
  addTransition(hourlyAct, "REQ", "ACT", "NV002", 0);

  const hourlyApp = makeTask({
    title: "Morning safety inspection",
    projectCode: "PRJ-PROD",
    taskType: "HOURLY",
    priority: "MEDIUM",
    state: "APP",
    createdByNV: "NV013",
    assignedToNV: "NV003",
    endOffset: -1,
    endHour: 10,
    endMinute: 30,
    progress: 100,
    approvedByNV: "NV013",
    createdOffset: -2,
  });
  addTransition(hourlyApp, "REQ", "ACT", "NV003", -2);
  addTransition(hourlyApp, "ACT", "PEN", "NV003", -1);
  addTransition(hourlyApp, "PEN", "APP", "NV013", -1);

  makeTask({
    title: "Prepare packaging materials",
    projectCode: "PRJ-GEN",
    taskType: "HOURLY",
    priority: "LOW",
    state: "REQ",
    createdByNV: "NV013",
    assignedToNV: "NV001",
    endOffset: 1,
    endHour: 10,
    endMinute: 30,
    createdOffset: 0,
  });

  // DAILY — defaults 17:00 / 18:00 same day
  const dailyActProgress = makeTask({
    title: "Update production log for Today",
    projectCode: "PRJ-PROD",
    taskType: "DAILY",
    priority: "MEDIUM",
    state: "ACT",
    createdByNV: "NV013",
    assignedToNV: "NV004",
    endOffset: 0,
    endHour: 17,
    progress: 60,
    badges: ["PROGRESS_UPDATE"],
    createdOffset: -1,
  });
  addTransition(dailyActProgress, "REQ", "ACT", "NV004", -1);
  addProgressLog(dailyActProgress, "NV004", 20, 60, 0, "Line data entered.");

  const dailyActExtension = makeTask({
    title: "Draft maintenance schedule",
    projectCode: "PRJ-ENG",
    taskType: "DAILY",
    priority: "HIGH",
    state: "ACT",
    createdByNV: "NV011",
    assignedToNV: "NV005",
    endOffset: 0,
    endHour: 18,
    progress: 40,
    isExtensionRequested: true,
    badges: ["AWAITING_EXTENSION_APPROVAL", "PROGRESS_UPDATE"],
    createdOffset: -2,
  });
  addTransition(dailyActExtension, "REQ", "ACT", "NV005", -1);
  addRequest(
    dailyActExtension,
    "NV005",
    "EXTENSION",
    "Vendor data arrived late.",
    "PENDING",
    0,
    3,
  );

  const dailyActVerification = makeTask({
    title: "Calibrate QC sensor array",
    projectCode: "PRJ-QC",
    taskType: "DAILY",
    priority: "MEDIUM",
    state: "ACT",
    createdByNV: "NV012",
    assignedToNV: "NV008",
    endOffset: 0,
    endHour: 17,
    progress: 50,
    badges: ["AWAITING_PROGRESS_VERIFICATION"],
    createdOffset: -1,
  });
  addTransition(dailyActVerification, "REQ", "ACT", "NV008", -1);
  addProgressLog(dailyActVerification, "NV008", 0, 50, 0, "Half calibrated.", false);

  const dailyOverdue = makeTask({
    title: "Submit shift handover report",
    projectCode: "PRJ-PROD",
    taskType: "DAILY",
    priority: "HIGH",
    state: "OVERDUE",
    createdByNV: "NV013",
    assignedToNV: "NV001",
    endOffset: 0,
    endHour: 17,
    progress: 40,
    isOverdue: true,
    createdOffset: -2,
  });
  addTransition(dailyOverdue, "REQ", "ACT", "NV001", -2);

  const dailyPen = makeTask({
    title: "Compile weekly output summary",
    projectCode: "PRJ-PROD",
    taskType: "DAILY",
    priority: "MEDIUM",
    state: "PEN",
    createdByNV: "NV013",
    assignedToNV: "NV002",
    endOffset: 0,
    endHour: 17,
    progress: 100,
    createdOffset: -1,
  });
  addTransition(dailyPen, "REQ", "ACT", "NV002", -1);
  addTransition(dailyPen, "ACT", "PEN", "NV002", 0);

  const dailyPenLate = makeTask({
    title: "Log late shipment correction",
    projectCode: "PRJ-PROD",
    taskType: "DAILY",
    priority: "HIGH",
    state: "PEN",
    createdByNV: "NV013",
    assignedToNV: "NV003",
    endOffset: -1,
    endHour: 17,
    progress: 100,
    isLateSubmission: true,
    createdOffset: -3,
  });
  addTransition(dailyPenLate, "REQ", "ACT", "NV003", -3);
  addTransition(dailyPenLate, "ACT", "OVERDUE", "NV003", -1);
  addTransition(dailyPenLate, "OVERDUE", "PEN", "NV003", 0, "Late Submission");
  addRequest(
    dailyPenLate,
    "NV003",
    "LATE_EXPLANATION",
    "Downstream supplier delay.",
    "APPROVED",
    0,
    undefined,
    "NV013",
    "Accepted.",
  );

  const dailyRej = makeTask({
    title: "Revise defect report",
    projectCode: "PRJ-QC",
    taskType: "DAILY",
    priority: "MEDIUM",
    state: "REJ",
    createdByNV: "NV012",
    assignedToNV: "NV009",
    endOffset: 0,
    endHour: 17,
    progress: 80,
    reviewedByNV: "NV012",
    createdOffset: -2,
  });
  addTransition(dailyRej, "REQ", "ACT", "NV009", -2);
  addTransition(dailyRej, "ACT", "PEN", "NV009", -1);
  addTransition(dailyRej, "PEN", "REJ", "NV012", 0, "Missing root-cause section.");

  const dailyCan = makeTask({
    title: "Redundant duplicate ticket",
    projectCode: "PRJ-GEN",
    taskType: "DAILY",
    priority: "LOW",
    state: "CAN",
    createdByNV: "NV013",
    assignedToNV: "NV004",
    endOffset: 0,
    endHour: 18,
    createdOffset: -2,
  });
  addTransition(dailyCan, "REQ", "ACT", "NV004", -2);
  addTransition(
    dailyCan,
    "ACT",
    "CAN",
    "NV013",
    -1,
    "Duplicate of T-1006.",
  );

  makeTask({
    title: "Plan Tomorrow shift allocation",
    projectCode: "PRJ-GEN",
    taskType: "DAILY",
    priority: "MEDIUM",
    state: "REQ",
    createdByNV: "NV013",
    assignedToNV: "NV001",
    endOffset: 1,
    endHour: 17,
    createdOffset: 0,
  });

  const dailyAppYesterday = makeTask({
    title: "Close Yesterday production batch",
    projectCode: "PRJ-PROD",
    taskType: "DAILY",
    priority: "MEDIUM",
    state: "APP",
    createdByNV: "NV013",
    assignedToNV: "NV002",
    endOffset: -1,
    endHour: 17,
    progress: 100,
    approvedByNV: "NV013",
    createdOffset: -2,
  });
  addTransition(dailyAppYesterday, "REQ", "ACT", "NV002", -2);
  addTransition(dailyAppYesterday, "ACT", "PEN", "NV002", -1);
  addTransition(dailyAppYesterday, "PEN", "APP", "NV013", -1);

  // MULTI_DAY — 0% → 100% with milestones
  const multiActive = makeTask({
    title: "Migrate legacy reporting module",
    projectCode: "PRJ-ENG",
    taskType: "MULTI_DAY",
    priority: "HIGH",
    state: "ACT",
    createdByNV: "NV011",
    assignedToNV: "NV006",
    startOffset: -5,
    endOffset: 6,
    progress: 60,
    badges: ["PROGRESS_UPDATE"],
    createdOffset: -6,
  });
  addTransition(multiActive, "REQ", "ACT", "NV006", -5);
  addProgressLog(multiActive, "NV006", 0, 25, -4, "Outline/Wireframe done.");
  addProgressLog(multiActive, "NV006", 25, 50, -2, "Draft/Rough done.");
  addProgressLog(multiActive, "NV006", 50, 60, 0, "Review in progress.");

  const multiPen = makeTask({
    title: "Roll out QC automation phase 1",
    projectCode: "PRJ-QC",
    taskType: "MULTI_DAY",
    priority: "HIGH",
    state: "PEN",
    createdByNV: "NV012",
    assignedToNV: "NV010",
    startOffset: -10,
    endOffset: 1,
    progress: 100,
    createdOffset: -12,
  });
  addTransition(multiPen, "REQ", "ACT", "NV010", -10);
  addProgressLog(multiPen, "NV010", 0, 75, -3, "Testing/Review complete.");
  addTransition(multiPen, "ACT", "PEN", "NV010", 0);

  const multiApp = makeTask({
    title: "Deploy production dashboard",
    projectCode: "PRJ-ENG",
    taskType: "MULTI_DAY",
    priority: "MEDIUM",
    state: "APP",
    createdByNV: "NV011",
    assignedToNV: "NV007",
    startOffset: -20,
    endOffset: -8,
    progress: 100,
    approvedByNV: "NV011",
    createdOffset: -22,
  });
  addTransition(multiApp, "REQ", "ACT", "NV007", -20);
  addProgressLog(multiApp, "NV007", 0, 100, -9, "Acceptance signed off.");
  addTransition(multiApp, "ACT", "PEN", "NV007", -9);
  addTransition(multiApp, "PEN", "APP", "NV011", -8);

  const multiRej = makeTask({
    title: "Annual compliance audit prep",
    projectCode: "PRJ-HR",
    taskType: "MULTI_DAY",
    priority: "MEDIUM",
    state: "REJ",
    createdByNV: "NV014",
    assignedToNV: "NV010",
    startOffset: -14,
    endOffset: 2,
    progress: 75,
    reviewedByNV: "NV014",
    createdOffset: -15,
  });
  addTransition(multiRej, "REQ", "ACT", "NV010", -14);
  addProgressLog(multiRej, "NV010", 0, 75, -5, "Testing/Review done.");
  addTransition(multiRej, "ACT", "PEN", "NV010", -1);
  addTransition(multiRej, "PEN", "REJ", "NV014", 0, "Evidence incomplete.");

  const multiMilestone25 = makeTask({
    title: "Design new inventory schema",
    projectCode: "PRJ-ENG",
    taskType: "MULTI_DAY",
    priority: "LOW",
    state: "ACT",
    createdByNV: "NV011",
    assignedToNV: "NV005",
    startOffset: -2,
    endOffset: 8,
    progress: 25,
    badges: ["PROGRESS_UPDATE"],
    createdOffset: -3,
  });
  addTransition(multiMilestone25, "REQ", "ACT", "NV005", -2);
  addProgressLog(multiMilestone25, "NV005", 0, 25, -1, "Outline/Wireframe done.");

  const multiMilestone50 = makeTask({
    title: "Build supplier scoring model",
    projectCode: "PRJ-QC",
    taskType: "MULTI_DAY",
    priority: "MEDIUM",
    state: "ACT",
    createdByNV: "NV012",
    assignedToNV: "NV008",
    startOffset: -4,
    endOffset: 5,
    progress: 50,
    badges: ["PROGRESS_UPDATE"],
    createdOffset: -5,
  });
  addTransition(multiMilestone50, "REQ", "ACT", "NV008", -4);
  addProgressLog(multiMilestone50, "NV008", 0, 50, -1, "Draft/Rough done.");

  const multiMilestone75 = makeTask({
    title: "Refactor attendance importer",
    projectCode: "PRJ-HR",
    taskType: "MULTI_DAY",
    priority: "HIGH",
    state: "ACT",
    createdByNV: "NV014",
    assignedToNV: "NV010",
    startOffset: -7,
    endOffset: 3,
    progress: 75,
    badges: ["PROGRESS_UPDATE"],
    createdOffset: -8,
  });
  addTransition(multiMilestone75, "REQ", "ACT", "NV010", -7);
  addProgressLog(multiMilestone75, "NV010", 0, 75, -2, "Testing/Review done.");

  // Attachments (filename-only) on a couple of tickets
  const multiPenAtt = addAttachment("TASK_REQUEST", multiPen.id, "qc-evidence.pdf", "NV010", -1);
  const multiRejAtt = addAttachment("TASK_REQUEST", multiRej.id, "audit-pack.xlsx", "NV010", -2);
  multiPen.attachments.push(multiPenAtt);
  multiRej.attachments.push(multiRejAtt);

  // Filler tasks to exceed 40 and populate every department / both months.
  const fillerAssignees = ["NV002", "NV003", "NV004", "NV005", "NV006", "NV007", "NV008", "NV009", "NV010"];
  for (let i = 0; i < 22; i += 1) {
    const assignee = fillerAssignees[i % fillerAssignees.length];
    const states: TicketStateCode[] = ["APP", "APP", "APP", "PEN", "ACT", "REJ", "CAN", "APP"];
    const state = states[i % states.length];
    const projectCodes = ["PRJ-PROD", "PRJ-ENG", "PRJ-QC", "PRJ-HR", "PRJ-GEN"];
    const projectCode = projectCodes[i % projectCodes.length];
    const createdOffset = -(6 + i);
    const endOffset = state === "APP" || state === "PEN" || state === "REJ" || state === "CAN" ? -(2 + (i % 5)) : 2 + (i % 6);
    const taskType: TaskType = i % 3 === 0 ? "DAILY" : i % 3 === 1 ? "MULTI_DAY" : "HOURLY";
    const filler = makeTask({
      title: `Routine work item ${i + 1}`,
      projectCode,
      taskType,
      priority: i % 4 === 0 ? "HIGH" : "MEDIUM",
      state,
      createdByNV: "NV011",
      assignedToNV: assignee,
      startOffset: taskType === "MULTI_DAY" ? createdOffset : null,
      endOffset,
      endHour: taskType === "HOURLY" ? 14 : 17,
      progress: state === "APP" || state === "PEN" || state === "REJ" ? 100 : state === "ACT" ? 40 : 0,
      badges: state === "ACT" ? ["PROGRESS_UPDATE"] : [],
      approvedByNV: state === "APP" ? "NV011" : null,
      reviewedByNV: state === "REJ" ? "NV011" : null,
      createdOffset,
    });
    addTransition(filler, "REQ", state === "REQ" ? "REQ" : "ACT", assignee, createdOffset);
    if (state === "APP") {
      addTransition(filler, "ACT", "PEN", assignee, endOffset);
      addTransition(filler, "PEN", "APP", "NV011", endOffset);
    } else if (state === "REJ") {
      addTransition(filler, "ACT", "PEN", assignee, endOffset);
      addTransition(filler, "PEN", "REJ", "NV011", endOffset, "Rework needed.");
    } else if (state === "CAN") {
      addTransition(filler, "ACT", "CAN", "NV011", endOffset, "No longer required.");
    } else if (state === "PEN") {
      addTransition(filler, "ACT", "PEN", assignee, endOffset);
    }
  }

  /* ------------------------------------------------------------- attendance */
  const attendanceRecords: AttendanceRecord[] = [];
  const monthStart = new Date(CURRENT_YEAR, CURRENT_MONTH - 1, 1);
  for (const user of users) {
    let idx = 0;
    for (
      let d = new Date(monthStart);
      d <= TODAY;
      d.setDate(d.getDate() + 1)
    ) {
      if (isWeekend(d)) continue;
      idx += 1;
      const late = (user.userCode.charCodeAt(4) + idx) % 7 === 0;
      const early = (user.userCode.charCodeAt(5) + idx) % 9 === 0;
      const checkIn = new Date(d);
      checkIn.setHours(late ? 8 : 7, late ? 45 : 55, 0, 0);
      const checkOut = new Date(d);
      checkOut.setHours(early ? 16 : 17, early ? 20 : 5, 0, 0);
      const hours = early ? 7.5 : 8;
      attendanceRecords.push({
        id: nextId("attd"),
        userId: user.id,
        user,
        workDate: iso(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)),
        checkIn: iso(checkIn),
        checkOut: iso(checkOut),
        isLate: late,
        isEarlyLeave: early,
        leaveCode: null,
        workingHours: hours,
        createdAt: iso(checkIn),
        updatedAt: iso(checkOut),
      });
    }
  }
  const attendanceByUserDate = new Map(
    attendanceRecords.map((a) => [`${a.userId}|${a.workDate.slice(0, 10)}`, a]),
  );

  /* ---------------------------------------------------------- leave requests */
  const leaveRequests: LeaveRequest[] = [];
  function addLeaveRequest(opts: {
    userNV: string;
    leaveCode: LeaveRequest["leaveCode"];
    startOffset: number;
    endOffset: number;
    totalDays: number;
    reason: string;
    status: LeaveRequest["status"];
    handoverNV?: string;
    approvedByNV?: string;
    createdOffset?: number;
    attachmentName?: string;
  }): LeaveRequest {
    const user = userByNVCode.get(opts.userNV)!;
    const req: LeaveRequest = {
      id: nextId("leave"),
      userId: user.id,
      user,
      leaveCode: opts.leaveCode,
      startDate: isoDay(opts.startOffset),
      endDate: isoDay(opts.endOffset),
      totalDays: opts.totalDays,
      reason: opts.reason,
      handoverUser: opts.handoverNV ? userByNVCode.get(opts.handoverNV)! : null,
      status: opts.status,
      approvedBy: opts.approvedByNV ? userByNVCode.get(opts.approvedByNV)! : null,
      approvedAt: opts.status === "APPROVED" ? isoDay(opts.createdOffset ?? -1, 16, 0) : null,
      attachments:
        opts.attachmentName !== undefined
          ? [addAttachment("LEAVE_REQUEST", "pending", opts.attachmentName, opts.userNV, opts.createdOffset ?? -1)]
          : [],
      createdAt: isoDay(opts.createdOffset ?? -1, 9, 0),
      updatedAt: isoDay(opts.createdOffset ?? -1, 9, 0),
    };
    for (const att of req.attachments) att.ownerId = req.id;
    leaveRequests.push(req);
    return req;
  }

  const approvedAl = addLeaveRequest({
    userNV: "NV001",
    leaveCode: "AL",
    startOffset: -5,
    endOffset: -3,
    totalDays: 3,
    reason: "Annual leave.",
    status: "APPROVED",
    handoverNV: "NV002",
    approvedByNV: "NV013",
    createdOffset: -10,
  });
  const approvedSl = addLeaveRequest({
    userNV: "NV005",
    leaveCode: "SL",
    startOffset: -2,
    endOffset: -2,
    totalDays: 1,
    reason: "Sick leave with note.",
    status: "APPROVED",
    approvedByNV: "NV011",
    createdOffset: -3,
    attachmentName: "medical-note.pdf",
  });
  const approvedToil = addLeaveRequest({
    userNV: "NV001",
    leaveCode: "TOIL",
    startOffset: 5,
    endOffset: 5,
    totalDays: 1,
    reason: "Time off in lieu of overtime.",
    status: "APPROVED",
    approvedByNV: "NV013",
    createdOffset: -1,
  });
  addLeaveRequest({
    userNV: "NV002",
    leaveCode: "AL",
    startOffset: 3,
    endOffset: 4,
    totalDays: 2,
    reason: "Family trip.",
    status: "PENDING",
    handoverNV: "NV004",
    createdOffset: 0,
  });
  addLeaveRequest({
    userNV: "NV006",
    leaveCode: "PL",
    startOffset: 2,
    endOffset: 2,
    totalDays: 1,
    reason: "Personal matter.",
    status: "PENDING",
    createdOffset: 0,
  });
  addLeaveRequest({
    userNV: "NV004",
    leaveCode: "EL",
    startOffset: -4,
    endOffset: -4,
    totalDays: 1,
    reason: "Emergency at home.",
    status: "REJECTED",
    approvedByNV: "NV013",
    createdOffset: -5,
  });

  // apply approved leave codes to attendance day cells
  for (const leave of [approvedAl, approvedSl, approvedToil]) {
    if (leave.status !== "APPROVED") continue;
    const start = new Date(leave.startDate);
    const end = new Date(leave.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = `${leave.userId}|${iso(new Date(d.getFullYear(), d.getMonth(), d.getDate())).slice(0, 10)}`;
      const rec = attendanceByUserDate.get(key);
      if (rec) rec.leaveCode = leave.leaveCode;
    }
  }

  // penalty cases (UAL / USL) assigned by HR
  function markPenalty(userNV: string, offset: number, code: "UAL" | "USL") {
    const user = userByNVCode.get(userNV)!;
    const key = `${user.id}|${isoDay(offset).slice(0, 10)}`;
    const existing = attendanceByUserDate.get(key);
    if (existing) {
      existing.leaveCode = code;
      existing.workingHours = 0;
      existing.checkIn = null;
      existing.checkOut = null;
    } else {
      const rec: AttendanceRecord = {
        id: nextId("attd"),
        userId: user.id,
        user,
        workDate: isoDay(offset),
        checkIn: null,
        checkOut: null,
        isLate: false,
        isEarlyLeave: false,
        leaveCode: code,
        workingHours: 0,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      };
      attendanceRecords.push(rec);
      attendanceByUserDate.set(key, rec);
    }
  }
  markPenalty("NV003", -1, "UAL");
  markPenalty("NV009", -2, "USL");

  /* ------------------------------------------------------- leave fund ledger */
  const leaveBalanceEntries: LeaveBalanceEntry[] = [];
  function addBalance(opts: {
    userNV: string;
    leaveCode: LeaveBalanceEntry["leaveCode"];
    entryType: LeaveBalanceEntry["entryType"];
    deltaDays: number;
    referenceType?: string;
    note?: string;
    createdByNV?: string;
    offset?: number;
  }) {
    const user = userByNVCode.get(opts.userNV)!;
    leaveBalanceEntries.push({
      id: nextId("bal"),
      user,
      leaveCode: opts.leaveCode,
      entryType: opts.entryType,
      deltaDays: opts.deltaDays,
      periodYear: CURRENT_YEAR,
      referenceType: opts.referenceType ?? null,
      referenceId: null,
      note: opts.note ?? null,
      createdBy: opts.createdByNV ? userByNVCode.get(opts.createdByNV)! : null,
      createdAt: isoDay(opts.offset ?? 0, 8, 0),
    });
  }
  for (const user of users) {
    addBalance({ userNV: user.userCode, leaveCode: "AL", entryType: "ACCRUAL", deltaDays: 12, referenceType: "MANUAL", note: "Annual allocation." });
    addBalance({ userNV: user.userCode, leaveCode: "TOIL", entryType: "ACCRUAL", deltaDays: 2, referenceType: "OVERTIME", note: "Opening TOIL fund." });
  }
  addBalance({ userNV: "NV001", leaveCode: "AL", entryType: "USAGE", deltaDays: -3, referenceType: "LEAVE_REQUEST", note: "Approved AL." });
  addBalance({ userNV: "NV001", leaveCode: "TOIL", entryType: "ACCRUAL", deltaDays: 0.75, referenceType: "OVERTIME", note: "6h overtime." });
  addBalance({ userNV: "NV005", leaveCode: "AL", entryType: "USAGE", deltaDays: -1, referenceType: "LEAVE_REQUEST", note: "Approved SL." });

  /* ------------------------------------------------------------- overtime */
  const overtimeRecords: OvertimeRecord[] = [];
  function addOvertime(userNV: string, offset: number, hours: number, approvedByNV?: string) {
    const user = userByNVCode.get(userNV)!;
    overtimeRecords.push({
      id: nextId("ot"),
      user,
      workDate: isoDay(offset),
      hours,
      isApproved: approvedByNV !== undefined,
      approvedBy: approvedByNV ? userByNVCode.get(approvedByNV)! : null,
      approvedAt: approvedByNV ? isoDay(offset, 19, 0) : null,
      note: "After-hours support.",
      createdAt: isoDay(offset, 19, 0),
      updatedAt: isoDay(offset, 19, 0),
    });
  }
  addOvertime("NV001", -6, 4, "NV013");
  addOvertime("NV001", -10, 2, "NV013");
  addOvertime("NV006", -3, 3, "NV011");
  addOvertime("NV008", -2, 5);

  /* --------------------------------------------------- KPI events + summaries */
  const kpiScoreEvents: KpiScoreEvent[] = [];
  function addKpiEvent(
    userNV: string,
    ruleCode: string,
    year: number,
    month: number,
    offset: number,
    taskId?: string,
  ) {
    const user = userByNVCode.get(userNV)!;
    const rule = KPI_POINT_RULE_BY_CODE[ruleCode];
    kpiScoreEvents.push({
      id: nextId("kpi"),
      userId: user.id,
      user,
      task: taskId ? tasks.find((t) => t.id === taskId) ?? null : null,
      ruleCode,
      points: rule.points,
      periodYear: year,
      periodMonth: month,
      occurredAt: isoDay(offset, 16, 0),
    });
  }

  const kpiMonthlySummaries: KpiMonthlySummary[] = [];
  function addSummary(opts: {
    userNV: string;
    year: number;
    month: number;
    totalTasks: number;
    onTime: number;
    urgentOnTime: number;
    firstTime: number;
    overdue: number;
    rejected: number;
    extensions: number;
    attendanceRate: number;
    perfectAttendance: number;
    unapprovedLeave: number;
    lateEarly: number;
  }) {
    const user = userByNVCode.get(opts.userNV)!;
    const score =
      opts.onTime * 10 +
      opts.urgentOnTime * 20 +
      opts.firstTime * 5 +
      opts.perfectAttendance -
      (opts.overdue * 15 +
        opts.rejected * 5 +
        opts.extensions * 2 +
        opts.unapprovedLeave * 10 +
        opts.lateEarly * 10);
    kpiMonthlySummaries.push({
      id: nextId("sum"),
      user,
      periodMonth: opts.month,
      periodYear: opts.year,
      totalTasksAssigned: opts.totalTasks,
      completedOnTime: opts.onTime,
      completedUrgentOnTime: opts.urgentOnTime,
      approvedFirstTime: opts.firstTime,
      overdueTasks: opts.overdue,
      rejectedTasks: opts.rejected,
      extensionRequestsCount: opts.extensions,
      attendanceRate: opts.attendanceRate,
      perfectAttendanceBonus: opts.perfectAttendance,
      unapprovedLeaveCount: opts.unapprovedLeave,
      lateEarlyCount: opts.lateEarly,
      totalKpiScore: score,
      createdAt: YEAR_START_ISO,
      updatedAt: NOW_ISO,
    });
  }

  const summarySeeds: {
    userNV: string;
    totalTasks: number;
    onTime: number;
    urgentOnTime: number;
    firstTime: number;
    overdue: number;
    rejected: number;
    extensions: number;
    attendanceRate: number;
    perfect: number;
    unapproved: number;
    lateEarly: number;
  }[] = [
    { userNV: "NV001", totalTasks: 25, onTime: 22, urgentOnTime: 2, firstTime: 20, overdue: 1, rejected: 1, extensions: 1, attendanceRate: 100, perfect: 50, unapproved: 0, lateEarly: 0 },
    { userNV: "NV002", totalTasks: 20, onTime: 18, urgentOnTime: 1, firstTime: 15, overdue: 1, rejected: 2, extensions: 1, attendanceRate: 92, perfect: 0, unapproved: 1, lateEarly: 1 },
    { userNV: "NV003", totalTasks: 18, onTime: 12, urgentOnTime: 0, firstTime: 8, overdue: 3, rejected: 4, extensions: 2, attendanceRate: 80, perfect: 0, unapproved: 2, lateEarly: 2 },
    { userNV: "NV004", totalTasks: 15, onTime: 14, urgentOnTime: 1, firstTime: 12, overdue: 0, rejected: 1, extensions: 0, attendanceRate: 98, perfect: 50, unapproved: 0, lateEarly: 0 },
    { userNV: "NV005", totalTasks: 22, onTime: 18, urgentOnTime: 1, firstTime: 16, overdue: 1, rejected: 1, extensions: 1, attendanceRate: 98, perfect: 0, unapproved: 0, lateEarly: 1 },
    { userNV: "NV006", totalTasks: 16, onTime: 15, urgentOnTime: 0, firstTime: 13, overdue: 0, rejected: 1, extensions: 0, attendanceRate: 100, perfect: 50, unapproved: 0, lateEarly: 0 },
    { userNV: "NV007", totalTasks: 14, onTime: 13, urgentOnTime: 0, firstTime: 11, overdue: 1, rejected: 0, extensions: 0, attendanceRate: 96, perfect: 0, unapproved: 0, lateEarly: 1 },
    { userNV: "NV008", totalTasks: 19, onTime: 17, urgentOnTime: 1, firstTime: 14, overdue: 0, rejected: 1, extensions: 1, attendanceRate: 99, perfect: 50, unapproved: 0, lateEarly: 0 },
    { userNV: "NV009", totalTasks: 12, onTime: 9, urgentOnTime: 0, firstTime: 7, overdue: 2, rejected: 2, extensions: 1, attendanceRate: 85, perfect: 0, unapproved: 1, lateEarly: 2 },
    { userNV: "NV010", totalTasks: 17, onTime: 15, urgentOnTime: 0, firstTime: 12, overdue: 1, rejected: 2, extensions: 1, attendanceRate: 94, perfect: 0, unapproved: 0, lateEarly: 2 },
    { userNV: "NV011", totalTasks: 8, onTime: 8, urgentOnTime: 1, firstTime: 7, overdue: 0, rejected: 0, extensions: 0, attendanceRate: 100, perfect: 50, unapproved: 0, lateEarly: 0 },
    { userNV: "NV012", totalTasks: 7, onTime: 7, urgentOnTime: 0, firstTime: 6, overdue: 0, rejected: 0, extensions: 0, attendanceRate: 100, perfect: 50, unapproved: 0, lateEarly: 0 },
    { userNV: "NV013", totalTasks: 6, onTime: 6, urgentOnTime: 0, firstTime: 5, overdue: 0, rejected: 0, extensions: 0, attendanceRate: 100, perfect: 50, unapproved: 0, lateEarly: 0 },
    { userNV: "NV014", totalTasks: 5, onTime: 5, urgentOnTime: 0, firstTime: 4, overdue: 0, rejected: 0, extensions: 0, attendanceRate: 100, perfect: 50, unapproved: 0, lateEarly: 0 },
    { userNV: "NV015", totalTasks: 4, onTime: 4, urgentOnTime: 0, firstTime: 4, overdue: 0, rejected: 0, extensions: 0, attendanceRate: 100, perfect: 50, unapproved: 0, lateEarly: 0 },
    { userNV: "NV016", totalTasks: 9, onTime: 9, urgentOnTime: 1, firstTime: 8, overdue: 0, rejected: 0, extensions: 0, attendanceRate: 100, perfect: 50, unapproved: 0, lateEarly: 0 },
  ];

  function summaryFromSeed(
    s: (typeof summarySeeds)[number],
    year: number,
    month: number,
    delta: { onTime: number; firstTime: number },
  ) {
    addSummary({
      userNV: s.userNV,
      year,
      month,
      totalTasks: s.totalTasks,
      onTime: delta.onTime,
      urgentOnTime: s.urgentOnTime,
      firstTime: delta.firstTime,
      overdue: s.overdue,
      rejected: s.rejected,
      extensions: s.extensions,
      attendanceRate: s.attendanceRate,
      perfectAttendance: s.perfect,
      unapprovedLeave: s.unapproved,
      lateEarly: s.lateEarly,
    });
  }

  for (const s of summarySeeds) {
    summaryFromSeed(s, CURRENT_YEAR, CURRENT_MONTH, {
      onTime: s.onTime,
      firstTime: s.firstTime,
    });
    // previous month (slightly different numbers)
    summaryFromSeed(s, PREVIOUS_MONTH_YEAR, PREVIOUS_MONTH, {
      onTime: Math.max(0, s.onTime - 1),
      firstTime: Math.max(0, s.firstTime - 2),
    });
  }

  // KPI ledger events (current month) for a few users
  addKpiEvent("NV001", "KPI_ON_TIME_TICKET", CURRENT_YEAR, CURRENT_MONTH, -1, hourlyApp.id);
  addKpiEvent("NV001", "KPI_ON_TIME_URGENT", CURRENT_YEAR, CURRENT_MONTH, -1, hourlyApp.id);
  addKpiEvent("NV001", "KPI_FIRST_TIME_APPROVAL", CURRENT_YEAR, CURRENT_MONTH, -1, hourlyApp.id);
  addKpiEvent("NV001", "KPI_PERFECT_ATTENDANCE", CURRENT_YEAR, CURRENT_MONTH, 0);
  addKpiEvent("NV002", "KPI_ON_TIME_TICKET", CURRENT_YEAR, CURRENT_MONTH, -1, dailyAppYesterday.id);
  addKpiEvent("NV003", "KPI_OVERDUE_TICKET", CURRENT_YEAR, CURRENT_MONTH, 0, dailyPenLate.id);
  addKpiEvent("NV009", "KPI_UNAPPROVED_LEAVE", CURRENT_YEAR, CURRENT_MONTH, -2);
  addKpiEvent("NV006", "KPI_ON_TIME_TICKET", CURRENT_YEAR, CURRENT_MONTH, -8, multiApp.id);

  /* ------------------------------------------------------ audit + settings */
  const systemAuditLogs: SystemAuditLog[] = [];
  function addAudit(opts: {
    userNV: string | null;
    moduleCode: ModuleCode | null;
    action: string;
    resourceType: string;
    resourceId?: string;
    oldData?: Record<string, unknown> | null;
    newData?: Record<string, unknown> | null;
    ip?: string;
    offset: number;
  }) {
    const user = opts.userNV ? userByNVCode.get(opts.userNV)! : null;
    systemAuditLogs.push({
      id: nextId("audit"),
      user,
      moduleCode: opts.moduleCode,
      action: opts.action,
      resourceType: opts.resourceType,
      resourceId: opts.resourceId ?? null,
      oldData: opts.oldData ?? null,
      newData: opts.newData ?? null,
      ipAddress: opts.ip ?? "203.0.113.10",
      userAgent: "Mozilla/5.0 (mock)",
      createdAt: isoDay(opts.offset, 15, 30),
    });
  }
  addAudit({ userNV: "NV014", moduleCode: "settings", action: "USER_CREATE", resourceType: "USER", resourceId: "NV010", newData: { userCode: "NV010", role: "EMPLOYEE" }, offset: -9 });
  addAudit({ userNV: "NV014", moduleCode: "settings", action: "USER_UPDATE", resourceType: "USER", resourceId: "NV010", oldData: { department: "B-QC" }, newData: { department: "B-HR" }, offset: -8 });
  addAudit({ userNV: "NV015", moduleCode: "settings", action: "PERMISSION_CHANGE", resourceType: "PERMISSION", resourceId: "role:EMPLOYEE", oldData: { granted: true }, newData: { granted: false }, offset: -7 });
  addAudit({ userNV: "NV016", moduleCode: "settings", action: "WEBHOOK_UPDATE", resourceType: "APP_SETTING", resourceId: "telegram.alert_group_chat_id", newData: { value: "-100123456789" }, offset: -6 });
  addAudit({ userNV: "NV013", moduleCode: "jobs", action: "TASK_CREATE", resourceType: "TASK", resourceId: hourlyReq.id, newData: { taskCode: hourlyReq.taskCode }, offset: 0 });
  addAudit({ userNV: "NV013", moduleCode: "jobs", action: "TASK_CANCEL", resourceType: "TASK", resourceId: dailyCan.id, oldData: { state: "ACT" }, newData: { state: "CAN" }, offset: -1 });
  addAudit({ userNV: "NV014", moduleCode: "planning", action: "PENALTY_LEAVE_ASSIGN", resourceType: "ATTENDANCE", resourceId: "NV003", newData: { leaveCode: "UAL" }, offset: -1 });
  addAudit({ userNV: "NV011", moduleCode: "planning", action: "LEAVE_APPROVE", resourceType: "LEAVE", resourceId: approvedAl.id, newData: { status: "APPROVED" }, offset: -10 });
  addAudit({ userNV: null, moduleCode: "performance", action: "KPI_RECALC", resourceType: "KPI_SUMMARY", resourceId: CURRENT_MONTH.toString(), offset: 0 });
  addAudit({ userNV: "NV015", moduleCode: "settings", action: "USER_LOCK", resourceType: "USER", resourceId: "NV007", oldData: { isActive: true }, newData: { isActive: false }, offset: -20 });
  addAudit({ userNV: "NV014", moduleCode: "settings", action: "PASSWORD_RESET", resourceType: "USER", resourceId: "NV006", offset: -4 });
  addAudit({ userNV: null, moduleCode: null, action: "SYSTEM_BOOTSTRAP", resourceType: "SYSTEM", offset: -30 });

  const appSettings: AppSetting[] = [
    { id: nextId("set"), moduleCode: "planning", key: "daily_planning_cutoff", value: "08:30", isSecret: false, description: "Daily Quick-add confirmation cutoff.", createdAt: YEAR_START_ISO, updatedAt: NOW_ISO },
    { id: nextId("set"), moduleCode: "jobs", key: "default_project_code", value: "PRJ-GEN", isSecret: false, description: "Default project for new tickets.", createdAt: YEAR_START_ISO, updatedAt: NOW_ISO },
    { id: nextId("set"), moduleCode: "performance", key: "kpi_engine_enabled", value: true, isSecret: false, description: "Enable deterministic KPI scoring.", createdAt: YEAR_START_ISO, updatedAt: NOW_ISO },
    { id: nextId("set"), moduleCode: "settings", key: "telegram.alert_group_chat_id", value: "-1009876543210", isSecret: false, description: "Telegram alert group chat ID.", createdAt: YEAR_START_ISO, updatedAt: NOW_ISO },
    { id: nextId("set"), moduleCode: "settings", key: "telegram.bot_token", value: "123456:AA-mock-bot-token", isSecret: true, description: "Telegram bot token.", createdAt: YEAR_START_ISO, updatedAt: NOW_ISO },
    { id: nextId("set"), moduleCode: "settings", key: "telegram.webhook_url", value: "https://mes.local/hooks/telegram", isSecret: false, description: "Webhook endpoint URL.", createdAt: YEAR_START_ISO, updatedAt: NOW_ISO },
    { id: nextId("set"), moduleCode: "settings", key: "telegram.enabled", value: true, isSecret: false, description: "Enable Telegram notifications.", createdAt: YEAR_START_ISO, updatedAt: NOW_ISO },
  ];

  const telegramWebhookConfig: TelegramWebhookConfig = {
    botToken: "123456:AA-mock-bot-token",
    alertGroupChatId: "-1009876543210",
    webhookUrl: "https://mes.local/hooks/telegram",
    isEnabled: true,
  };

  const notifications: Notification[] = [
    {
      id: nextId("notif"),
      channel: "TELEGRAM",
      template: "TASK_CREATED",
      recipient: "-1009876543210",
      payload: { taskCode: hourlyReq.taskCode },
      status: "SENT",
      attempts: 1,
      relatedType: "TASK",
      relatedId: hourlyReq.id,
      errorMessage: null,
      sentAt: isoDay(0, 9, 5),
      createdAt: isoDay(0, 9, 0),
      updatedAt: isoDay(0, 9, 5),
    },
    {
      id: nextId("notif"),
      channel: "TELEGRAM",
      template: "LEAVE_APPROVED",
      recipient: "-1009876543210",
      payload: { leaveCode: "AL" },
      status: "FAILED",
      attempts: 2,
      relatedType: "LEAVE",
      relatedId: approvedAl.id,
      errorMessage: "Chat not found.",
      sentAt: null,
      createdAt: isoDay(-10, 16, 5),
      updatedAt: isoDay(-10, 16, 10),
    },
  ];

  return {
    modules: MODULES.map((m) => ({ code: m.code, name: m.name })),
    departments,
    users,
    roles,
    permissions,
    rolePermissions,
    projects,
    tasks,
    attachments,
    attendanceRecords,
    leaveRequests,
    leaveBalanceEntries,
    overtimeRecords,
    kpiScoreEvents,
    kpiMonthlySummaries,
    systemAuditLogs,
    appSettings,
    notifications,
    telegramWebhookConfig,
  };
}

/* -------------------------------------------------------------------------- */
/* Reactive store                                                             */
/* -------------------------------------------------------------------------- */

export const state: MockState = seed();

let version = 0;
const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getVersion(): number {
  return version;
}

export function getServerVersion(): number {
  return 0;
}

/** Notify subscribers that the store changed. */
export function notify(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/* -------------------------------------------------------------------------- */
/* Convenience lookups                                                        */
/* -------------------------------------------------------------------------- */

export function userByCode(userCode: string): User | null {
  return state.users.find((u) => u.userCode === userCode) ?? null;
}

export function userById(id: string): User | null {
  return state.users.find((u) => u.id === id) ?? null;
}

export function departmentById(
  id: string | null | undefined,
): Department | null {
  if (!id) return null;
  return state.departments.find((d) => d.id === id) ?? null;
}

export function taskById(id: string): Task | null {
  return state.tasks.find((t) => t.id === id) ?? null;
}

export function demoUsers(): User[] {
  const byRole = new Map(state.users.map((u) => [u.userCode, u]));
  return (Object.keys(DEMO_USER_CODES) as RoleCode[])
    .map((role) => byRole.get(DEMO_USER_CODES[role]) ?? null)
    .filter((u): u is User => u !== null);
}
