/**
 * Domain types for the authenticated MES GraphQL API.
 *
 * These mirror the operations documented in `API_CONTACT_SPECIFICATION.md`
 * §5–§7 and the scope of the fields each screen selects. Domain tokens
 * (`REQ`/`ACT`/…, `AL`/`UAL`/…) are preserved verbatim.
 */

export type ID = string;
export type DateTime = string;
export type Decimal = number;

/* ────────────────────────────── Enums ────────────────────────────── */

export type TicketStateCode =
  | "REQ"
  | "ACT"
  | "PEN"
  | "APP"
  | "REJ"
  | "CAN"
  | "OVERDUE";

export type LeaveCode =
  | "AL"
  | "UAL"
  | "SL"
  | "USL"
  | "PL"
  | "ML"
  | "CL"
  | "EL"
  | "LWP"
  | "TOIL"
  | "VTO";

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TaskType = "HOURLY" | "DAILY" | "MULTI_DAY";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type TaskRequestType = "EXTENSION" | "LATE_EXPLANATION";
/** What a completion request asks the reviewer to accept. */
export type CompletionScope = "MILESTONE" | "FULL_JOB";
export type DepartmentType = "DEPARTMENT" | "DIVISION";
export type ExportFormat = "PDF" | "XLSX" | "CSV";
export type RoleCode =
  | "SUPER_ADMIN"
  | "TECH_LEAD"
  | "HR_MANAGER"
  | "DEPT_HEAD"
  | "EMPLOYEE";

export type TaskStateBadge =
  | "URGENT_PROCESSING"
  | "PROGRESS_UPDATE"
  | "AWAITING_EXTENSION_APPROVAL"
  | "AWAITING_PROGRESS_VERIFICATION";

/* ─────────────────────────── Pagination ─────────────────────────── */

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

/* ─────────────────────────── Identity ───────────────────────────── */

export interface RoleRef {
  id: ID;
  code: RoleCode;
  name: string;
}

export interface UserRef {
  id: ID;
  userCode: string;
  fullName: string;
  email: string;
  department: DepartmentRef | null;
  isActive?: boolean;
  roles?: RoleRef[];
}

export interface DepartmentRef {
  id: ID;
  code: string;
  name: string;
  departmentType?: DepartmentType;
  parent?: DepartmentRef | null;
  manager?: UserRef | null;
  autoForkingEnabled?: boolean;
  isActive?: boolean;
}

export interface PermissionRef {
  id: ID;
  code: string;
  moduleCode: string;
  description: string | null;
}

export interface RoleDetail {
  id: ID;
  code: RoleCode;
  name: string;
  description: string | null;
  permissions: PermissionRef[];
}

export interface DepartmentDetail {
  id: ID;
  code: string;
  name: string;
  departmentType: DepartmentType;
  parent: DepartmentRef | null;
  manager: UserRef | null;
  autoForkingEnabled: boolean;
  isActive: boolean;
}

/* ─────────────────────────── Registries ─────────────────────────── */

