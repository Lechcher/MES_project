# Spec Delta

## Purpose

Defines how the authenticated shell declares that a navigation into it may block
the immediately rendered UI, and how it composes the interactive elements of its
account menu, so the shell navigates predictably and renders valid HTML.

## ADDED Requirements

### Requirement: Authenticated tree declares blocking navigation

The authenticated screen tree SHALL declare that a navigation into it may block
the immediately rendered UI, because the viewer is resolved in the browser after
the response is sent. The declaration SHALL cover only the authenticated tree;
screens reachable without a session SHALL remain subject to the development
server's navigation-instantness validation.

#### Scenario: Viewer is resolved after the response

- **WHEN** an authenticated screen is opened in the browser
- **THEN** the shell shows its session-loading state before the viewer's content
  appears, because the viewer is resolved in the browser

#### Scenario: Development server reports no dropped segment

- **WHEN** the development server validates the authenticated screen tree
- **THEN** it reports no failure that a segment was dropped from rendering and no
  navigation-instantness error for that tree

#### Scenario: Public screens are not opted out

- **WHEN** a screen reachable without a session is opened
- **THEN** it renders its own content immediately and shows no session-loading
  state

#### Scenario: Navigation between authenticated screens renders

- **WHEN** the viewer navigates from one authenticated screen to another
- **THEN** the destination screen renders with the viewer's content as before

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
