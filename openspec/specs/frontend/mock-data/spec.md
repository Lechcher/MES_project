# frontend/mock-data Specification

## Purpose

The typed in-memory stand-in for the future GraphQL backend: domain entities and enums verbatim from the API contract, offset/limit pagination connections, role-scoped reads per the access matrix, documented lifecycle rules for in-memory mutations, and zero network calls.

## Requirements

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

### Requirement: Entities mirror the API contract
The mock layer SHALL provide typed fixtures for every entity the screens need, with camelCase field names per `API_CONTACT_SPECIFICATION.md`: users, departments, roles, permissions, projects, tasks (with progress logs, state transitions, requests, and attachments), attendance records, leave requests, leave balances, overtime records, KPI point rules, KPI score events, monthly KPI summaries, the three audit-table row sets, system audit log entries, app settings, and the Telegram webhook config.

#### Scenario: Task fixture shape
- **WHEN** a task fixture is read
- **THEN** it exposes `taskCode`, `title`, `taskType`, `priority`, `state`, `progressPercentage`, `assignedTo`, `department`, `project`, `startDate`, `endDate`, and its badge/flag fields per the contract

#### Scenario: Registries are available
- **WHEN** screens need lookups
- **THEN** the ticket-state registry (7 codes with names, colors, terminal flags) and the leave-code registry (11 codes with names, categories, payroll rules, and flags) are available

### Requirement: Enum codes are verbatim
All enum values SHALL appear exactly as defined: ticket states `REQ`, `ACT`, `PEN`, `APP`, `REJ`, `CAN`, `OVERDUE`; leave codes `AL`, `UAL`, `SL`, `USL`, `PL`, `ML`, `CL`, `EL`, `LWP`, `TOIL`, `VTO`; priorities `LOW`, `MEDIUM`, `HIGH`, `URGENT`; task types `HOURLY`, `DAILY`, `MULTI_DAY`; approval statuses `PENDING`, `APPROVED`, `REJECTED`; roles `SUPER_ADMIN`, `TECH_LEAD`, `HR_MANAGER`, `DEPT_HEAD`, `EMPLOYEE`; department types `DEPARTMENT`, `DIVISION`.

#### Scenario: Fixtures use exact codes
- **WHEN** fixtures include an annual-leave request and an urgent task
- **THEN** the request's `leaveCode` is `AL` and the task's `priority` is `URGENT`

### Requirement: List reads use offset pagination
Every list read SHALL return a connection of `nodes` plus a `pageInfo` carrying `offset`, `limit`, `totalCount`, and `hasNextPage`, honoring the requested offset and limit.

#### Scenario: First page
- **WHEN** the ticket list requests offset 0 with limit 20 and the store holds 34 matching tickets
- **THEN** 20 nodes are returned with `totalCount` 34 and `hasNextPage` true

### Requirement: Reads are role-scoped per the access matrix
Mock reads SHALL scope to the viewer: `EMPLOYEE` sees only their own records (assigned tasks, own attendance and leave, own `AL`/`TOIL` balances); `DEPT_HEAD` sees their department's records; `TECH_LEAD`, `HR_MANAGER`, and `SUPER_ADMIN` see company-wide data where the matrix grants it.

#### Scenario: Employee task scope
- **WHEN** an `EMPLOYEE` reads the task list
- **THEN** only tasks assigned to that employee are returned

#### Scenario: Department Head calendar scope
- **WHEN** a `DEPT_HEAD` reads the matrix calendar rows
- **THEN** only employees of that department appear

#### Scenario: Employee balances
- **WHEN** an `EMPLOYEE` reads leave balances
- **THEN** only that employee's `AL` and `TOIL` balances are returned

### Requirement: Seed data is deterministic and covers every state
Fixtures SHALL be deterministic and anchored relative to the current date, so yesterday/today/tomorrow views, the current month's calendar, and overdue examples always show meaningful data. The seed SHALL include at least one ticket in every state (`REQ`, `ACT`, `PEN`, `APP`, `REJ`, `CAN`, `OVERDUE`), at least one of each task type, examples of all four `ACT` secondary badges, at least one approved leave, and at least one `UAL`/`USL` penalty case.

#### Scenario: Every state has an example
- **WHEN** the seed loads
- **THEN** at least one ticket exists in each of `REQ`, `ACT`, `PEN`, `APP`, `REJ`, `CAN`, `OVERDUE`

#### Scenario: Today is populated
- **WHEN** the day context is Today
- **THEN** tickets and calendar cells exist for the current date, including at least one `OVERDUE` ticket

### Requirement: One demo account per role
The mock layer SHALL provide five demo accounts — exactly one per role code — each with a department consistent with the org fixture.

#### Scenario: Five roles available
- **WHEN** the sign-in page reads the demo accounts
- **THEN** one account per role is returned, each carrying a department from the org fixture
