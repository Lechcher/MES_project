# Spec Delta

## Purpose

Provides the versioned GraphQL boundary through which authenticated clients use the MES modules and shared services. The API exposes the documented domain operations, consistent pagination, and machine-readable failures.

## ADDED Requirements

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
