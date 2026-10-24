# Spec Delta

## ADDED Requirements

### Requirement: A language switcher is available on every screen
The frame around every screen SHALL offer a language switcher, reachable on the sign-in screen and inside the authenticated shell, visible to every role, and it SHALL show which language is active.

#### Scenario: Switcher before sign-in
- **WHEN** a visitor opens the sign-in screen
- **THEN** a language switcher is available and changing it changes the sign-in screen's language

#### Scenario: Switcher for every role
- **WHEN** a signed-in viewer of any role opens any app
- **THEN** the language switcher is reachable and reflects the language the viewer chose
