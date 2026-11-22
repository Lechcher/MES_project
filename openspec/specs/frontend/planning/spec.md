# frontend/planning Specification

## Purpose

The Planning & Attendance app screens: the role-scoped matrix work calendar with Gantt-like ticket bars and leave badges, leave request registration, the Approval Board queues, attendance and leave-fund summaries, penalty-leave assignment, and print/export entry points.

## Requirements

### Requirement: Matrix calendar scope follows the role matrix
The matrix calendar SHALL scope by role: `EMPLOYEE` sees a personal calendar; `DEPT_HEAD` sees their department's calendar; `HR_MANAGER`, `TECH_LEAD`, and `SUPER_ADMIN` see the company-wide calendar with a department filter. Rows SHALL be employees (grouped by department/division) and columns the days of the selected month.

#### Scenario: Personal calendar
- **WHEN** an `EMPLOYEE` opens the matrix calendar
- **THEN** the only row is that employee

#### Scenario: Company-wide with department filter
- **WHEN** an `HR_MANAGER` opens the matrix calendar and filters to one department
- **THEN** only that department's employees are shown as rows

### Requirement: Calendar renders ticket bars and day badges
The calendar SHALL render tickets as Gantt-like bars carrying the actual progress percentage and the state's English name (`Requested`, `Active`, `Pending`, `Approved`, `Rejected`, `Cancelled`, `Overdue`). Day cells SHALL display the official leave badge for approved leave under its documented name (Annual Leave, Sick Leave, Personal Leave, …) and SHALL be tagged with the penalty leave's name (Unapproved / Unpaid Annual Leave, Unexcused / Unpaid Sick Leave) for rejected or unauthorized absence, plus late and early-leave marks.

#### Scenario: Approved leave badge
- **WHEN** a day cell falls within an approved `AL` leave request
- **THEN** the cell shows the "Annual Leave" badge

#### Scenario: Penalty tag
- **WHEN** a day cell falls within unauthorized absence
- **THEN** the cell is tagged "Unexcused / Unpaid Sick Leave" or "Unapproved /
  Unpaid Annual Leave"

#### Scenario: Ticket bar
- **WHEN** an `ACT` task spans the visible days at 60% progress
- **THEN** its bar shows "Active" and 60%

### Requirement: Create Leave Request form
Every role SHALL be able to register a leave request selecting a leave code (`AL`, `SL`, `PL`, `ML`, `CL`, `EL`, `LWP`, `TOIL`, `VTO`), start and end dates, total days, reason, attachment, and handover person. Submitted requests SHALL start `PENDING`.

#### Scenario: Submit a request
- **WHEN** an `EMPLOYEE` submits an `AL` request with a handover person
- **THEN** the request is created `PENDING` and appears in the approvers' leave queue

### Requirement: Approval Board visibility by role
The Approval Board SHALL be hidden for `EMPLOYEE`. `DEPT_HEAD` SHALL see the Department Work Approval and Department Leave Request Approval queues; `HR_MANAGER` and `SUPER_ADMIN` SHALL see the System-wide Approval Board plus the penalty-leave function, as shall `TECH_LEAD` without the penalty-leave function.

#### Scenario: Employee sees no board
- **WHEN** an `EMPLOYEE` opens the Planning app
- **THEN** no Approval Board tab is rendered

#### Scenario: Department Head queues
- **WHEN** a `DEPT_HEAD` opens the Approval Board
- **THEN** department work-approval and leave-approval queues are shown, scoped to the department

### Requirement: Work approval queue applies KPI effects
The work queue SHALL list tickets in `PEN` with Approve (moves to `APP`, awards KPI points) and Return (moves to `REJ`, deducts KPI points) actions, plus a second queue listing pending extension and late-submission requests with their approve/reject actions.

#### Scenario: Approve a report
- **WHEN** an approver approves a `PEN` report that was on time
- **THEN** the ticket becomes `APP` and a positive KPI score event is recorded

#### Scenario: Return a report
- **WHEN** an approver returns a `PEN` report
- **THEN** the ticket becomes `REJ` and a KPI penalty event is recorded

### Requirement: Penalty leave restricted to HR and Super Admin
Assigning `UAL`/`USL` SHALL be offered only to `HR_MANAGER` and `SUPER_ADMIN`; other roles SHALL NOT see the action. Penalty assignment SHALL tag the affected days and record the wage and KPI deduction consequences in the mock data.

#### Scenario: HR assigns a penalty
- **WHEN** an `HR_MANAGER` assigns `USL` to an absence
- **THEN** the affected day cells are tagged `USL`

#### Scenario: Manager cannot assign penalties
- **WHEN** a `TECH_LEAD` opens the Approval Board
- **THEN** no penalty-leave assignment action is offered

