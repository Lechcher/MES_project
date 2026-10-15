/**
 * Domain types mirroring the GraphQL API contract
 * (`API_CONTACT_SPECIFICATION.md` §5–§7).
 *
 * Conventions preserved verbatim from the contract:
 * - Field names are camelCase (snake_case columns mapped on read).
 * - IDs are the built-in `ID` scalar (opaque UUID strings).
 * - DateTime is an ISO-8601 UTC string.
 * - Decimal is serialized as a JSON number; represented here as `number`.
 * - Enum values preserve the source tokens exactly (e.g. `REQ`, `MULTI_DAY`).
 * - Relations are nullable where the contract marks them nullable.
 */

export type ID = string;
export type DateTime = string;
export type Decimal = number;
export type JSON = unknown;

/*──────────────────────────── Enums (verbatim tokens) ─────────────────────────*/

export type TicketStateCode =
  | "REQ" | "ACT" | "PEN" | "APP" | "REJ" | "CAN" | "OVERDUE";

export type LeaveCode =
  | "AL" | "UAL" | "SL" | "USL" | "PL" | "ML" | "CL" | "EL" | "LWP"
  | "TOIL" | "VTO";

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TaskType = "HOURLY" | "DAILY" | "MULTI_DAY";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type TaskRequestType = "EXTENSION" | "LATE_EXPLANATION";
export type NotificationStatus = "PENDING" | "SENT" | "FAILED";
export type DepartmentType = "DEPARTMENT" | "DIVISION";
export type LeaveEntryType =
  | "ACCRUAL" | "USAGE" | "ADJUSTMENT" | "EXPIRY" | "CARRY_OVER";
export type LeaveCategory = "PAID" | "UNPAID" | "INSURANCE" | "SPECIAL";
export type ExportFormat = "PDF" | "XLSX" | "CSV";
export type RoleCode =
  | "SUPER_ADMIN" | "TECH_LEAD" | "HR_MANAGER" | "DEPT_HEAD" | "EMPLOYEE";
export type Scope = "ALL" | "COMPANY_WIDE" | "DEPARTMENT_ONLY" | "PERSONAL";

export type TaskStateBadge =
  | "URGENT_PROCESSING"
  | "PROGRESS_UPDATE"
  | "AWAITING_EXTENSION_APPROVAL"
  | "AWAITING_PROGRESS_VERIFICATION";

/*──────────────────────────── Pagination ─────────────────────────────────────*/

export interface OffsetPageInfo {
  offset: number;
  limit: number;
  totalCount: number;
  hasNextPage: boolean;
}

export interface Connection<T> {
  nodes: T[];
  pageInfo: OffsetPageInfo;
}

/*──────────────────────────── Identity & org ─────────────────────────────────*/

export interface User {
  id: ID;
  userCode: string;
  fullName: string;
  email: string;
  department: Department | null;
  isActive: boolean;
  roles: Role[];
  createdAt: DateTime;
  updatedAt: DateTime;
}

export interface Department {
  id: ID;
  code: string;
  name: string;
  departmentType: DepartmentType;
  parent: Department | null;
  manager: User | null;
  autoForkingEnabled: boolean;
  isActive: boolean;
  createdAt: DateTime;
  updatedAt: DateTime;
}

export interface Role {
  id: ID;
  code: RoleCode;
  name: string;
  description: string | null;
  permissions: Permission[];
  createdAt: DateTime;
  updatedAt: DateTime;
}

export interface Permission {
  id: ID;
  code: string;
  moduleCode: string;
  description: string | null;
}

export interface UserRole {
  user: User;
  role: Role;
  assignedAt: DateTime;
}

export interface RolePermission {
  role: Role;
  permission: Permission;
  grantedAt: DateTime;
}

/*──────────────────────────── Auth / session ─────────────────────────────────*/

