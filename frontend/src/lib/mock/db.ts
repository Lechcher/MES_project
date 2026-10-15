/**
 * db.ts — module-level deterministic in-memory store.
 *
 * Seeded deterministically relative to `new Date()` at module load, so
 * Today/Yesterday/Overdue/calendar views are always populated. Re-seeded on
 * every page reload (in-memory, ephemeral — matches the specified behavior).
 * Makes zero network calls.
 */

import {
  KPI_POINT_RULES,
  LEAVE_CODE_BY_CODE,
  LEAVE_CODES,
  TICKET_STATE_BY_CODE,
  TICKET_STATES,
} from "./registries";
import type {
  ApprovalStatus,
  AppSetting,
  Attachment,
  AttendanceRecord,
  Department,
  DepartmentType,
  KpiMonthlySummary,
  KpiPointRule,
  KpiScoreEvent,
  LeaveBalance,
  LeaveBalanceEntry,
  LeaveCode,
  LeaveRequest,
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
  TaskStateTransition,
  TaskType,
  TelegramWebhookConfig,
  TicketStateCode,
  User,
} from "./types";

/*──────────────────────────── helpers ────────────────────────────────────────*/

const now = () => new Date();

function uid(prefix = ""): string {
  return `${prefix}${Math.random().toString(36).slice(2, 14)}`;
}

function id(): string {
  // opaque UUID-shaped ID, deterministic-ish enough for a mock
  return `${uid()}-${uid()}-${uid()}`;
}

