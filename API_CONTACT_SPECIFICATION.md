# API_CONTACT_SPECIFICATION.md

> GraphQL API contract for the MES prototype. This document defines the **interface** between clients and the system: the transport and JSON wire format, how sessions are established, how the two-layer authorization model is expressed, the GraphQL type system, and every query and mutation for the five apps (`Jobs`, `Planning`, `Performance`, `Settings & IAM`, `Audit Log`) plus shared/core concerns.

This is a **contract specification**, not code. It contains GraphQL SDL and JSON examples only; it introduces no resolvers, schema file, SQL, or client codegen.

---

## 1. Purpose & Scope

This document is the single interface reference for the MES prototype. It serves client developers, backend implementers, reviewers, and coding agents who need to build against the system without reading the underlying design documents end to end.

It is derived from, and should be read alongside:

- [`SYSTEM_PROCESS_FLOW-en.md`](./SYSTEM_PROCESS_FLOW-en.md) — behavior: roles, screens, flows, the two-layer authorization mechanism, and the shared code tables.
- [`SYSTEM_ARCHITECTURE.md`](./SYSTEM_ARCHITECTURE.md) — structure: the module catalog, core engines, the shared domain model, and the authorization architecture.
- [`DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql`](./DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql) — data: the persisted domain model (tables, enums, code registries, and views) that the type system mirrors.

**API style.** A single **GraphQL** endpoint over HTTP, with **JSON** request and response payloads.

**In scope:** API conventions and the JSON wire format; authentication and session operations; the authorization model and per-operation access; the GraphQL type system (scalars, enums, shared object types); queries and mutations for all five apps and for shared/core concerns; the error catalog; worked examples; and traceability back to the source documents.

**Out of scope:** implementation detail (resolvers, persistence, indexes, migrations); the concrete runtime stack beyond the transport and wire-format conventions this contract requires; REST/OpenAPI as an alternative surface; and any behavior, code, role, or value not described by the source documents. The planned apps `Recruitment`, `Payroll`, and `Assets` are noted as non-contractual extension points only.

---

## 2. API Conventions

### 2.1 Transport and endpoint

- **Protocol:** GraphQL over HTTP.
- **Endpoint:** a single versioned endpoint, `POST /api/v1/graphql`.
- **Content type:** `application/json` for both request and response.
- **Method:** `POST` for all operations (queries and mutations). Introspection is available on the same endpoint for authorized clients.

### 2.2 Request envelope

Every request is a JSON object with the standard GraphQL-over-HTTP shape:

```json
{
  "query": "query Viewer { viewer { user { id fullName } } }",
  "operationName": "Viewer",
  "variables": {}
}
```

| Field | Required | Description |
| --- | --- | --- |
| `query` | yes | The GraphQL document (query or mutation). |
| `operationName` | no | Required only when the document contains more than one operation. |
| `variables` | no | A JSON object supplying operation variables. Preferred over inline literals. |

### 2.3 Response envelope

Every response is a JSON object:

```json
{
  "data": null,
  "errors": [],
  "extensions": {}
}
```

- `data` — the result tree, or `null` when the request fails before execution.
- `errors` — an array of error objects (see §8); omitted or empty on success.
- `extensions` — optional metadata (for example request tracing); never used to carry domain data.

GraphQL semantics apply: when some fields resolve and others fail, `data` contains the partial result **and** `errors` is populated.

### 2.4 Operation naming

- **Queries** are nouns describing what is read: `tasks`, `project`, `leaveRequests`, `personalKpiDashboard`.
- **Mutations** are a verb followed by the subject, in `camelCase`: `createTask`, `acceptTask`, `submitTaskReport`, `registerLeave`, `assignPenaltyLeave`, `updateTelegramWebhookConfig`.
- A mutation with a single subject returns that subject's type directly; mutations that produce a side file return an `ExportResult`.
- Field names are stable API surface; they do not change when the underlying column names change.

### 2.5 Pagination

List operations use **offset/limit** pagination and return a connection object.

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `offset` | `Int` | `0` | Number of items to skip. |
| `limit` | `Int` | `20` | Maximum items to return (server may cap). |

```graphql
type OffsetPageInfo {
  offset: Int!
  limit: Int!
  totalCount: Int!
  hasNextPage: Boolean!
}
```

Every `XxxConnection` type exposes `nodes: [Xxx!]!` and `pageInfo: OffsetPageInfo!`.

### 2.6 Filtering and sorting

- Each list operation accepts an optional `filter` input and an `orderBy` enum. Filter fields are combined with logical AND. Unset fields are ignored.
- `orderBy` enums use `FIELD_ASC` / `FIELD_DESC` values (for example `CREATED_AT_DESC`, `END_DATE_ASC`, `TOTAL_KPI_SCORE_DESC`).
- Omitting `orderBy` applies the operation's documented default order.

### 2.7 Naming and scalar mapping

The contract uses GraphQL naming conventions and maps the persisted model to GraphQL types.

