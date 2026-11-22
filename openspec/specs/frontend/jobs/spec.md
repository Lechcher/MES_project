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
The create form SHALL capture title, description, project (defaulting to General Operations when none is selected), priority (default `MEDIUM`), one or more assignees, and department. New tickets SHALL start in `REQ`, and the `+ Create New Ticket` button SHALL be offered to every role except `EMPLOYEE`.

#### Scenario: Defaults
- **WHEN** a `TECH_LEAD` submits the create form without selecting a project
- **THEN** the ticket is created under General Operations with priority `MEDIUM` in state `REQ`

#### Scenario: Employee cannot create
- **WHEN** an `EMPLOYEE` uses the Jobs app
- **THEN** the `+ Create New Ticket` button is not rendered

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

### Requirement: Assignee selection holds each employee at most once
The create form's assignee combobox SHALL treat one employee as one selection
regardless of how the option was constructed: selecting an already-selected
employee SHALL remove that employee from the selection instead of adding a
second one, and the selection SHALL hold each employee id at most once so the
rendered chips and the submitted assignee ids stay distinct.

#### Scenario: Re-selecting an assigned employee toggles them off
- **WHEN** a creator picks an employee from the dropdown who already holds a chip in the assignee combobox
- **THEN** that employee's chip is removed and no additional chip is added

#### Scenario: The preselected creator toggles off instead of duplicating
- **WHEN** the creator is preselected as the default assignee and then selects their own entry from the dropdown list
- **THEN** that employee is removed from the selection instead of duplicated, and no duplicate-key condition arises

#### Scenario: The submitted assignee ids are distinct
- **WHEN** a creator submits the create form with an employee selected through more than one path
- **THEN** the create request carries that employee's id exactly once

### Requirement: Each picked attachment reports its own outcome
The system SHALL show every file the viewer picked to attach to a completion
request with its own state — pending, uploading, stored, or failed — and SHALL
show a failed file's reported failure message on its row.

#### Scenario: A file the store refuses
- **WHEN** the viewer uploads a picked file and the storage backend refuses to
  store it
- **THEN** that file's row reports the failed state with the failure message
  naming the file, while the other rows keep their own states

#### Scenario: Successful upload
- **WHEN** the viewer uploads a picked file and it is stored
- **THEN** the file's row reports the stored state

### Requirement: A failed attachment can be retried without picking it again
The system SHALL let the viewer re-queue a file whose upload failed and retry
it without picking the file again, keeping the file's reported failure visible
until it is retried.

#### Scenario: Retry after a storage failure
- **WHEN** the viewer retries a file whose row reports the failed state
- **THEN** the same file is uploaded again, the row leaves the failed state, and
  its outcome is reported anew

### Requirement: A completion request cannot be submitted with unresolved attachments
The system SHALL refuse to submit a completion request while any picked file is
still uploading or has failed to store, and SHALL name the unresolved file in
the refusal.

#### Scenario: Submit while a file failed
- **WHEN** the viewer submits a completion request and one picked file failed to
  store
- **THEN** the submission is refused with a message naming that file, and no
  completion request is created

#### Scenario: Submit once every file is stored
- **WHEN** the viewer submits a completion request and every picked file is
  stored
- **THEN** the request is submitted with the stored files attached

### Requirement: Task type deadline rules
The create form SHALL set deadlines by task type: `HOURLY` uses the slots 10:30, 14:00, 16:30; `DAILY` defaults to 17:00/18:00 the same day; `MULTI_DAY` takes start and end dates.

#### Scenario: Hourly task
- **WHEN** a `TECH_LEAD` creates an hourly task with the 14:00 slot
- **THEN** the ticket is created in `REQ` with its deadline at 14:00

### Requirement: Multi-assignee ticket creation
The create form SHALL let the creator pick assignees from the selected department's active members through a multi-select combobox, offering the creator themselves as the default selection. Submitting with N selected employees SHALL create N `REQ` tickets — one per employee, in the selected department, sharing the entered title, description, project, task type, priority, and deadlines. At least one assignee SHALL be required.

#### Scenario: Assign to several employees at once
- **WHEN** a creator selects 3 employees of the Engineering department and submits the form
- **THEN** 3 `REQ` tickets are created, one assigned to each selected employee, all in Engineering with the same title, type, priority, and deadlines

#### Scenario: Defaults to the creator
- **WHEN** a creator opens the form and changes nothing
- **THEN** the assignee combobox holds the creator themselves as the single selection

