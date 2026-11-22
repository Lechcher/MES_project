# Spec Delta

## Purpose

The Planning Schedule screen: how ticket bars are colored, sized and packed on its rows, and how the task editor collects a ticket's time so the schedule never promises time it does not have.

## ADDED Requirements

### Requirement: Ticket bars use a light fill with a state-colored border
Ticket bars SHALL render on a light neutral surface with a 1 px border in their ticket-state color (`REQ` dark, `ACT` yellow, `PEN` blue, `APP` green, `REJ`/`CAN`/`OVERDUE` red) and dark text. The category SHALL keep its colored left stripe and icon, and each bar SHALL expose its state, dates and assignee through its accessible label and tooltip.

#### Scenario: Requested bar is readable
- **WHEN** a `REQ` ticket is drawn on the schedule
- **THEN** its bar has a light fill, a dark 1 px border, and dark text

#### Scenario: Category stays independent of state
- **WHEN** an `HOURLY` `PEN` ticket and a `MULTI_DAY` `PEN` ticket are drawn side by side
- **THEN** both bars carry a `PEN`-colored border and each keeps its own category stripe and icon

#### Scenario: Overdue bar keeps its border color
- **WHEN** an `OVERDUE` ticket is drawn on the schedule
- **THEN** its bar keeps the `#da1e28` 1 px border and does not turn into a solid red block

### Requirement: Ticket bar span matches the scheduled dates
A ticket bar's rendered width SHALL match its scheduled interval: a `DAILY` bar SHALL cover exactly one day column, an `HOURLY` bar SHALL cover exactly its `startDate` to `endDate` hour range, and a `MULTI_DAY` bar SHALL cover exactly its inclusive start day through end day. A clipped bar SHALL stop at the first or last visible column and carry a continuation indicator; it SHALL NOT extend past the visible range nor widen beyond the scheduled interval.

#### Scenario: Daily ticket spans one day
- **WHEN** a `DAILY` ticket whose `endDate` falls after midnight on its start day is drawn in Week scale
- **THEN** its bar covers exactly the one day column of its start day

#### Scenario: Hourly ticket spans its hours
- **WHEN** an `HOURLY` ticket runs 18:00 to 22:00 and the Day scale is active
- **THEN** its bar covers exactly the 4 hour columns from 18:00 through 22:00

#### Scenario: Hourly ticket is not stretched by a midnight end date
- **WHEN** an `HOURLY` ticket starts 21:00 on Monday and its `endDate` is stored as 04:00 on Tuesday
- **THEN** the Monday part of its bar covers 21:00 to 24:00 with a continues-later indicator

### Requirement: Ticket bar label states its scheduled range
A ticket bar's label SHALL state its scheduled range in its category's unit — an `HOURLY` bar SHALL show its start and end hour, a `DAILY` bar SHALL show its date, and a `MULTI_DAY` bar SHALL show its start and end date — followed by the short code, title and state label as the bar's width allows, truncated when the bar is narrow.

#### Scenario: Wide multi-day bar shows both dates
- **WHEN** a `MULTI_DAY` ticket running 12/10 to 14/10 is drawn in Week scale
- **THEN** its bar shows 12/10 and 14/10 plus the ticket code and title

#### Scenario: Narrow daily bar truncates its inner text
- **WHEN** a wide-screen Year scale renders one chip per month for a `DAILY` ticket
- **THEN** the chip is truncated without clipping the bar itself or breaking the row's alignment

### Requirement: Schedule rows grow to fit every ticket
Schedule rows SHALL stack their tickets into lanes, with tickets that do not overlap in time sharing a lane and overlapping tickets taking the next lane. A row's height SHALL be the base row height times its highest used lane, so every ticket in the row stays fully visible and no bar overlaps another. The employee cell SHALL span the full row height.

#### Scenario: Employee with three overlapping tickets
- **WHEN** one employee has three tickets that all overlap the same hour in Day scale
- **THEN** the row holds three stacked bars and its height is three times the base row height

#### Scenario: Employee with sequential tickets
- **WHEN** one employee has two tickets that do not overlap
- **THEN** both bars sit in the same lane and the row keeps the base row height

#### Scenario: Dragging to a row with several lanes
- **WHEN** a writer drops a ticket onto an employee whose row has three lanes
- **THEN** the drop snaps to the row, renders in a free lane, and does not hide the row's other bars

### Requirement: Task editor is one full-page form
The task editor SHALL present every ticket field on a single page — title, category, priority, assignee, start, end, internal notes, the state tag with exactly the transitions the viewer may perform, and the duplicate and delete actions — with no tab navigation and without hiding any field behind a switch.

#### Scenario: Writer opens an existing ticket
- **WHEN** a writer opens a `MULTI_DAY` ticket for editing
- **THEN** title, category, priority, assignee, start, end, notes, the state tag, and the duplicate and delete actions are all visible together on one page

#### Scenario: Reader opens their own ticket
- **WHEN** an `EMPLOYEE` opens one of their own tickets
- **THEN** the fields are read-only, the same single page is used, and only the employee's existing task actions are offered

### Requirement: Task editor time entry follows the category
Time entry SHALL be limited by the ticket's category: `DAILY` offers a single day and its end is the end of that day; `MULTI_DAY` offers a start day and a separate end day; `HOURLY` offers a start hour and an end hour on the same day. `DAILY` and `HOURLY` SHALL NOT offer a separate end day. The editor SHALL reject an end that is not after its start and SHALL show the resulting duration.

#### Scenario: Hourly ticket picks hours
- **WHEN** a writer creates an `HOURLY` ticket on 20/10/2026 at 13:00
- **THEN** the editor shows a start hour and an end hour for 20/10/2026 and no end-day field

#### Scenario: Daily ticket has no end day
- **WHEN** a writer creates a `DAILY` ticket on 20/10/2026
- **THEN** the editor shows only that day and states that the ticket ends at the end of 20/10/2026

#### Scenario: Multi-day ticket picks a range
- **WHEN** a writer creates a `MULTI_DAY` ticket from 20/10/2026 to 24/10/2026
- **THEN** the editor shows both the start day and the end day

#### Scenario: Category change keeps a valid interval
- **WHEN** a writer changes a `DAILY` ticket to `HOURLY` before saving
- **THEN** the editor offers an end hour for the same day and keeps the interval valid

#### Scenario: End hour before start hour is rejected
- **WHEN** an `HOURLY` ticket has an end hour earlier than its start hour on the same day
- **THEN** the editor shows the end-before-start message and does not save

### Requirement: Task editor scrolls inside its dialog
Whenever the task editor's content is wider than its dialog, its form SHALL scroll horizontally inside the dialog, and it SHALL scroll vertically when the content is taller, with the dialog header and its cancel and save actions remaining reachable without resizing the window.

#### Scenario: Editor wider than the window
- **WHEN** a writer opens the editor on a narrow window
- **THEN** the form scrolls horizontally inside the dialog and the save action stays reachable
