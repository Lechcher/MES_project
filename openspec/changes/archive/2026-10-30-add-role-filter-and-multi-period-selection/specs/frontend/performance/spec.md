# Spec Delta

## MODIFIED Requirements

### Requirement: Personal KPI Dashboard for every role
Every role SHALL see a Personal KPI Dashboard driven by the shared period selection, with a score card showing the total KPI score across the selected months, a donut chart, the viewer's own `AL Balance`/`TOIL Balance`, and recent KPI score events. Recent events and the score-composition chart SHALL name each KPI rule in the active locale instead of showing its code. The dashboard SHALL also include a bar chart of the viewer's total KPI score for each month in the selected period. For `EMPLOYEE`, this is the entire Performance app.

#### Scenario: Employee sees only the personal dashboard
- **WHEN** an `EMPLOYEE` opens the Performance app
- **THEN** the Personal KPI Dashboard is rendered and the Audit chart and table tab is visible with only the viewer's own authorized rows

#### Scenario: Recent events
- **WHEN** the dashboard renders for a month with activity
- **THEN** the recent events list shows each event's rule and points

#### Scenario: KPI score by month
- **WHEN** the dashboard renders for a period with recorded summaries
- **THEN** a bar chart plots the viewer's total KPI score for each of the months in the selected period

#### Scenario: Switching the trend year
- **WHEN** the viewer changes the selected period so that it covers another year
- **THEN** the dashboard re-reads and replots the newly selected months without reloading the page

### Requirement: KPI score by month chart
The Personal KPI Dashboard SHALL include a bar chart of the viewer's total KPI score for each month in the selected period, and the plotted months SHALL follow the period selection shared with the rest of the Performance app.

#### Scenario: Months with no recorded score
- **WHEN** a month in the selected period has no recorded summary
- **THEN** that month plots as a zero-height bar rather than being omitted from the axis

#### Scenario: Personal trend is not role-gated
- **WHEN** any role opens the Performance app
- **THEN** the monthly trend chart is available on the personal dashboard

#### Scenario: Trend follows the shared selection
- **WHEN** the selected period changes to another set of months
- **THEN** the chart plots exactly the months of the new selection

### Requirement: Audit chart and table available to every role
The audit surface SHALL be titled "Audit chart and table" and SHALL render for every role, including `EMPLOYEE`. Rows SHALL be limited to the viewer's authorized data scope, and the Company-wide, Department-wide, and Employees in department selectors SHALL be unavailable to a viewer whose scope makes them meaningless. An employee-level row SHALL name the role of the person it lists, and the scope note shown to a viewer whose scope is fixed SHALL name that viewer's role.

#### Scenario: Employee opens the audit tab
- **WHEN** an `EMPLOYEE` opens the Audit chart and table tab
- **THEN** the chart and table render showing only that employee's own row, the scope selector is disabled so no company or department grain can be chosen, and the row names the employee's role

#### Scenario: Department Head scope
- **WHEN** a `DEPT_HEAD` opens the audit tab and selects Company-wide scope
- **THEN** only employees of the Department Head's own department are listed

#### Scenario: Company-wide roles
- **WHEN** a `SUPER_ADMIN`, `TECH_LEAD`, or `HR_MANAGER` opens the audit tab
- **THEN** all three scopes are selectable and their rows are not restricted to one department unless a department is chosen

#### Scenario: Scope note names the role
- **WHEN** a viewer whose scope is fixed to their own rows opens the audit tab
- **THEN** the scope note names the viewer's role rather than stating an unnamed limitation

### Requirement: Audit time frame selection
The audit surface SHALL offer Month, Quarter, and Year time frames, and each frame SHALL let the viewer select one or more periods of that frame rather than a single anchor period. A selected month SHALL cover that month, a selected quarter SHALL cover the three months of that quarter, and a selected year SHALL cover the twelve months of that year. The selected periods SHALL aggregate the viewer's authorized monthly summaries into one chart and one table. A Week time frame SHALL NOT be offered.

#### Scenario: Month frame
- **WHEN** the Month time frame is selected with one month chosen
- **THEN** the chart and table show that month's data

#### Scenario: Quarter frame
- **WHEN** the Quarter time frame is selected with one quarter chosen
- **THEN** the chart and table show the three months of that quarter combined

#### Scenario: Year frame
- **WHEN** the Year time frame is selected with one year chosen
- **THEN** the chart and table show the twelve months of that year combined

#### Scenario: Several months selected
- **WHEN** the Month time frame is selected with several months chosen
- **THEN** the chart and table show the combined data of exactly those months

#### Scenario: Several quarters and years selected
- **WHEN** the Quarter or Year time frame is selected with several periods chosen
- **THEN** the chart and table combine every month those periods cover

#### Scenario: No weekly option
- **WHEN** the time frame selector opens
- **THEN** its options are Month, Quarter, and Year only

### Requirement: Performance score ranking chart
The audit surface SHALL render a Performance score ranking chart ordered by total performance score, highest first. Its scope, time frame, selected periods, and role selection SHALL be the same selections that drive the detail table, and its rows SHALL follow the same authorized scope.

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

#### Scenario: Ranking follows the role selection
- **WHEN** a role selection narrows the rows
- **THEN** the chart ranks only the rows that role selection leaves

### Requirement: Detail performance KPI score table
The audit surface SHALL render one combined detail table in place of the former three audit tables. A Company-wide scope shows one row per employee with the employee-level detail columns, including the person's role; a Department-wide scope shows one row per department with the department-level aggregate columns; an Employees in department scope shows one row per employee narrowed to the selected department. Every scope SHALL respect the selected time frame, the selected periods, and the viewer's authorized data scope.

