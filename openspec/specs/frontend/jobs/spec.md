# frontend/jobs Specification

## Purpose

The Jobs & Projects app screens: the role-scoped ticket list with the 1-Click Day Navigation Bar, ticket detail with the full state lifecycle and secondary badges, ticket creation with task types and Auto-forking, Daily Quick-add, extension and late-submission flows, and print/export entry points.

## Requirements

### Requirement: 1-Click Day Navigation Bar
The Jobs header SHALL show the quick-jump bar `[ Yesterday ] [ Today ] [ Tomorrow ]`, and selecting a day SHALL set the ticket list's day context.

#### Scenario: Jump to tomorrow
- **WHEN** the reviewer clicks `[ Tomorrow ]`
- **THEN** the ticket list shows tickets whose day context is tomorrow

### Requirement: Ticket list is scoped by role
The ticket list SHALL show: for `EMPLOYEE`, only their own tickets; for `DEPT_HEAD`, their department's tickets; for `TECH_LEAD`, `HR_MANAGER`, and `SUPER_ADMIN`, company tickets. The list SHALL offer filters (state, priority, task type, overdue, urgent, project, department, search) alongside the day context.

#### Scenario: Employee sees own tickets only
- **WHEN** an `EMPLOYEE` opens the ticket list
- **THEN** only tickets assigned to that employee are listed

#### Scenario: Filter by state
- **WHEN** the reviewer filters the list by state `PEN`
- **THEN** only `PEN` tickets are listed

### Requirement: Ticket rows show state badges and lifecycle flags
Each ticket row SHALL show its title, state badge in the documented color (`REQ` White, `ACT` Yellow, `PEN` Blue, `APP` Green, `REJ` Orange, `CAN` Red, `OVERDUE` Red (Warning)), priority, task type, progress percentage, assignee, department, project, and deadline, plus the applicable `ACT` secondary badge (`ACT - Urgent Processing`, `ACT - Progress Update (X%)`, `ACT - Awaiting Extension Approval`, `ACT - Awaiting Progress Verification`). No task-code column SHALL be rendered (record identifiers are not displayed; see `frontend/display-labels`). State badges SHALL show the English state name and the secondary badges SHALL read "Active — Urgent Processing", "Active — Progress Update (X%)", "Active — Awaiting Extension Approval", and "Active — Awaiting Progress Verification", with the color mapping unchanged.

#### Scenario: Overdue row
- **WHEN** a ticket past its deadline with progress under 100% is listed
- **THEN** its badge shows "Overdue" in Red (Warning)

#### Scenario: Secondary badge
- **WHEN** an active ticket awaits an extension decision
- **THEN** its row shows the "Active — Awaiting Extension Approval" badge

### Requirement: Ticket detail renders the lifecycle
Ticket detail SHALL show full ticket information, progress log, state-transition history, requests, and attachments, and SHALL offer the actions valid for the ticket's current state and the viewer's role: Accept Task (`REQ`→`ACT`), Log Progress (percentage + comment, on `ACT`), Complete/Submit Report (`ACT`→`PEN`), Approve (`PEN`→`APP`), Return (`PEN`→`REJ`), Report Late Submission/Explanation (`OVERDUE`→`PEN`, tagged Late Submission), and Cancel Ticket (reason mandatory).

#### Scenario: Submit report
- **WHEN** an assignee presses Complete on an `ACT` ticket
- **THEN** the ticket moves to `PEN`

#### Scenario: Approve
- **WHEN** an approver approves a `PEN` ticket
- **THEN** the ticket moves to `APP`

#### Scenario: Actions invalid for the state are hidden
- **WHEN** a `REQ` ticket is viewed
- **THEN** no Complete or Approve action is offered

#### Scenario: Complete is locked on overdue
- **WHEN** an `OVERDUE` ticket is viewed by its assignee
- **THEN** Complete is unavailable and Report Late Submission/Explanation is offered

### Requirement: Approve, Return, and Cancel are restricted to approver roles
Approve (`APP`) and Return (`REJ`) SHALL be offered to every role except `EMPLOYEE`. Cancel Ticket SHALL be offered to `SUPER_ADMIN`, `TECH_LEAD`, `HR_MANAGER`, and `DEPT_HEAD`, and to an `EMPLOYEE` only for their own ticket, with a mandatory reason, following the API contract.