function iso(d: Date): string {
  return d.toISOString();
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setUTCHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setUTCHours(23, 59, 59, 999);
  return r;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/*──────────────────────────── date anchors ───────────────────────────────────*/

const today = startOfDay(now());
const yesterday = addDays(today, -1);
const tomorrow = addDays(today, 1);
const nowIso = iso(now());

/*──────────────────────────── department fixtures ────────────────────────────*/

const deptOps = {
  id: id(),
  code: "OPS",
  name: "General Operations",
  departmentType: "DEPARTMENT" as DepartmentType,
  parent: null,
  manager: null as User | null,
  autoForkingEnabled: true,
  isActive: true,
  createdAt: iso(addDays(today, -60)),
  updatedAt: iso(addDays(today, -60)),
};

const deptSales = {
  id: id(),
  code: "SL",
  name: "Sales",
  departmentType: "DEPARTMENT" as DepartmentType,
  parent: null,
  manager: null as User | null,
  autoForkingEnabled: true,
  isActive: true,
  createdAt: iso(addDays(today, -60)),
  updatedAt: iso(addDays(today, -60)),
};

const deptEng = {
  id: id(),
  code: "ENG",
  name: "Engineering",
  departmentType: "DEPARTMENT" as DepartmentType,
  parent: null,
  manager: null as User | null,
  autoForkingEnabled: false,
  isActive: true,
  createdAt: iso(addDays(today, -60)),
  updatedAt: iso(addDays(today, -60)),
};

const deptHR = {
  id: id(),
  code: "HR",
  name: "Human Resources",
  departmentType: "DEPARTMENT" as DepartmentType,
  parent: null,
  manager: null as User | null,
  autoForkingEnabled: true,
  isActive: true,
  createdAt: iso(addDays(today, -60)),
  updatedAt: iso(addDays(today, -60)),
};

const divisions: Department[] = [
  {
    id: id(),
    code: "DIV-OPS",
    name: "Operations Division",
    departmentType: "DIVISION",
    parent: null,
    manager: null as User | null,
    autoForkingEnabled: true,
    isActive: true,
    createdAt: iso(addDays(today, -60)),
    updatedAt: iso(addDays(today, -60)),
  },
];

const departments: Department[] = [
  deptOps,
  deptSales,
  deptEng,
  deptHR,
  ...divisions,
];

const deptByCode: Record<string, Department> = {};
for (const d of departments) deptByCode[d.code] = d;

/*──────────────────────────── user fixtures ──────────────────────────────────*/

const makeUser = (
  overrides: Partial<User> & { departmentCode?: string },
): User => {
  const department = overrides.departmentCode
    ? deptByCode[overrides.departmentCode] || null
    : null;
  return {
    id: overrides.id || id(),
    userCode: overrides.userCode || uid("USR"),
    fullName: overrides.fullName || "User",
    email: overrides.email || `user@example.com`,
    department,
    isActive: overrides.isActive ?? true,
    roles: overrides.roles || [],
    createdAt: overrides.createdAt || iso(addDays(today, -90)),
    updatedAt: iso(addDays(today, -90)),
  } as User;
};

const adminUser = makeUser({
  userCode: "ADMIN01",
  fullName: "Super Admin",
  email: "admin@mes.local",
  departmentCode: "OPS",
  roles: [],
});

const techLeadUser = makeUser({
  userCode: "LEAD01",
  fullName: "Tech Lead",
  email: "lead@mes.local",
  departmentCode: "ENG",
  roles: [],
});

const hrManagerUser = makeUser({
  userCode: "HR01",
  fullName: "HR Manager",
  email: "hr@mes.local",
  departmentCode: "HR",
  roles: [],
});

const deptHeadUser = makeUser({
  userCode: "HEAD01",
  fullName: "Dept Head",
  email: "head@mes.local",
  departmentCode: "OPS",
  roles: [],
});

const employeeUser = makeUser({
  userCode: "EMP01",
  fullName: "Employee One",
  email: "emp@mes.local",
  departmentCode: "OPS",
  roles: [],
});

const employeeUser2 = makeUser({
  userCode: "EMP02",
  fullName: "Employee Two",
  email: "emp2@mes.local",
  departmentCode: "OPS",
  roles: [],
});

const employeeUserSales = makeUser({
  userCode: "EMP03",
  fullName: "Sales Employee",
  email: "emp3@mes.local",
  departmentCode: "SL",
  roles: [],
});

const users: User[] = [
  adminUser,
  techLeadUser,
  hrManagerUser,
  deptHeadUser,
  employeeUser,
  employeeUser2,
  employeeUserSales,
  makeUser({
    userCode: "EMP04",
    fullName: "Engineering Employee",
    email: "emp4@mes.local",
    departmentCode: "ENG",
  }),
  makeUser({
    userCode: "EMP05",
    fullName: "HR Employee",
    email: "emp5@mes.local",
    departmentCode: "HR",
  }),
  makeUser({
    userCode: "EMP06",
    fullName: "Ops Employee",
    email: "emp6@mes.local",
    departmentCode: "OPS",
  }),
  makeUser({
    userCode: "EMP07",
    fullName: "Ops Employee B",
    email: "emp7@mes.local",
    departmentCode: "OPS",
  }),
  makeUser({
    userCode: "EMP08",
    fullName: "Sales Employee B",
    email: "emp8@mes.local",
    departmentCode: "SL",
  }),
];

const userById: Record<string, User> = {};
for (const u of users) userById[u.id] = u;

const userByCode: Record<string, User> = {};
for (const u of users) userByCode[u.userCode] = u;

/* demo accounts: exactly one per role */
const DEMO_ACCOUNTS: User[] = [
  adminUser,
  techLeadUser,
  hrManagerUser,
  deptHeadUser,
  employeeUser,
];

/*──────────────────────────── roles & permissions ────────────────────────────*/

const permissions: Permission[] = [
  {
    id: id(),
    code: "jobs.ticket.create",
    moduleCode: "jobs",
    description: "Create / allocate a ticket (REQ).",
  },
  {
    id: id(),
    code: "jobs.ticket.accept_report",
    moduleCode: "jobs",
    description: "Accept a task (ACT) and report (PEN).",
  },
  {
    id: id(),
    code: "jobs.ticket.approve_return",
    moduleCode: "jobs",
    description: "Approve (APP) or return (REJ) a report.",
  },
  {
    id: id(),
    code: "jobs.ticket.cancel",
    moduleCode: "jobs",
    description: "Cancel a ticket (CAN).",
  },
  {
    id: id(),
    code: "jobs.ticket.request_extension",
    moduleCode: "jobs",
    description: "Request an extension or explain a late submission.",
  },
  {
    id: id(),
    code: "jobs.ticket.print_export",
    moduleCode: "jobs",
    description: "Print ticket slips / export task data.",
  },
  {
    id: id(),
    code: "planning.calendar.view",
    moduleCode: "planning",
    description: "View the attendance matrix calendar.",
  },
  {
    id: id(),
    code: "planning.leave.register",
    moduleCode: "planning",
    description: "Register a leave request.",
  },
  {
    id: id(),
    code: "planning.leave.approve",
    moduleCode: "planning",
    description: "Approve leave requests / work.",
  },
  {
    id: id(),
    code: "planning.leave.assign_penalty",
    moduleCode: "planning",
    description: "Assign penalty leave codes (UAL, USL).",
  },
  {
    id: id(),
    code: "planning.print_export",
    moduleCode: "planning",
    description: "Print leave requests / export attendance data.",
  },
  {
    id: id(),
    code: "performance.kpi.view_personal",
    moduleCode: "performance",
    description: "View the personal KPI dashboard.",
  },
  {
    id: id(),
    code: "performance.audit.level3_view",
    moduleCode: "performance",
    description: "View Audit Level 3 (employees in a department).",
  },
  {
    id: id(),
    code: "performance.audit.level1_2_view",
    moduleCode: "performance",
    description: "View Audit Levels 1 & 2 (company / department).",
  },
  {
    id: id(),
    code: "performance.print_export",
    moduleCode: "performance",
    description: "Print / export KPI and audit reports.",
  },
  {
    id: id(),
    code: "settings.users.manage",
    moduleCode: "settings",
    description: "Manage accounts (create/edit/reset/lock).",
  },
  {
    id: id(),
    code: "settings.rbac.manage",
    moduleCode: "settings",
    description: "Manage RBAC authorization.",
  },
  {
    id: id(),
    code: "settings.webhook.manage",
    moduleCode: "settings",
    description: "Manage the Telegram webhook configuration.",
  },
];

const permByCode: Record<string, Permission> = {};
for (const p of permissions) permByCode[p.code] = p;

const grants: Record<RoleCode, string[]> = {
  SUPER_ADMIN: permissions.map((p) => p.code),
  TECH_LEAD: permissions
    .filter((p) => p.code !== "settings.users.manage")
    .map((p) => p.code),
  HR_MANAGER: permissions
    .filter(
      (p) =>
        p.code !== "settings.rbac.manage" &&
        p.code !== "settings.webhook.manage" &&
        p.moduleCode !== "audit-log",
    )
    .map((p) => p.code),
  DEPT_HEAD: [
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
  ],
  EMPLOYEE: [
    "jobs.ticket.accept_report",
    "jobs.ticket.request_extension",
    "jobs.ticket.print_export",
    "planning.calendar.view",
    "planning.leave.register",
    "planning.print_export",
    "performance.kpi.view_personal",
    "performance.print_export",
  ],
};

const permSetByRole: Record<RoleCode, Set<string>> = {} as Record<
  RoleCode,
  Set<string>
>;
for (const role of Object.keys(grants) as RoleCode[]) {
  permSetByRole[role] = new Set(grants[role]);
}

const roles: Role[] = [
  {
    id: id(),
    code: "SUPER_ADMIN",
    name: "Super Admin",
    description: "Full system administration.",
    permissions: [],
    createdAt: iso(addDays(today, -120)),
    updatedAt: iso(addDays(today, -120)),
  },
  {
    id: id(),
    code: "TECH_LEAD",
    name: "Manager / Tech Lead",
    description: "Management plus RBAC and webhook configuration.",
    permissions: [],
    createdAt: iso(addDays(today, -120)),
    updatedAt: iso(addDays(today, -120)),
  },
  {
    id: id(),
    code: "HR_MANAGER",
    name: "HR Manager",
    description: "Company-wide HR: users, leave, reports.",
    permissions: [],
    createdAt: iso(addDays(today, -120)),
    updatedAt: iso(addDays(today, -120)),
  },
  {
    id: id(),
    code: "DEPT_HEAD",
    name: "Department Head",
    description: "Department-scoped management.",
    permissions: [],
    createdAt: iso(addDays(today, -120)),
    updatedAt: iso(addDays(today, -120)),
  },
  {
    id: id(),
    code: "EMPLOYEE",
    name: "Employee",
    description: "Personal workspace only.",
    permissions: [],
    createdAt: iso(addDays(today, -120)),
    updatedAt: iso(addDays(today, -120)),
  },
];

const roleByCode: Record<RoleCode, Role> = {} as Record<RoleCode, Role>;
for (const r of roles) {
  roleByCode[r.code] = r;
  r.permissions = permissions.filter((p) => permSetByRole[r.code].has(p.code));
}

// assign roles to users (demo accounts get exactly their role)
const assignRole = (user: User, roleCode: RoleCode) => {
  user.roles = [roleByCode[roleCode]];
};
assignRole(adminUser, "SUPER_ADMIN");
assignRole(techLeadUser, "TECH_LEAD");
assignRole(hrManagerUser, "HR_MANAGER");
assignRole(deptHeadUser, "DEPT_HEAD");
assignRole(employeeUser, "EMPLOYEE");
assignRole(employeeUser2, "EMPLOYEE");
assignRole(employeeUserSales, "EMPLOYEE");
for (const u of users.slice(7)) assignRole(u, "EMPLOYEE");

// set department managers
deptOps.manager = deptHeadUser;
deptSales.manager = employeeUserSales;
deptEng.manager = techLeadUser;
deptHR.manager = hrManagerUser;

/*──────────────────────────── project fixtures ───────────────────────────────*/

const projGeneral = {
  id: id(),
  code: "GEN-OPS",
  name: "General Operations",
  description: "Default project for general operational tasks.",
  department: deptOps,
  isActive: true,
  createdAt: iso(addDays(today, -120)),
  updatedAt: iso(addDays(today, -120)),
};

const projSales = {
  id: id(),
  code: "SL-2026",
  name: "Sales Campaign 2026",
  description: "Quarterly sales campaign.",
  department: deptSales,
  isActive: true,
  createdAt: iso(addDays(today, -100)),
  updatedAt: iso(addDays(today, -100)),
};

const projects: Project[] = [projGeneral, projSales];
const projectById: Record<string, Project> = {};
for (const p of projects) projectById[p.id] = p;

/*──────────────────────────── task fixtures ──────────────────────────────────*/

const hourSlot = (h: number, m: number): Date => {
  const r = new Date(today);
  r.setUTCHours(h, m, 0, 0);
  return r;
};

const makeTask = (overrides: Partial<Task>): Task => {
  const task: Task = {
    id: overrides.id || id(),
    taskCode: overrides.taskCode || `T-${uid().toUpperCase().slice(0, 4)}`,
    title: overrides.title || "Untitled task",
    description: overrides.description || null,
    project: overrides.project || projGeneral,
    taskType: overrides.taskType || "DAILY",
    priority: overrides.priority || "MEDIUM",
    state: overrides.state || "REQ",
    createdBy: overrides.createdBy || deptHeadUser,
    assignedTo: overrides.assignedTo || employeeUser,
    department: overrides.department || deptOps,
    startDate: overrides.startDate || iso(today),
    endDate: overrides.endDate || iso(addDays(today, 1)),
    extendedDeadline: overrides.extendedDeadline || null,
    progressPercentage: overrides.progressPercentage ?? 0,
    isUrgentHourly: overrides.isUrgentHourly ?? false,
    isExtensionRequested: overrides.isExtensionRequested ?? false,
    isOverdue: overrides.isOverdue ?? false,
    badges: overrides.badges || [],
    approvedBy: overrides.approvedBy || null,
    approvedAt: overrides.approvedAt || null,
    reviewedBy: overrides.reviewedBy || null,
    reviewedAt: overrides.reviewedAt || null,
    progressLogs: [],
    stateTransitions: [],
    requests: [],
    attachments: [],
    createdAt: overrides.createdAt || iso(addDays(today, -7)),
    updatedAt: iso(now()),
  };
  return task;
};

const pushTransition = (
  task: Task,
  toState: TicketStateCode,
  actor: User,
  reason?: string,
) => {
  const transition: TaskStateTransition = {
    id: id(),
    task,
    fromState: task.state,
    toState,
    actor,
    reason: reason || null,
    createdAt: iso(now()),
  };
  task.stateTransitions.push(transition);
  task.state = toState;
  task.updatedAt = iso(now());
};

const pushProgressLog = (
  task: Task,
  user: User,
  previous: number,
  next: number,
  comment?: string,
  verified = false,
) => {
  const log: TaskProgressLog = {
    id: id(),
    task,
    user,
    previousPercentage: previous,
    newPercentage: next,
    logComment: comment || null,
    isVerifiedByManager: verified,
    createdAt: iso(now()),
  };
  task.progressLogs.push(log);
  task.progressPercentage = next;
  task.updatedAt = iso(now());
};

const addAttachment = (
  ownerType: string,
  ownerId: string,
  fileName: string,
  mimeType: string,
  uploadedBy: User,
): Attachment => ({
  id: id(),
  ownerType,
  ownerId,
  url: `mock://attachments/${ownerId}/${fileName}`,
  fileName,
  mimeType,
  uploadedBy,
  createdAt: iso(now()),
});

const tasks: Task[] = [];

/* REQ states (unconfirmed) */
tasks.push(
  makeTask({
    taskCode: "T-1001",
    title: "Prepare weekly production report",
    taskType: "DAILY",
    priority: "HIGH",
    state: "REQ",
    assignedTo: employeeUser,
    department: deptOps,
    endDate: iso(hourSlot(17, 0)),
    createdAt: iso(addDays(today, -2)),
  }),
  makeTask({
    taskCode: "T-1002",
    title: "Review Q3 sales forecast",
    taskType: "HOURLY",
    priority: "URGENT",
    state: "REQ",
    assignedTo: employeeUserSales,
    department: deptSales,
    endDate: iso(hourSlot(14, 0)),
    isUrgentHourly: true,
    createdAt: iso(addDays(today, -1)),
  }),
  makeTask({
    taskCode: "T-1003",
    title: "Update employee directory",
    taskType: "DAILY",
    priority: "LOW",
    state: "REQ",
    assignedTo: employeeUser2,
    department: deptHR,
    endDate: iso(addDays(today, 2)),
    createdAt: iso(addDays(today, -3)),
  }),
);

/* ACT states (in progress) */
tasks.push(
  makeTask({
    taskCode: "T-1004",
    title: "Design onboarding workflow",
    taskType: "MULTI_DAY",
    priority: "MEDIUM",
    state: "ACT",
    assignedTo: employeeUser,
    department: deptOps,
    startDate: iso(addDays(today, -5)),
    endDate: iso(addDays(today, 3)),
    progressPercentage: 50,
    badges: ["PROGRESS_UPDATE"],
    createdAt: iso(addDays(today, -10)),
  }),
  makeTask({
    taskCode: "T-1005",
    title: "Configure CI/CD pipeline",
    taskType: "HOURLY",
    priority: "HIGH",
    state: "ACT",
    assignedTo: employeeUser2,
    department: deptEng,
    endDate: iso(hourSlot(16, 30)),
    badges: ["URGENT_PROCESSING"],
    createdAt: iso(addDays(today, -1)),
  }),
  makeTask({
    taskCode: "T-1006",
    title: "Audit Q2 expense claims",
    taskType: "DAILY",
    priority: "LOW",
    state: "ACT",
    assignedTo: hrManagerUser,
    department: deptHR,
    endDate: iso(addDays(today, 5)),
    progressPercentage: 30,
    createdAt: iso(addDays(today, -7)),
  }),
);

/* PEN states (report submitted, awaiting approval) */
tasks.push(
  makeTask({
    taskCode: "T-1007",
    title: "Monthly payroll reconciliation",
    taskType: "DAILY",
    priority: "HIGH",
    state: "PEN",
    assignedTo: hrManagerUser,
    department: deptHR,
    endDate: iso(addDays(today, -1)),
    progressPercentage: 100,
    createdAt: iso(addDays(today, -14)),
  }),
  makeTask({
    taskCode: "T-1008",
    title: "Client presentation deck",
    taskType: "MULTI_DAY",
    priority: "MEDIUM",
    state: "PEN",
    assignedTo: employeeUserSales,
    department: deptSales,
    startDate: iso(addDays(today, -8)),
    endDate: iso(addDays(today, -2)),
    progressPercentage: 100,
    badges: ["AWAITING_PROGRESS_VERIFICATION"],
    createdAt: iso(addDays(today, -12)),
  }),
);

/* APP states (approved) */
tasks.push(
  makeTask({
    taskCode: "T-1009",
    title: "Onboard new hire",
    taskType: "DAILY",
    priority: "MEDIUM",
    state: "APP",
    assignedTo: employeeUser2,
    department: deptHR,
    endDate: iso(addDays(today, -3)),
    progressPercentage: 100,
    approvedBy: deptHeadUser,
    approvedAt: iso(addDays(today, -2)),
    createdAt: iso(addDays(today, -10)),
  }),
  makeTask({
    taskCode: "T-1010",
    title: "Quarterly budget review",
    taskType: "MULTI_DAY",
    priority: "HIGH",
    state: "APP",
    assignedTo: adminUser,
    department: deptOps,
    startDate: iso(addDays(today, -20)),
    endDate: iso(addDays(today, -5)),
    progressPercentage: 100,
    approvedBy: techLeadUser,
    approvedAt: iso(addDays(today, -4)),
    createdAt: iso(addDays(today, -25)),
  }),
);

/* REJ states (returned) */
tasks.push(
  makeTask({
    taskCode: "T-1011",
    title: "Draft safety policy",
    taskType: "DAILY",
    priority: "LOW",
    state: "REJ",
    assignedTo: employeeUser,
    department: deptOps,
    endDate: iso(addDays(today, -4)),
    progressPercentage: 60,
    reviewedBy: deptHeadUser,
    reviewedAt: iso(addDays(today, -3)),
    createdAt: iso(addDays(today, -8)),
  }),
);

/* CAN states (cancelled) */
tasks.push(
  makeTask({
    taskCode: "T-1012",
    title: "Legacy data migration (cancelled)",
    taskType: "MULTI_DAY",
    priority: "LOW",
    state: "CAN",
    assignedTo: employeeUser2,
    department: deptEng,
    startDate: iso(addDays(today, -15)),
    endDate: iso(addDays(today, -1)),
    progressPercentage: 20,
    createdAt: iso(addDays(today, -20)),
  }),
);

/* OVERDUE states */
tasks.push(
  makeTask({
    taskCode: "T-1013",
    title: "File monthly tax summary",
    taskType: "DAILY",
    priority: "URGENT",
    state: "OVERDUE",
    assignedTo: hrManagerUser,
    department: deptHR,
    endDate: iso(hourSlot(10, 30)),
    isOverdue: true,
    createdAt: iso(addDays(today, -3)),
  }),
  makeTask({
    taskCode: "T-1014",
    title: "Refresh dashboard widgets",
    taskType: "HOURLY",
    priority: "HIGH",
    state: "OVERDUE",
    assignedTo: employeeUser2,
    department: deptEng,
    endDate: iso(hourSlot(10, 30)),
    isUrgentHourly: true,
    isOverdue: true,
    createdAt: iso(addDays(today, -2)),
  }),
);

/* remaining tasks to reach 40+ with variety */
const extBadgeTask = makeTask({
  taskCode: "T-1015",
  title: "Quarterly compliance audit",
  taskType: "MULTI_DAY",
  priority: "HIGH",
  state: "ACT",
  assignedTo: employeeUser,
  department: deptOps,
  startDate: iso(addDays(today, -6)),
  endDate: iso(addDays(today, 4)),
  progressPercentage: 40,
  badges: ["AWAITING_EXTENSION_APPROVAL"],
  createdAt: iso(addDays(today, -10)),
});
pushTransition(extBadgeTask, "ACT", deptHeadUser, "Accepted");
tasks.push(extBadgeTask);

const extraTitles = [
  "Update compliance checklist",
  "Back up production database",
  "Write API documentation",
  "Fix login redirect bug",
  "Performance profiling",
  "Security patch review",
  "Vendor contract renewal",
  "Office equipment audit",
  "Training session prep",
  "Inventory count Q4",
  "Migrate legacy file storage",
  "Review access logs",
  "Update DNS records",
  "Configure monitoring alerts",
  "Refactor notification service",
  "Audit third-party licenses",
  "Prepare board deck",
  "Renew SSL certificates",
  "Load test checkout flow",
  "Document runbooks",
  "Patch mobile app crash",
  "Reconcile vendor invoices",
  "Update brand guidelines",
  "Backup configuration review",
  "Test disaster recovery",
  "Onboard new contractor",
];
let counter = 1020;
for (const title of extraTitles) {
  const assigned = users[counter % users.length];
  const dept = assigned.department || deptOps;
  const state = ["REQ", "ACT", "PEN", "APP", "REJ", "CAN", "OVERDUE"][
    counter % 7
  ] as TicketStateCode;
  const taskType = ["HOURLY", "DAILY", "MULTI_DAY"][counter % 3] as TaskType;
  const priority = ["LOW", "MEDIUM", "HIGH", "URGENT"][counter % 4] as Priority;
  tasks.push(
    makeTask({
      taskCode: `T-${counter}`,
      title,
      taskType,
      priority,
      state,
      assignedTo: assigned,
      department: dept,
      progressPercentage: state === "APP" ? 100 : counter % 100,
      isOverdue: state === "OVERDUE",
      endDate: iso(addDays(today, (counter % 10) - 5)),
      createdAt: iso(addDays(today, -counter % 30)),
    }),
  );
  counter += 1;
}

const taskById: Record<string, Task> = {};
for (const t of tasks) taskById[t.id] = t;

/* seed a few progress logs & transitions for realism */
const t1004 =
  taskById[
    Array.from(Object.keys(taskById)).find(
      (k) => taskById[k].taskCode === "T-1004",
    )!
  ];
pushTransition(t1004, "ACT", deptHeadUser, "Accepted for implementation");
pushProgressLog(
  t1004,
  employeeUser,
  0,
  50,
  "Wireframe approved, drafting layout",
  false,
);
pushProgressLog(t1004, employeeUser, 50, 75, "Components implemented", false);

const t1009 =
  taskById[
    Array.from(Object.keys(taskById)).find(
      (k) => taskById[k].taskCode === "T-1009",
    )!
  ];
pushTransition(t1009, "ACT", deptHeadUser, "Accepted");
pushTransition(t1009, "PEN", employeeUser2, "Report submitted");
pushTransition(t1009, "APP", deptHeadUser, "Approved as-is");
pushProgressLog(
  t1009,
  employeeUser2,
  0,
  100,
  "All onboarding steps complete",
  true,
);

const t1013 =
  taskById[
    Array.from(Object.keys(taskById)).find(
      (k) => taskById[k].taskCode === "T-1013",
    )!
  ];
pushTransition(t1013, "REQ", hrManagerUser, "Allocated");
pushTransition(t1013, "OVERDUE", hrManagerUser, "Missed 10:30 hourly deadline");

/* task requests (extension / late explanation) */
const taskRequests: TaskRequest[] = [];
const extReq: TaskRequest = {
  id: id(),
  task: t1004,
  user: employeeUser,
  requestType: "EXTENSION",
  requestedDeadline: iso(addDays(today, 7)),
  reason: "Need extra time for stakeholder review.",
  status: "PENDING",
  reviewedBy: null,
  reviewComment: null,
  reviewedAt: null,
  createdAt: iso(addDays(today, -2)),
  updatedAt: iso(addDays(today, -2)),
};
taskRequests.push(extReq);
t1004.requests.push(extReq);
t1004.isExtensionRequested = true;

const lateReq: TaskRequest = {
  id: id(),
  task: t1013,
  user: hrManagerUser,
  requestType: "LATE_EXPLANATION",
  requestedDeadline: null,
  reason: "Waiting on external vendor data.",
  status: "PENDING",
  reviewedBy: null,
  reviewComment: null,
  reviewedAt: null,
  createdAt: iso(addDays(today, -1)),
  updatedAt: iso(addDays(today, -1)),
};
taskRequests.push(lateReq);
t1013.requests.push(lateReq);

/* attachments */
const attachments: Attachment[] = [];
const att = addAttachment(
  "TASK_PROGRESS",
  t1004.id,
  "wireframe.pdf",
  "application/pdf",
  employeeUser,
);
attachments.push(att);
t1004.attachments.push(att);

const taskRequestById: Record<string, TaskRequest> = {};
for (const r of taskRequests) taskRequestById[r.id] = r;
const attachmentById: Record<string, Attachment> = {};
for (const a of attachments) attachmentById[a.id] = a;

/*──────────────────────────── attendance & leave fixtures ────────────────────*/

const dayOffset = (n: number): Date => addDays(today, n);

const makeAttendance = (
  overrides: Partial<AttendanceRecord>,
): AttendanceRecord => ({
  id: overrides.id || id(),
  user: overrides.user || employeeUser,
  workDate: overrides.workDate || iso(today),
  checkIn: overrides.checkIn || null,
  checkOut: overrides.checkOut || null,
  isLate: overrides.isLate ?? false,
  isEarlyLeave: overrides.isEarlyLeave ?? false,
  leaveCode: overrides.leaveCode || null,
  workingHours: overrides.workingHours ?? 0,
  createdAt: overrides.createdAt || iso(today),
  updatedAt: iso(today),
});

const attendanceRecords: AttendanceRecord[] = [
  makeAttendance({
    user: employeeUser,
    workDate: iso(yesterday),
    checkIn: iso(addDays(yesterday, 0)),
    checkOut: iso(addDays(yesterday, 0)),
    isLate: false,
    isEarlyLeave: false,
    workingHours: 8,
  }),
  makeAttendance({
    user: employeeUser,
    workDate: iso(today),
    checkIn: iso(addDays(today, 0)),
    checkOut: null,
    isLate: true,
    isEarlyLeave: false,
    workingHours: 4,
  }),
  makeAttendance({
    user: employeeUser2,
    workDate: iso(yesterday),
    checkIn: iso(addDays(yesterday, 0)),
    checkOut: iso(addDays(yesterday, 0)),
    isLate: false,
    isEarlyLeave: true,
    leaveCode: "SL",
    workingHours: 6,
  }),
  makeAttendance({
    user: hrManagerUser,
    workDate: iso(yesterday),
    checkIn: iso(addDays(yesterday, 0)),
    checkOut: iso(addDays(yesterday, 0)),
    isLate: false,
    isEarlyLeave: false,
    workingHours: 8,
  }),
];

const attendanceById: Record<string, AttendanceRecord> = {};
for (const a of attendanceRecords) attendanceById[a.id] = a;

const makeLeaveRequest = (overrides: Partial<LeaveRequest>): LeaveRequest => ({
  id: overrides.id || id(),
  user: overrides.user || employeeUser,
  leaveCode: overrides.leaveCode || "AL",
  startDate: overrides.startDate || iso(addDays(today, 5)),
  endDate: overrides.endDate || iso(addDays(today, 6)),
  totalDays: overrides.totalDays ?? 2,
  reason: overrides.reason || "Annual leave.",
  handoverUser: overrides.handoverUser || null,
  status: overrides.status || "PENDING",
  approvedBy: overrides.approvedBy || null,
  approvedAt: overrides.approvedAt || null,
  attachments: [],
  createdAt: overrides.createdAt || iso(addDays(today, -3)),
  updatedAt: iso(addDays(today, -3)),
});

const leaveRequests: LeaveRequest[] = [
  makeLeaveRequest({
    user: employeeUser,
    leaveCode: "AL",
    startDate: iso(addDays(today, 10)),
    endDate: iso(addDays(today, 11)),
    totalDays: 2,
    reason: "Annual leave.",
    status: "APPROVED",
    approvedBy: deptHeadUser,
    approvedAt: iso(addDays(today, -2)),
  }),
  makeLeaveRequest({
    user: employeeUser2,
    leaveCode: "SL",
    startDate: iso(addDays(today, -1)),
    endDate: iso(addDays(today, -1)),
    totalDays: 1,
    reason: "Sick leave.",
    status: "PENDING",
  }),
  makeLeaveRequest({
    user: hrManagerUser,
    leaveCode: "UAL",
    startDate: iso(addDays(today, -2)),
    endDate: iso(addDays(today, -2)),
    totalDays: 1,
    reason: "Unapproved absence.",
    status: "APPROVED",
    approvedBy: adminUser,
    approvedAt: iso(addDays(today, -1)),
  }),
];

const leaveById: Record<string, LeaveRequest> = {};
for (const lr of leaveRequests) leaveById[lr.id] = lr;

const makeLeaveBalanceEntry = (
  overrides: Partial<LeaveBalanceEntry>,
): LeaveBalanceEntry => ({
  id: overrides.id || id(),
  user: overrides.user || employeeUser,
  leaveCode: overrides.leaveCode || "AL",
  entryType: overrides.entryType || "ACCRUAL",
  deltaDays: overrides.deltaDays ?? 0,
  periodYear: overrides.periodYear ?? today.getUTCFullYear(),
  referenceType: overrides.referenceType || null,
  referenceId: overrides.referenceId || null,
  note: overrides.note || null,
  createdBy: overrides.createdBy || null,
  createdAt: overrides.createdAt || iso(today),
});

const leaveBalanceEntries: LeaveBalanceEntry[] = [
  makeLeaveBalanceEntry({
    user: employeeUser,
    leaveCode: "AL",
    entryType: "ACCRUAL",
    deltaDays: 15,
  }),
  makeLeaveBalanceEntry({
    user: employeeUser,
    leaveCode: "AL",
    entryType: "USAGE",
    deltaDays: -3,
  }),
  makeLeaveBalanceEntry({
    user: employeeUser,
    leaveCode: "TOIL",
    entryType: "ACCRUAL",
    deltaDays: 8,
  }),
  makeLeaveBalanceEntry({
    user: employeeUser2,
    leaveCode: "AL",
    entryType: "ACCRUAL",
    deltaDays: 12,
  }),
  makeLeaveBalanceEntry({
    user: employeeUser2,
    leaveCode: "TOIL",
    entryType: "ACCRUAL",
    deltaDays: 4,
  }),
];

const leaveBalances: LeaveBalance[] = [
  {
    user: employeeUser,
    leaveCode: "AL",
    leaveName: "Annual Leave",
    balanceDays: 12,
  },
  {
    user: employeeUser,
    leaveCode: "TOIL",
    leaveName: "Time Off In Lieu",
    balanceDays: 8,
  },
  {
    user: employeeUser2,
    leaveCode: "AL",
    leaveName: "Annual Leave",
    balanceDays: 12,
  },
  {
    user: employeeUser2,
    leaveCode: "TOIL",
    leaveName: "Time Off In Lieu",
    balanceDays: 4,
  },
];

/*──────────────────────────── overtime fixtures ──────────────────────────────*/

const overtimeRecords: OvertimeRecord[] = [
  {
    id: id(),
    user: employeeUser,
    workDate: iso(addDays(today, -3)),
    hours: 2,
    isApproved: true,
    approvedBy: deptHeadUser,
    approvedAt: iso(addDays(today, -2)),
    note: "Evening support.",
    createdAt: iso(addDays(today, -3)),
    updatedAt: iso(addDays(today, -2)),
  },
  {
    id: id(),
    user: employeeUser2,
    workDate: iso(addDays(today, -2)),
    hours: 3,
    isApproved: false,
    approvedBy: null,
    approvedAt: null,
    note: "Weekend deploy.",
    createdAt: iso(addDays(today, -2)),
    updatedAt: iso(addDays(today, -2)),
  },
];

/*──────────────────────────── KPI fixtures ───────────────────────────────────*/

const periodYear = today.getUTCFullYear();
const periodMonth = today.getUTCMonth() + 1;
const prevMonth = periodMonth === 1 ? 12 : periodMonth - 1;
const prevYear = periodMonth === 1 ? periodYear - 1 : periodYear;

const kpiScoreEvents: KpiScoreEvent[] = [
  {
    id: id(),
    user: employeeUser,
    task: tasks.find((t) => t.taskCode === "T-1009") || null,
    ruleCode: "KPI_ON_TIME_TICKET",
    points: 10,
    periodYear,
    periodMonth,
    occurredAt: iso(addDays(today, -5)),
  },
  {
    id: id(),
    user: employeeUser,
    task: tasks.find((t) => t.taskCode === "T-1013") || null,
    ruleCode: "KPI_OVERDUE_TICKET",
    points: -15,
    periodYear,
    periodMonth,
    occurredAt: iso(addDays(today, -2)),
  },
  {
    id: id(),
    user: hrManagerUser,
    task: tasks.find((t) => t.taskCode === "T-1007") || null,
    ruleCode: "KPI_ON_TIME_TICKET",
    points: 10,
    periodYear,
    periodMonth,
    occurredAt: iso(addDays(today, -4)),
  },
];

const makeKpiMonthlySummary = (
  overrides: Partial<KpiMonthlySummary>,
): KpiMonthlySummary => ({
  id: overrides.id || id(),
  user: overrides.user || employeeUser,
  periodMonth: overrides.periodMonth ?? periodMonth,
  periodYear: overrides.periodYear ?? periodYear,
  totalTasksAssigned: overrides.totalTasksAssigned ?? 0,
  completedOnTime: overrides.completedOnTime ?? 0,
  completedUrgentOnTime: overrides.completedUrgentOnTime ?? 0,
  approvedFirstTime: overrides.approvedFirstTime ?? 0,
  overdueTasks: overrides.overdueTasks ?? 0,
  rejectedTasks: overrides.rejectedTasks ?? 0,
  extensionRequestsCount: overrides.extensionRequestsCount ?? 0,
  attendanceRate: overrides.attendanceRate ?? 0,
  perfectAttendanceBonus: overrides.perfectAttendanceBonus ?? 0,
  unapprovedLeaveCount: overrides.unapprovedLeaveCount ?? 0,
  lateEarlyCount: overrides.lateEarlyCount ?? 0,
  totalKpiScore: overrides.totalKpiScore ?? 0,
  createdAt: overrides.createdAt || iso(today),
  updatedAt: iso(today),
});

const kpiMonthlySummaries: KpiMonthlySummary[] = [
  makeKpiMonthlySummary({
    user: employeeUser,
    periodMonth,
    periodYear,
    totalTasksAssigned: 8,
    completedOnTime: 5,
    completedUrgentOnTime: 1,
    approvedFirstTime: 2,
    overdueTasks: 1,
    rejectedTasks: 0,
    extensionRequestsCount: 1,
    attendanceRate: 90,
    perfectAttendanceBonus: 0,
    unapprovedLeaveCount: 0,
    lateEarlyCount: 1,
    totalKpiScore: 42,
  }),
  makeKpiMonthlySummary({
    user: employeeUser,
    periodMonth: prevMonth,
    periodYear: prevYear,
    totalTasksAssigned: 6,
    completedOnTime: 6,
    completedUrgentOnTime: 0,
    approvedFirstTime: 3,
    overdueTasks: 0,
    rejectedTasks: 0,
    extensionRequestsCount: 0,
    attendanceRate: 100,
    perfectAttendanceBonus: 50,
    unapprovedLeaveCount: 0,
    lateEarlyCount: 0,
    totalKpiScore: 118,
  }),
  makeKpiMonthlySummary({
    user: hrManagerUser,
    periodMonth,
    periodYear,
    totalTasksAssigned: 10,
    completedOnTime: 8,
    completedUrgentOnTime: 0,
    approvedFirstTime: 1,
    overdueTasks: 0,
    rejectedTasks: 0,
    extensionRequestsCount: 0,
    attendanceRate: 95,
    perfectAttendanceBonus: 0,
    unapprovedLeaveCount: 0,
    lateEarlyCount: 0,
    totalKpiScore: 85,
  }),
];

const kpiScoreEventsById: Record<string, KpiScoreEvent> = {};
for (const e of kpiScoreEvents) kpiScoreEventsById[e.id] = e;
const kpiMonthlySummariesById: Record<string, KpiMonthlySummary> = {};
for (const s of kpiMonthlySummaries) kpiMonthlySummariesById[s.id] = s;

/*──────────────────────────── system audit fixtures ──────────────────────────*/

const systemAuditLogs: SystemAuditLog[] = [
  {
    id: id(),
    user: adminUser,
    action: "USER_CREATE",
    resourceType: "USER",
    resourceId: employeeUser.id,
    oldData: null,
    newData: {
      userCode: employeeUser.userCode,
      fullName: employeeUser.fullName,
    },
    ipAddress: "192.168.1.10",
    userAgent: "mock-client",
    createdAt: iso(addDays(today, -30)),
  },
  {
    id: id(),
    user: deptHeadUser,
    action: "TASK_ACCEPT",
    resourceType: "TASK",
    resourceId: t1004.id,
    oldData: null,
    newData: { state: "ACT" },
    ipAddress: "192.168.1.11",
    userAgent: "mock-client",
    createdAt: iso(addDays(today, -5)),
  },
  {
    id: id(),
    user: hrManagerUser,
    action: "LEAVE_APPROVE",
    resourceType: "LEAVE_REQUEST",
    resourceId: leaveRequests[0].id,
    oldData: { status: "PENDING" },
    newData: { status: "APPROVED" },
    ipAddress: "192.168.1.12",
    userAgent: "mock-client",
    createdAt: iso(addDays(today, -2)),
  },
];

const systemAuditLogsById: Record<string, SystemAuditLog> = {};
for (const l of systemAuditLogs) systemAuditLogsById[l.id] = l;

/*──────────────────────────── settings fixtures ──────────────────────────────*/

const appSettings: AppSetting[] = [
  {
    id: id(),
    moduleCode: "jobs",
    key: "defaultProject",
    value: projGeneral.id,
    isSecret: false,
    description: "Default project for new tasks.",
    createdAt: iso(addDays(today, -120)),
    updatedAt: iso(addDays(today, -120)),
  },
  {
    id: id(),
    moduleCode: "settings",
    key: "appName",
    value: "MES Prototype",
    isSecret: false,
    description: "Application display name.",
    createdAt: iso(addDays(today, -120)),
    updatedAt: iso(addDays(today, -120)),
  },
];

const appSettingsById: Record<string, AppSetting> = {};
for (const s of appSettings) appSettingsById[s.id] = s;

const telegramWebhookConfig: TelegramWebhookConfig = {
  botToken: null,
  alertGroupChatId: null,
  webhookUrl: null,
  isEnabled: false,
};

const notifications: Notification[] = [];

/*──────────────────────────── module exports ─────────────────────────────────*/

export {
  addDays,
  adminUser,
  appSettings,
  appSettingsById,
  attachmentById,
  attendanceById,
  attendanceRecords,
  clamp,
  DEMO_ACCOUNTS,
  departments,
  deptByCode,
  deptEng,
  deptHeadUser,
  deptHR,
  deptOps,
  deptSales,
  employeeUser,
  endOfDay,
  grants,
  hrManagerUser,
  id,
  iso,
  kpiMonthlySummaries,
  kpiMonthlySummariesById,
  kpiScoreEvents,
  kpiScoreEventsById,
  leaveBalanceEntries,
  leaveBalances,
  leaveById,
  leaveRequests,
  notifications,
  now,
  nowIso,
  overtimeRecords,
  periodMonth,
  periodYear,
  permByCode,
  permissions,
  permSetByRole,
  prevMonth,
  prevYear,
  projectById,
  projects,
  projGeneral,
  roleByCode,
  roles,
  startOfDay,
  systemAuditLogs,
  systemAuditLogsById,
  taskById,
  taskRequestById,
  tasks,
  techLeadUser,
  telegramWebhookConfig,
  today,
  tomorrow,
  uid,
  userByCode,
  userById,
  users,
  yesterday,
};
