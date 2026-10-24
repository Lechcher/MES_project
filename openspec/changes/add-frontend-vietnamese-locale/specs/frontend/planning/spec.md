# Spec Delta

## MODIFIED Requirements

### Requirement: Calendar renders ticket bars and day badges
The calendar SHALL render tickets as Gantt-like bars carrying the actual progress percentage and the state's natural-language name in the active locale (`Requested`, `Active`, `Pending`, `Approved`, `Rejected`, `Cancelled`, `Overdue` in English). Day cells SHALL display the approved leave's badge under its natural-language name in the active locale (Annual Leave, Sick Leave, Personal Leave, … in English) and SHALL be tagged with the penalty leave's natural-language name for rejected or unauthorized absence, plus late and early-leave marks.

#### Scenario: Approved leave badge
- **WHEN** a day cell falls within an approved `AL` leave request
- **THEN** the cell shows the locale's annual-leave badge ("Annual Leave" in English)

#### Scenario: Penalty tag
- **WHEN** a day cell falls within unauthorized absence
- **THEN** the cell is tagged with the locale's penalty-leave name ("Unexcused / Unpaid Sick Leave" or "Unapproved / Unpaid Annual Leave" in English)

#### Scenario: Ticket bar
- **WHEN** an `ACT` task spans the visible days at 60% progress
- **THEN** its bar shows the locale's active-state name and 60%

### Requirement: Attendance summary and leave-fund balances
The app SHALL show an attendance summary for the viewer's scope — check-in/out, late and early-leave flags, working hours, and the leave name per record in the active locale — plus each person's `AL Balance` and `TOIL Balance`.

#### Scenario: Balances listed
- **WHEN** an `HR_MANAGER` opens the attendance summary
- **THEN** every company employee row shows that person's `AL Balance` and `TOIL Balance`