export interface Session {
  id: ID;
  token: string;
  expiresAt: DateTime;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface Viewer {
  user: User;
  session: Session;
}

export interface AuthPayload {
  session: Session;
  viewer: Viewer;
}

/*──────────────────────────── Code registries ────────────────────────────────*/

export interface TicketState {
  code: TicketStateCode;
  name: string;
  color: string;
  description: string | null;
  isTerminal: boolean;
  sortOrder: number;
}

export interface LeaveCodeInfo {
  code: LeaveCode;
  name: string;
  category: LeaveCategory;
  isPaid: boolean;
  payrollRule: string;
  deductsWage: boolean;
  isPenalty: boolean;
  isBalanceTracked: boolean;
  sortOrder: number;
}

export interface KpiPointRule {
  code: string;
  event: string;
  points: number;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
}

/*──────────────────────────── Jobs & Projects ────────────────────────────────*/

export interface Project {
  id: ID;
  code: string;
  name: string;
  description: string | null;
  department: Department | null;
  isActive: boolean;
  createdAt: DateTime;
  updatedAt: DateTime;
}

export interface Task {
  id: ID;
  taskCode: string;
  title: string;
  description: string | null;
  project: Project | null;
  taskType: TaskType;
  priority: Priority;
  state: TicketStateCode;
  createdBy: User | null;
  assignedTo: User | null;
  department: Department | null;
  startDate: DateTime | null;
  endDate: DateTime | null;
  extendedDeadline: DateTime | null;
  progressPercentage: number;
  isUrgentHourly: boolean;
  isExtensionRequested: boolean;
  isOverdue: boolean;
  badges: TaskStateBadge[];
  approvedBy: User | null;
  approvedAt: DateTime | null;
  reviewedBy: User | null;
  reviewedAt: DateTime | null;
  progressLogs: TaskProgressLog[];
  stateTransitions: TaskStateTransition[];
  requests: TaskRequest[];
  attachments: Attachment[];
  createdAt: DateTime;
  updatedAt: DateTime;
}

export interface TaskStateTransition {
  id: ID;
  task: Task;
  fromState: TicketStateCode | null;
  toState: TicketStateCode;
  actor: User | null;
  reason: string | null;
  createdAt: DateTime;
}

export interface TaskProgressLog {
  id: ID;
  task: Task;
  user: User;
  previousPercentage: number;
  newPercentage: number;
  logComment: string | null;
  isVerifiedByManager: boolean;
  createdAt: DateTime;
}

export interface TaskRequest {
  id: ID;
  task: Task;
  user: User;
  requestType: TaskRequestType;
  requestedDeadline: DateTime | null;
  reason: string;
  status: ApprovalStatus;
  reviewedBy: User | null;
  reviewComment: string | null;
  reviewedAt: DateTime | null;
  createdAt: DateTime;
  updatedAt: DateTime;
}

export interface Attachment {
  id: ID;
  ownerType: string;
  ownerId: ID;
  url: string;
  fileName: string | null;
  mimeType: string | null;
  uploadedBy: User | null;
  createdAt: DateTime;
}

export interface TaskConnection extends Connection<Task> {}
export interface ProjectConnection extends Connection<Project> {}

/*──────────────────────────── Planning & Attendance ──────────────────────────*/

export interface AttendanceRecord {
  id: ID;
  user: User;
  workDate: DateTime;
  checkIn: DateTime | null;
  checkOut: DateTime | null;
  isLate: boolean;
  isEarlyLeave: boolean;
  leaveCode: LeaveCode | null;
  workingHours: Decimal;
  createdAt: DateTime;
  updatedAt: DateTime;
}

export interface LeaveRequest {
  id: ID;
  user: User;
  leaveCode: LeaveCode;
  startDate: DateTime;
  endDate: DateTime;
  totalDays: Decimal;
  reason: string;
  handoverUser: User | null;
  status: ApprovalStatus;
  approvedBy: User | null;
  approvedAt: DateTime | null;
  attachments: Attachment[];
  createdAt: DateTime;
  updatedAt: DateTime;
}

export interface LeaveBalanceEntry {
  id: ID;
  user: User;
  leaveCode: LeaveCode;
  entryType: LeaveEntryType;
  deltaDays: Decimal;
  periodYear: number;
  referenceType: string | null;
  referenceId: ID | null;
  note: string | null;
  createdBy: User | null;
  createdAt: DateTime;
}

export interface LeaveBalance {
  user: User;
  leaveCode: LeaveCode;
  leaveName: string;
  balanceDays: Decimal;
}

export interface OvertimeRecord {
  id: ID;
  user: User;
  workDate: DateTime;
  hours: Decimal;
  isApproved: boolean;
  approvedBy: User | null;
  approvedAt: DateTime | null;
  note: string | null;
  createdAt: DateTime;
  updatedAt: DateTime;
}

export interface AttendanceRecordConnection extends Connection<AttendanceRecord> {}
export interface LeaveRequestConnection extends Connection<LeaveRequest> {}
export interface OvertimeRecordConnection extends Connection<OvertimeRecord> {}

export interface MatrixCalendar {
  department: Department | null;
  fromDate: DateTime;
  toDate: DateTime;
  rows: MatrixCalendarRow[];
}

export interface MatrixCalendarRow {
  user: User;
  days: MatrixCalendarDay[];
}

export interface MatrixCalendarDay {
  workDate: DateTime;
  state: TicketStateCode | null;
  progressPercentage: number | null;
  leaveCode: LeaveCode | null;
  isLate: boolean;
  isEarlyLeave: boolean;
}

/*──────────────────────────── Performance & Audit ────────────────────────────*/

export interface KpiScoreEvent {
  id: ID;
  user: User;
  task: Task | null;
  ruleCode: string;
  points: number;
  periodYear: number;
  periodMonth: number;
  occurredAt: DateTime;
}

export interface KpiMonthlySummary {
  id: ID;
  user: User;
  periodMonth: number;
  periodYear: number;
  totalTasksAssigned: number;
  completedOnTime: number;
  completedUrgentOnTime: number;
  approvedFirstTime: number;
  overdueTasks: number;
  rejectedTasks: number;
  extensionRequestsCount: number;
  attendanceRate: Decimal;
  perfectAttendanceBonus: number;
  unapprovedLeaveCount: number;
  lateEarlyCount: number;
  totalKpiScore: number;
  createdAt: DateTime;
  updatedAt: DateTime;
}

export interface PersonalKpiDashboard {
  periodYear: number;
  periodMonth: number;
  totalKpiScore: number;
  summary: KpiMonthlySummary | null;
  leaveBalances: LeaveBalance[];
  recentEvents: KpiScoreEvent[];
}

export interface KpiAuditLevel1Row {
  periodYear: number;
  periodMonth: number;
  user: User;
  department: Department | null;
  totalTasksAssigned: number;
  completedOnTime: number;
  overdueTasks: number;
  unapprovedLeaveCount: number;
  perfectAttendanceBonus: number;
  attendanceRate: Decimal;
  totalKpiScore: number;
}

export interface KpiAuditLevel2Row {
  periodYear: number;
  periodMonth: number;
  department: Department;
  totalEmployees: number;
  totalTasksAssigned: number;
  avgAttendanceRate: Decimal;
  avgDepartmentKpiScore: Decimal;
}

export interface KpiAuditLevel3Row {
  periodYear: number;
  periodMonth: number;
  department: Department;
  user: User;
  totalTasksAssigned: number;
  completedOnTime: number;
  overdueTasks: number;
  immediateApprovalCount: number;
  returnedCount: number;
  perfectAttendanceBonus: number;
  attendanceRate: Decimal;
  totalKpiScore: number;
}

export interface KpiScoreEventConnection extends Connection<KpiScoreEvent> {}
export interface KpiAuditLevel1Connection extends Connection<KpiAuditLevel1Row> {}
export interface KpiAuditLevel2Connection extends Connection<KpiAuditLevel2Row> {}
export interface KpiAuditLevel3Connection extends Connection<KpiAuditLevel3Row> {}

/*──────────────────────────── Settings & IAM ─────────────────────────────────*/

export interface SystemAuditLog {
  id: ID;
  user: User | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  oldData: JSON | null;
  newData: JSON | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: DateTime;
}

export interface AppSetting {
  id: ID;
  moduleCode: string;
  key: string;
  value: JSON;
  isSecret: boolean;
  description: string | null;
  createdAt: DateTime;
  updatedAt: DateTime;
}

export interface TelegramWebhookConfig {
  botToken: string | null;
  alertGroupChatId: string | null;
  webhookUrl: string | null;
  isEnabled: boolean;
}

export interface Notification {
  id: ID;
  channel: string;
  template: string | null;
  recipient: string | null;
  payload: JSON | null;
  status: NotificationStatus;
  attempts: number;
  relatedType: string | null;
  relatedId: ID | null;
  errorMessage: string | null;
  sentAt: DateTime | null;
  createdAt: DateTime;
  updatedAt: DateTime;
}

export interface SystemAuditLogConnection extends Connection<SystemAuditLog> {}
export interface UserConnection extends Connection<User> {}
export interface NotificationConnection extends Connection<Notification> {}

export interface ExportResult {
  id: ID;
  fileName: string;
  mimeType: string;
  format: ExportFormat;
  url: string;
  createdAt: DateTime;
}
