# Spec Delta

## ADDED Requirements

### Requirement: Planning opens on the Schedule
The Planning app's first tab SHALL be the Schedule (see `frontend/schedule`) and SHALL replace the matrix calendar.

#### Scenario: Schedule tab
- **WHEN** any role opens the Planning app
- **THEN** the first tab is Schedule and shows the Week scale

## REMOVED Requirements

### Requirement: Matrix calendar scope follows the role matrix
**Reason**: Replaced by the Schedule, which keeps the same role scoping (`frontend/schedule` "Department filter").
**Migration**: Use the Schedule tab; personal, department, and company scopes are unchanged.

### Requirement: Calendar renders ticket bars and day badges
**Reason**: Replaced by the Schedule's ticket categories and leave/attendance marks (`frontend/schedule` "Ticket categories are visually distinct" and "Leave and attendance marks on rows").
**Migration**: Ticket bars, state names, progress, leave badges, penalty tags, and late/early marks render on Schedule rows.
