# Spec Delta

## MODIFIED Requirements

### Requirement: Durable MES records
The system SHALL persist users, organization units, roles, permissions, projects, tasks, task completion requests and their attachments, workflow history, attendance, leave, overtime, KPI records, settings, notifications, and audit events.

#### Scenario: Records survive restart
- **WHEN** a user creates a task and the service restarts successfully
- **THEN** the task and its recorded state remain available afterward

#### Scenario: Read committed leave balance
- **WHEN** a leave request or approved overtime changes a tracked balance
- **THEN** subsequent balance reads reflect the committed ledger entries

#### Scenario: Completion requests survive restart
- **WHEN** an assignee submits a completion request and the service restarts successfully
- **THEN** the request, its state, and its attachments remain available afterward

## ADDED Requirements

### Requirement: Persist task completion requests
The system SHALL store each completion request with its ticket, requester, scope, title, description, declared progress, planned stage count, state, reviewer, decision reason and decision time, cascading from its ticket.

#### Scenario: Cascade with the ticket
- **WHEN** a ticket and its journey entries are deleted
- **THEN** the ticket's completion requests are removed with it

### Requirement: Constrain stored completion-request values
The system SHALL reject a stored completion request whose scope is outside `MILESTONE`/`FULL_JOB`, whose state is outside `PEN`/`APP`/`REJ`, whose declared progress is outside 0–100, or whose planned stage count is not greater than zero.

#### Scenario: Out-of-range values
- **WHEN** a completion request is stored with an out-of-range scope, state, declared progress, or non-positive planned stage count
- **THEN** the write is rejected

### Requirement: Record the planned stage count for multi-day plans
The system SHALL store the ticket's expected number of stages when a request carries one, so later progress recomputations can use it.

#### Scenario: Plan is stored on the ticket
- **WHEN** a request carries an expected-number-of-stages value
- **THEN** the ticket's planned stage count is stored and readable on later requests

### Requirement: Keep one pending completion request per ticket
The system SHALL permit at most one `PEN` completion request per ticket, and SHALL leave a rejected entry intact while the ticket moves back to `PEN` for resubmission.

#### Scenario: Second pending request is refused
- **WHEN** an assignee submits a completion request while the ticket already has a `PEN` request
- **THEN** the write is refused and the pending request is unchanged

#### Scenario: Resubmission keeps history
- **WHEN** an assignee resubmits after a rejection
- **THEN** the rejected entry stays `REJ`, the new entry is `PEN`, and both are on the ticket's journey

### Requirement: Record attachment file size
The system SHALL store the byte size of each uploaded attachment so the UI can report a file's size without reading its bytes.

#### Scenario: Size is reported after upload
- **WHEN** a file is uploaded and stored
- **THEN** its attachment row records the uploaded byte size

### Requirement: Keep multi-day progress monotonic
The system SHALL never lower a ticket's recorded progress percentage, whether progress is set from a logged percentage or recomputed from the approved stage ledger.

#### Scenario: Recompute cannot regress
- **WHEN** an approved milestone computes a percentage below the ticket's current one
- **THEN** the ticket keeps its current percentage
