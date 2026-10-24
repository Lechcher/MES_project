# frontend/performance Specification

## Purpose

The Performance app screens: the Personal KPI Dashboard available to every role, the three-level audit tables with their documented columns, the company-wide ranking column chart, the deterministic KPI point rules, and print/export entry points — with role-based visibility of each audit level.

## Requirements

### Requirement: Personal KPI Dashboard for every role
Every role SHALL see a Personal KPI Dashboard with a month selector, a score card showing the total KPI score, a donut chart, the viewer's own `AL Balance`/`TOIL Balance`, and recent KPI score events. For `EMPLOYEE`, this is the entire Performance app.

#### Scenario: Employee sees only the personal dashboard
- **WHEN** an `EMPLOYEE` opens the Performance app
- **THEN** only the Personal KPI Dashboard is rendered and no audit table is visible

#### Scenario: Recent events
- **WHEN** the dashboard renders for a month with activity
- **THEN** the recent events list shows each event's rule and points

### Requirement: Audit Table 1 — company employees
`SUPER_ADMIN`, `TECH_LEAD`, and `HR_MANAGER` SHALL see the company-level table with the exact documented columns — No., Employee Name, Department/Division, Total Tasks, On-Time, Overdue, Annual Leave, Sick Leave, Unapproved Leave, Excellent Attendance (+50), Unapproved-Leave Deduction (-10/occurrence), Attendance Rate (%), TOTAL PERFORMANCE SCORE — sorted by TOTAL PERFORMANCE SCORE descending. Column headers SHALL read in English without parenthetical code keys, and the Employee ID column SHALL NOT be rendered (record identifiers are not displayed; see `frontend/display-labels`).

#### Scenario: Sorted ranking
- **WHEN** the Level 1 table renders
- **THEN** rows are ordered by TOTAL PERFORMANCE SCORE from highest to lowest and show every documented column

### Requirement: Audit Table 2 — departments
The same roles SHALL see the department-level table with the exact documented columns — No., Department/Division Name, Department Head, Total Employees, Total Tasks Assigned, Avg. Progress Rate (%), On-Time Completion Rate (%), Avg. Attendance Score, Avg. Department Performance Score. The Department Code column SHALL NOT be rendered (record identifiers are not displayed; see `frontend/display-labels`).

#### Scenario: Department rows
- **WHEN** the Level 2 table renders
- **THEN** one row per department shows all documented columns

### Requirement: Audit Table 3 — employees within a department
`SUPER_ADMIN`, `TECH_LEAD`, `HR_MANAGER`, and `DEPT_HEAD` SHALL see the employee-level table with the exact documented columns — No., Employee Name, Total Tasks, On-Time, Overdue, Annual Leave, Unapproved Leave, Immediate Approval (+5), Excellent Attendance (+50), Returned (-5), Attendance Rate (%), TOTAL PERFORMANCE SCORE. For `DEPT_HEAD` it SHALL be scoped to their own department only. The Employee ID column SHALL NOT be rendered (record identifiers are not displayed; see `frontend/display-labels`).

#### Scenario: Department Head scope
- **WHEN** a `DEPT_HEAD` opens the Level 3 table
- **THEN** only that department's employees are listed

#### Scenario: Hidden from Employee
- **WHEN** an `EMPLOYEE` opens the Performance app
- **THEN** no Level 3 table is rendered

### Requirement: Levels 1 and 2 hidden from Department Head
Audit Tables 1 and 2 SHALL be restricted to `SUPER_ADMIN`, `TECH_LEAD`, and `HR_MANAGER`; `DEPT_HEAD` SHALL NOT see them.

#### Scenario: Department Head sees no company tables
- **WHEN** a `DEPT_HEAD` opens the Performance app
- **THEN** the personal dashboard and their department's Level 3 table are shown and no Level 1 or Level 2 table is rendered

### Requirement: Company-wide ranking column chart
Roles that see Audit Tables 1 and 2 SHALL also see the company-wide ranking column chart.

#### Scenario: Ranking chart
- **WHEN** an `HR_MANAGER` opens the Performance audit views
- **THEN** the ranking column chart renders alongside the tables

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