export interface TicketStateInfo {
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
  category: string;
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

/* ──────────────────────────── Jobs ──────────────────────────────── */

export interface ProjectRef {
  id: ID;
  code: string;
  name: string;
  description?: string | null;
  department?: DepartmentRef | null;
  isActive?: boolean;
}

export interface TaskSummary {
  id: ID;
  taskCode: string;
  title: string;
  description: string | null;
  project: ProjectRef | null;
  taskType: TaskType;
  priority: Priority;
  state: TicketStateCode;
  createdBy: UserRef | null;
  assignedTo: UserRef | null;
  department: DepartmentRef | null;
  startDate: DateTime | null;
  endDate: DateTime | null;
  extendedDeadline: DateTime | null;
  progressPercentage: number;
  isUrgentHourly: boolean;
  isExtensionRequested: boolean;
  isOverdue: boolean;
  /** `MULTI_DAY` only: the expected number of stages, or null when open-ended. */
  plannedStageCount: number | null;
  badges: TaskStateBadge[];
  approvedBy: UserRef | null;
  approvedAt: DateTime | null;
  reviewedBy: UserRef | null;
  reviewedAt: DateTime | null;
  createdAt: DateTime;
  updatedAt: DateTime;
}

export interface TaskStateTransition {
  id: ID;
  fromState: TicketStateCode | null;
  toState: TicketStateCode;
  actor: UserRef | null;
  reason: string | null;
  createdAt: DateTime;
}

export interface TaskProgressLog {
  id: ID;
  user: UserRef;
  previousPercentage: number;
  newPercentage: number;
  logComment: string | null;
  isVerifiedByManager: boolean;
  createdAt: DateTime;
}

export interface TaskRequest {
  id: ID;
  user: UserRef;
  requestType: TaskRequestType;
  requestedDeadline: DateTime | null;
  reason: string;
  status: ApprovalStatus;
  reviewedBy: UserRef | null;
  reviewComment: string | null;
  reviewedAt: DateTime | null;
  createdAt: DateTime;
  updatedAt: DateTime;
}

export interface Attachment {
  id: ID;
  url: string;
  fileName: string | null;
  mimeType: string | null;
  /** Byte length reported by the API, so the UI shows a size without a read. */
  sizeBytes: number | null;
  createdAt: DateTime;
}

/** One submitted work stage and the decision it received. */
export interface TaskCompletionRequest {
  id: ID;
  /** The ticket this stage belongs to. */
  task: { id: ID; taskCode: string };
  user: UserRef;
  scope: CompletionScope;
  title: string;
  description: string | null;
  declaredProgress: number | null;
  plannedStageCount: number | null;
  /** `PEN` awaiting review, `APP` approved, `REJ` sent back. */
  state: TicketStateCode;
  reviewedBy: UserRef | null;
  reviewComment: string | null;
  reviewedAt: DateTime | null;
  /** The requester's evidence. */
  attachments: Attachment[];
  /** The required-fix files an approver attached to a `REJ`. */
  decisionAttachments: Attachment[];
  createdAt: DateTime;
  updatedAt: DateTime;
}

export interface TaskDetail extends TaskSummary {
  progressLogs: TaskProgressLog[];
  stateTransitions: TaskStateTransition[];
  requests: TaskRequest[];
  /** The completion-request ledger, oldest first. */
  journey: TaskCompletionRequest[];
  attachments: Attachment[];
}

export interface TaskFilter {
  projectId?: string;
  departmentId?: string;
  assignedToId?: string;
  state?: TicketStateCode;
  taskType?: TaskType;
  priority?: Priority;
  isOverdue?: boolean;
  isUrgentHourly?: boolean;
  endDateBefore?: DateTime;
  endDateAfter?: DateTime;
  search?: string;
}

export type TaskOrderBy =
  | "CREATED_AT_DESC"
  | "END_DATE_ASC"
  | "PRIORITY_DESC"
  | "STATE_ASC";

export interface CreateTaskInput {
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
}

/* ─────────────────────────── Planning ───────────────────────────── */

export interface AttendanceRecord {
  id: ID;
  user: UserRef;
  workDate: DateTime;
  checkIn: DateTime | null;
  checkOut: DateTime | null;
  isLate: boolean;
  isEarlyLeave: boolean;
  leaveCode: LeaveCode | null;
  workingHours: Decimal;
}

export interface LeaveRequest {
  id: ID;
  user: UserRef;
  leaveCode: LeaveCode;
  startDate: DateTime;
  endDate: DateTime;
  totalDays: Decimal;
  reason: string;
  handoverUser: UserRef | null;
  status: ApprovalStatus;
  approvedBy: UserRef | null;
  approvedAt: DateTime | null;
  attachments: Attachment[];
  createdAt: DateTime;
  updatedAt: DateTime;
}

export interface LeaveBalance {
  user: UserRef;
  leaveCode: LeaveCode;
  leaveName: string;
  balanceDays: Decimal;
}

export interface OvertimeRecord {
  id: ID;
  user: UserRef;
  workDate: DateTime;
  hours: Decimal;
  isApproved: boolean;
  note: string | null;
}

export interface MatrixCalendarDay {
  workDate: DateTime;
  state: TicketStateCode | null;
  progressPercentage: number | null;
  leaveCode: LeaveCode | null;
  isLate: boolean;
  isEarlyLeave: boolean;
}

export interface MatrixCalendarRow {
  user: UserRef;
  days: MatrixCalendarDay[];
}

/* ───────────────────────── Planning Schedule ───────────────────────── */

export type ScheduleScale = "DAY" | "WEEK" | "MONTH" | "YEAR";

/** The visible window: `from` inclusive, `to` exclusive, local time. */
export interface ScheduleRange {
  scale: ScheduleScale;
  from: Date;
  to: Date;
}

/** A schedule bar is a task; the three categories are its `taskType`. */
export type ScheduledTask = TaskSummary;

export interface UpdateTaskInput {
  taskId: ID;
  title?: string;
  description?: string | null;
  taskType?: TaskType;
  priority?: Priority;
  /** `null` clears the assignee; omitting keeps it. */
  assignedToId?: ID | null;
  departmentId?: ID | null;
  startDate?: DateTime | null;
  endDate?: DateTime | null;
  isUrgentHourly?: boolean;
}

export interface TaskImportRow {
  line: number;
  values: Record<string, string>;
  errors: string[];
}

export interface TaskImportPreview {
  rows: TaskImportRow[];
  validCount: number;
  errorCount: number;
}

export interface MatrixCalendar {
  department: DepartmentRef | null;
  fromDate: DateTime;
  toDate: DateTime;
  rows: MatrixCalendarRow[];
}

/* ────────────────────────── Performance ─────────────────────────── */

export interface KpiScoreEvent {
  id: ID;
  user: UserRef;
  task: { id: ID; taskCode: string } | null;
  ruleCode: string;
  points: number;
  periodYear: number;
  periodMonth: number;
  occurredAt: DateTime;
}

export interface KpiMonthlySummary {
  id: ID;
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
  user: UserRef;
  department: DepartmentRef | null;
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
  department: DepartmentRef;
  totalEmployees: number;
  totalTasksAssigned: number;
  avgAttendanceRate: Decimal;
  avgDepartmentKpiScore: Decimal;
}

export interface KpiAuditLevel3Row {
  periodYear: number;
  periodMonth: number;
  department: DepartmentRef;
  user: UserRef;
  totalTasksAssigned: number;
  completedOnTime: number;
  overdueTasks: number;
  immediateApprovalCount: number;
  returnedCount: number;
  perfectAttendanceBonus: number;
  attendanceRate: Decimal;
  totalKpiScore: number;
}

/* ─────────────────────────── Settings ───────────────────────────── */

export interface SystemAuditLog {
  id: ID;
  user: UserRef | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  oldData: unknown;
  newData: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: DateTime;
}

export interface TelegramWebhookConfig {
  botToken: string | null;
  alertGroupChatId: string | null;
  webhookUrl: string | null;
  isEnabled: boolean;
}

export interface ModuleActivitySummary {
  moduleCode: string;
  moduleName: string;
  eventCount: number;
  lastActivityAt: DateTime | null;
}

/* ──────────────────────────── Export ────────────────────────────── */

export interface ExportResult {
  id: ID;
  fileName: string;
  mimeType: string;
  format: ExportFormat;
  url: string;
  createdAt: DateTime;
}
