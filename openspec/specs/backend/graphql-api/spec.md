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
The system SHALL provide `login`, `logout`, `viewer`, password reset, and password change operations, and SHALL require a valid unexpired session for protected operations.

#### Scenario: Login and use a session
- **WHEN** a user submits valid credentials and uses the returned session token on a later request
- **THEN** the API returns the authenticated viewer and permits authorized operations

#### Scenario: Reject an expired session
- **WHEN** a protected operation is called without a valid session
- **THEN** the API returns an `UNAUTHENTICATED` error

### Requirement: Documented app operations
The system SHALL expose the documented queries and mutations for Jobs, Planning, Performance, Settings & IAM, and Audit Log, including the shared ticket-state and leave-code registries.

#### Scenario: Read and mutate a task
- **WHEN** an authorized client queries tasks and accepts a task in `REQ`
- **THEN** the API returns task data and the task transitions to `ACT`

#### Scenario: Register leave
- **WHEN** an authenticated client registers a valid leave request
- **THEN** the API returns the created request in `PENDING`

#### Scenario: Read the audit stream
- **WHEN** an authorized technical role queries audit events
- **THEN** the API returns the filtered system-wide or per-module activity data

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
