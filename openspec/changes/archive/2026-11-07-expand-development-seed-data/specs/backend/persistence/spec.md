# Spec Delta

## MODIFIED Requirements

### Requirement: Repeatable development seed data
The system SHALL provide deterministic local development and test data covering each ticket state, task type, and role, a populated multi-user organization spread across departments and divisions, current-month calendar attendance coverage, and documented leave, overtime, performance, workflow-history and audit examples without replacing production records.

#### Scenario: Seed a local test database
- **WHEN** the development seed is applied to a clean database
- **THEN** the documented role and workflow scenarios can be exercised consistently

#### Scenario: Each department holds multiple staff
- **WHEN** the development seed is applied
- **THEN** every seeded department and division contains multiple active staff accounts so department-scoped calendar, task, leave and performance views are populated rather than single-row

#### Scenario: Current-month calendar coverage
- **WHEN** a manager reads the matrix calendar for the current month
- **THEN** each seeded user's row shows attendance for the month's working days, including present days, occasional late and early-leave badges, approved leave days, and at least one penalty (`UAL`/`USL`) case

#### Scenario: Multi-week task coverage
- **WHEN** the development seed is applied
- **THEN** seeded tickets span days before, on, and after today across every ticket state, task type, and priority, including multi-day bars that cross week boundaries, and each ticket carries its state-transition history

#### Scenario: Seeded workflow records accompany tickets
- **WHEN** a seeded ticket with reported progress is read
- **THEN** its progress logs, state transitions, `EXTENSION` and `LATE_EXPLANATION` requests, and completion requests in each decision state (`PEN`, `APP`, `REJ`) are available

#### Scenario: Leave and overtime ledgers are populated
- **WHEN** leave balances, leave requests, or overtime records are read after seeding
- **THEN** accrual, usage, and adjustment ledger entries exist alongside leave requests in each status (approved, pending, rejected) and both pending and approved overtime records

#### Scenario: Performance dashboards are populated
- **WHEN** a KPI dashboard, leaderboard, or monthly summary is read after seeding
- **THEN** KPI score events exist for multiple users spanning more than one month, with both bonus and penalty events, and each user's monthly summary reflects the recomputed totals

#### Scenario: Audit rows are populated
- **WHEN** the audit log module is read after seeding
- **THEN** system audit events exist covering more than one module and resource type

## ADDED Requirements

### Requirement: Documented demo accounts are preserved
The system SHALL keep exactly one documented demo account per role code with unchanged email, user code and development password, and additional seeded staff accounts SHALL hold the `EMPLOYEE` role only.

#### Scenario: Role accounts unchanged
- **WHEN** the development seed is applied to an existing database
- **THEN** the five documented demo accounts keep their email, user code, role and password, so existing sign-in flows and permission walkthroughs continue to work

#### Scenario: Added staff are employees
- **WHEN** the additional seeded accounts are listed
- **THEN** every one of them holds the `EMPLOYEE` role and no second `SUPER_ADMIN`, `TECH_LEAD`, `HR_MANAGER`, or `DEPT_HEAD` account is introduced

#### Scenario: Deactivated account for scoping checks
- **WHEN** the seeded users are listed in an identity management view
- **THEN** at least one seeded account is inactive so activation-state filtering and scoping behavior can be exercised

### Requirement: Seeded KPI summaries are recomputed, not authored
The system SHALL derive each user's monthly KPI summary from the seeded score events and attendance data through the same computation the application uses, rather than inserting hand-written summary rows.

#### Scenario: Summaries match the ledger
- **WHEN** a seeded user's monthly summary is read
- **THEN** its counters equal what the application's own monthly-summary computation produces from the seeded events and attendance rows for that period

### Requirement: Seeding is idempotent
The system SHALL assign every seeded row a stable identity and insert without duplicating or replacing existing rows, so repeated seed runs leave the database unchanged.

#### Scenario: Second run changes nothing
- **WHEN** the development seed runs twice against the same database
- **THEN** row counts and seeded row ids are identical after the second run and no duplicate records are created

### Requirement: Development fixtures stay out of production
The system SHALL refuse to run the development seed against a production configuration and SHALL NOT modify or delete any existing records when it runs.

#### Scenario: Production refused
- **WHEN** the development seed runs with a production configuration
- **THEN** it refuses to seed, reports the reason, and writes no records
