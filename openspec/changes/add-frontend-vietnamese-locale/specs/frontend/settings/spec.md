# Spec Delta

## MODIFIED Requirements

### Requirement: Org Structure management with Auto-forking
The Org Structure view SHALL show the department/division hierarchy (code, name, type shown under its natural-language name in the active locale, parent, manager, active state) with create and edit actions, plus a per-department Auto-forking toggle controlling whether new tickets replicate to the department's members.

#### Scenario: Toggle Auto-forking
- **WHEN** a `SUPER_ADMIN` turns Auto-forking off for a department
- **THEN** the setting is persisted and subsequent Jobs ticket creation does not offer or perform Auto-forking for that department

#### Scenario: Department type in Vietnamese
- **WHEN** a `TECH_LEAD` opens Org Structure in Vietnamese
- **THEN** each row's type column reads the Vietnamese type name, not the code
