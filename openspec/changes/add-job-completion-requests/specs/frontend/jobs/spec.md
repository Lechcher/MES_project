# Spec Delta

## MODIFIED Requirements

### Requirement: Ticket detail renders the lifecycle
Ticket detail SHALL show full ticket information, progress log, state-transition history, requests, the journey list of completion requests, and attachments, and SHALL offer the actions valid for the ticket's current state and the viewer's role: Accept Task (`REQ`→`ACT`), Log Progress (percentage + comment, on `ACT`), Complete (`ACT`→`PEN`, and `REJ`→`PEN` for resubmission, through the completion dialog), Approve / Reject the pending completion request (`PEN`, approver roles), Report Late Submission/Explanation (`OVERDUE`→`PEN`, tagged Late Submission), and Cancel Ticket (reason mandatory).

#### Scenario: Submit report
- **WHEN** an assignee presses Complete on an `ACT` ticket
- **THEN** the completion dialog opens, and submitting it moves the ticket to `PEN` with a `PEN` journey entry

#### Scenario: Approve
- **WHEN** an approver approves a ticket's pending completion request
- **THEN** the request's decision is recorded and the ticket's state changes per the request's scope

#### Scenario: Actions invalid for the state are hidden
- **WHEN** a `REQ` ticket is viewed
- **THEN** no Complete or Approve action is offered

#### Scenario: Complete is locked on overdue
- **WHEN** an `OVERDUE` ticket is viewed by its assignee
- **THEN** Complete is unavailable and Report Late Submission/Explanation is offered

### Requirement: Approve, Return, and Cancel are restricted to approver roles
Approving and rejecting a ticket's pending completion request SHALL be offered to every role except `EMPLOYEE`; a rejection SHALL require a reason and MAY attach required-fix files. Cancel Ticket SHALL be offered to `SUPER_ADMIN`, `TECH_LEAD`, `HR_MANAGER`, and `DEPT_HEAD`, and to an `EMPLOYEE` only for their own ticket, with a mandatory reason, following the API contract. An `EMPLOYEE` SHALL NOT be offered Approve or Reject on a `PEN` ticket.

#### Scenario: Employee sees no approve actions
- **WHEN** an `EMPLOYEE` opens a `PEN` ticket's detail
- **THEN** no Approve or Reject action is rendered

#### Scenario: Cancel with reason
- **WHEN** a `TECH_LEAD` cancels a ticket and enters a reason
- **THEN** the ticket moves to `CAN` and the reason is recorded

#### Scenario: Employee cancels own ticket
- **WHEN** an `EMPLOYEE` cancels their own ticket and enters a reason
- **THEN** the ticket moves to `CAN` and the reason is recorded

### Requirement: Multi-day milestone tracking
`MULTI_DAY` tickets SHALL derive their accumulated progress from the approved stage ledger rather than from fixed milestone gates, and SHALL offer a `[Complete milestone]` and a `[Complete job]` choice when a completion request is submitted. A `MILESTONE` request MAY be approved only while stages remain; the ticket reaches `APP` when a `FULL_JOB` request is approved, with no requirement that progress first reached 100%.

#### Scenario: Milestone label
- **WHEN** a `MULTI_DAY` ticket has two approved milestones and a declared plan of four stages
- **THEN** the progress card shows `~50%` and "2 stages approved of 4 planned"

#### Scenario: Stage ledger is open-ended
- **WHEN** a `MULTI_DAY` ticket has no declared plan and one approved milestone declared at 40%
- **THEN** the progress card shows `~40%` and "1 stage approved, total open-ended"

#### Scenario: No gate on completion
- **WHEN** a `MULTI_DAY` ticket at 40% has its `FULL_JOB` request approved
- **THEN** the ticket becomes `APP` and its journey closes without any 100% requirement

## ADDED Requirements

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
