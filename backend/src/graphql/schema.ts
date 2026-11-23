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

  enum ShoptifyPayoutStatus {
    SCHEDULED
    IN_TRANSIT
    PAID
    FAILED
  }

  enum ShoptifyExceptionReason {
    ADDRESS_INVALID
    PAYMENT_HELD
    OUT_OF_STOCK
    FRAUD_RISK
    CUSTOMER_EDIT
    OTHER
  }

  enum ShoptifyAutomationTrigger {
    ORDER_CREATED
    ORDER_UPDATED
    ORDER_EXCEPTION
    STOCK_LOW
    REFUND_CREATED
    PAYOUT_FAILED
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

  input RequestEmailChangeInput {
    currentPassword: String!
    newEmail: String!
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

  type KpiMonth {
    periodYear: Int!
    periodMonth: Int!
  }

  type KpiMonthlyTotal {
    periodYear: Int!
    periodMonth: Int!
    totalKpiScore: Int!
  }

  type KpiPeriodSummary {
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
  }

  type PersonalKpiDashboard {
    months: [KpiMonth!]!
    totalKpiScore: Int!
    monthlyTotals: [KpiMonthlyTotal!]!
    summary: KpiPeriodSummary
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

  input KpiMonthInput {
    periodYear: Int!
    periodMonth: Int!
  }

  input KpiPeriodSelectionInput {
    months: [KpiMonthInput!]!
  }

  input KpiAuditFilter {
    months: [KpiMonthInput!]!
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

  # Inbound bot configuration (openspec/changes/add-telegram-bot). Secrets are
  # always returned masked; the settings editor is the only surface that can
  # change them.
  type TelegramBotSettings {
    isEnabled: Boolean!
    botToken: String
    botTokenSet: Boolean!
    aiBaseUrl: String
    aiApiKey: String
    aiApiKeySet: Boolean!
    aiDefaultModel: String
    pushAlertsEnabled: Boolean!
  }

  input SaveTelegramBotSettingsInput {
    isEnabled: Boolean
    botToken: String
    clearBotToken: Boolean
    aiBaseUrl: String
    aiApiKey: String
    clearAiApiKey: Boolean
    aiDefaultModel: String
    pushAlertsEnabled: Boolean
  }

  type TelegramLinkCode {
    code: String!
    expiresAt: DateTime!
  }

  type TelegramLink {
    id: ID!
    telegramUserId: String!
    telegramChatId: String!
    telegramUsername: String
    isActive: Boolean!
    lastSeenAt: DateTime
    createdAt: DateTime!
    userId: ID!
    userCode: String
    fullName: String
  }

  type TelegramAiModel {
    modelId: String!
    displayName: String
    fetchedAt: DateTime!
  }

  # One of the viewer's own Telegram accounts, linked through the browser
  # MTProto module (openspec/changes/add-telegram-multi-account-client).
  # sessionString and deviceFingerprint reconnect the account in the
  # viewer's own browser; both are returned only to the owning viewer.
  # webSlot is the stable slot the embedded Telegram Web client keeps the
  # account under (its ?account=N scheme).
  type TelegramAccount {
    id: ID!
    telegramUserId: String!
    phoneNumber: String
    username: String
    firstName: String!
    lastName: String
    avatarUrl: String
    isActive: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
    deviceFingerprint: JSON
    sessionString: String
    webSlot: Int
  }

  input TelegramProfileInput {
    telegramUserId: String!
    phoneNumber: String!
    username: String
    firstName: String!
    lastName: String
    avatarUrl: String
  }

  input TelegramDeviceFingerprintInput {
    deviceModel: String!
    systemVersion: String!
    appVersion: String!
  }

  input SaveTelegramAccountInput {
    sessionString: String!
    profile: TelegramProfileInput!
    deviceFingerprint: TelegramDeviceFingerprintInput!
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
  # Shopify commerce (shoptify app)                                  #
  # ---------------------------------------------------------------- #

  type ShoptifyStore {
    id: ID!
    name: String!
    shopDomain: String!
    currency: String!
    scopes: [String!]
    isActive: Boolean!
    lastSyncAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type ShoptifyOrder {
    id: ID!
    storeId: ID!
    storeName: String
    shopifyOrderId: String!
    orderNumber: String
    customerEmail: String
    customerPhone: String
    shippingAddress: JSON
    financialStatus: String
    fulfillmentStatus: String
    # Minor units in the order's currency.
    totalPrice: Int!
    currency: String!
    tags: [String!]
    note: String
    hasException: Boolean!
    exceptionReason: ShoptifyExceptionReason
    netProfit: Int
    fulfillments: [ShoptifyFulfillment!]!
    refunds: [ShoptifyRefund!]!
    shopifyCreatedAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type ShoptifyOrderConnection {
    nodes: [ShoptifyOrder!]!
    pageInfo: OffsetPageInfo!
  }

  type ShoptifyProductConnection {
    nodes: [ShoptifyProduct!]!
    pageInfo: OffsetPageInfo!
  }

  type ShoptifyCustomerConnection {
    nodes: [ShoptifyCustomer!]!
    pageInfo: OffsetPageInfo!
  }

  type ShoptifyPayoutConnection {
    nodes: [ShoptifyPayout!]!
    pageInfo: OffsetPageInfo!
  }

  type ShoptifyFulfillment {
    id: ID!
    orderId: ID!
    shopifyFulfillmentId: String
    trackingCompany: String
    trackingNumber: String
    trackingUrl: String
    shipmentStatus: String
    createdAt: DateTime!
  }

  type ShoptifyRefund {
    id: ID!
    orderId: ID!
    shopifyRefundId: String!
    # Minor units.
    amount: Int!
    currency: String!
    reason: String
    createdAt: DateTime!
  }

  type ShoptifyProduct {
    id: ID!
    storeId: ID!
    shopifyProductId: String!
    title: String!
    status: String
    variants: [ShoptifyVariant!]!
    updatedAt: DateTime!
  }

  type ShoptifyVariant {
    id: ID!
    productId: ID!
    storeId: ID!
    storeName: String
    shopifyVariantId: String!
    sku: String
    # Cross-store mapping key: variants sharing it stock-sync together.
    masterSku: String
    # Minor units.
    price: Int
    costOfGoods: Int
    availableQuantity: Int!
    minStockLevel: Int
    isLowStock: Boolean!
  }

  type ShoptifyCustomer {
    id: ID!
    email: String
    phone: String
    totalOrdersCount: Int!
    # Minor units.
    totalSpent: Int!
    isBlacklisted: Boolean!
    isHighRisk: Boolean!
    notes: String
  }

  type ShoptifyPayout {
    id: ID!
    storeId: ID!
    storeName: String
    shopifyPayoutId: String!
    # Minor units.
    amount: Int!
    currency: String!
    status: ShoptifyPayoutStatus!
    payoutDate: DateTime
    createdAt: DateTime!
  }

  type ShoptifyAutomationRule {
    id: ID!
    name: String!
    storeId: ID
    storeName: String
    triggerEvent: ShoptifyAutomationTrigger!
    conditions: JSON
    actions: JSON
    isActive: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  input ShoptifyOrderFilter {
    storeId: ID
    financialStatus: String
    fulfillmentStatus: String
    hasException: Boolean
    createdAfter: DateTime
    createdBefore: DateTime
    search: String
  }

  input ShoptifyProductFilter {
    storeId: ID
    masterSku: String
    lowStockOnly: Boolean
  }

  input ShoptifyCustomerFilter {
    isBlacklisted: Boolean
    isHighRisk: Boolean
    search: String
  }

  input ShoptifyConnectStoreInput {
    shopDomain: String!
    accessToken: String!
  }

  input ShoptifyOrderFlagsInput {
    orderId: ID!
    tags: [String!]
    note: String
    hasException: Boolean
    exceptionReason: ShoptifyExceptionReason
  }

  input ShoptifyFulfillmentInput {
    orderId: ID!
    trackingCompany: String!
    trackingNumber: String!
    trackingUrl: String
  }

  input ShoptifyBulkFulfillInput {
    # One tracking payload per order; each order is independent.
    items: [ShoptifyFulfillmentInput!]!
  }

  input ShoptifyInventoryUpdateInput {
    variantId: ID!
    availableQuantity: Int
    price: Int
    status: String
  }

  input ShoptifyCustomerFlagInput {
    customerId: ID!
    isBlacklisted: Boolean
    isHighRisk: Boolean
    notes: String
  }

  input ShoptifyOrderExpensesInput {
    orderId: ID!
    revenue: Int!
    cogs: Int
    shipping: Int
    gatewayFee: Int
    adSpend: Int
  }

  input ShoptifyPayoutInput {
    storeId: ID!
    shopifyPayoutId: String!
    amount: Int!
    currency: String!
    status: ShoptifyPayoutStatus
    payoutDate: DateTime
  }

  input ShoptifySaveRuleInput {
    id: ID
    name: String!
    storeId: ID
    triggerEvent: ShoptifyAutomationTrigger!
    conditions: JSON
    actions: JSON
    isActive: Boolean
  }

  type ShoptifyOAuthBegin {
    redirectUrl: String!
  }

  type ShoptifyBulkFulfillResult {
    succeeded: [ShoptifyFulfillment!]!
    failed: [ShoptifyOperationError!]!
  }

  type ShoptifyOperationError {
    orderId: ID
    message: String!
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
    personalKpiDashboard(input: KpiPeriodSelectionInput!): PersonalKpiDashboard!
    kpiScoreEvents(
      input: KpiPeriodSelectionInput!
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
    telegramBotSettings: TelegramBotSettings!
    telegramLinkCode: TelegramLinkCode!
    telegramLinks: [TelegramLink!]!
    telegramAiModels: [TelegramAiModel!]!
    telegramAccounts: [TelegramAccount!]!
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

    # Shopify commerce
    shoptifyStores: [ShoptifyStore!]!
    shoptifyOrders(
      filter: ShoptifyOrderFilter
      offset: Int = 0
      limit: Int = 20
    ): ShoptifyOrderConnection!
    shoptifyOrder(id: ID!): ShoptifyOrder
    shoptifyProducts(
      filter: ShoptifyProductFilter
      offset: Int = 0
      limit: Int = 20
    ): ShoptifyProductConnection!
    shoptifyCustomers(
      filter: ShoptifyCustomerFilter
      offset: Int = 0
      limit: Int = 20
    ): ShoptifyCustomerConnection!
    shoptifyPayouts(storeId: ID, offset: Int = 0, limit: Int = 20): ShoptifyPayoutConnection!
    shoptifyAutomationRules(storeId: ID): [ShoptifyAutomationRule!]!
  }

  type Mutation {
    # Auth
    login(input: LoginInput!): AuthPayload!
    logout: Boolean!
    requestPasswordReset(email: String!): Boolean!
    resetPassword(input: ResetPasswordInput!): Boolean!
    changePassword(input: ChangePasswordInput!): Boolean!
    requestEmailChange(input: RequestEmailChangeInput!): Boolean!
    confirmEmailChange(token: String!): Boolean!

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
    saveTelegramBotSettings(
      input: SaveTelegramBotSettingsInput!
    ): TelegramBotSettings!
    refreshTelegramAiModels: [TelegramAiModel!]!
    revokeTelegramLink(linkId: ID!): Boolean!
    saveTelegramAccount(input: SaveTelegramAccountInput!): TelegramAccount!
    removeTelegramAccount(accountId: ID!): Boolean!

    # Audit Log app
    exportAuditLogs(
      filter: ModuleAuditFilter
      format: ExportFormat = XLSX
    ): ExportResult!

    # Shopify commerce
    shoptifyBeginOAuth(shopDomain: String!): ShoptifyOAuthBegin!
    shoptifyConnectStore(input: ShoptifyConnectStoreInput!): ShoptifyStore!
    shoptifyDeactivateStore(storeId: ID!): ShoptifyStore!
    shoptifyUpdateOrderFlags(input: ShoptifyOrderFlagsInput!): ShoptifyOrder!
    shoptifyBulkFulfill(input: ShoptifyBulkFulfillInput!): ShoptifyBulkFulfillResult!
    shoptifyUpdateVariant(input: ShoptifyInventoryUpdateInput!): ShoptifyVariant!
    shoptifySyncInventory(variantId: ID!): ShoptifyVariant!
    shoptifySetCustomerFlags(input: ShoptifyCustomerFlagInput!): ShoptifyCustomer!
    shoptifySetOrderExpenses(input: ShoptifyOrderExpensesInput!): ShoptifyOrder!
    shoptifyRecordPayout(input: ShoptifyPayoutInput!): ShoptifyPayout!
    shoptifySaveRule(input: ShoptifySaveRuleInput!): ShoptifyAutomationRule!
    shoptifyDeleteRule(ruleId: ID!): Boolean!
    shoptifyExportOrders(
      filter: ShoptifyOrderFilter
      format: ExportFormat = XLSX
    ): ExportResult!
    shoptifyExportProducts(
      filter: ShoptifyProductFilter
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
    printKpiReport(input: KpiPeriodSelectionInput!): ExportResult!
    exportAuditWorkbook(filter: KpiAuditFilter!): ExportResult!
    exportSchedule(input: ScheduleInput!, format: ExportFormat = XLSX): ExportResult!
    taskImportTemplate(format: ExportFormat = XLSX): ExportResult!
  }
`;
