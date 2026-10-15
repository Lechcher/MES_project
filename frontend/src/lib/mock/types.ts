/**
 * Domain types for the MES prototype mock layer.
 *
 * These mirror the GraphQL contract in `API_CONTACT_SPECIFICATION.md`:
 * camelCase fields, nullable relations, `OffsetPageInfo` pagination, and enum
 * tokens preserved verbatim. Date/time fields are ISO-8601 strings (the
 * contract's `DateTime` scalar) so fixtures stay structurally identical to what
 * the real API will return.
 */

/* -------------------------------------------------------------------------- */
/* Enums (tokens verbatim)                                                    */
/* -------------------------------------------------------------------------- */

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

export type NotificationStatus = "PENDING" | "SENT" | "FAILED";

export type DepartmentType = "DEPARTMENT" | "DIVISION";

export type LeaveEntryType =
  | "ACCRUAL"
  | "USAGE"
  | "ADJUSTMENT"
  | "EXPIRY"
  | "CARRY_OVER";

export type LeaveCategory = "PAID" | "UNPAID" | "INSURANCE" | "SPECIAL";

export type ExportFormat = "PDF" | "XLSX" | "CSV";

export type RoleCode =
  | "SUPER_ADMIN"
  | "TECH_LEAD"
  | "HR_MANAGER"
  | "DEPT_HEAD"
  | "EMPLOYEE";

export type Scope = "ALL" | "COMPANY_WIDE" | "DEPARTMENT_ONLY" | "PERSONAL";

export type TaskStateBadge =
  | "URGENT_PROCESSING"
  | "PROGRESS_UPDATE"
  | "AWAITING_EXTENSION_APPROVAL"
  | "AWAITING_PROGRESS_VERIFICATION";

export type ModuleCode =
  | "jobs"
  | "planning"
  | "performance"
  | "settings"
  | "audit-log";

/* -------------------------------------------------------------------------- */
/* Common                                                                     */
/* -------------------------------------------------------------------------- */

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

