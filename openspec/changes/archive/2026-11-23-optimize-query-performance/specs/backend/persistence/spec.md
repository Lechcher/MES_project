# Spec Delta

## ADDED Requirements

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