| Source (schema) | Contract (GraphQL) | Notes |
| --- | --- | --- |
| `snake_case` column / table | `camelCase` field / `PascalCase` type | Reported to clients in camelCase. |
| `uuid` primary key | built-in `ID` scalar | Carried as an opaque UUID string. |
| `TIMESTAMPTZ` / `DATE` | `DateTime` scalar | ISO-8601 string (UTC). |
| `jsonb` | `JSON` scalar | Arbitrary JSON value. |
| `NUMERIC` | `Decimal` scalar | Arbitrary-precision decimal, serialized as a JSON number or string. |
| `VARCHAR` enum-like column / enum type | GraphQL `enum` | Enum values preserve the exact tokens. |

### 2.8 Custom scalars

```graphql
scalar DateTime
scalar JSON
scalar Decimal
```

The built-in `ID` scalar represents UUID identifiers. Enum values preserve the source tokens exactly (for example `REQ`, `TOIL`, `MULTI_DAY`).

---

## 3. Authentication & Session

### 3.1 How a session is established and carried

1. The client authenticates with the `login` mutation, supplying `email` and `password`.
2. On success, the mutation returns a **session token** and the authenticated `viewer`.
3. The client carries the token on every subsequent request in the HTTP header:

   ```text
   Authorization: Bearer <sessionToken>
   ```

4. The server resolves the token to a session whose **subject** is a `User` together with that user's assigned `roles`. The session's roles and the user's department determine which operations succeed and how much data they return (§4).
5. Sessions expire (`Session.expiresAt`); an expired or missing token causes `UNAUTHENTICATED` (§8).

### 3.2 Auth types

```graphql
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
```

### 3.3 Auth operations

| Operation | Type | Input | Output | Access |
| --- | --- | --- | --- | --- |
| `login` | mutation | `LoginInput!` (`email`, `password`) | `AuthPayload!` | public |
| `logout` | mutation | none | `Boolean!` | any authenticated |
| `viewer` | query | none | `Viewer` | any authenticated |
| `requestPasswordReset` | mutation | `String!` (`email`) | `Boolean!` | public |
| `resetPassword` | mutation | `ResetPasswordInput!` (`token`, `newPassword`) | `Boolean!` | public |
| `changePassword` | mutation | `ChangePasswordInput!` (`currentPassword`, `newPassword`) | `Boolean!` | any authenticated |

Input/output types:

```graphql
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

extend type Mutation {
  login(input: LoginInput!): AuthPayload!
  logout: Boolean!
  requestPasswordReset(email: String!): Boolean!
  resetPassword(input: ResetPasswordInput!): Boolean!
  changePassword(input: ChangePasswordInput!): Boolean!
}

extend type Query {
  viewer: Viewer
}
```

Every operation in §6 and §7 other than the public auth operations requires an authenticated session. Administrative account flows (create/edit/reset/lock a user) live in §6.4 and require the `Settings` authorization.

---

## 4. Authorization Model

### 4.1 Two layers of control

Authorization is enforced in **two independent layers**, both driven by the same role model. Every operation is annotated with the roles that may invoke it and the scope of data it returns.

- **Layer 1 — App-Level Access Guard.** Determines which app a role may open. A role that lacks app access cannot invoke that app's operations at all.
- **Layer 2 — View & Action-Level Access Guard.** Determines which operations (reads, actions, export buttons) a role may invoke and which data columns it sees.

### 4.2 Roles

```graphql
enum RoleCode {
  SUPER_ADMIN
  TECH_LEAD
  HR_MANAGER
  DEPT_HEAD
  EMPLOYEE
}
```

`TECH_LEAD` is the contract token for the documented **Manager / Tech Lead** role.

### 4.3 Scope vocabulary

```graphql
enum Scope {
  ALL
  COMPANY_WIDE
  DEPARTMENT_ONLY
  PERSONAL
}
```

| Scope | Meaning |
| --- | --- |
| `ALL` | Unrestricted within the function. |
| `COMPANY_WIDE` | All departments. |
| `DEPARTMENT_ONLY` | Restricted to the caller's own department. |
| `PERSONAL` | Restricted to the caller's own records. |

### 4.4 Per-operation annotation convention

Each operation in §6 and §7 is documented with:

- **Roles** — the roles permitted to invoke it (Layer 1 + Layer 2 entry check).
- **Scope** — the data scope applied, which may differ by role; when it does, the table lists each role's effective scope.

An operation invoked by a role that lacks access returns `FORBIDDEN` (§8). A role with access receives data already scoped to its effective scope; the server never returns records outside the scope.

### 4.5 App-level access summary

| App | Super Admin | Manager / Tech Lead (`TECH_LEAD`) | HR Manager | Department Head | Employee |
| --- | --- | --- | --- | --- | --- |
| **Jobs** | `ALL` | `ALL` | `COMPANY_WIDE` | `DEPARTMENT_ONLY` | `PERSONAL` |
| **Planning** | `ALL` | `ALL` | `COMPANY_WIDE` | `DEPARTMENT_ONLY` | `PERSONAL` |
| **Performance** | `ALL` | `ALL` | `COMPANY_WIDE` | `DEPARTMENT_ONLY` | `PERSONAL` |
| **Settings & IAM** | visible | visible | user directory only | fully hidden | fully hidden |
| **Audit Log** | visible | visible | fully hidden | fully hidden | fully hidden |

