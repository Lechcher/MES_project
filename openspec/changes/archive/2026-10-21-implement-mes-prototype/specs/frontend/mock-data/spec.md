# Spec Delta

## ADDED Requirements

### Requirement: Use the GraphQL API for production data
The production UI SHALL obtain domain data and perform state-changing actions through the authenticated GraphQL API; local fixtures SHALL NOT be used as a silent fallback for failed requests.

#### Scenario: Read persisted application data
- **WHEN** an authenticated user opens an app
- **THEN** the UI displays records returned by the GraphQL API

#### Scenario: Surface API failure
- **WHEN** a production data request fails
- **THEN** the UI shows an actionable error instead of presenting stale fixture data as a successful response

### Requirement: Keep fixture data in development and tests
The system SHALL restrict deterministic sample records and role-specific seed users to local development and test environments.

#### Scenario: Production starts without development fixtures
- **WHEN** the application runs in production
- **THEN** development sample records and demo credentials are not loaded

#### Scenario: Test environment loads repeatable fixtures
- **WHEN** tests load the documented seed data
- **THEN** they receive stable examples covering the required roles, ticket states, task types, leave, and attendance cases

## REMOVED Requirements

### Requirement: Mutations follow the documented lifecycle in memory
Write actions SHALL mutate the in-memory store and be visible to subsequent reads, without persisting across reloads. State transitions SHALL follow the documented lifecycle: `REQ → ACT → PEN → {APP | REJ}`; `CAN` at any time with a mandatory reason; `OVERDUE` requires a late-submission explanation before `PEN`. Invalid or role-forbidden actions SHALL be rejected.

#### Scenario: Accept a ticket
- **WHEN** an assignee accepts a `REQ` ticket
- **THEN** its state becomes `ACT` and the transition is recorded with actor and timestamp

#### Scenario: Cancel without a reason is rejected
- **WHEN** a permitted role cancels a ticket without entering a reason
- **THEN** the action is rejected and the state is unchanged

#### Scenario: Overdue requires explanation
- **WHEN** a late-submission report on an `OVERDUE` ticket is submitted
- **THEN** the ticket moves to `PEN` tagged with the Late Submission warning

#### Scenario: Mutations are not persisted
- **WHEN** the browser is reloaded after mutating data
- **THEN** the seed data is restored

**Reason**: In-memory writes and reload resets are prototype-only behavior and conflict with the persistent API-backed system.
**Migration**: Use the authenticated GraphQL mutations and durable server records; retain in-memory fixtures only in tests.

### Requirement: Zero network calls
The mock layer SHALL make no HTTP or network requests to any backend, and print/export actions SHALL return a mock result descriptor without generating real files.

#### Scenario: Walkthrough generates no backend traffic
- **WHEN** a reviewer signs in, browses every app, performs actions, and triggers print/export
- **THEN** no request is made to any backend API and no file is generated

**Reason**: The full system requires authenticated GraphQL operations and generated report files.
**Migration**: Route production reads and writes through the documented API and generate the specified report formats.
