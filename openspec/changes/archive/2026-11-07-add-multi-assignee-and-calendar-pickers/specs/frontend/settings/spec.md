# Spec Delta

## REMOVED Requirements

### Requirement: Org Structure management with Auto-forking
**Reason:** The per-department Auto-forking toggle is retired with the Auto-forking feature itself (the setting was reachable only by HQ technical roles and is replaced by explicit multi-assignee selection at ticket creation). The hierarchy management behavior it also covered survives in the added requirement below.
**Migration:** Manage departments without a forking option; assign tickets to specific employees when creating them.

## ADDED Requirements

### Requirement: Org Structure management
The Org Structure view SHALL show the department/division hierarchy (code, name, type shown as "Department" or "Division", parent, manager, active state) with create and edit actions.

#### Scenario: Hierarchy rows render
- **WHEN** an admin opens the Org Structure view
- **THEN** each department/division row shows its code, name, type, parent, manager, and active state, with an edit action
