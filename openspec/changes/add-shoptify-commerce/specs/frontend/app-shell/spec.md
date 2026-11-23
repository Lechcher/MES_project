# Spec Delta

## MODIFIED Requirements

### Requirement: Home Page Dashboard app launcher
The dashboard SHALL render Jobs, Planning, and Performance for every role; Settings for `SUPER_ADMIN` and `TECH_LEAD` with all menus and for `HR_MANAGER` with User Directory only; Audit Log only for `SUPER_ADMIN` and `TECH_LEAD`; and the shoptify app for every role granted commerce access by the permission matrix.

#### Scenario: Employee launcher
- **WHEN** an `EMPLOYEE` views the dashboard
- **THEN** entries for Jobs, Planning, and Performance are shown, and no Settings, Audit Log, or shoptify entry appears

#### Scenario: HR launcher
- **WHEN** an `HR_MANAGER` views the dashboard
- **THEN** Jobs, Planning, Performance, and Settings entries appear, Settings leads only to the User Directory, and Audit Log and shoptify are absent

#### Scenario: Admin launcher
- **WHEN** a `SUPER_ADMIN` or `TECH_LEAD` views the dashboard
- **THEN** all five apps appear, including Audit Log, and the shoptify app appears for every role granted commerce access

#### Scenario: Commerce-granted launcher
- **WHEN** a viewer whose role is granted commerce access views the dashboard
- **THEN** the shoptify entry appears with its name and description, and no shoptify entry appears for a viewer whose role is not granted commerce access

### Requirement: Top navigation with app switcher and user menu
The top navigation SHALL list the dashboard and only apps the viewer's role may access — including the shoptify app for roles granted commerce access — show the viewer's name, role, and department, and offer sign-out.

#### Scenario: Nav shows only permitted apps
- **WHEN** an `EMPLOYEE` opens the top navigation
- **THEN** only the dashboard, Jobs, Planning, and Performance are listed

#### Scenario: Technical role sees Audit Log
- **WHEN** a `TECH_LEAD` opens the top navigation
- **THEN** Audit Log is listed with the other permitted apps, and the shoptify app is listed only when that role is granted commerce access

#### Scenario: Sign out
- **WHEN** the viewer signs out from the user menu
- **THEN** the viewer's session is ended and the sign-in page opens