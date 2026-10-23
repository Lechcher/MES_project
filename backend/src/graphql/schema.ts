/**
 * GraphQL schema definition.
 *
 * Transcribed from `API_CONTACT_SPECIFICATION.md`. The contract presents the
 * schema as per-app `extend type Query/Mutation` blocks; this file merges them
 * into one document. Operation names and type/field names are stable API
 * surface and must match the contract exactly.
 */

export const typeDefs = /* GraphQL */ `
  scalar DateTime
  scalar JSON
  scalar Decimal

  # ---------------------------------------------------------------- #
  # Enums                                                            #
  # ---------------------------------------------------------------- #

  enum RoleCode {
    SUPER_ADMIN
    TECH_LEAD
    HR_MANAGER
    DEPT_HEAD
    EMPLOYEE
  }

  enum Scope {
    ALL
    COMPANY_WIDE
    DEPARTMENT_ONLY
    PERSONAL
  }

  enum TicketStateCode {
    REQ
    ACT
    PEN
    APP
    REJ
    CAN
    OVERDUE
  }

  enum LeaveCode {
    AL
    UAL
    SL
    USL
    PL
    ML
    CL
    EL
    LWP
    TOIL
    VTO
  }

  enum Priority {
    LOW
    MEDIUM
    HIGH
    URGENT
  }

  enum TaskType {
    HOURLY
    DAILY
    MULTI_DAY
  }

  enum ApprovalStatus {
    PENDING
    APPROVED
    REJECTED
  }

  enum TaskRequestType {
    EXTENSION
    LATE_EXPLANATION
  }

  enum NotificationStatus {
    PENDING
    SENT
    FAILED
  }

  enum DepartmentType {
    DEPARTMENT
    DIVISION
  }

  enum LeaveEntryType {
    ACCRUAL
    USAGE
    ADJUSTMENT
    EXPIRY
    CARRY_OVER
  }

  enum LeaveCategory {
    PAID
    UNPAID
    INSURANCE
    SPECIAL
  }

  enum ExportFormat {
    PDF
    XLSX
    CSV
  }

  enum TaskStateBadge {
    URGENT_PROCESSING
    PROGRESS_UPDATE
    AWAITING_EXTENSION_APPROVAL
    AWAITING_PROGRESS_VERIFICATION
  }

  enum ProjectOrderBy {
    NAME_ASC
    NAME_DESC
    CREATED_AT_DESC
  }

  enum TaskOrderBy {
    CREATED_AT_DESC
    END_DATE_ASC
    PRIORITY_DESC
    STATE_ASC
  }

  enum KpiAuditOrderBy {
    TOTAL_KPI_SCORE_DESC
    TOTAL_KPI_SCORE_ASC
    ATTENDANCE_RATE_DESC
  }

  # ---------------------------------------------------------------- #
  # Auth & session                                                   #
  # ---------------------------------------------------------------- #

  type Session {
    id: ID!
    token: String!
    expiresAt: DateTime!
    ipAddress: String
    userAgent: String
  }

  type Viewer {
    user: User!
    session: Session!
  }

  input LoginInput {
    email: String!
    password: String!
  }

  type AuthPayload {
    session: Session!
    viewer: Viewer!
  }

  input ResetPasswordInput {
    token: String!
    newPassword: String!
  }

  input ChangePasswordInput {
    currentPassword: String!
    newPassword: String!
  }

  # ---------------------------------------------------------------- #
  # Shared                                                           #
  # ---------------------------------------------------------------- #

  type OffsetPageInfo {
    offset: Int!
    limit: Int!
    totalCount: Int!
    hasNextPage: Boolean!
  }

  type ExportResult {
    id: ID!
    fileName: String!
    mimeType: String!
    format: ExportFormat!
    url: String!
    createdAt: DateTime!
  }

  type TicketState {
    code: TicketStateCode!
    name: String!
    color: String!
    description: String
    isTerminal: Boolean!
    sortOrder: Int!
  }

  type LeaveCodeInfo {
    code: LeaveCode!
    name: String!
    category: LeaveCategory!
    isPaid: Boolean!
    payrollRule: String!
    deductsWage: Boolean!
    isPenalty: Boolean!
    isBalanceTracked: Boolean!
    sortOrder: Int!
  }

  # ---------------------------------------------------------------- #
  # Identity, organization, RBAC                                     #
  # ---------------------------------------------------------------- #

  type User {
    id: ID!
    userCode: String!
    fullName: String!
    email: String!
    department: Department
    isActive: Boolean!
    roles: [Role!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Department {
    id: ID!
    code: String!
    name: String!
    departmentType: DepartmentType!
    parent: Department
    manager: User
    autoForkingEnabled: Boolean!
    isActive: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Role {
    id: ID!
    code: RoleCode!
    name: String!
    description: String
    permissions: [Permission!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Permission {
    id: ID!
    code: String!
    moduleCode: String!
    description: String
  }

  type UserRole {
    user: User!
    role: Role!
    assignedAt: DateTime!
  }

  type RolePermission {
    role: Role!
    permission: Permission!
    grantedAt: DateTime!
  }

  # ---------------------------------------------------------------- #
  # Jobs & Projects                                                  #
  # ---------------------------------------------------------------- #

  type Project {
    id: ID!
    code: String!
    name: String!
    description: String
    department: Department
    isActive: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Task {
    id: ID!
    taskCode: String!
    title: String!
    description: String
    project: Project
    taskType: TaskType!
    priority: Priority!
    state: TicketStateCode!
    createdBy: User
    assignedTo: User
    department: Department
    startDate: DateTime
    endDate: DateTime
    extendedDeadline: DateTime
    progressPercentage: Int!
    isUrgentHourly: Boolean!
    isExtensionRequested: Boolean!
    isOverdue: Boolean!
    badges: [TaskStateBadge!]!
    approvedBy: User
    approvedAt: DateTime
    reviewedBy: User
    reviewedAt: DateTime
    plannedStageCount: Int
    progressLogs: [TaskProgressLog!]!
    stateTransitions: [TaskStateTransition!]!
    requests: [TaskRequest!]!
    journey: [TaskCompletionRequest!]!
    attachments: [Attachment!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type TaskStateTransition {
    id: ID!
    task: Task!
    fromState: TicketStateCode
    toState: TicketStateCode!
    actor: User
    reason: String
    createdAt: DateTime!
  }

  type TaskProgressLog {
    id: ID!
    task: Task!
    user: User!
    previousPercentage: Int!
    newPercentage: Int!
    logComment: String
    isVerifiedByManager: Boolean!
    createdAt: DateTime!
  }

  type TaskRequest {
    id: ID!
    task: Task!
    user: User!
    requestType: TaskRequestType!
    requestedDeadline: DateTime
    reason: String!
    status: ApprovalStatus!
    reviewedBy: User
    reviewComment: String
    reviewedAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type TaskCompletionRequest {
    id: ID!
    task: Task!
    user: User!
    scope: String!
    title: String!
    description: String
    declaredProgress: Int
    plannedStageCount: Int
    state: TicketStateCode!
    reviewedBy: User
    reviewComment: String
    reviewedAt: DateTime
    attachments: [Attachment!]!
    decisionAttachments: [Attachment!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Attachment {
    id: ID!
    ownerType: String!
    ownerId: ID!
    url: String!
    fileName: String
    mimeType: String
    sizeBytes: Int
    uploadedBy: User
    createdAt: DateTime!
  }

  type TaskConnection {
    nodes: [Task!]!
    pageInfo: OffsetPageInfo!
  }

  type ProjectConnection {
    nodes: [Project!]!
    pageInfo: OffsetPageInfo!
  }

  input ProjectFilter {
    departmentId: ID
    isActive: Boolean
    search: String
  }

  input TaskFilter {
    projectId: ID
    departmentId: ID
    assignedToId: ID
    state: TicketStateCode
    taskType: TaskType
    priority: Priority
    isOverdue: Boolean
    isUrgentHourly: Boolean
    endDateBefore: DateTime
    endDateAfter: DateTime
    search: String
  }

  input CreateTaskInput {
    title: String!
    description: String
    projectId: ID
    taskType: TaskType!
    priority: Priority!
    assignedToId: ID
    departmentId: ID
    startDate: DateTime
    endDate: DateTime
    isUrgentHourly: Boolean = false
  }

  input LogTaskProgressInput {
    taskId: ID!
    newPercentage: Int!
    logComment: String
    attachmentIds: [ID!]
  }

  input SubmitTaskReportInput {
    taskId: ID!
    reportComment: String
    attachmentIds: [ID!]
  }

  input RequestExtensionInput {
    taskId: ID!
    requestedDeadline: DateTime!
    reason: String!
    attachmentIds: [ID!]
  }

  input ExplainLateSubmissionInput {
    taskId: ID!
    reason: String!
    attachmentIds: [ID!]
  }

  input ReviewTaskRequestInput {
    requestId: ID!
    decision: ApprovalStatus!
    reviewComment: String
  }

  input SubmitTaskCompletionRequestInput {
    taskId: ID!
    scope: String!
    title: String!
    description: String
    declaredProgress: Int
    plannedStageCount: Int
    attachmentIds: [ID!]
  }

  input ReviewTaskCompletionRequestInput {
    requestId: ID!
    decision: ApprovalStatus!
    reviewComment: String
    attachmentIds: [ID!]
  }

  input CancelTaskInput {
    taskId: ID!
    reason: String!
  }

  # ---------------------------------------------------------------- #
  # Planning & Attendance                                            #
  # ---------------------------------------------------------------- #

  type AttendanceRecord {
    id: ID!
    user: User!
    workDate: DateTime!
    checkIn: DateTime
    checkOut: DateTime
    isLate: Boolean!
    isEarlyLeave: Boolean!
    leaveCode: LeaveCode
    workingHours: Decimal!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type LeaveRequest {
    id: ID!
    user: User!
    leaveCode: LeaveCode!
    startDate: DateTime!
    endDate: DateTime!
    totalDays: Decimal!
    reason: String!
    handoverUser: User
    status: ApprovalStatus!
    approvedBy: User
    approvedAt: DateTime
    attachments: [Attachment!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type LeaveBalanceEntry {
    id: ID!
    user: User!
    leaveCode: LeaveCode!
    entryType: LeaveEntryType!
    deltaDays: Decimal!
    periodYear: Int!
    referenceType: String
    referenceId: ID
    note: String
    createdBy: User
    createdAt: DateTime!
  }

  type LeaveBalance {
    user: User!
    leaveCode: LeaveCode!
    leaveName: String!
    balanceDays: Decimal!
  }

  type OvertimeRecord {
    id: ID!
    user: User!
    workDate: DateTime!
    hours: Decimal!
    isApproved: Boolean!
    approvedBy: User
    approvedAt: DateTime
    note: String
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type AttendanceRecordConnection {
    nodes: [AttendanceRecord!]!
    pageInfo: OffsetPageInfo!
  }

  type LeaveRequestConnection {
    nodes: [LeaveRequest!]!
    pageInfo: OffsetPageInfo!
  }

  type OvertimeRecordConnection {
    nodes: [OvertimeRecord!]!
    pageInfo: OffsetPageInfo!
  }

  type MatrixCalendar {
    department: Department
    fromDate: DateTime!
    toDate: DateTime!
    rows: [MatrixCalendarRow!]!
  }

  type MatrixCalendarRow {
    user: User!
    days: [MatrixCalendarDay!]!
  }

  type MatrixCalendarDay {
    workDate: DateTime!
    state: TicketStateCode
    progressPercentage: Int
    leaveCode: LeaveCode
    isLate: Boolean!
    isEarlyLeave: Boolean!
  }

  input RegisterLeaveInput {
    leaveCode: LeaveCode!
    startDate: DateTime!
    endDate: DateTime!
    reason: String!
    handoverUserId: ID
    attachmentIds: [ID!]
  }

  input ReviewLeaveInput {
    leaveRequestId: ID!
    decision: ApprovalStatus!
    reviewComment: String
  }

  input AssignPenaltyLeaveInput {
    userId: ID!
    leaveCode: LeaveCode!
    workDate: DateTime!
    note: String
  }

  input MatrixCalendarInput {
    departmentId: ID
    fromDate: DateTime!
    toDate: DateTime!
  }

  input ScheduleInput {
    departmentId: ID
    fromDate: DateTime!
    toDate: DateTime!
    state: TicketStateCode
  }

  input UpdateTaskInput {
    taskId: ID!
    title: String
    description: String
    taskType: TaskType
    priority: Priority
    assignedToId: ID
    departmentId: ID
    startDate: DateTime
    endDate: DateTime
    isUrgentHourly: Boolean
  }

  input DuplicateTaskInput {
    taskId: ID!
    assignedToId: ID
    startDate: DateTime
  }

  input ImportFileInput {
    fileName: String!
    contentBase64: String!
  }

  type TaskImportRow {
    line: Int!
    values: JSON!
    errors: [String!]!
  }

  type TaskImportPreview {
    rows: [TaskImportRow!]!
    validCount: Int!
    errorCount: Int!
  }

  input AttendanceFilter {
    userId: ID
    departmentId: ID
    fromDate: DateTime
    toDate: DateTime
    isLate: Boolean
    isEarlyLeave: Boolean
    leaveCode: LeaveCode
  }

  input LeaveRequestFilter {
    userId: ID
    departmentId: ID
    leaveCode: LeaveCode
    status: ApprovalStatus
    fromDate: DateTime
    toDate: DateTime
  }

  input RecordOvertimeInput {
    userId: ID!
    workDate: DateTime!
    hours: Decimal!
    note: String
  }

  input ReviewOvertimeInput {
    overtimeId: ID!
    decision: ApprovalStatus!
    reviewComment: String
  }

  # ---------------------------------------------------------------- #
  # Performance & Audit                                              #
  # ---------------------------------------------------------------- #

  type KpiPointRule {
    code: String!
    event: String!
    points: Int!
    description: String
    isActive: Boolean!
    sortOrder: Int!
  }

  type KpiScoreEvent {
    id: ID!
    user: User!
    task: Task
    ruleCode: String!
    points: Int!
    periodYear: Int!
    periodMonth: Int!
    occurredAt: DateTime!
  }

  type KpiMonthlySummary {
    id: ID!
    user: User!
    periodMonth: Int!
    periodYear: Int!
    totalTasksAssigned: Int!
    completedOnTime: Int!
    completedUrgentOnTime: Int!
    approvedFirstTime: Int!
    overdueTasks: Int!
    rejectedTasks: Int!
    extensionRequestsCount: Int!
    attendanceRate: Decimal!
    perfectAttendanceBonus: Int!
    unapprovedLeaveCount: Int!
    lateEarlyCount: Int!
    totalKpiScore: Int!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type PersonalKpiDashboard {
    periodYear: Int!
    periodMonth: Int!
    totalKpiScore: Int!
    summary: KpiMonthlySummary
    leaveBalances: [LeaveBalance!]!
    recentEvents: [KpiScoreEvent!]!
  }

  type KpiAuditLevel1Row {
    periodYear: Int!
    periodMonth: Int!
    user: User!
    department: Department
    totalTasksAssigned: Int!
    completedOnTime: Int!
    overdueTasks: Int!
    unapprovedLeaveCount: Int!
    perfectAttendanceBonus: Int!
    attendanceRate: Decimal!
    totalKpiScore: Int!
  }

  type KpiAuditLevel2Row {
    periodYear: Int!
    periodMonth: Int!
    department: Department!
    totalEmployees: Int!
    totalTasksAssigned: Int!
    avgAttendanceRate: Decimal!
    avgDepartmentKpiScore: Decimal!
  }

  type KpiAuditLevel3Row {
    periodYear: Int!
    periodMonth: Int!
    department: Department!
    user: User!
    totalTasksAssigned: Int!
    completedOnTime: Int!
    overdueTasks: Int!
    immediateApprovalCount: Int!
    returnedCount: Int!
    perfectAttendanceBonus: Int!
    attendanceRate: Decimal!
    totalKpiScore: Int!
  }

  type KpiScoreEventConnection {
    nodes: [KpiScoreEvent!]!
    pageInfo: OffsetPageInfo!
  }

  type KpiAuditLevel1Connection {
    nodes: [KpiAuditLevel1Row!]!
    pageInfo: OffsetPageInfo!
  }

  type KpiAuditLevel2Connection {
    nodes: [KpiAuditLevel2Row!]!
    pageInfo: OffsetPageInfo!
  }

  type KpiAuditLevel3Connection {
    nodes: [KpiAuditLevel3Row!]!
    pageInfo: OffsetPageInfo!
  }

  input KpiPeriodInput {
    periodYear: Int!
    periodMonth: Int!
  }

  input KpiAuditFilter {
    periodYear: Int!
    periodMonth: Int
    departmentId: ID
  }

  # ---------------------------------------------------------------- #
  # Settings & IAM                                                   #
  # ---------------------------------------------------------------- #

  type SystemAuditLog {
    id: ID!
    user: User
    action: String!
    resourceType: String!
    resourceId: String
    oldData: JSON
    newData: JSON
    ipAddress: String
    userAgent: String
    createdAt: DateTime!
  }

  type AppSetting {
    id: ID!
    moduleCode: String!
    key: String!
    value: JSON
    isSecret: Boolean!
    description: String
  }

  type Notification {
    id: ID!
    channel: String!
    template: String
    recipient: String
    payload: JSON
    status: NotificationStatus!
    attempts: Int!
    relatedType: String
    relatedId: ID
    errorMessage: String
    sentAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type TelegramWebhookConfig {
    botToken: String
    alertGroupChatId: String
    webhookUrl: String
    isEnabled: Boolean!
  }

  type UserConnection {
    nodes: [User!]!
    pageInfo: OffsetPageInfo!
  }

  type SystemAuditLogConnection {
    nodes: [SystemAuditLog!]!
    pageInfo: OffsetPageInfo!
  }

  type NotificationConnection {
    nodes: [Notification!]!
    pageInfo: OffsetPageInfo!
  }

  input CreateUserInput {
    userCode: String!
    fullName: String!
    email: String!
    password: String!
    departmentId: ID
    roleCodes: [RoleCode!]!
  }

  input UpdateUserInput {
    id: ID!
    fullName: String
    email: String
    departmentId: ID
    roleCodes: [RoleCode!]
    isActive: Boolean
  }

  input UserFilter {
    departmentId: ID
    roleCode: RoleCode
    isActive: Boolean
    search: String
  }

  input CreateDepartmentInput {
    code: String!
    name: String!
    departmentType: DepartmentType!
    parentId: ID
    managerId: ID
    autoForkingEnabled: Boolean = true
  }

  input UpdateDepartmentInput {
    id: ID!
    name: String
    parentId: ID
    managerId: ID
    autoForkingEnabled: Boolean
    isActive: Boolean
  }

  input UpdateRolePermissionsInput {
    roleId: ID!
    permissionCodes: [String!]!
  }

  input UpdateAppSettingInput {
    moduleCode: String!
    key: String!
    value: JSON
    isSecret: Boolean
  }

  input UpdateTelegramWebhookConfigInput {
    botToken: String
    alertGroupChatId: String
    webhookUrl: String
    isEnabled: Boolean
  }

  input AuditLogFilter {
    userId: ID
    action: String
    resourceType: String
    resourceId: String
    fromDate: DateTime
    toDate: DateTime
  }

  input NotificationFilter {
    status: NotificationStatus
    channel: String
    relatedType: String
    relatedId: ID
  }

  # ---------------------------------------------------------------- #
  # Audit Log (app 5)                                                #
  # ---------------------------------------------------------------- #

  type ModuleActivitySummary {
    moduleCode: String!
    moduleName: String!
    eventCount: Int!
    lastActivityAt: DateTime
  }

  input ModuleAuditFilter {
    moduleCode: String
    userId: ID
    action: String
    resourceType: String
    resourceId: String
    fromDate: DateTime
    toDate: DateTime
  }

  # ---------------------------------------------------------------- #
  # Root types                                                       #
  # ---------------------------------------------------------------- #

  type Query {
    # Auth
    viewer: Viewer

    # Registries
    ticketStates: [TicketState!]!
    leaveCodes: [LeaveCodeInfo!]!

    # Jobs & Projects
    projects(
      filter: ProjectFilter
      orderBy: ProjectOrderBy
      offset: Int = 0
      limit: Int = 20
    ): ProjectConnection!
    project(id: ID!): Project
    tasks(
      filter: TaskFilter
      orderBy: TaskOrderBy
      offset: Int = 0
      limit: Int = 20
    ): TaskConnection!
    task(id: ID!): Task

    # Planning & Attendance
    matrixCalendar(input: MatrixCalendarInput!): MatrixCalendar!
    scheduledTasks(input: ScheduleInput!): [Task!]!
    attendanceRecords(
      filter: AttendanceFilter
      offset: Int = 0
      limit: Int = 20
    ): AttendanceRecordConnection!
    leaveRequests(
      filter: LeaveRequestFilter
      offset: Int = 0
      limit: Int = 20
    ): LeaveRequestConnection!
    leaveBalances(userId: ID): [LeaveBalance!]!
    overtimeRecords(offset: Int = 0, limit: Int = 20): OvertimeRecordConnection!

    # Performance & Audit
    personalKpiDashboard(input: KpiPeriodInput!): PersonalKpiDashboard!
    kpiScoreEvents(
      input: KpiPeriodInput!
      offset: Int = 0
      limit: Int = 20
    ): KpiScoreEventConnection!
    kpiPointRules: [KpiPointRule!]!
    kpiAuditLevel1Company(
      filter: KpiAuditFilter!
      offset: Int = 0
      limit: Int = 20
    ): KpiAuditLevel1Connection!
    kpiAuditLevel2Department(filter: KpiAuditFilter!): KpiAuditLevel2Connection!
    kpiAuditLevel3Employee(
      filter: KpiAuditFilter!
      orderBy: KpiAuditOrderBy
      offset: Int = 0
      limit: Int = 20
    ): KpiAuditLevel3Connection!

    # Settings & IAM
    users(filter: UserFilter, offset: Int = 0, limit: Int = 20): UserConnection!
    user(id: ID!): User
    departments: [Department!]!
    roles: [Role!]!
    permissions: [Permission!]!
    systemAuditLogs(
      filter: AuditLogFilter
      offset: Int = 0
      limit: Int = 20
    ): SystemAuditLogConnection!
    appSettings(moduleCode: String): [AppSetting!]!
    telegramWebhookConfig: TelegramWebhookConfig!
    notifications(
      filter: NotificationFilter
      offset: Int = 0
      limit: Int = 20
    ): NotificationConnection!

    # Audit Log app
    auditLogs(
      filter: ModuleAuditFilter
      offset: Int = 0
      limit: Int = 20
    ): SystemAuditLogConnection!
    moduleActivity(filter: ModuleAuditFilter): [ModuleActivitySummary!]!
  }

  type Mutation {
    # Auth
    login(input: LoginInput!): AuthPayload!
    logout: Boolean!
    requestPasswordReset(email: String!): Boolean!
    resetPassword(input: ResetPasswordInput!): Boolean!
    changePassword(input: ChangePasswordInput!): Boolean!

    # Jobs & Projects
    createTask(input: CreateTaskInput!): Task!
    acceptTask(taskId: ID!): Task!
    logTaskProgress(input: LogTaskProgressInput!): Task!
    submitTaskReport(input: SubmitTaskReportInput!): Task!
    approveTask(taskId: ID!): Task!
    returnTask(taskId: ID!, reason: String!): Task!
    cancelTask(input: CancelTaskInput!): Task!
    requestExtension(input: RequestExtensionInput!): TaskRequest!
    explainLateSubmission(input: ExplainLateSubmissionInput!): TaskRequest!
    reviewTaskRequest(input: ReviewTaskRequestInput!): TaskRequest!
    submitTaskCompletionRequest(
      input: SubmitTaskCompletionRequestInput!
    ): TaskCompletionRequest!
    reviewTaskCompletionRequest(
      input: ReviewTaskCompletionRequestInput!
    ): TaskCompletionRequest!

    # Planning & Attendance
    registerLeave(input: RegisterLeaveInput!): LeaveRequest!
    reviewLeave(input: ReviewLeaveInput!): LeaveRequest!
    assignPenaltyLeave(input: AssignPenaltyLeaveInput!): AttendanceRecord!
    recordOvertime(input: RecordOvertimeInput!): OvertimeRecord!
    reviewOvertime(input: ReviewOvertimeInput!): OvertimeRecord!
    updateTask(input: UpdateTaskInput!): Task!
    deleteTask(taskId: ID!): Boolean!
    duplicateTask(input: DuplicateTaskInput!): Task!
    previewTaskImport(file: ImportFileInput!): TaskImportPreview!
    commitTaskImport(file: ImportFileInput!): [Task!]!

    # Settings & IAM
    createUser(input: CreateUserInput!): User!
    updateUser(input: UpdateUserInput!): User!
    resetUserPassword(userId: ID!, newPassword: String!): Boolean!
    deactivateUser(userId: ID!): User!
    createDepartment(input: CreateDepartmentInput!): Department!
    updateDepartment(input: UpdateDepartmentInput!): Department!
    updateRolePermissions(input: UpdateRolePermissionsInput!): Role!
    updateAppSetting(input: UpdateAppSettingInput!): AppSetting!
    updateTelegramWebhookConfig(
      input: UpdateTelegramWebhookConfigInput!
    ): TelegramWebhookConfig!

    # Audit Log app
    exportAuditLogs(
      filter: ModuleAuditFilter
      format: ExportFormat = XLSX
    ): ExportResult!

    # Print / export
    printTaskSlip(taskId: ID!): ExportResult!
    exportTasks(filter: TaskFilter, format: ExportFormat = XLSX): ExportResult!
    printLeaveRequest(leaveRequestId: ID!): ExportResult!
    printAttendanceCalendar(input: MatrixCalendarInput!): ExportResult!
    exportAttendance(
      filter: AttendanceFilter
      format: ExportFormat = XLSX
    ): ExportResult!
    printKpiReport(input: KpiPeriodInput!): ExportResult!
    exportAuditWorkbook(filter: KpiAuditFilter!): ExportResult!
    exportSchedule(input: ScheduleInput!, format: ExportFormat = XLSX): ExportResult!
    taskImportTemplate(format: ExportFormat = XLSX): ExportResult!
  }
`;