### 4.6 Documented asymmetries (must be preserved)

- Only **HR Manager** and **Super Admin** can assign the penalty leave codes **`UAL`** / **`USL`**; Manager/Tech Lead and Department Head cannot (§6.2).
- Only **Super Admin** and **Manager / Tech Lead** can manage RBAC authorization and the Telegram webhook configuration (§6.4).
- HR Manager can manage accounts in the user directory but does **not** see the RBAC or webhook menus.
- The **Audit Log** app is visible only to **Super Admin** and **Manager / Tech Lead**; it is fully hidden from HR Manager, Department Head, and Employee (§6.5), even though HR can view the audit trail in the user directory.
- Department Head never sees the company-wide audit levels; Employee never sees any audit level above their personal KPI.
- An Employee cannot create tickets allocated to others (no `createTask` access).

---

## 5. Type System

### 5.1 Enums

```graphql
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
```

### 5.2 Code registries

```graphql
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
```

`LeaveCodeInfo` is the registry record for a leave code; the `LeaveCode` enum is the bare token used elsewhere.

### 5.3 Identity, organization, and RBAC

```graphql
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
```

### 5.4 Common types

```graphql
type ExportResult {
  id: ID!
  fileName: String!
  mimeType: String!
  format: ExportFormat!
  url: String!
  createdAt: DateTime!
}
```

`ExportResult.url` points to the generated artifact; the contract does not prescribe storage. Print outputs are PDF; spreadsheet exports are `.xlsx` and `.csv`.

---

## 6. App APIs

### 6.1 Jobs & Projects

The main operational and ticket-handling module: project/campaign tracking, time and progress classification, the ticket state lifecycle, extension requests, and late-submission handling.

#### Types

```graphql
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
  progressLogs: [TaskProgressLog!]!
  stateTransitions: [TaskStateTransition!]!
  requests: [TaskRequest!]!
  attachments: [Attachment!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}

enum TaskStateBadge {
  URGENT_PROCESSING
  PROGRESS_UPDATE
  AWAITING_EXTENSION_APPROVAL
  AWAITING_PROGRESS_VERIFICATION
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

type Attachment {
  id: ID!
  ownerType: String!
  ownerId: ID!
  url: String!
  fileName: String
  mimeType: String
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
```

`TaskStateBadge` corresponds to the documented `ACT` secondary badges, whose display labels are exactly:

| Enum value | Display label |
| --- | --- |
| `URGENT_PROCESSING` | `ACT - Urgent Processing` |
| `PROGRESS_UPDATE` | `ACT - Progress Update (X%)` |
| `AWAITING_EXTENSION_APPROVAL` | `ACT - Awaiting Extension Approval` |
| `AWAITING_PROGRESS_VERIFICATION` | `ACT - Awaiting Progress Verification` |

Time and progress classification (preserved): **Hourly** tasks follow the urgent slots `10:30`, `14:00`, `16:30`; **Daily** tasks default to `17:00`/`18:00` the same day; **Multi-day** tasks track accumulated progress `0% → 100%` with milestones `25%`, `50%`, `75%`, `100%`. The daily planning/confirmation cutoff is `08:30`.

#### Inputs

```graphql
input ProjectFilter {
  departmentId: ID
  isActive: Boolean
  search: String
}

enum ProjectOrderBy {
  NAME_ASC
  NAME_DESC
  CREATED_AT_DESC
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

enum TaskOrderBy {
  CREATED_AT_DESC
  END_DATE_ASC
  PRIORITY_DESC
  STATE_ASC
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

input CancelTaskInput {
  taskId: ID!
  reason: String!
}
```

#### Operations

| Operation | Type | Signature | Roles | Scope |
| --- | --- | --- | --- | --- |
| `projects` | query | `(filter, orderBy, offset, limit): ProjectConnection!` | SA, TL, HR, DH | SA/TL `ALL`; HR `COMPANY_WIDE`; DH `DEPARTMENT_ONLY` |
| `project` | query | `(id: ID!): Project` | SA, TL, HR, DH | as `projects` |
| `tasks` | query | `(filter, orderBy, offset, limit): TaskConnection!` | all roles | SA/TL `ALL`; HR `COMPANY_WIDE`; DH `DEPARTMENT_ONLY`; EMP `PERSONAL` |
| `task` | query | `(id: ID!): Task` | all roles | same scoping as `tasks` |
| `createTask` | mutation | `(input: CreateTaskInput!): Task!` | SA, TL, HR, DH | creates `REQ`; supports the Auto-forking Engine; Employees are **denied** |
| `acceptTask` | mutation | `(taskId: ID!): Task!` | all roles | `REQ → ACT` |
| `logTaskProgress` | mutation | `(input: LogTaskProgressInput!): Task!` | all roles | update multi-day `%`, appends a progress log |
| `submitTaskReport` | mutation | `(input: SubmitTaskReportInput!): Task!` | all roles | `ACT → PEN` |
| `approveTask` | mutation | `(taskId: ID!): Task!` | SA, TL, HR, DH | `PEN → APP` |
| `returnTask` | mutation | `(taskId: ID!, reason: String!): Task!` | SA, TL, HR, DH | `PEN → REJ` |
| `cancelTask` | mutation | `(input: CancelTaskInput!): Task!` | SA, TL, HR, DH, EMP | Employee (own) or Manager `→ CAN`; reason mandatory |
| `requestExtension` | mutation | `(input: RequestExtensionInput!): TaskRequest!` | all roles | creates an `EXTENSION` request |
| `explainLateSubmission` | mutation | `(input: ExplainLateSubmissionInput!): TaskRequest!` | all roles | creates a `LATE_EXPLANATION` request for `OVERDUE` |
| `reviewTaskRequest` | mutation | `(input: ReviewTaskRequestInput!): TaskRequest!` | SA, TL, HR, DH | approve updates the deadline; reject keeps it |

