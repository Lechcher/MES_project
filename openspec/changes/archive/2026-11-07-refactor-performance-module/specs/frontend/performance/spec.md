# Spec Delta

## MODIFIED Requirements

### Requirement: Personal KPI Dashboard for every role
Every role SHALL see a Personal KPI Dashboard with a month selector, a score card showing the total KPI score, a donut chart, the viewer's own `AL Balance`/`TOIL Balance`, and recent KPI score events. Recent events and the score-composition chart SHALL name each KPI rule in the active locale instead of showing its code. The dashboard SHALL also include a bar chart of the viewer's total KPI score for each month of the selected year. For `EMPLOYEE`, this is the entire Performance app.

#### Scenario: Employee sees only the personal dashboard
- **WHEN** an `EMPLOYEE` opens the Performance app
- **THEN** the Personal KPI Dashboard is rendered and the Audit chart and table tab is visible with only the viewer's own authorized rows

#### Scenario: Recent events
- **WHEN** the dashboard renders for a month with activity
- **THEN** the recent events list shows each event's rule and points

#### Scenario: KPI score by month
- **WHEN** the dashboard renders for a year with recorded summaries
- **THEN** a bar chart plots the viewer's total KPI score for each of the twelve months of the selected year

#### Scenario: Switching the trend year
- **WHEN** the viewer changes the year on the trend chart
- **THEN** the chart replots the twelve months of the newly selected year without reloading the page

## ADDED Requirements

### Requirement: KPI point rules render as localized names
Every user-visible rendering of a KPI point rule SHALL show its localized name. The rule code SHALL NOT appear in the recent events list, the score-composition chart legend, or the scoring rules table.

#### Scenario: Recent event row
- **WHEN** a recent event for `KPI_ON_TIME_TICKET` renders in English
- **THEN** the rule cell reads "On-time ticket" and shows no code token

#### Scenario: Score composition legend
- **WHEN** the score-composition chart renders a segment for `KPI_OVERDUE_TICKET`
- **THEN** the legend reads "Overdue ticket" in the active locale, not the code

#### Scenario: Vietnamese locale
- **WHEN** the locale is `vi` and the same events render
- **THEN** the rule cells and the legend show the Vietnamese rule names

#### Scenario: Unknown rule falls back gracefully
- **WHEN** an event carries a rule code with no localized name
- **THEN** the row still renders, falling back to the catalogued event name rather than showing a blank cell

### Requirement: KPI score by month chart
The Personal KPI Dashboard SHALL include a bar chart of the viewer's total KPI score for each month of the selected year, with a year switcher that changes the twelve months plotted.

#### Scenario: Months with no recorded score
- **WHEN** a month in the selected year has no recorded summary
- **THEN** that month plots as a zero-height bar rather than being omitted from the axis

#### Scenario: Personal trend is not role-gated
- **WHEN** any role opens the Performance app
- **THEN** the monthly trend chart is available on the personal dashboard

### Requirement: Audit chart and table available to every role
The audit surface SHALL be titled "Audit chart and table" and SHALL render for every role, including `EMPLOYEE`. Rows SHALL be limited to the viewer's authorized data scope, and the Company-wide and Department-wide selectors SHALL be unavailable to a viewer whose scope makes them meaningless.

#### Scenario: Employee opens the audit tab
- **WHEN** an `EMPLOYEE` opens the Audit chart and table tab
- **THEN** the chart and table render showing only that employee's own row, and the scope and department selectors are disabled

#### Scenario: Department Head scope
- **WHEN** a `DEPT_HEAD` opens the audit tab and selects Company-wide scope
- **THEN** only employees of the Department Head's own department are listed

#### Scenario: Company-wide roles
- **WHEN** a `SUPER_ADMIN`, `TECH_LEAD`, or `HR_MANAGER` opens the audit tab
- **THEN** both Company-wide and Department-wide scopes are selectable and their rows are not restricted to one department

### Requirement: Audit time frame selection
The audit surface SHALL offer Month, Quarter, and Year time frames. Quarter and Year SHALL aggregate the viewer's authorized monthly summaries into the selected quarter or the selected year. A Week time frame SHALL NOT be offered.

#### Scenario: Month frame
- **WHEN** the Month time frame is selected
- **THEN** the chart and table show the selected month's data

#### Scenario: Quarter frame
- **WHEN** the Quarter time frame is selected
- **THEN** the chart and table show the three months of the selected quarter combined

#### Scenario: Year frame
- **WHEN** the Year time frame is selected
- **THEN** the chart and table show the twelve months of the selected year combined

#### Scenario: No weekly option
- **WHEN** the time frame selector opens
- **THEN** its options are Month, Quarter, and Year only

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

### Requirement: Detail performance KPI score table
The audit surface SHALL render one combined detail table in place of the former three audit tables. A Company-wide scope shows one row per employee with the employee-level detail columns; a Department-wide scope shows one row per department with the department-level aggregate columns. Both scopes SHALL respect the selected time frame and the viewer's authorized data scope.

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

## REMOVED Requirements

### Requirement: Audit Table 1 — company employees
**Reason**: The three separately-gated audit tables are replaced by one combined "Detail performance KPI score" table, which removes the level-based split.
**Migration**: Read employee-level detail rows in the combined table under Company-wide scope; the documented employee-level columns are preserved there.

### Requirement: Audit Table 2 — departments
**Reason**: The three separately-gated audit tables are replaced by one combined "Detail performance KPI score" table, which removes the level-based split.
**Migration**: Read department-level aggregate rows in the combined table under Department-wide scope.

### Requirement: Audit Table 3 — employees within a department
**Reason**: The three separately-gated audit tables are replaced by one combined "Detail performance KPI score" table, which removes the level-based split.
**Migration**: A `DEPT_HEAD` reads their department's employees in the combined table under Company-wide scope; the employee-level columns are preserved there.

### Requirement: Levels 1 and 2 hidden from Department Head
**Reason**: Audit visibility is no longer split per level; the audit surface is open to every role and row-level data scope is applied instead.
**Migration**: The combined table restricts a `DEPT_HEAD`'s rows to their own department rather than hiding the surface.

### Requirement: Company-wide ranking column chart
**Reason**: The fixed company-wide chart is replaced by the selectable Performance score ranking chart, which supports Company-wide and Department-wide scopes over Month, Quarter, and Year time frames.
**Migration**: Use the Performance score ranking chart's Company-wide scope to reproduce the old chart.