#### Scenario: Empty selection is refused
- **WHEN** a creator clears the assignee combobox and submits
- **THEN** the submission is refused with a validation message and no ticket is created

### Requirement: Ticket categories constrain the date shape

The category a ticket is created with SHALL decide the shape of its dates, on
every surface that creates or edits a ticket. A create or edit form SHALL refuse
to save an interval that does not fit the chosen category, or an end that is not
after its start. Every ticket SHALL be saved with both a start and an end,
whatever its category.

#### Scenario: A daily ticket covers exactly one day
- **WHEN** a `TECH_LEAD` creates a `DAILY` ticket
- **THEN** the ticket is saved with a start and an end on that one day

#### Scenario: An hourly ticket stays inside one day
- **WHEN** a `TECH_LEAD` creates an `HOURLY` ticket
- **THEN** the ticket is saved with a start hour and an end hour inside that single day, and the form offers no end hour that falls on the next day

#### Scenario: Only a multi-day ticket may span days
- **WHEN** a `TECH_LEAD` creates a `MULTI_DAY` ticket from 20/10 to 31/10
- **THEN** the ticket is saved so that it covers every day from 20/10 through 31/10 inclusive, and no day in that span is lost to a stored timezone offset

#### Scenario: An invalid interval is refused
- **WHEN** the chosen end is not after the start, or the interval does not fit the chosen category
- **THEN** the form refuses to save and reports that the end must come after the start

#### Scenario: Every category carries a start
- **WHEN** any ticket is created, regardless of category
- **THEN** the saved ticket has a start date as well as an end date, so it can be placed on the schedule

### Requirement: Completion request dialog
The Complete action SHALL open a dialog that requires a request title, accepts a work-done description and attachments, and — for `MULTI_DAY` only — offers the scope choice, an optional estimated progress, and an optional expected-number-of-stages input. `DAILY` and `HOURLY` tickets SHALL submit a `FULL_JOB` request directly.

#### Scenario: Title is required
- **WHEN** an assignee submits the completion dialog with an empty title
- **THEN** the submission is refused and no journey entry is created

#### Scenario: Scope choice on multi-day
- **WHEN** an assignee opens the dialog on a `MULTI_DAY` ticket
- **THEN** the dialog offers `[Complete milestone]` and `[Complete job]` plus the optional estimate and expected-stage inputs

#### Scenario: Daily submits full job directly
- **WHEN** an assignee completes a `DAILY` ticket
- **THEN** the request is submitted as `FULL_JOB` without a scope choice

### Requirement: Journey list of work stages
Ticket detail SHALL render the ticket's completion requests as a journey list, oldest to newest, showing each entry's state badge, title, description, requester, decider and decision reason, with that entry's attachments. Evidence and required-fix files SHALL be shown separately.

#### Scenario: Journey order and states
- **WHEN** a reviewer opens a ticket that has one approved and one rejected request
- **THEN** the journey shows the approved entry first, each with its own state badge

#### Scenario: Required-fix files are grouped
- **WHEN** an approver rejected a request with a reason and a required-fix file
- **THEN** the rejected journey entry shows the employee's evidence and the required-fix file separately

### Requirement: Milestone progress display
The progress card SHALL show the ticket's percentage prefixed with `~` and, when the journey has approved stages, the count of approved stages followed by the planned total when known or "total open-ended" otherwise.

#### Scenario: Estimate marker
- **WHEN** a ticket's progress is derived from its stage ledger
- **THEN** the progress card reads `~X%` and not a bare `X%`

#### Scenario: Legacy rows keep their label
- **WHEN** a `MULTI_DAY` ticket has no journey entries and its progress crosses 25%
- **THEN** the legacy milestone label is shown for that legacy row only

### Requirement: Attachment preview and download
The ticket attachment section and every journey entry's attachments SHALL preview inline through the authenticated file route: images, video, audio and PDF inline in a dialog, and every other format as a file card with a lucide icon by extension, its name and size, and a download action. Attachment URLs SHALL be same-origin `/api/mes/files/...` paths so authorization applies to previews.

#### Scenario: Preview a video
- **WHEN** a reviewer clicks a video attachment
- **THEN** it opens in a dialog with player controls and its own download fallback

#### Scenario: Download an archive
- **WHEN** a reviewer clicks a `.zip` attachment
- **THEN** a file card is shown with its name and size and a download action
