# Spec Delta

## ADDED Requirements

### Requirement: Authenticated sign-in and session
The system SHALL authenticate users with their email and password, establish a session for the authenticated viewer, protect app routes, and clear the viewer on sign-out.

#### Scenario: Successful sign-in
- **WHEN** a user submits valid credentials
- **THEN** the authenticated viewer is established and the role-aware dashboard opens

#### Scenario: Protected route without a session
- **WHEN** an unauthenticated user opens an app route
- **THEN** the user is redirected to sign-in

#### Scenario: Sign out
- **WHEN** the viewer signs out
- **THEN** the session is ended and the sign-in page opens

## MODIFIED Requirements

### Requirement: Home Page Dashboard app launcher
The dashboard SHALL render Jobs, Planning, and Performance for every role; Settings for `SUPER_ADMIN` and `TECH_LEAD` with all menus and for `HR_MANAGER` with User Directory only; and Audit Log only for `SUPER_ADMIN` and `TECH_LEAD`.

#### Scenario: Employee launcher
- **WHEN** an `EMPLOYEE` views the dashboard
- **THEN** entries for Jobs, Planning, and Performance are shown and no Settings or Audit Log entry appears

#### Scenario: HR launcher
- **WHEN** an `HR_MANAGER` views the dashboard
- **THEN** Jobs, Planning, Performance, and Settings entries appear, Settings leads only to the User Directory, and Audit Log is absent

#### Scenario: Admin launcher
- **WHEN** a `SUPER_ADMIN` or `TECH_LEAD` views the dashboard
- **THEN** all five apps appear, including Audit Log

### Requirement: Global layout applies the DESIGN.md theme
Every screen SHALL follow the light IBM Carbon direction in `DESIGN.md`: white surfaces, charcoal ink, a single IBM Blue `#0f62fe` accent, flat-square corners, hairline borders, and IBM Plex Sans typography. Shared layout and semantic state colors SHALL remain consistent across apps, and where `AGENTS.md` still summarises the theme as dark, `DESIGN.md` is authoritative.

#### Scenario: Theme conformance
- **WHEN** any screen renders
- **THEN** the screen uses the white canvas, charcoal ink, IBM Blue accents, flat-square corners, and IBM Plex Sans typography defined in `DESIGN.md`

#### Scenario: Footer inversion
- **WHEN** the footer renders on any screen
- **THEN** it uses an inverse charcoal surface with inverse ink while remaining distinguishable from the light page canvas

### Requirement: Top navigation with app switcher and user menu
The top navigation SHALL list the dashboard and only apps the viewer's role may access, show the viewer's name, role, and department, and offer sign-out.

#### Scenario: Nav shows only permitted apps
- **WHEN** an `EMPLOYEE` opens the top navigation
- **THEN** only the dashboard, Jobs, Planning, and Performance are listed

#### Scenario: Technical role sees Audit Log
- **WHEN** a `TECH_LEAD` opens the top navigation
- **THEN** Audit Log is listed with the other permitted apps

#### Scenario: Sign out
- **WHEN** the viewer signs out from the user menu
- **THEN** the viewer's session is ended and the sign-in page opens

## REMOVED Requirements

### Requirement: Demo sign-in with role selection
The system SHALL present a sign-in page offering one demo account per role (`SUPER_ADMIN`, `TECH_LEAD`, `HR_MANAGER`, `DEPT_HEAD`, `EMPLOYEE`), showing each account's name, email, role, and department. Selecting an account SHALL establish that user as the viewer for the page session. No password SHALL be required in this mock-data prototype.

#### Scenario: Sign-in lands on the Home Page Dashboard
- **WHEN** a reviewer selects a demo account on the sign-in page
- **THEN** that user becomes the viewer and the Home Page Dashboard opens

#### Scenario: App routes require a viewer
- **WHEN** an app route is opened with no viewer established in the page session
- **THEN** the app redirects to the sign-in page

#### Scenario: Session is ephemeral
- **WHEN** the browser is reloaded
- **THEN** the viewer is cleared and the sign-in page is shown again

**Reason**: The full system uses authenticated API sessions rather than passwordless, page-local role selection.
**Migration**: Use the authenticated sign-in flow; development seed accounts may remain available for local testing.
