# Spec Delta

## MODIFIED Requirements

### Requirement: KPI scoring follows the fixed rule set
The app SHALL display persisted KPI scores computed from the documented rules: +10 per on-time approved ticket (`APP`), +20 per on-time urgent ticket, +5 per immediate approval without edits, +50 for a month of perfect attendance; -15 per `OVERDUE` ticket, -5 per returned (`REJ`) ticket, -2 per extension request, -10 per late/early-leave or unapproved-leave (`UAL`/`USL`) occurrence. Approve and Return actions SHALL update the assignee's recorded KPI events.

#### Scenario: Approve an urgent on-time ticket
- **WHEN** an approver approves an urgent ticket submitted before its deadline
- **THEN** a `+20` KPI event is recorded for the assignee

#### Scenario: Return a ticket
- **WHEN** an approver returns a report
- **THEN** a `-5` KPI event is recorded

### Requirement: Performance print/export entry points
The app SHALL offer Print (a generated A4 personal KPI evaluation report) and Export (a generated `.xlsx` workbook of the authorized audit tables and ranking chart). `DEPT_HEAD` exports SHALL be limited to their department, and `EMPLOYEE` exports SHALL contain only their personal report.

#### Scenario: Employee export
- **WHEN** an `EMPLOYEE` presses Export
- **THEN** a generated workbook contains only the personal report

#### Scenario: Department export
- **WHEN** a `DEPT_HEAD` exports performance data
- **THEN** the generated workbook contains only the authorized department data
