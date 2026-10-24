# Spec Delta

## MODIFIED Requirements

### Requirement: Audit Table 1 — company employees
`SUPER_ADMIN`, `TECH_LEAD`, and `HR_MANAGER` SHALL see the company-level table with the exact documented columns — No., Employee Name, Department/Division, Total Tasks, On-Time, Overdue, Annual Leave, Sick Leave, Unapproved Leave, Excellent Attendance (+50), Unapproved-Leave Deduction (-10/occurrence), Attendance Rate (%), TOTAL PERFORMANCE SCORE — sorted by TOTAL PERFORMANCE SCORE descending. Column headers SHALL read in the active locale without parenthetical code keys, and the Employee ID column SHALL NOT be rendered (record identifiers are not displayed; see `frontend/display-labels`).

#### Scenario: Sorted ranking
- **WHEN** the Level 1 table renders
- **THEN** rows are ordered by TOTAL PERFORMANCE SCORE from highest to lowest and show every documented column

#### Scenario: Vietnamese headers
- **WHEN** the Level 1 table renders in Vietnamese
- **THEN** the column headers read in Vietnamese and still carry no parenthetical code keys
