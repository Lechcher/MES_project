# Spec Delta

## Purpose

Defines how the authenticated shell declares that a navigation into it may block
the immediately rendered UI, and how it composes the interactive elements of its
account menu, so the shell navigates predictably and renders valid HTML.

## ADDED Requirements

### Requirement: Authenticated screens declare blocking navigation

Each authenticated screen SHALL declare at its own route segment that a
navigation into it may block the immediately rendered UI, because the viewer is
resolved in the browser after the response is sent. The declaration SHALL apply
to the authenticated screens and SHALL NOT remove development-time
navigation-instantness validation from screens reachable without a session.

#### Scenario: Viewer is resolved after the response

- **WHEN** an authenticated screen is opened in the browser
- **THEN** the shell shows its session-loading state before the viewer's content
  appears, because the viewer is resolved in the browser

#### Scenario: Development server reports no dropped segment

- **WHEN** the development server validates an authenticated screen
- **THEN** it reports no failure that a segment was dropped from rendering and no
  navigation-instantness error for that screen

#### Scenario: Public screens keep validation

- **WHEN** the development server validates a screen reachable without a session
- **THEN** that screen is still subject to navigation-instantness validation and
  any defect found is reported

#### Scenario: Navigation between authenticated screens renders

- **WHEN** the viewer navigates from one authenticated screen to another
- **THEN** the destination screen renders with the viewer's content as before

#### Scenario: The screen still renders its content

- **WHEN** the viewer opens an authenticated screen after their session resolves
- **THEN** the screen renders the same content it rendered before the declaration
  was added, with no missing or duplicated region

### Requirement: Single interactive element for the account menu trigger

The authenticated shell's account menu SHALL present its trigger as a single
interactive element that displays the viewer's name and role and opens the menu.
The shell SHALL render valid HTML, so that hydration reports no interactive
element nested inside another.

#### Scenario: Trigger is one interactive element

- **WHEN** the shell renders the account menu
- **THEN** the trigger is one interactive element carrying the viewer's name and
  role, and no interactive element is nested inside it

#### Scenario: No nested-interactive-element hydration error

- **WHEN** the shell hydrates in the browser after sign-in
- **THEN** no error is reported that an interactive element is a descendant of
  another interactive element

#### Scenario: The menu still opens

- **WHEN** the viewer activates the account menu trigger
- **THEN** the menu opens and offers the viewer's account details and sign-out

#### Scenario: Sign out still works from the menu

- **WHEN** the viewer chooses sign-out from the open account menu
- **THEN** the session is ended and the sign-in page opens