```graphql
extend type Query {
  projects(filter: ProjectFilter, orderBy: ProjectOrderBy, offset: Int = 0, limit: Int = 20): ProjectConnection!
  project(id: ID!): Project
  tasks(filter: TaskFilter, orderBy: TaskOrderBy, offset: Int = 0, limit: Int = 20): TaskConnection!
  task(id: ID!): Task
}

extend type Mutation {
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
}
```

State lifecycle (preserved): `REQ → ACT → PEN → {APP | REJ}`, cancel to `CAN` at any time, and passing a deadline moves the ticket to `OVERDUE` (which requires a late-submission explanation before `PEN`).

### 6.2 Planning & Attendance

The matrix work calendar, attendance, acceptance-report approval, and leave registration.

#### Types

```graphql
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
```

#### Inputs

```graphql
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
```

#### Operations

| Operation | Type | Signature | Roles | Scope |
| --- | --- | --- | --- | --- |
| `matrixCalendar` | query | `(input: MatrixCalendarInput!): MatrixCalendar!` | all roles | SA/TL `ALL`; HR `COMPANY_WIDE`; DH `DEPARTMENT_ONLY`; EMP `PERSONAL` |
| `attendanceRecords` | query | `(filter, offset, limit): AttendanceRecordConnection!` | all roles | same scoping as `matrixCalendar` |
| `leaveRequests` | query | `(filter, offset, limit): LeaveRequestConnection!` | all roles | same scoping as `matrixCalendar` |
| `leaveBalances` | query | `(userId: ID): [LeaveBalance!]!` | all roles | SA/TL `ALL`; HR `COMPANY_WIDE`; DH `DEPARTMENT_ONLY`; EMP `PERSONAL` (`AL`, `TOIL`) |
| `overtimeRecords` | query | `(filter, offset, limit): OvertimeRecordConnection!` | all roles | same scoping as `matrixCalendar` |
| `registerLeave` | mutation | `(input: RegisterLeaveInput!): LeaveRequest!` | all roles | creates a leave request (`AL`, `SL`, `PL`, `ML`, `CL`, `EL`, `LWP`, `TOIL`, `VTO`) |
| `reviewLeave` | mutation | `(input: ReviewLeaveInput!): LeaveRequest!` | SA, TL, HR, DH | approve shows the leave badge; reject keeps it absent |
| `assignPenaltyLeave` | mutation | `(input: AssignPenaltyLeaveInput!): AttendanceRecord!` | **SA, HR only** | tags `UAL`/`USL`; deducts 100% of the daily wage + KPI points |
| `recordOvertime` | mutation | `(input: RecordOvertimeInput!): OvertimeRecord!` | SA, TL, HR, DH | feeds the OT hours fund backing `TOIL` |
| `reviewOvertime` | mutation | `(input: ReviewOvertimeInput!): OvertimeRecord!` | SA, TL, HR, DH | approve/reject |

```graphql
extend type Query {
  matrixCalendar(input: MatrixCalendarInput!): MatrixCalendar!
  attendanceRecords(filter: AttendanceFilter, offset: Int = 0, limit: Int = 20): AttendanceRecordConnection!
  leaveRequests(filter: LeaveRequestFilter, offset: Int = 0, limit: Int = 20): LeaveRequestConnection!
  leaveBalances(userId: ID): [LeaveBalance!]!
  overtimeRecords(offset: Int = 0, limit: Int = 20): OvertimeRecordConnection!
}

extend type Mutation {
  registerLeave(input: RegisterLeaveInput!): LeaveRequest!
  reviewLeave(input: ReviewLeaveInput!): LeaveRequest!
  assignPenaltyLeave(input: AssignPenaltyLeaveInput!): AttendanceRecord!
  recordOvertime(input: RecordOvertimeInput!): OvertimeRecord!
  reviewOvertime(input: ReviewOvertimeInput!): OvertimeRecord!
}
```

The approval board covers reports in `PEN` (approve `APP` / return `REJ`) and pending extension/late-submission requests. HR/Super Admin may assign the penalty codes `UAL`/`USL`; unauthorized absence deducts 100% of the daily wage plus an attendance KPI deduction.

### 6.3 Performance & Audit

Deterministic KPI scoring and the multi-level audit tables. Scoring is reproducible from a fixed rule set: **Total Performance Score = Total Bonus Points (+) − Total Penalty Points (−)**.

