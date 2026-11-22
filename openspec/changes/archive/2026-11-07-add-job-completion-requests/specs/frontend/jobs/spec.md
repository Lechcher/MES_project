# Spec Delta

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
