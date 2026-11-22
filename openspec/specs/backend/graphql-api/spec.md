# backend/graphql-api Specification

## Purpose

Provides the versioned GraphQL boundary through which authenticated clients use the MES modules and shared services. The API exposes the documented domain operations, consistent pagination, and machine-readable failures.

## Requirements

### Requirement: Versioned GraphQL transport
The system SHALL expose the MES GraphQL contract at `POST /api/v1/graphql` using JSON request and response envelopes, including GraphQL partial-result semantics and authorized introspection.

#### Scenario: Execute a query with variables
- **WHEN** a client posts a valid GraphQL document and variables to the endpoint
- **THEN** the response contains the requested data in the documented JSON envelope

#### Scenario: Return partial data with field errors
- **WHEN** one field in an otherwise executable operation fails
- **THEN** the response contains any successful data and a corresponding `errors` entry

### Requirement: Authenticated API sessions
The system SHALL provide `login`, `logout`, `viewer`, password reset, and password change operations, and SHALL require a valid unexpired session for protected operations. The `login` operation SHALL accept either an email address or a user code as the identifier — exactly one of the two — and SHALL report an unknown identifier with the same `UNAUTHENTICATED` failure a wrong password produces.

#### Scenario: Login and use a session
- **WHEN** a user submits valid credentials and uses the returned session token on a later request
- **THEN** the API returns the authenticated viewer and permits authorized operations

#### Scenario: Login by user code
- **WHEN** a user submits a valid user code with their password
- **THEN** the API returns the authenticated viewer and session, exactly as an email login does

#### Scenario: Login with both identifiers
- **WHEN** a login input carries both an email and a user code
- **THEN** the API rejects the input with `VALIDATION_FAILED`

#### Scenario: Reject an expired session
- **WHEN** a protected operation is called without a valid session
- **THEN** the API returns an `UNAUTHENTICATED` error

### Requirement: Documented app operations
The system SHALL expose the documented queries and mutations for Jobs, Planning, Performance, Settings & IAM, and Audit Log, including the shared ticket-state and leave-code registries. User creation SHALL accept no user code and assign one automatically, and audit log queries SHALL return readable labels — `FullName (userCode)` — wherever an entry references a user by identifier. The Jobs surface SHALL additionally expose the completion-request read and mutation operations, and a task SHALL expose its journey of completion requests and its planned stage count. The API SHALL additionally expose the Telegram-account operations — reading the viewer's linked accounts, linking (upserting) one with its session material and stable slot, and removing one — on the same versioned endpoint, with every operation scoped to the authenticated viewer and session material never appearing in error messages or logs.

#### Scenario: Read and mutate a task
- **WHEN** an authorized client queries tasks and accepts a task in `REQ`
- **THEN** the API returns task data and the task transitions to `ACT`

#### Scenario: Register leave
- **WHEN** an authenticated client registers a valid leave request
- **THEN** the API returns the created request in `PENDING`

#### Scenario: Submit a completion request
- **WHEN** an authenticated assignee submits a `FULL_JOB` completion request for an `ACT` ticket
- **THEN** the API returns the created request in `PEN` and the ticket in `PEN`

#### Scenario: Create a user without a code
- **WHEN** an authorized admin creates a user without supplying a user code
- **THEN** the user is created with the next free code in the `V0000000`–`V9999999` range

#### Scenario: Read the audit stream
- **WHEN** an authorized technical role queries audit events
- **THEN** the API returns the filtered activity data with user references rendered as readable labels

#### Scenario: Exhausted code range fails explicitly
- **WHEN** every code in the `V0000000`–`V9999999` range is already taken and a user is created
- **THEN** the API reports a `CONFLICT` failure and creates no user

#### Scenario: Read the viewer's Telegram accounts
- **WHEN** an authenticated viewer queries their linked Telegram accounts
- **THEN** the API returns exactly that viewer's accounts — profile information, the stable slot, and the session material needed to restore them — and no other viewer's accounts

#### Scenario: Link a Telegram account twice
- **WHEN** a viewer links a Telegram account they already have linked
- **THEN** the API updates the viewer's existing record for that Telegram identity — including its session material and slot — instead of creating a second one

#### Scenario: Remove a Telegram account
- **WHEN** a viewer removes one of their linked Telegram accounts
- **THEN** the API deletes that viewer's record for that Telegram identity and leaves the viewer's other accounts unchanged

#### Scenario: Telegram account operations stay viewer-scoped
- **WHEN** one authenticated viewer attempts to read or remove another viewer's Telegram account
- **THEN** the API refuses with the same failure shape an out-of-scope resource produces, revealing nothing about the other viewer's accounts

### Requirement: Performance period selection inputs
The Performance operations SHALL take a period selection expressed as a list of months rather than a single month, and the audit levels' filter SHALL name the months it selects. The personal dashboard SHALL report the selected months, the total for each of them, and one aggregate over them.

#### Scenario: Audit filter names several months
- **WHEN** an authorized client queries an audit level with a filter naming three months
- **THEN** the response carries the authorized rows of those three months

#### Scenario: Audit filter names one month
- **WHEN** an authorized client queries an audit level with a filter naming a single month
- **THEN** the response carries that month's authorized rows

#### Scenario: Personal dashboard reports the selected period
- **WHEN** a client requests the personal dashboard for three months
- **THEN** the response reports the three selected months, each month's total KPI score, and one aggregate over them

#### Scenario: Aggregate totals sum the selected months
- **WHEN** the personal dashboard aggregates several months
- **THEN** its total KPI score and its task, on-time, overdue, returned, extension, unapproved-leave, and perfect-attendance counters are the sums of the months that reported a summary

#### Scenario: Aggregate rate averages the reporting months
- **WHEN** the personal dashboard aggregates several months and only some of them report an attendance rate
- **THEN** the reported attendance rate is the mean of the months that reported one

#### Scenario: Empty selection is rejected
- **WHEN** a client requests a Performance operation with an empty month list
- **THEN** the operation fails with a validation error and returns no data

### Requirement: List pagination and filtering
The system SHALL return list results as `nodes` and `pageInfo` connections with offset, limit, total count, and next-page state, and SHALL apply supplied filter fields together.

#### Scenario: Paginate a task list
- **WHEN** a client requests a task page with an offset and limit
- **THEN** the response contains that page and accurate `totalCount` and `hasNextPage` values

### Requirement: Stable API errors
The system SHALL return stable machine-readable error codes for authentication, authorization, missing or out-of-scope resources, validation, conflicts, invalid state transitions, business-rule violations, rate limits, and unexpected failures.

#### Scenario: Reject an invalid transition
- **WHEN** a client requests a transition that is not valid for the task's current state
- **THEN** the mutation fails with `STATE_TRANSITION_INVALID` and does not report a successful transition

#### Scenario: Deny a forbidden operation
- **WHEN** an authenticated caller lacks the required role or data scope
- **THEN** the API returns `FORBIDDEN` without disclosing out-of-scope records

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