| Rule code | Event | Points |
| --- | --- | --- |
| `KPI_ON_TIME_TICKET` | on-time ticket (`APP`) | `+10` |
| `KPI_ON_TIME_URGENT` | on-time urgent ticket (`APP`) | `+20` |
| `KPI_FIRST_TIME_APPROVAL` | approved immediately without edits | `+5` |
| `KPI_PERFECT_ATTENDANCE` | month of excellent attendance | `+50` |
| `KPI_OVERDUE_TICKET` | overdue ticket (`OVERDUE`) | `-15` |
| `KPI_RETURNED_TICKET` | instance returned (`REJ`) | `-5` |
| `KPI_EXTENSION_REQUEST` | extension request | `-2` |
| `KPI_UNAPPROVED_LEAVE` | late/early or unapproved leave (`UAL`/`USL`) | `-10` |

#### Types

```graphql
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
```

#### Inputs

```graphql
input KpiPeriodInput {
  periodYear: Int!
  periodMonth: Int!
}

input KpiAuditFilter {
  periodYear: Int!
  periodMonth: Int
  departmentId: ID
}
```

#### Operations

| Operation | Type | Signature | Roles | Scope |
| --- | --- | --- | --- | --- |
| `personalKpiDashboard` | query | `(input: KpiPeriodInput!): PersonalKpiDashboard!` | all roles | `PERSONAL` |
| `kpiScoreEvents` | query | `(input: KpiPeriodInput!, offset, limit): KpiScoreEventConnection!` | all roles | SA/TL `ALL`; HR `COMPANY_WIDE`; DH `DEPARTMENT_ONLY`; EMP `PERSONAL` |
| `kpiPointRules` | query | `: [KpiPointRule!]!` | all roles | registry read |
| `kpiAuditLevel1Company` | query | `(filter: KpiAuditFilter!, offset, limit): KpiAuditLevel1Connection!` | SA, TL, HR | `ALL` / `COMPANY_WIDE`; **hidden from DH and EMP** |
| `kpiAuditLevel2Department` | query | `(filter: KpiAuditFilter!): KpiAuditLevel2Connection!` | SA, TL, HR | `ALL` / `COMPANY_WIDE`; **hidden from DH and EMP** |
| `kpiAuditLevel3Employee` | query | `(filter: KpiAuditFilter!, orderBy, offset, limit): KpiAuditLevel3Connection!` | SA, TL, HR, DH | SA/TL `ALL`; HR `COMPANY_WIDE`; DH `DEPARTMENT_ONLY`; **hidden from EMP** |

```graphql
extend type Query {
  personalKpiDashboard(input: KpiPeriodInput!): PersonalKpiDashboard!
  kpiScoreEvents(input: KpiPeriodInput!, offset: Int = 0, limit: Int = 20): KpiScoreEventConnection!
  kpiPointRules: [KpiPointRule!]!
  kpiAuditLevel1Company(filter: KpiAuditFilter!, offset: Int = 0, limit: Int = 20): KpiAuditLevel1Connection!
  kpiAuditLevel2Department(filter: KpiAuditFilter!): KpiAuditLevel2Connection!
  kpiAuditLevel3Employee(filter: KpiAuditFilter!, orderBy: KpiAuditOrderBy, offset: Int = 0, limit: Int = 20): KpiAuditLevel3Connection!
}

enum KpiAuditOrderBy {
  TOTAL_KPI_SCORE_DESC
  TOTAL_KPI_SCORE_ASC
  ATTENDANCE_RATE_DESC
}
```

The three audit levels correspond to the documented tables: Level 1 = company-wide per employee (HR/Admin); Level 2 = aggregated by department/division; Level 3 = per employee within a department (Department Head).

### 6.4 Settings & IAM

The administration center for authorization, organization management, audit logging, and connection configuration.

#### Types

```graphql
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
```

#### Inputs

```graphql
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
```

#### Operations

| Operation | Type | Signature | Roles | Scope |
| --- | --- | --- | --- | --- |
| `users` | query | `(filter: UserFilter, offset, limit): UserConnection!` | SA, TL, HR | user directory; SA/TL `ALL`; HR `COMPANY_WIDE` |
| `user` | query | `(id: ID!): User` | all roles | SA/TL `ALL`; HR `COMPANY_WIDE`; DH `DEPARTMENT_ONLY`; EMP `PERSONAL` (self) |
| `departments` | query | `: [Department!]!` | SA, TL, HR, DH | org structure; DH `DEPARTMENT_ONLY` |
| `roles` | query | `: [Role!]!` | SA, TL | RBAC |
| `permissions` | query | `: [Permission!]!` | SA, TL | RBAC |
| `createUser` | mutation | `(input: CreateUserInput!): User!` | SA, HR | account lifecycle |
| `updateUser` | mutation | `(input: UpdateUserInput!): User!` | SA, HR | account lifecycle |
| `resetUserPassword` | mutation | `(userId: ID!, newPassword: String!): Boolean!` | SA, HR | account lifecycle |
| `deactivateUser` | mutation | `(userId: ID!): User!` | SA, HR | soft delete |
| `createDepartment` | mutation | `(input: CreateDepartmentInput!): Department!` | SA, TL | org structure |
| `updateDepartment` | mutation | `(input: UpdateDepartmentInput!): Department!` | SA, TL | org structure + auto-forking |
| `updateRolePermissions` | mutation | `(input: UpdateRolePermissionsInput!): Role!` | **SA, TL only** | RBAC |
| `systemAuditLogs` | query | `(filter: AuditLogFilter, offset, limit): SystemAuditLogConnection!` | SA, TL | audit trail |
| `appSettings` | query | `(moduleCode: String): [AppSetting!]!` | SA, TL | configuration |
| `updateAppSetting` | mutation | `(input: UpdateAppSettingInput!): AppSetting!` | SA, TL | configuration |
| `telegramWebhookConfig` | query | `: TelegramWebhookConfig!` | SA, TL | webhook |
| `updateTelegramWebhookConfig` | mutation | `(input: UpdateTelegramWebhookConfigInput!): TelegramWebhookConfig!` | **SA, TL only** | webhook |
| `notifications` | query | `(filter: NotificationFilter, offset, limit): NotificationConnection!` | SA, TL, HR | notification log |

