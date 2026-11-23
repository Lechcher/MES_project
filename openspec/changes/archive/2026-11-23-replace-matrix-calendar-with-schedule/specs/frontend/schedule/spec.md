# Spec Delta

## Purpose

The Planning Schedule screen: a resource timeline where planners view, create, edit, move, copy, import, and export employee work tickets across a chosen time range.

## ADDED Requirements

### Requirement: Schedule layout
The Schedule SHALL show a top bar (range navigation, scale toggle, range picker, department filter, actions), a left column of employees grouped by department, and a grid with one row per employee and one column per time unit of the active scale.

#### Scenario: Rows and columns
- **WHEN** a viewer opens the Schedule in Week scale
- **THEN** each visible employee has one row and the grid shows the seven days of the current week

### Requirement: Time scales
The Schedule SHALL support Day (hour columns), Week (day columns), Month (day columns), and Year (month columns) scales, default to Week, and offer previous, today, and next navigation that moves by one unit of the active scale.

#### Scenario: Default scale
- **WHEN** a viewer opens the Schedule for the first time
- **THEN** the Week scale is active and the current week is shown

#### Scenario: Navigate next
- **WHEN** the Month scale is active and the viewer presses next
- **THEN** the following calendar month is shown

### Requirement: Custom date range
The Schedule SHALL let the viewer enter a start and end date in `DD/MM/YYYY` format and SHALL reject a range whose end precedes its start or whose dates are invalid.

#### Scenario: Valid range
- **WHEN** the viewer enters `01/11/2026` to `15/11/2026`
- **THEN** the grid shows day columns from 1 to 15 November 2026

#### Scenario: Reversed range
- **WHEN** the viewer enters an end date before the start date
- **THEN** the range is not applied and an inline validation message is shown

### Requirement: Department filter
Viewers with company scope SHALL be able to filter rows to one department or all departments. A `DEPT_HEAD` SHALL see only their department; an `EMPLOYEE` SHALL see only their own row.

#### Scenario: Filter to a department
- **WHEN** an `HR_MANAGER` selects the Engineering department
- **THEN** only Engineering employees are listed as rows

#### Scenario: Employee view
- **WHEN** an `EMPLOYEE` opens the Schedule
- **THEN** the only row is that employee and no department filter is shown

### Requirement: Ticket categories are visually distinct
Ticket bars SHALL be styled by category: `DAILY` as a single-day task, `MULTI_DAY` as a bar spanning its days with a progress bar and percentage, and `HOURLY` as an urgent in-hour task showing its hour slot and an urgent marker. Each bar SHALL also show its state label.

#### Scenario: Multi-day progress
- **WHEN** a `MULTI_DAY` task at 40% spans three visible days
- **THEN** one bar covers those three days and shows a 40% progress bar

#### Scenario: Urgent in-hour task
- **WHEN** an `HOURLY` task is due at 14:00
- **THEN** its bar shows the urgent marker and the 14:00 slot

### Requirement: Leave and attendance marks on rows
Rows SHALL keep showing approved leave badges, penalty leave tags, and late/early-leave marks on the affected days.

#### Scenario: Leave on the schedule
- **WHEN** an employee has approved `AL` on a visible day
- **THEN** that day in the employee's row shows the Annual Leave badge

### Requirement: Task editor dialog
Writers SHALL create and edit tickets in a dialog with Details, Time, and Notes tabs covering title, category, priority (1–4 stars mapping `LOW`, `MEDIUM`, `HIGH`, `URGENT`), assignee, start and end, allocated hours, and internal notes. The dialog SHALL show the state tag and offer only the transitions the viewer may perform.

#### Scenario: Create from an empty cell
- **WHEN** a writer clicks an empty cell in an employee's row
- **THEN** the editor opens with that employee as assignee and that cell's time as start

#### Scenario: Read-only for non-writers
- **WHEN** an `EMPLOYEE` opens their own ticket
- **THEN** the fields are read-only and only the employee's existing task actions are offered

### Requirement: Delete and duplicate
Writers SHALL be able to delete a ticket after confirmation and duplicate a ticket into a new `REQ` ticket with the same fields.

#### Scenario: Duplicate
- **WHEN** a writer chooses Duplicate on a ticket
- **THEN** a new `REQ` ticket with the same title, category, priority, assignee, and dates appears in the same row

#### Scenario: Delete requires confirmation
- **WHEN** a writer chooses Delete and cancels the confirmation
- **THEN** the ticket remains on the schedule

### Requirement: Drag to move and copy
Writers SHALL be able to drag a ticket bar to another time unit or another employee row; the drop SHALL snap to the grid and save the new dates and assignee. Holding Alt (Option) while dropping SHALL create a copy instead of moving. Non-writers SHALL NOT be able to drag.

#### Scenario: Move to another day
- **WHEN** a writer drags a `DAILY` ticket from Monday to Wednesday in Week scale
- **THEN** the ticket's start and end move by two days and the bar renders on Wednesday

#### Scenario: Reassign by row
- **WHEN** a writer drops a ticket onto another employee's row
- **THEN** the ticket is assigned to that employee

#### Scenario: Failed save reverts
- **WHEN** the server rejects a move
- **THEN** the bar returns to its original position and an error message is shown

### Requirement: Bulk import
Writers SHALL be able to download an import template, upload a CSV or XLSX file, review a validation preview listing valid rows and per-row errors, and commit only when the preview has no errors.

#### Scenario: Preview with errors
- **WHEN** an uploaded file has a row with an unknown employee email
- **THEN** the preview marks that row with an error and the commit action is disabled

#### Scenario: Commit
- **WHEN** a file with only valid rows is committed
- **THEN** the tickets are created and appear on the schedule

### Requirement: Schedule report export
The Schedule SHALL export a report in PDF, CSV, or XLSX using the current department, date range, and an optional state filter.

#### Scenario: Export filtered report
- **WHEN** a viewer exports XLSX with state `ACT` for the current week
- **THEN** the downloaded file contains only `ACT` tickets in that range and the viewer's scope
