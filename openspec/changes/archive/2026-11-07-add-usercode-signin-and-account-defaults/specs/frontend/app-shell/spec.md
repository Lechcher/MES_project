# Spec Delta

## MODIFIED Requirements

### Requirement: Authenticated sign-in and session
The system SHALL authenticate users with their email and password or their user code and password, establish a session for the authenticated viewer, protect app routes, and clear the viewer on sign-out.

#### Scenario: Successful sign-in
- **WHEN** a user submits valid credentials
- **THEN** the authenticated viewer is established and the role-aware dashboard opens

#### Scenario: Sign in with a user code
- **WHEN** a user submits a valid user code and password
- **THEN** the authenticated viewer is established and the role-aware dashboard opens

#### Scenario: Protected route without a session
- **WHEN** an unauthenticated user opens an app route
- **THEN** the user is redirected to sign-in

#### Scenario: Sign out
- **WHEN** the viewer signs out
- **THEN** the session is ended and the sign-in page opens

#### Scenario: Unknown identifier fails neutrally
- **WHEN** a user submits an identifier that is neither a known email nor a known user code
- **THEN** the sign-in fails with the same invalid-credentials error a wrong password produces

## ADDED Requirements

### Requirement: The user dropdown trigger names the viewer's code
The navigation's user dropdown trigger SHALL show the viewer's user code beside their name, so the account in use is identifiable at a glance.

#### Scenario: Code beside the name
- **WHEN** a signed-in viewer sees the navigation's user dropdown trigger
- **THEN** their user code is shown beside their full name

#### Scenario: Every role sees their own code
- **WHEN** a viewer of any role signs in
- **THEN** the trigger shows that viewer's own code