```graphql
extend type Query {
  users(filter: UserFilter, offset: Int = 0, limit: Int = 20): UserConnection!
  user(id: ID!): User
  departments: [Department!]!
  roles: [Role!]!
  permissions: [Permission!]!
  systemAuditLogs(filter: AuditLogFilter, offset: Int = 0, limit: Int = 20): SystemAuditLogConnection!
  appSettings(moduleCode: String): [AppSetting!]!
  telegramWebhookConfig: TelegramWebhookConfig!
  notifications(filter: NotificationFilter, offset: Int = 0, limit: Int = 20): NotificationConnection!
}

extend type Mutation {
  createUser(input: CreateUserInput!): User!
  updateUser(input: UpdateUserInput!): User!
  resetUserPassword(userId: ID!, newPassword: String!): Boolean!
  deactivateUser(userId: ID!): User!
  createDepartment(input: CreateDepartmentInput!): Department!
  updateDepartment(input: UpdateDepartmentInput!): Department!
  updateRolePermissions(input: UpdateRolePermissionsInput!): Role!
  updateAppSetting(input: UpdateAppSettingInput!): AppSetting!
  updateTelegramWebhookConfig(input: UpdateTelegramWebhookConfigInput!): TelegramWebhookConfig!
}
```

Access rules (preserved): the app is fully hidden from Employee and Department Head; HR Manager sees the user directory only (RBAC and webhook are hidden); Super Admin and Manager/Tech Lead see the full technical configuration set. The system audit log records user, action, field changes, timestamp, and IP address.

### 6.5 Audit Log

The technical activity-monitoring app. It exposes a system-wide activity stream and per-module activity over the append-only audit event store, with filtering and export. It is accessible only to Super Admin and Manager/Tech Lead, and reads the same `system_audit_logs` store that backs `systemAuditLogs` in §6.4.

#### Types

```graphql
type ModuleActivitySummary {
  moduleCode: String!
  moduleName: String!
  eventCount: Int!
  lastActivityAt: DateTime
}
```

`SystemAuditLog` and `SystemAuditLogConnection` are defined in §6.4 and reused here.

#### Inputs

```graphql
input ModuleAuditFilter {
  moduleCode: String
  userId: ID
  action: String
  resourceType: String
  resourceId: String
  fromDate: DateTime
  toDate: DateTime
}
```

#### Operations

| Operation | Type | Signature | Roles | Scope |
| --- | --- | --- | --- | --- |
| `auditLogs` | query | `(filter: ModuleAuditFilter, offset, limit): SystemAuditLogConnection!` | SA, TL | `ALL`; system-wide activity stream |
| `moduleActivity` | query | `(filter: ModuleAuditFilter): [ModuleActivitySummary!]!` | SA, TL | `ALL`; per-module activity summary |
| `exportAuditLogs` | mutation | `(filter: ModuleAuditFilter, format: ExportFormat = XLSX): ExportResult!` | SA, TL | `ALL`; `.xlsx` / `.csv` |

```graphql
extend type Query {
  auditLogs(filter: ModuleAuditFilter, offset: Int = 0, limit: Int = 20): SystemAuditLogConnection!
  moduleActivity(filter: ModuleAuditFilter): [ModuleActivitySummary!]!
}

extend type Mutation {
  exportAuditLogs(filter: ModuleAuditFilter, format: ExportFormat = XLSX): ExportResult!
}
```

Access rules: the app is fully hidden from HR Manager, Department Head, and Employee; only Super Admin and Manager/Tech Lead can read the stream, view per-module activity, or export. The app is read-only over an append-only store — no operation edits or deletes a recorded audit event. `moduleCode` filtering and per-module grouping use the registered module codes (`jobs`, `planning`, `performance`, `settings`, `audit-log`); events with no module are treated as unattributed.

---

## 7. Shared & Core APIs

Shared, system-wide capabilities consumed by every app: the code registries, the notification log, and print/export.

### 7.1 Registry queries

