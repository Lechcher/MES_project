# frontend/performance Specification

## MODIFIED Requirements

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
