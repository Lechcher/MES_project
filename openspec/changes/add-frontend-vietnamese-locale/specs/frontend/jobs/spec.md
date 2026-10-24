# Spec Delta

## MODIFIED Requirements

### Requirement: Ticket rows show state badges and lifecycle flags
Each ticket row SHALL show its title, state badge in the documented color (`REQ` White, `ACT` Yellow, `PEN` Blue, `APP` Green, `REJ` Orange, `CAN` Red, `OVERDUE` Red (Warning)), priority, task type, progress percentage, assignee, department, project, and deadline, plus the applicable `ACT` secondary badge (`ACT - Urgent Processing`, `ACT - Progress Update (X%)`, `ACT - Awaiting Extension Approval`, `ACT - Awaiting Progress Verification`). No task-code column SHALL be rendered (record identifiers are not displayed; see `frontend/display-labels`). State badges SHALL show the state's natural-language name in the active locale, and the secondary badges SHALL read as the locale's "Active — Urgent Processing", "Active — Progress Update (X%)", "Active — Awaiting Extension Approval", and "Active — Awaiting Progress Verification", with the color mapping unchanged.

#### Scenario: Overdue row
- **WHEN** a ticket past its deadline with progress under 100% is listed
- **THEN** its badge shows the locale's overdue name in Red (Warning)

#### Scenario: Secondary badge
- **WHEN** an active ticket awaits an extension decision
- **THEN** its row shows the locale's "Active — Awaiting Extension Approval" badge
