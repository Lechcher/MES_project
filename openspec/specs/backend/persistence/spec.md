# backend/persistence Specification

## Purpose

Keeps the MES's identity, organization, operational records, settings, and history available across requests and application restarts. It defines durable system behavior independent of the storage implementation.

## Requirements

### Requirement: Durable MES records
The system SHALL persist users, organization units, roles, permissions, projects, tasks, task completion requests and their attachments, workflow history, attendance, leave, overtime, KPI records, settings, notifications, and audit events. The system SHALL also persist each viewer's linked Telegram accounts — one record per viewer and Telegram identity — with the Telegram profile information, the masked phone number, the stable embedded-client slot, and the encrypted session material, cascading from the owning viewer.

#### Scenario: Records survive restart
- **WHEN** a user creates a task and the service restarts successfully
- **THEN** the task and its recorded state remain available afterward

#### Scenario: Read committed leave balance
- **WHEN** a leave request or approved overtime changes a tracked balance
- **THEN** subsequent balance reads reflect the committed ledger entries

#### Scenario: Completion requests survive restart
- **WHEN** an assignee submits a completion request and the service restarts successfully
- **THEN** the request, its state, and its attachments remain available afterward

#### Scenario: Linked Telegram account survives restart
- **WHEN** a viewer links a Telegram account and the service restarts successfully
- **THEN** the viewer's account record remains available — its stable slot and encrypted session restorable to that viewer only — with no second record for the same viewer and Telegram identity permitted

#### Scenario: Deleting the owner removes the record's meaning
- **WHEN** a viewer whose Telegram accounts are linked is removed
- **THEN** their Telegram account records go with them and no orphaned session material remains restorable

### Requirement: Consistent workflow updates
The system SHALL commit each state-changing operation and its required related records together, or leave all affected records unchanged if the operation fails.

#### Scenario: Record task transition history
- **WHEN** an authorized user accepts a `REQ` task
- **THEN** the task becomes `ACT` and its actor-attributed transition is persisted as one consistent change

#### Scenario: Roll back invalid business mutation
- **WHEN** a leave or task mutation fails validation or violates a business rule
- **THEN** no partial domain or history records are committed

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

### Requirement: Consistent migration set

The system SHALL apply its PostgreSQL schema through a versioned migration set whose journal and files agree: every journal entry names an existing migration file, every migration file is named by exactly one journal entry, entry tags are unique, and journal timestamps strictly increase in entry order. Applying the set to a database that has already applied it SHALL execute no statement and SHALL NOT fail.

#### Scenario: Fresh database receives the whole set
- **WHEN** migrations are applied to a database with no recorded migrations
- **THEN** every journal entry's statements execute in journal order and each applied migration is recorded in the migrations table

#### Scenario: Re-applying the set is a no-op
- **WHEN** the same migration set is applied again to a database that already recorded it
- **THEN** no statement executes, no error is raised, and the resulting schema is unchanged

#### Scenario: A journal entry without its file fails fast
- **WHEN** a journal entry names a migration file that does not exist in the migrations folder
- **THEN** application fails with an actionable error before any statement of the set executes

#### Scenario: A migration file without its journal entry is detected
- **WHEN** a migration file exists in the migrations folder that no journal entry names
- **THEN** the set is inconsistent — the file is never applied — and the parity check reports it

#### Scenario: Out-of-order journal timestamps are detected
- **WHEN** a later journal entry carries a timestamp older than an earlier entry's
- **THEN** the parity check reports it, because the apply decision compares recorded timestamps against journal timestamps and a stale timestamp would replay an already-applied migration

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

### Requirement: PostgreSQL persistence engine

The system SHALL persist its records to a PostgreSQL database reached through a connection URL supplied as configuration, replacing the SQLite database file path. Record durability and the atomicity of state-changing operations SHALL be unchanged by the engine switch.

#### Scenario: Configured connection is used
- **WHEN** the service starts with a PostgreSQL connection URL
- **THEN** it applies its migration set and serves every read and write against that database

#### Scenario: Records survive restart
- **WHEN** a record is committed and the service restarts
- **THEN** the record is still available afterward

#### Scenario: Missing or malformed connection is rejected at startup
- **WHEN** the service starts without a usable connection URL
- **THEN** it exits with an actionable message naming the missing configuration before serving any request

### Requirement: Referential integrity is enforced by the database

Foreign keys, uniqueness, and value constraints SHALL be enforced by the PostgreSQL database itself rather than only by application validation, so a rejected write is a constraint violation that commits no partial record and that the application maps to its domain error.

#### Scenario: A cascading delete removes dependent records
- **WHEN** a parent record is deleted and its dependents declare a cascade
- **THEN** the dependent records are removed in the same change

#### Scenario: An invalid stored value is rejected
- **WHEN** a write carries a value outside a declared constraint
- **THEN** the database rejects the write and no partial record is committed

### Requirement: Bounded storage growth and index-backed reads
The system SHALL prevent unbounded growth in high-churn tables — including authentication sessions — so per-request reads over them stay fast as the application runs, and SHALL keep the indexes that its hot read paths depend on in place and effective. A hot read path's query plan SHALL use an appropriate index rather than a full table scan, verified through the database's own query-plan tooling rather than assumed.

#### Scenario: Expired sessions are pruned
- **WHEN** the maintenance/pruning path runs
- **THEN** expired or superseded session rows are removed so the session table does not grow without bound across sign-ins, while active sessions are retained

#### Scenario: Hot reads use their indexes
- **WHEN** a hot read path (for example task lists by assignee, attendance by user and date, KPI events by user and period, session lookup by token) is run through the database's query-plan tooling
- **THEN** the plan shows an index seek or range scan on the relevant index rather than a full table scan of the table

#### Scenario: Loss of an index is a regression
- **WHEN** an index that a hot read path relies on is missing or unused (a scan appears where a seek is expected)
- **THEN** the query-cost guard reports it so the index or the query is corrected before the change is archived