| Operation | Type | Signature | Roles | Scope |
| --- | --- | --- | --- | --- |
| `ticketStates` | query | `: [TicketState!]!` | all authenticated | registry read |
| `leaveCodes` | query | `: [LeaveCodeInfo!]!` | all authenticated | registry read |

```graphql
extend type Query {
  ticketStates: [TicketState!]!
  leaveCodes: [LeaveCodeInfo!]!
}
```

### 7.2 Print / export operations

| Operation | Type | Signature | Roles | Scope |
| --- | --- | --- | --- | --- |
| `printTaskSlip` | mutation | `(taskId: ID!): ExportResult!` | all roles | PDF (assignment/acceptance slip) |
| `exportTasks` | mutation | `(filter: TaskFilter, format: ExportFormat = XLSX): ExportResult!` | all roles | `.xlsx` / `.csv` |
| `printLeaveRequest` | mutation | `(leaveRequestId: ID!): ExportResult!` | all roles | PDF, A4 |
| `printAttendanceCalendar` | mutation | `(input: MatrixCalendarInput!): ExportResult!` | all roles | PDF, A4 Landscape |
| `exportAttendance` | mutation | `(filter: AttendanceFilter, format: ExportFormat = XLSX): ExportResult!` | all roles | `.xlsx` (AL/TOIL balances) |
| `printKpiReport` | mutation | `(input: KpiPeriodInput!): ExportResult!` | all roles | PDF, A4 |
| `exportAuditWorkbook` | mutation | `(filter: KpiAuditFilter!): ExportResult!` | SA, TL, HR, DH | `.xlsx`, one sheet per audit level |

Export scope follows the caller's scope for the corresponding read operation (for example an Employee exports only personal tasks; a Department Head exports only their department).

```graphql
extend type Mutation {
  printTaskSlip(taskId: ID!): ExportResult!
  exportTasks(filter: TaskFilter, format: ExportFormat = XLSX): ExportResult!
  printLeaveRequest(leaveRequestId: ID!): ExportResult!
  printAttendanceCalendar(input: MatrixCalendarInput!): ExportResult!
  exportAttendance(filter: AttendanceFilter, format: ExportFormat = XLSX): ExportResult!
  printKpiReport(input: KpiPeriodInput!): ExportResult!
  exportAuditWorkbook(filter: KpiAuditFilter!): ExportResult!
}
```

---

## 8. Errors

GraphQL returns errors in the top-level `errors` array. Each error carries a human-readable `message` and a stable, machine-readable `extensions.code`.

```json
{
  "data": null,
  "errors": [
    {
      "message": "You do not have permission to assign the UAL leave code.",
      "path": ["assignPenaltyLeave"],
      "extensions": {
        "code": "FORBIDDEN",
        "details": { "requiredRoles": ["SUPER_ADMIN", "HR_MANAGER"] }
      }
    }
  ]
}
```

### Error catalog

| `extensions.code` | Meaning |
| --- | --- |
| `UNAUTHENTICATED` | No session, or an invalid/expired token. |
| `FORBIDDEN` | Authenticated but the role lacks access to the operation or scope. |
| `NOT_FOUND` | The referenced resource does not exist or is out of scope. |
| `VALIDATION_FAILED` | Input failed validation; `details` lists field errors. |
| `CONFLICT` | The request conflicts with current state (for example a duplicate code). |
| `STATE_TRANSITION_INVALID` | The requested ticket/leave transition is not allowed from the current state. |
| `RULE_VIOLATION` | A business rule was violated (for example cancelling without a reason). |
| `RATE_LIMITED` | Too many requests. |
| `INTERNAL` | An unexpected server error. |

`details` is an optional extra JSON object; its shape is code-specific. Partial success is expressed by returning `data` with the successful fields and `errors` with the failures.

---

## 9. Examples

### 9.1 Query with variables — a task list

Request:

```json
{
  "query": "query Tasks($filter: TaskFilter) { tasks(filter: $filter, orderBy: END_DATE_ASC, limit: 2) { nodes { id taskCode title state priority progressPercentage endDate assignedTo { id fullName } } pageInfo { offset limit totalCount hasNextPage } } }",
  "operationName": "Tasks",
  "variables": {
    "filter": { "state": "ACT", "isOverdue": false }
  }
}
```

Response:

```json
{
  "data": {
    "tasks": {
      "nodes": [
        {
          "id": "6f1c2b3a-0000-4000-8000-000000000001",
          "taskCode": "T-1024",
          "title": "Prepare weekly production report",
          "state": "ACT",
          "priority": "HIGH",
          "progressPercentage": 50,
          "endDate": "2026-10-16T17:00:00Z",
          "assignedTo": { "id": "9b7e0000-0000-4000-8000-0000000000aa", "fullName": "Nguyen Van A" }
        }
      ],
      "pageInfo": { "offset": 0, "limit": 2, "totalCount": 1, "hasNextPage": false }
    }
  }
}
```

### 9.2 Mutation with variables — register a leave request

Request:

