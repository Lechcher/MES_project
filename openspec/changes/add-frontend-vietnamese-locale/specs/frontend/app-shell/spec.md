# Spec Delta

## MODIFIED Requirements

### Requirement: Authenticated sign-in and session
The system SHALL authenticate users with their email and password, establish a session for the authenticated viewer, protect app routes, and clear the viewer on sign-out. The sign-in screen's text SHALL render in the viewer's selected language, and the language choice SHALL be available from that screen before the viewer has a session.

#### Scenario: Successful sign-in
- **WHEN** a user submits valid credentials
- **THEN** the authenticated viewer is established and the role-aware dashboard opens

#### Scenario: Protected route without a session
- **WHEN** an unauthenticated user opens an app route
- **THEN** the user is redirected to sign-in

#### Scenario: Sign out
- **WHEN** the viewer signs out
- **THEN** the session is ended and the sign-in page opens

#### Scenario: Sign-in screen in the selected language
- **WHEN** an unauthenticated viewer has selected Vietnamese and reaches the sign-in page
- **THEN** the sign-in page renders its headings, labels, buttons, and messages in Vietnamese and offers both languages to switch between

### Requirement: Home Page Dashboard app launcher
The dashboard SHALL render Jobs, Planning, and Performance for every role; Settings for `SUPER_ADMIN` and `TECH_LEAD` with all menus and for `HR_MANAGER` with User Directory only; and Audit Log only for `SUPER_ADMIN` and `TECH_LEAD`. Each tile's name and description SHALL render in the viewer's selected language.

#### Scenario: Employee launcher
- **WHEN** an `EMPLOYEE` views the dashboard
- **THEN** entries for Jobs, Planning, and Performance are shown and no Settings or Audit Log entry appears

#### Scenario: HR launcher
- **WHEN** an `HR_MANAGER` views the dashboard
- **THEN** Jobs, Planning, Performance, and Settings entries appear, Settings leads only to the User Directory, and Audit Log is absent

#### Scenario: Admin launcher
- **WHEN** a `SUPER_ADMIN` or `TECH_LEAD` views the dashboard
- **THEN** all five apps appear, including Audit Log

#### Scenario: Launcher copy in the selected language
- **WHEN** a Vietnamese-selected viewer opens the dashboard
- **THEN** each tile's title and description reads in Vietnamese while listing exactly the apps that viewer's role may access

### Requirement: Global layout applies the DESIGN.md theme
Every screen SHALL follow the light IBM Carbon direction in `DESIGN.md`: white surfaces, charcoal ink, a single IBM Blue `#0f62fe` accent, flat-square corners, hairline borders, and IBM Plex Sans typography. Shared layout and semantic state colors SHALL remain consistent across apps, and where `AGENTS.md` still summarises the theme as dark, `DESIGN.md` is authoritative. The layout SHALL carry the selected language's typeface subset and declare it on the document, so both languages keep the documented typography intact.

#### Scenario: Theme conformance
- **WHEN** any screen renders
- **THEN** the screen uses the white canvas, charcoal ink, IBM Blue accents, flat-square corners, and IBM Plex Sans typography defined in `DESIGN.md`

#### Scenario: Footer inversion
- **WHEN** the footer renders on any screen
- **THEN** it uses an inverse charcoal surface with inverse ink while remaining distinguishable from the light page canvas

#### Scenario: Document declares the active language
- **WHEN** any screen renders in Vietnamese
- **THEN** the document's language attribute declares Vietnamese while the page still uses the documented typeface with the subset Vietnamese needs

### Requirement: Top navigation with app switcher and user menu
The top navigation SHALL list the dashboard and only apps the viewer's role may access, show the viewer's name, role, and department, and offer sign-out. Its labels SHALL render in the viewer's selected language, and the user menu SHALL offer the language choice.

#### Scenario: Nav shows only permitted apps
- **WHEN** an `EMPLOYEE` opens the top navigation
- **THEN** only the dashboard, Jobs, Planning, and Performance are listed

#### Scenario: Technical role sees Audit Log
- **WHEN** a `TECH_LEAD` opens the top navigation
- **THEN** Audit Log is listed with the other permitted apps

#### Scenario: Sign out
- **WHEN** the viewer signs out from the user menu
- **THEN** the viewer's session is ended and the sign-in page opens

#### Scenario: Nav labels in the selected language
- **WHEN** a Vietnamese-selected viewer opens the top navigation
- **THEN** the app names, the dashboard link, the sign-out action, and the user menu labels read in Vietnamese, with the viewer's own name and department still shown as they were entered

#### Scenario: Language choice lives in the user menu
- **WHEN** a signed-in viewer opens the user menu
- **THEN** it offers English and Vietnamese, and the current language is indicated