#### Scenario: Employee sees no approve actions
- **WHEN** an `EMPLOYEE` opens a `PEN` ticket's detail
- **THEN** no Approve or Return action is rendered

#### Scenario: Cancel with reason
- **WHEN** a `TECH_LEAD` cancels a ticket and enters a reason
- **THEN** the ticket moves to `CAN` and the reason is recorded

#### Scenario: Employee cancels own ticket
- **WHEN** an `EMPLOYEE` cancels their own ticket and enters a reason
- **THEN** the ticket moves to `CAN` and the reason is recorded

### Requirement: Create Ticket form captures ticket data
The create form SHALL capture title, description, project (defaulting to General Operations when none is selected), priority (default `MEDIUM`), assignee, and department. New tickets SHALL start in `REQ`, and the `+ Create New Ticket` button SHALL be offered to every role except `EMPLOYEE`.

#### Scenario: Defaults
- **WHEN** a `TECH_LEAD` submits the create form without selecting a project
- **THEN** the ticket is created under General Operations with priority `MEDIUM` in state `REQ`

#### Scenario: Employee cannot create
- **WHEN** an `EMPLOYEE` uses the Jobs app
- **THEN** the `+ Create New Ticket` button is not rendered

### Requirement: Task type rules and Auto-forking
The create form SHALL set deadlines by task type: `HOURLY` uses the slots 10:30, 14:00, 16:30; `DAILY` defaults to 17:00/18:00 the same day; `MULTI_DAY` takes start and end dates. The Auto-forking option SHALL replicate the ticket to the selected department's active members.

#### Scenario: Hourly task
- **WHEN** a `TECH_LEAD` creates an hourly task with the 14:00 slot
- **THEN** the ticket is created in `REQ` with its deadline at 14:00

#### Scenario: Auto-forking
- **WHEN** Auto-forking is enabled while creating a ticket for a department with 3 active members
- **THEN** a `REQ` ticket is created for each of the 3 members

### Requirement: Daily Quick-add before the 08:30 cutoff
The Jobs app SHALL offer a Daily Quick-add screen for planning/confirming the day's tickets first thing (before 08:30), listing the day's unconfirmed `REQ` tickets with quick-accept actions.

#### Scenario: Quick-add today
- **WHEN** a reviewer opens Daily Quick-add on a day with `REQ` tickets
- **THEN** those tickets are listed with a quick Accept action

### Requirement: Multi-day milestone tracking
`MULTI_DAY` tickets SHALL track accumulated progress 0%→100% with the documented milestones — 25% Outline/Wireframe, 50% Draft/Rough, 75% Testing/Review, 100% Acceptance — and SHALL move to `PEN` when progress reaches 100% and the report is submitted.

#### Scenario: Milestone label
- **WHEN** a multi-day ticket's progress crosses 25%
- **THEN** the Outline/Wireframe milestone is shown

### Requirement: Extension request flow
An assignee SHALL be able to request an extension while the ticket is active and before its deadline passes, choosing a new deadline, reason, and evidence. While the request is pending, the ticket shows "Active — Awaiting Extension Approval". Approvers SHALL approve (deadline updated) or reject (original deadline kept).

#### Scenario: Extension approved
- **WHEN** an approver approves an extension request for a new deadline
- **THEN** the ticket's deadline is updated and the badge clears

#### Scenario: Extension rejected
- **WHEN** an approver rejects an extension request
- **THEN** the original deadline is kept

### Requirement: Jobs print/export entry points
The app SHALL offer Print (a generated PDF assignment slip with time log and comments) and Export (a generated `.xlsx` or `.csv` task list per the active filters). For `EMPLOYEE`, both SHALL be limited to their own tickets.

#### Scenario: Print slip
- **WHEN** a reviewer presses Print on a ticket
- **THEN** a PDF assignment slip is generated with the ticket's time log and comments

#### Scenario: Export employee tasks
- **WHEN** an `EMPLOYEE` exports the task list
- **THEN** a generated file contains only that employee's tickets matching the active filters
