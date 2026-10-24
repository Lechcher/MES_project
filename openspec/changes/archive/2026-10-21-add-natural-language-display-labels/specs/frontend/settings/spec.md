# frontend/settings Specification

## MODIFIED Requirements

### Requirement: Org Structure management with Auto-forking
The Org Structure view SHALL show the department/division hierarchy (code, name, type shown as "Department" or "Division", parent, manager, active state) with create and edit actions, plus a per-department Auto-forking toggle controlling whether new tickets replicate to the department's members.

#### Scenario: Toggle Auto-forking
- **WHEN** a `SUPER_ADMIN` turns Auto-forking off for a department
- **THEN** the setting is saved in mock state and the Jobs create form no longer offers Auto-forking for that department