### Requirement: Attendance summary and leave-fund balances
The app SHALL show an attendance summary for the viewer's scope — check-in/out, late and early-leave flags, working hours, and the English leave name per record — plus each person's `AL Balance` and `TOIL Balance`.

#### Scenario: Balances listed
- **WHEN** an `HR_MANAGER` opens the attendance summary
- **THEN** every company employee row shows that person's `AL Balance` and `TOIL Balance`

### Requirement: Planning print/export entry points
The app SHALL offer Print (a generated A4 leave request with signature placeholder and A4 landscape monthly attendance calendar) and Export (a generated `.xlsx` attendance summary and remaining-leave-fund table). Outputs SHALL be limited to the viewer's authorized scope (`DEPT_HEAD` department-only; `EMPLOYEE` own request only).

#### Scenario: Export attendance
- **WHEN** a reviewer presses Export on the attendance summary
- **THEN** a generated `.xlsx` file contains the scoped attendance and remaining-leave-fund data

#### Scenario: Employee prints leave request
- **WHEN** an `EMPLOYEE` prints a leave request
- **THEN** an A4 PDF is generated for that employee's own request

### Requirement: Planning page segment declares instant navigation may block
The planning page segment SHALL declare that a navigation into it may block the immediately rendered UI, because the viewer is resolved in the browser after the response is sent. This declaration covers only the planning page segment; screens reachable without a session SHALL remain subject to the development server's navigation-instantness validation.

#### Scenario: Viewer is resolved after the response
- **WHEN** the planning page is opened in the browser
- **THEN** the shell shows its session-loading state before the viewer's content appears, because the viewer is resolved in the browser

#### Scenario: Development server reports no dropped segment
- **WHEN** the development server validates the planning page segment
- **THEN** it reports no failure that a segment was dropped from rendering and no navigation-instantness error for that segment

#### Scenario: Instant navigation declaration is present
- **WHEN** the planning page segment configuration is inspected
- **THEN** it declares `export const instant = false`

### Requirement: Schedule grid fits the viewport and scrolls horizontally
The schedule grid SHALL fit within the available viewport width rather than
stretching the page, and SHALL scroll its time axis horizontally inside the
grid so every time column and ticket bar is reachable. The page itself SHALL
NOT scroll horizontally because of the schedule.

#### Scenario: Timeline wider than the viewport
- **WHEN** the schedule's time columns exceed the viewport width (for example the DAY scale's 24 hour columns in a narrow window)
- **THEN** the grid body scrolls horizontally so every column and ticket bar can be brought into view, and the page's own horizontal scroll does not extend beyond the viewport

#### Scenario: Employee column stays pinned while the timeline scrolls
- **WHEN** the grid body is scrolled horizontally
- **THEN** the employee column stays fixed at the left edge of the grid and remains readable, and the column headers stay aligned with the rows

#### Scenario: Timeline narrower than the viewport
- **WHEN** the schedule's time columns fit within the available width (for example the MONTH scale's five day columns)
- **THEN** the grid renders at the available width without an unnecessary horizontal scroll area

### Requirement: Ticket bar continuation chevrons stand clear of bar content
A ticket bar's continues-before and continues-after chevrons SHALL render at
the bar's edges with spacing that keeps them clear of the bar's content — the
category icon, task code, and trailing labels — so a continuation hint never
overlaps the ticket text. The chevrons SHALL stay visible and edge-anchored at
every bar width.

#### Scenario: Chevron does not overlap the ticket's content
- **WHEN** a bar whose ticket starts before the visible range (or ends after it) renders its continuation chevron
- **THEN** the chevron's box does not intersect the bar's content boxes and a visible gap separates the chevron from the nearest icon or label

#### Scenario: Chevron stays readable on a narrow bar
- **WHEN** a bar is too narrow to show its text labels
- **THEN** its continuation chevron still renders at the bar's edge without being clipped by the bar's content

### Requirement: Calendar range band is visible in every theme
In the date-range calendar, the days between the selected from and to dates
SHALL render on a band surface that is visibly distinct from the calendar's
background in every active theme, the band SHALL read as continuous between
the two endpoint days, and the endpoint days SHALL keep reading as the
selected bounds.

#### Scenario: In-between days show a band in the dark theme
- **WHEN** a range spanning several days is shown and the app renders in the dark theme
- **THEN** the days between the from and to dates show a band whose color differs from the calendar's background, continuous from the start day to the end day

#### Scenario: In-between days show a band in the light theme
- **WHEN** the same range is shown and the app renders in the light theme
- **THEN** the in-between days show a band distinct from the calendar's background, preserving the light theme's existing appearance
