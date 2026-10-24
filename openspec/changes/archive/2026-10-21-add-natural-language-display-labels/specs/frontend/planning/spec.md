# frontend/planning Specification

## MODIFIED Requirements

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

### Requirement: Attendance summary and leave-fund balances
The app SHALL show an attendance summary for the viewer's scope — check-in/out, late and early-leave flags, working hours, and the English leave name per record — plus each person's `AL Balance` and `TOIL Balance`.

#### Scenario: Balances listed
- **WHEN** an `HR_MANAGER` opens the attendance summary
- **THEN** every company employee row shows that person's `AL Balance` and `TOIL Balance`
