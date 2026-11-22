# Spec Delta

## MODIFIED Requirements

### Requirement: Audit chart and table available to every role
The audit surface SHALL be titled "Audit chart and table" and SHALL render for every role, including `EMPLOYEE`. Rows SHALL be limited to the viewer's authorized data scope, and the Company-wide, Department-wide, and Employees in department selectors SHALL be unavailable to a viewer whose scope makes them meaningless.

#### Scenario: Employee opens the audit tab
- **WHEN** an `EMPLOYEE` opens the Audit chart and table tab
- **THEN** the chart and table render showing only that employee's own row, and the scope selector is disabled so no company or department grain can be chosen

#### Scenario: Department Head scope
- **WHEN** a `DEPT_HEAD` opens the audit tab and selects Company-wide scope
- **THEN** only employees of the Department Head's own department are listed

#### Scenario: Company-wide roles
- **WHEN** a `SUPER_ADMIN`, `TECH_LEAD`, or `HR_MANAGER` opens the audit tab
- **THEN** all three scopes are selectable and their rows are not restricted to one department unless a department is chosen

### Requirement: Performance score ranking chart
The audit surface SHALL render a Performance score ranking chart ordered by total performance score, highest first. Its scope and time frame SHALL be the same selections that drive the detail table, and its rows SHALL follow the same authorized scope.

#### Scenario: Ranking order
- **WHEN** the ranking chart renders with several authorized rows
- **THEN** the bars are ordered from the highest total performance score to the lowest

#### Scenario: Quarter ranking
- **WHEN** the Quarter time frame is selected
- **THEN** the chart ranks the aggregated quarter scores rather than a single month's scores

#### Scenario: Department-wide ranking
- **WHEN** Department-wide scope is selected
- **THEN** the chart ranks departments instead of employees

#### Scenario: Employees in department ranking
- **WHEN** Employees in department scope is selected and a department is chosen
- **THEN** the chart ranks that department's employees rather than the whole company's

### Requirement: Detail performance KPI score table
The audit surface SHALL render one combined detail table in place of the former three audit tables. A Company-wide scope shows one row per employee with the employee-level detail columns; a Department-wide scope shows one row per department with the department-level aggregate columns; an Employees in department scope shows one row per employee narrowed to the selected department. Every scope SHALL respect the selected time frame and the viewer's authorized data scope.

#### Scenario: Company-wide employee rows
- **WHEN** Company-wide scope and the Month time frame are selected
- **THEN** the table lists employees with No., Employee Name, Department/Division, Total Tasks, On-Time, Overdue, Unapproved Leave, Excellent Attendance (+50), Attendance Rate (%), and TOTAL PERFORMANCE SCORE, ordered by TOTAL PERFORMANCE SCORE descending

#### Scenario: Department-wide department rows
- **WHEN** Department-wide scope is selected
- **THEN** the table lists departments with No., Department/Division Name, Department Head, Total Employees, Total Tasks Assigned, Avg. Attendance Score, and Avg. Department Performance Score

#### Scenario: Single table, no level headings
- **WHEN** the audit tab renders
- **THEN** exactly one detail table is rendered and no "Audit Table 1", "Audit Table 2", or "Audit Table 3" heading appears

#### Scenario: Empty scope
- **WHEN** the selected scope and time frame have no authorized rows
- **THEN** an empty state explains that no KPI summaries are available in scope for that period

#### Scenario: No record identifiers
- **WHEN** the detail table renders
- **THEN** no Employee ID or department code column is rendered

#### Scenario: Employees in department rows
- **WHEN** Employees in department scope is selected and a department is chosen
- **THEN** the table lists that department's employees with the same employee-level columns as the Company-wide scope, and the Department/Division column shows the chosen department

## ADDED Requirements

### Requirement: Employees in department audit scope
The audit surface SHALL offer an "Employees in department" ranking scope that lists the employees of one chosen department with the same employee-level columns and ranking as the Company-wide scope. The scope SHALL be offered only to a role with an authorized per-department employee read, and SHALL be absent for a personal-scoped viewer.

#### Scenario: Narrowed rows
- **WHEN** a `SUPER_ADMIN`, `TECH_LEAD`, or `HR_MANAGER` selects Employees in department scope and picks a department
- **THEN** the chart and table show only that department's employees, ranked by TOTAL PERFORMANCE SCORE descending

#### Scenario: Employee is not offered the scope
- **WHEN** an `EMPLOYEE` opens the audit tab
- **THEN** the Employees in department scope is not offered, because no per-department employee read is authorized

#### Scenario: Department Head sees their own department only
- **WHEN** a `DEPT_HEAD` selects Employees in department scope
- **THEN** the rows are limited to the Department Head's own department and the department cannot be changed

### Requirement: Department selection for the employees-in-department scope
Selecting the Employees in department scope SHALL reveal a department selector beside the existing scope and time frame selectors. The selector SHALL default to the viewer's own department when one is known, and SHALL list department names rather than department codes. Until a department is chosen the surface SHALL render a prompt state rather than an empty table.

#### Scenario: Selector appears with the scope
- **WHEN** a viewer selects the Employees in department scope
- **THEN** a department selector appears next to the scope and time frame selectors

#### Scenario: Default department
- **WHEN** a viewer with a known department opens the Employees in department scope for the first time
- **THEN** that department is pre-selected and its employees are already shown

#### Scenario: No department chosen
- **WHEN** a viewer has no department of their own and has not chosen one
- **THEN** the surface asks them to choose a department instead of rendering an empty table or chart

#### Scenario: Names, not codes
- **WHEN** the department selector opens
- **THEN** it lists departments by their names, and no department code is rendered as the option's content