export interface ExportResult {
  id: string;
  fileName: string;
  mimeType: string;
  format: ExportFormat;
  url: string;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/* Code registries                                                            */
/* -------------------------------------------------------------------------- */

export interface TicketState {
  code: TicketStateCode;
  name: string;
  color: string;
  description: string;
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

export interface ModuleInfo {
  code: ModuleCode;
  name: string;
  description: string;
  isEnabled: boolean;
  sortOrder: number;
}

/* -------------------------------------------------------------------------- */
/* Identity, organization, RBAC                                               */
/* -------------------------------------------------------------------------- */

export interface Permission {
  id: string;
  code: string;
  moduleCode: ModuleCode;
  description: string;
}

export interface Role {
  id: string;
  code: RoleCode;
  name: string;
  description: string;
  permissions: Permission[];
  createdAt: string;
  updatedAt: string;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  departmentType: DepartmentType;
  parent: Department | null;
  parentId: string | null;
  manager: User | null;
  managerId: string | null;
  autoForkingEnabled: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  userCode: string;
  fullName: string;
  email: string;
  departmentId: string | null;
  department: Department | null;
  isActive: boolean;
  roles: Role[];
  createdAt: string;
  updatedAt: string;
}

export interface UserRole {
  user: User;
  role: Role;
  assignedAt: string;
}

export interface RolePermission {
  role: Role;
  permission: Permission;
  grantedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Jobs & Projects                                                            */
/* -------------------------------------------------------------------------- */

export interface Project {
  id: string;
  code: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  department: Department | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  ownerType: string;
  ownerId: string;
  url: string;
  fileName: string | null;
  mimeType: string | null;
  uploadedBy: User | null;
  createdAt: string;
}

export interface TaskStateTransition {
  id: string;
  taskId: string;
  fromState: TicketStateCode | null;
  toState: TicketStateCode;
  actor: User | null;
  reason: string | null;
  createdAt: string;
}

export interface TaskProgressLog {
  id: string;
  taskId: string;
  user: User;
  previousPercentage: number;
  newPercentage: number;
  logComment: string | null;
  isVerifiedByManager: boolean;
  createdAt: string;
}

export interface TaskRequest {
  id: string;
  taskId: string;
  user: User;
  requestType: TaskRequestType;
  requestedDeadline: string | null;
  reason: string;
  status: ApprovalStatus;
  reviewedBy: User | null;
  reviewComment: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  taskCode: string;
  title: string;
  description: string | null;
  projectId: string | null;
  project: Project | null;
  taskType: TaskType;
  priority: Priority;
  state: TicketStateCode;
  createdBy: User | null;
  assignedTo: User | null;
  assignedToId: string | null;
  departmentId: string | null;
  department: Department | null;
  startDate: string | null;
  endDate: string | null;
  extendedDeadline: string | null;
  progressPercentage: number;
  isUrgentHourly: boolean;
  isExtensionRequested: boolean;
  isOverdue: boolean;
  /** Late Submission warning flag (set when an `OVERDUE` ticket is explained). */
  isLateSubmission: boolean;
  badges: TaskStateBadge[];
  approvedBy: User | null;
  approvedAt: string | null;
  reviewedBy: User | null;
  reviewedAt: string | null;
  progressLogs: TaskProgressLog[];
  stateTransitions: TaskStateTransition[];
  requests: TaskRequest[];
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Planning, attendance & leave funds                                         */
/* -------------------------------------------------------------------------- */

export interface AttendanceRecord {
  id: string;
  userId: string;
  user: User;
  workDate: string;
  checkIn: string | null;
  checkOut: string | null;
  isLate: boolean;
  isEarlyLeave: boolean;
  leaveCode: LeaveCode | null;
  workingHours: number;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  user: User;
  leaveCode: LeaveCode;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  handoverUser: User | null;
  status: ApprovalStatus;
  approvedBy: User | null;
  approvedAt: string | null;
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
}

export interface LeaveBalanceEntry {
  id: string;
  user: User;
  leaveCode: LeaveCode;
  entryType: LeaveEntryType;
  deltaDays: number;
  periodYear: number;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  createdBy: User | null;
  createdAt: string;
}

export interface LeaveBalance {
  user: User;
  leaveCode: LeaveCode;
  leaveName: string;
  balanceDays: number;
}

export interface OvertimeRecord {
  id: string;
  user: User;
  workDate: string;
  hours: number;
  isApproved: boolean;
  approvedBy: User | null;
  approvedAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MatrixCalendarDay {
  workDate: string;
  state: TicketStateCode | null;
  progressPercentage: number | null;
  leaveCode: LeaveCode | null;
  isLate: boolean;
  isEarlyLeave: boolean;
}

export interface MatrixCalendarRow {
  user: User;
  days: MatrixCalendarDay[];
}

export interface MatrixCalendar {
  department: Department | null;
  fromDate: string;
  toDate: string;
  rows: MatrixCalendarRow[];
}

/* -------------------------------------------------------------------------- */
/* Performance & KPI                                                          */
/* -------------------------------------------------------------------------- */

export interface KpiPointRule {
  code: string;
  event: string;
  points: number;
  description: string;
  isActive: boolean;
  sortOrder: number;
}

export interface KpiScoreEvent {
  id: string;
  userId: string;
  user: User;
  task: Task | null;
  ruleCode: string;
  points: number;
  periodYear: number;
  periodMonth: number;
  occurredAt: string;
}

export interface KpiMonthlySummary {
  id: string;
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
  attendanceRate: number;
  perfectAttendanceBonus: number;
  unapprovedLeaveCount: number;
  lateEarlyCount: number;
  totalKpiScore: number;
  createdAt: string;
  updatedAt: string;
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
  attendanceRate: number;
  totalKpiScore: number;
}

export interface KpiAuditLevel2Row {
  periodYear: number;
  periodMonth: number;
  department: Department;
  totalEmployees: number;
  totalTasksAssigned: number;
  avgAttendanceRate: number;
  avgDepartmentKpiScore: number;
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
  attendanceRate: number;
  totalKpiScore: number;
}

/* -------------------------------------------------------------------------- */
/* Settings & IAM                                                             */
/* -------------------------------------------------------------------------- */

export interface SystemAuditLog {
  id: string;
  user: User | null;
  moduleCode: ModuleCode | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AppSetting {
  id: string;
  moduleCode: ModuleCode;
  key: string;
  value: unknown;
  isSecret: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  channel: string;
  template: string | null;
  recipient: string | null;
  payload: Record<string, unknown> | null;
  status: NotificationStatus;
  attempts: number;
  relatedType: string | null;
  relatedId: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TelegramWebhookConfig {
  botToken: string | null;
  alertGroupChatId: string | null;
  webhookUrl: string | null;
  isEnabled: boolean;
}

export interface ModuleActivitySummary {
  moduleCode: ModuleCode;
  moduleName: string;
  eventCount: number;
  lastActivityAt: string | null;
}

/* -------------------------------------------------------------------------- */
/* Filters & inputs (contract-shaped)                                         */
/* -------------------------------------------------------------------------- */

export interface TaskFilter {
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
}

export type TaskOrderBy =
  | "CREATED_AT_DESC"
  | "END_DATE_ASC"
  | "PRIORITY_DESC"
  | "STATE_ASC";

export interface AttendanceFilter {
  userId?: string;
  departmentId?: string;
  fromDate?: string;
  toDate?: string;
  isLate?: boolean;
  isEarlyLeave?: boolean;
  leaveCode?: LeaveCode;
}

export interface LeaveRequestFilter {
  userId?: string;
  departmentId?: string;
  leaveCode?: LeaveCode;
  status?: ApprovalStatus;
  fromDate?: string;
  toDate?: string;
}

export interface UserFilter {
  departmentId?: string;
  roleCode?: RoleCode;
  isActive?: boolean;
  search?: string;
}

export interface AuditLogFilter {
  userId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface KpiPeriodInput {
  periodYear: number;
  periodMonth: number;
}

export interface KpiAuditFilter {
  periodYear: number;
  periodMonth?: number;
  departmentId?: string;
}

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
  autoForking?: boolean;
}

export interface LogTaskProgressInput {
  taskId: string;
  newPercentage: number;
  logComment?: string;
  attachmentIds?: string[];
}

export interface SubmitTaskReportInput {
  taskId: string;
  reportComment?: string;
  attachmentIds?: string[];
}

export interface RequestExtensionInput {
  taskId: string;
  requestedDeadline: string;
  reason: string;
  attachmentIds?: string[];
}

export interface ExplainLateSubmissionInput {
  taskId: string;
  reason: string;
  attachmentIds?: string[];
}

export interface CancelTaskInput {
  taskId: string;
  reason: string;
}

export interface ReviewTaskRequestInput {
  requestId: string;
  decision: ApprovalStatus;
  reviewComment?: string;
}

export interface RegisterLeaveInput {
  leaveCode: LeaveCode;
  startDate: string;
  endDate: string;
  reason: string;
  handoverUserId?: string;
  attachmentIds?: string[];
  /** Mock extension: filename-only attachments (no real upload). */
  attachmentNames?: string[];
}

export interface ReviewLeaveInput {
  leaveRequestId: string;
  decision: ApprovalStatus;
  reviewComment?: string;
}

export interface AssignPenaltyLeaveInput {
  userId: string;
  leaveCode: LeaveCode;
  workDate: string;
  note?: string;
}

export interface RecordOvertimeInput {
  userId: string;
  workDate: string;
  hours: number;
  note?: string;
}

export interface ReviewOvertimeInput {
  overtimeId: string;
  decision: ApprovalStatus;
  reviewComment?: string;
}

export interface MatrixCalendarInput {
  departmentId?: string;
  fromDate: string;
  toDate: string;
}

export interface CreateUserInput {
  userCode: string;
  fullName: string;
  email: string;
  password: string;
  departmentId?: string;
  roleCodes: RoleCode[];
}

export interface UpdateUserInput {
  id: string;
  fullName?: string;
  email?: string;
  departmentId?: string;
  roleCodes?: RoleCode[];
  isActive?: boolean;
}

export interface CreateDepartmentInput {
  code: string;
  name: string;
  departmentType: DepartmentType;
  parentId?: string;
  managerId?: string;
  autoForkingEnabled?: boolean;
}

export interface UpdateDepartmentInput {
  id: string;
  name?: string;
  parentId?: string;
  managerId?: string;
  autoForkingEnabled?: boolean;
  isActive?: boolean;
}

export interface UpdateRolePermissionsInput {
  roleId: string;
  permissionCodes: string[];
}

export interface UpdateTelegramWebhookConfigInput {
  botToken?: string;
  alertGroupChatId?: string;
  webhookUrl?: string;
  isEnabled?: boolean;
}

/**
 * A mock error carrying the contract's machine-readable code (see
 * `API_CONTACT_SPECIFICATION.md` §8).
 */
export type MockErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "STATE_TRANSITION_INVALID"
  | "RULE_VIOLATION";

export class MockError extends Error {
  code: MockErrorCode;
  details?: Record<string, unknown>;

  constructor(
    code: MockErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MockError";
    this.code = code;
    this.details = details;
  }
}
