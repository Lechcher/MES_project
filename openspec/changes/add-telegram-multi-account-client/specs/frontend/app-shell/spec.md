# Spec Delta

## MODIFIED Requirements

### Requirement: Home Page Dashboard app launcher
The dashboard SHALL render Jobs, Planning, and Performance for every role; Settings for `SUPER_ADMIN` and `TECH_LEAD` with all menus and for `HR_MANAGER` with User Directory only; and Audit Log only for `SUPER_ADMIN` and `TECH_LEAD`. The dashboard SHALL also render Telegram for every role — it is a viewer-personal workspace whose data is scoped to the viewer's own linked Telegram accounts, so no role is excluded from the launcher entry.

#### Scenario: Employee launcher
- **WHEN** an `EMPLOYEE` views the dashboard
- **THEN** entries for Jobs, Planning, Performance, and Telegram are shown and no Settings or Audit Log entry appears

#### Scenario: HR launcher
- **WHEN** an `HR_MANAGER` views the dashboard
- **THEN** Jobs, Planning, Performance, Telegram, and Settings entries appear, Settings leads only to the User Directory, and Audit Log is absent

#### Scenario: Admin launcher
- **WHEN** a `SUPER_ADMIN` or `TECH_LEAD` views the dashboard
- **THEN** all six apps appear, including Audit Log and Telegram

#### Scenario: Telegram opens the viewer's own workspace
- **WHEN** a viewer of any role opens the Telegram module from the launcher
- **THEN** the viewer's own linked Telegram accounts are offered and no other viewer's accounts can be reached from the surface