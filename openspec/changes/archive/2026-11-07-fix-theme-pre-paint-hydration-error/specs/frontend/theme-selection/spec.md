# Spec Delta

## ADDED Requirements

### Requirement: The pre-paint theme applies without a hydration error

The theme class written on the document element before first paint SHALL be one React accepts rather than reports as a mismatch: hydration of any screen SHALL complete without a hydration error for the document element, the resolved theme class SHALL stay in place, and the document SHALL carry the pre-paint script inside its head so no script-placement warning is reported for it.

#### Scenario: Dark viewer's hydration is clean

- **WHEN** a viewer whose stored or operating-system theme is dark loads any screen
- **THEN** React hydrates without reporting a mismatch for the document element and the dark class the pre-paint script wrote stays in place

#### Scenario: Light viewer's hydration is clean

- **WHEN** a viewer with no dark preference loads any screen
- **THEN** React hydrates without reporting a mismatch for the document element and the theme the pre-paint script wrote stays in place

#### Scenario: Development console is free of theme diagnostics

- **WHEN** a screen is loaded in the development server and its console is inspected
- **THEN** no hydration-mismatch error for the document element and no script-placement warning for the pre-paint script is reported
