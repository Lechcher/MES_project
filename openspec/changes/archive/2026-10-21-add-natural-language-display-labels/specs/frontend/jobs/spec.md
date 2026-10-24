# frontend/jobs Specification

## MODIFIED Requirements

### Requirement: Ticket rows show state badges and lifecycle flags
Each ticket row SHALL show its title, state badge in the documented color (`REQ` White, `ACT` Yellow, `PEN` Blue, `APP` Green, `REJ` Orange, `CAN` Red, `OVERDUE` Red (Warning)), priority, task type, progress percentage, assignee, department, project, and deadline, plus the applicable `ACT` secondary badge (`ACT - Urgent Processing`, `ACT - Progress Update (X%)`, `ACT - Awaiting Extension Approval`, `ACT - Awaiting Progress Verification`). No task-code column SHALL be rendered (record identifiers are not displayed; see `frontend/display-labels`). State badges SHALL show the English state name and the secondary badges SHALL read "Active — Urgent Processing", "Active — Progress Update (X%)", "Active — Awaiting Extension Approval", and "Active — Awaiting Progress Verification", with the color mapping unchanged.

#### Scenario: Overdue row
- **WHEN** a ticket past its deadline with progress under 100% is listed
- **THEN** its badge shows "Overdue" in Red (Warning)

#### Scenario: Secondary badge
- **WHEN** an active ticket awaits an extension decision
- **THEN** its row shows the "Active — Awaiting Extension Approval" badge

### Requirement: Extension request flow
An assignee SHALL be able to request an extension while the ticket is active and before its deadline passes, choosing a new deadline, reason, and evidence. While the request is pending, the ticket shows "Active — Awaiting Extension Approval". Approvers SHALL approve (deadline updated) or reject (original deadline kept).

#### Scenario: Extension approved
- **WHEN** an approver approves an extension request for a new deadline
- **THEN** the ticket's deadline is updated and the badge clears

#### Scenario: Extension rejected
- **WHEN** an approver rejects an extension request
- **THEN** the original deadline is kept
