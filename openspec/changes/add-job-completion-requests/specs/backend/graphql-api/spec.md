# Spec Delta

## MODIFIED Requirements

### Requirement: Documented app operations
The system SHALL expose the documented queries and mutations for Jobs, Planning, Performance, Settings & IAM, and Audit Log, including the shared ticket-state and leave-code registries. The Jobs surface SHALL additionally expose the completion-request read and mutation operations, and a task SHALL expose its journey of completion requests and its planned stage count.

#### Scenario: Read and mutate a task
- **WHEN** an authorized client queries tasks and accepts a task in `REQ`
- **THEN** the API returns task data and the task transitions to `ACT`

#### Scenario: Register leave
- **WHEN** an authenticated client registers a valid leave request
- **THEN** the API returns the created request in `PENDING`

#### Scenario: Submit a completion request
- **WHEN** an authenticated assignee submits a `FULL_JOB` completion request for an `ACT` ticket
- **THEN** the API returns the created request in `PEN` and the ticket in `PEN`

#### Scenario: Read the audit stream
- **WHEN** an authorized technical role queries audit events
- **THEN** the API returns the filtered system-wide or per-module activity data

## ADDED Requirements

### Requirement: Completion request contract shape
The API SHALL expose completion requests as `TaskCompletionRequest` values carrying the ticket, requester, scope (`MILESTONE` or `FULL_JOB`), title, description, declared progress, planned stage count, state in `PEN`/`APP`/`REJ`, reviewer, review comment, review time, employee evidence attachments, and decision attachments.

#### Scenario: Read a journey with evidence
- **WHEN** an authorized client queries a task's journey
- **THEN** each entry returns its state, requester, reviewer and its evidence and decision attachments

#### Scenario: Rejected entry carries its decision
- **WHEN** a client reads a rejected completion request
- **THEN** the entry reports the reviewer, the review comment, and the decision attachments

### Requirement: Completion request operations
The API SHALL expose `submitTaskCompletionRequest` to every in-scope role and `reviewTaskCompletionRequest` to `SUPER_ADMIN`, `TECH_LEAD`, `HR_MANAGER`, and `DEPT_HEAD`, using the documented input shapes. Submitting an empty title SHALL fail with `VALIDATION_FAILED`, submitting from an invalid state SHALL fail with `STATE_TRANSITION_INVALID`, reviewing by a non-approver SHALL fail with `FORBIDDEN`, and rejecting without a review comment SHALL fail.

#### Scenario: Deny a second pending request
- **WHEN** an assignee submits a completion request while a prior request for the same ticket is still `PEN`
- **THEN** the mutation fails with `STATE_TRANSITION_INVALID` and the prior request is unchanged

#### Scenario: Reject requires a comment
- **WHEN** an approver rejects a completion request without a review comment
- **THEN** the mutation fails and the entry stays `PEN`

#### Scenario: Employee cannot review
- **WHEN** an `EMPLOYEE` calls `reviewTaskCompletionRequest`
- **THEN** the API returns `FORBIDDEN` and no decision is recorded

### Requirement: Multi-day progress is reported from the stage ledger
The documented Jobs contract SHALL describe multi-day progress as derived from the approved stage ledger — the ratio of approved `MILESTONE` entries to the ticket's planned stage count, or the entry's declared progress when no plan is set — and SHALL document that approving a `MILESTONE` request does not complete the ticket and that no completion requires 100% progress.

#### Scenario: Milestone approval leaves the ticket open
- **WHEN** an approver approves a milestone request
- **THEN** the returned ticket is still `PEN` and its reported percentage follows the stage ledger

#### Scenario: Full job approval completes any ticket
- **WHEN** an approver approves a `FULL_JOB` request for a ticket below 100% progress
- **THEN** the returned ticket is `APP`