```json
{
  "query": "mutation RegisterLeave($input: RegisterLeaveInput!) { registerLeave(input: $input) { id leaveCode startDate endDate totalDays status } }",
  "operationName": "RegisterLeave",
  "variables": {
    "input": {
      "leaveCode": "AL",
      "startDate": "2026-11-02T00:00:00Z",
      "endDate": "2026-11-03T00:00:00Z",
      "reason": "Annual leave",
      "handoverUserId": "9b7e0000-0000-4000-8000-0000000000bb"
    }
  }
}
```

Response:

```json
{
  "data": {
    "registerLeave": {
      "id": "aa11bb22-0000-4000-8000-0000000000cc",
      "leaveCode": "AL",
      "startDate": "2026-11-02T00:00:00Z",
      "endDate": "2026-11-03T00:00:00Z",
      "totalDays": 2,
      "status": "PENDING"
    }
  }
}
```

### 9.3 Mutation denied by authorization

Request:

```json
{
  "query": "mutation AssignPenalty($input: AssignPenaltyLeaveInput!) { assignPenaltyLeave(input: $input) { id } }",
  "operationName": "AssignPenalty",
  "variables": {
    "input": { "userId": "9b7e0000-0000-4000-8000-0000000000aa", "leaveCode": "UAL", "workDate": "2026-10-14T00:00:00Z" }
  }
}
```

Response (caller is a Department Head, who cannot assign `UAL`/`USL`):

```json
{
  "data": null,
  "errors": [
    {
      "message": "You do not have permission to assign the UAL leave code.",
      "path": ["assignPenaltyLeave"],
      "extensions": {
        "code": "FORBIDDEN",
        "details": { "requiredRoles": ["SUPER_ADMIN", "HR_MANAGER"] }
      }
    }
  ]
}
```

---

## 10. Traceability

| This document | Source |
| --- | --- |
| 1. Purpose & Scope | Document scope of all three sources; `SYSTEM_ARCHITECTURE.md` §1. |
| 2. API Conventions | `SYSTEM_ARCHITECTURE.md` §5 (layered view) and §11 (integration points) for the client-facing transport framing; `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` for naming/scalar mapping. |
| 3. Authentication & Session | `SYSTEM_ARCHITECTURE.md` §9.1 (RBAC & Permission Matrix Engine), §2/§4 (User Directory); `SYSTEM_PROCESS_FLOW-en.md` RBAC section (login/access guard). |
| 4. Authorization Model | `SYSTEM_PROCESS_FLOW-en.md` "Authorization & UI Rendering Mechanism" + Detailed Access Control Matrix; `SYSTEM_ARCHITECTURE.md` §8; `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` seed roles (`SUPER_ADMIN`, `TECH_LEAD`, `HR_MANAGER`, `DEPT_HEAD`, `EMPLOYEE`) and `role_permissions`. |
| 5. Type System | `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` enums, `ticket_states`, `leave_codes`, `users`, `departments`, `roles`, `permissions`, `user_roles`, `role_permissions`; `SYSTEM_ARCHITECTURE.md` §7 (shared domain model). |
| 6.1 Jobs & Projects | `SYSTEM_PROCESS_FLOW-en.md` App 1; `SYSTEM_ARCHITECTURE.md` §6.1, §7.1–7.2, §9.4; `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` `projects`, `tasks`, `task_state_transitions`, `task_progress_logs`, `task_requests`, `attachments`. |
| 6.2 Planning & Attendance | `SYSTEM_PROCESS_FLOW-en.md` App 2 + leave-state codes; `SYSTEM_ARCHITECTURE.md` §6.2, §10 (attendance rules); `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` `attendance_records`, `leave_requests`, `leave_balance_entries`, `overtime_records`, `v_user_leave_balances`. |
| 6.3 Performance & Audit | `SYSTEM_PROCESS_FLOW-en.md` App 3 (scoring algorithm, Tables 1–3); `SYSTEM_ARCHITECTURE.md` §6.3, §9.3; `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` `kpi_point_rules`, `kpi_score_events`, `kpi_monthly_summaries`, `v_kpi_audit_level1_company`, `v_kpi_audit_level2_department`, `v_kpi_audit_level3_employee`. |
| 6.4 Settings & IAM | `SYSTEM_PROCESS_FLOW-en.md` App 4; `SYSTEM_ARCHITECTURE.md` §6.4, §10 (auditability, notification); `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` `system_audit_logs`, `app_settings`, `notifications`, `roles`, `permissions`, `role_permissions`, `modules`. |
| 6.5 Audit Log | `SYSTEM_PROCESS_FLOW-en.md` App 5; `SYSTEM_ARCHITECTURE.md` §6.5, §10 (auditability); `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` `system_audit_logs` (`module_code`), `modules`. |
| 7. Shared & Core APIs | `SYSTEM_ARCHITECTURE.md` §9.5 (Print/Export Engine), §9.6 (Global State & Leave Code Registry), §9.2 (Telegram Webhook Notification Engine), §11; `SYSTEM_PROCESS_FLOW-en.md` Print/Export per app; `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` `ticket_states`, `leave_codes`, `notifications`. |
| 8. Errors | Design D7; `SYSTEM_ARCHITECTURE.md` §8 (authorization outcomes). |
| 9. Examples | Illustrative of §2–§7; no new behavior. |
