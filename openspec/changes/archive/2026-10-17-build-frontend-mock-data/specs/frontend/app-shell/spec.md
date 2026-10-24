# Spec Delta

## Purpose

The frame around every screen: demo sign-in offering one account per role, the role-gated Home Page Dashboard app launcher, the global layout applying the current DESIGN.md light IBM Carbon theme, and role-aware navigation across the MES apps.

## ADDED Requirements

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

### Requirement: Home Page Dashboard app launcher
The dashboard SHALL render one entry per in-scope app the viewer's role may access, per the Layer-1 access matrix: Jobs, Planning, and Performance for every role; Settings visible to `SUPER_ADMIN` and `TECH_LEAD` (all menus) and to `HR_MANAGER` (User Directory only). The Audit Log app is not part of this change and SHALL NOT be rendered; it ships with the `add-audit-log-module` change.

#### Scenario: Employee launcher
- **WHEN** an `EMPLOYEE` views the dashboard
- **THEN** entries for Jobs, Planning, and Performance are shown and no Settings entry appears

#### Scenario: HR launcher
- **WHEN** an `HR_MANAGER` views the dashboard
- **THEN** Jobs, Planning, Performance, and Settings entries appear, and Settings leads only to the User Directory

#### Scenario: Admin launcher
- **WHEN** a `SUPER_ADMIN` or `TECH_LEAD` views the dashboard
- **THEN** all four in-scope app entries appear, each leading to its app

### Requirement: Global layout applies the DESIGN.md theme
Every screen SHALL follow the current `DESIGN.md`: light canvas `#ffffff`, IBM Blue `#0f62fe` as the single accent, flat-square 0px corners on all buttons, cards, inputs, and containers, IBM Plex Sans typography (weights 300/400/600), 1px hairline borders, no drop shadows, and a footer on the inverse charcoal canvas `#161616`. Semantic colors SHALL be success `#24a148`, warning `#f1c21b`, error `#da1e28`.

#### Scenario: Theme conformance
- **WHEN** any screen renders
- **THEN** the page background is white, primary actions use IBM Blue, corners are square, text is IBM Plex Sans, and no component casts a drop shadow

#### Scenario: Footer inversion
- **WHEN** the footer renders on any screen
- **THEN** it uses the inverse charcoal canvas with inverse ink tokens while the rest of the page stays light

### Requirement: Top navigation with app switcher and user menu
The top navigation SHALL list the dashboard and only the app entries the viewer's role may access, show the viewer's name, role, and department, and offer sign-out plus demo-account switching.

#### Scenario: Nav shows only permitted apps
- **WHEN** an `EMPLOYEE` opens the top navigation
- **THEN** only the dashboard, Jobs, Planning, and Performance are listed

#### Scenario: Sign out
- **WHEN** the viewer signs out from the user menu
- **THEN** the viewer is cleared and the sign-in page opens

### Requirement: Domain vocabulary rendered verbatim
The UI SHALL display domain tokens exactly as defined — ticket states `REQ`, `ACT`, `PEN`, `APP`, `REJ`, `CAN`, `OVERDUE` and leave codes `AL`, `UAL`, `SL`, `USL`, `PL`, `ML`, `CL`, `EL`, `LWP`, `TOIL`, `VTO` — with English UI text, without renaming, translation, or paraphrase.

#### Scenario: State badge shows the code
- **WHEN** a ticket in state `PEN` is displayed
- **THEN** its badge shows the code `PEN` with its documented name and Blue color

### Requirement: In-app header renders role-appropriate tabs and actions
Each app SHALL render an app header with the app name and its tabs and action buttons, and SHALL hide any tab, column, or action the viewer's role must not see (Layer-2 rendering), rather than disabling it.

#### Scenario: Role-hidden tab
- **WHEN** an `EMPLOYEE` opens the Planning app
- **THEN** the Approval Board tab is not rendered