#### Scenario: Company-wide employee rows
- **WHEN** Company-wide scope and the Month time frame are selected
- **THEN** the table lists employees with No., Employee Name, Role, Department/Division, Total Tasks, On-Time, Overdue, Unapproved Leave, Excellent Attendance (+50), Attendance Rate (%), and TOTAL PERFORMANCE SCORE, ordered by TOTAL PERFORMANCE SCORE descending

#### Scenario: Department-wide department rows
- **WHEN** Department-wide scope is selected
- **THEN** the table lists departments with No., Department/Division Name, Department Head, Total Employees, Total Tasks Assigned, Avg. Attendance Score, and Avg. Department Performance Score

#### Scenario: Single table, no level headings
- **WHEN** the audit tab renders
- **THEN** exactly one detail table is rendered and no "Audit Table 1", "Audit Table 2", or "Audit Table 3" heading appears

#### Scenario: Empty scope
- **WHEN** the selected scope, time frame, and periods have no authorized rows
- **THEN** an empty state explains that no KPI summaries are available in scope for that period

#### Scenario: No record identifiers
- **WHEN** the detail table renders
- **THEN** no Employee ID or department code column is rendered

#### Scenario: Employees in department rows
- **WHEN** Employees in department scope is selected and a department is chosen
- **THEN** the table lists that department's employees with the same employee-level columns as the Company-wide scope, and the Department/Division column shows the chosen department

#### Scenario: Role column names the role
- **WHEN** an employee-level row renders
- **THEN** its Role cell shows the person's role name and no role code

### Requirement: Performance print/export entry points
The app SHALL offer Print (a generated A4 personal KPI evaluation report) and Export (a generated `.xlsx` workbook of the authorized audit tables and ranking chart). Both SHALL cover every month of the selected period. `DEPT_HEAD` exports SHALL be limited to their department, and `EMPLOYEE` exports SHALL contain only their personal report.

#### Scenario: Employee export
- **WHEN** an `EMPLOYEE` presses Export
- **THEN** a generated workbook contains only the personal report

#### Scenario: Department export
- **WHEN** a `DEPT_HEAD` exports performance data
- **THEN** the generated workbook contains only the authorized department data

#### Scenario: Export covers the selected period
- **WHEN** an authorized viewer exports with several months selected
- **THEN** the generated workbook's audit tables and ranking cover every selected month

#### Scenario: Print covers the selected period
- **WHEN** a viewer prints their personal KPI report with several months selected
- **THEN** the generated PDF reports the totals and events of every selected month

## ADDED Requirements

### Requirement: Personal dashboard period aggregate
The Personal KPI Dashboard SHALL report the selected period as one aggregate: the total KPI score summed across the selected months, the summary counters summed across the months that reported, the attendance rate averaged over those months, the score composition and the recent events drawn from every selected month, and a trend chart plotting each selected month. The score card SHALL name the selected period.

#### Scenario: Aggregated score card
- **WHEN** more than one month is selected
- **THEN** the score card shows the sum of the selected months' total KPI scores and names the selected period

#### Scenario: Events across the selected months
- **WHEN** several months are selected and each of them recorded score events
- **THEN** the score composition and the recent events list cover the events of all selected months

#### Scenario: Summary counters are summed
- **WHEN** several months are selected
- **THEN** the period summary reports the summed counters of the months that recorded a summary

#### Scenario: Months without a summary contribute nothing
- **WHEN** a selected month has no recorded summary
- **THEN** it adds nothing to the aggregate and plots as a zero-height bar

### Requirement: Shared Performance period selection
The Performance app SHALL own one period selection, and every Performance surface SHALL read that same selection. The selection SHALL consist of a time frame and the set of selected periods of that frame, and SHALL expand to an ordered, de-duplicated list of months that every Performance read covers. Changing the time frame SHALL reset the selected periods to the current period of the new frame.

#### Scenario: One selection drives every surface
- **WHEN** the viewer changes the selected period on the Performance app
- **THEN** the Audit chart and table, the Personal KPI Dashboard, the print action, and the export action all cover the newly selected months

#### Scenario: Selection expands to months
- **WHEN** a quarter and a month of another year are selected
- **THEN** the selection covers the quarter's three months together with the selected month, with no month counted twice

#### Scenario: Changing the time frame resets the periods
- **WHEN** the viewer switches from the Month time frame to the Year time frame
- **THEN** the selected periods become the current year

### Requirement: Audit role selection
The audit surface SHALL let a viewer narrow the employee-level rows to one or more roles, so rows of several roles can be displayed and compared at once. The role selection SHALL be offered only where the authorized rows expose more than one role, SHALL narrow only the rows the viewer may already read, and SHALL render role names rather than role codes.

#### Scenario: Several roles displayed together
- **WHEN** a viewer selects two roles on the audit surface
- **THEN** the chart and the table show the authorized rows of both roles and no other rows

#### Scenario: Role selection narrows only
- **WHEN** a viewer selects a role that holds no rows in the authorized scope
- **THEN** the surface shows the empty state rather than rows outside the authorized scope

#### Scenario: Role selection is not offered for a single-role scope
- **WHEN** the authorized rows expose only one role, such as an employee's own row
- **THEN** no role selection control is offered

#### Scenario: Role names, not codes
- **WHEN** the role selection opens
- **THEN** its options read the documented role names and no role code is rendered as the option's content
