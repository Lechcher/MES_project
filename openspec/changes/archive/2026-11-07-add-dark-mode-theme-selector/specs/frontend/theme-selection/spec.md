# Spec Delta

## Purpose

Lets every viewer choose the canvas the interface draws on — following the operating system, or pinned to light or dark — and keeps that choice across visits without disturbing any screen's content.

## ADDED Requirements

### Requirement: Theme selector offers system, light, and dark
The authenticated shell SHALL offer a theme selector with exactly three options — follow the system, light, and dark — visible to every role, and SHALL show which mode is currently active.

#### Scenario: Selector reachable for every role
- **WHEN** a signed-in viewer of any role opens the top navigation
- **THEN** a theme selector is reachable beside the language switcher and names the active mode

#### Scenario: Three modes, no more
- **WHEN** the selector opens
- **THEN** it offers follow-the-system, light, and dark, and no fourth option

### Requirement: The chosen theme is remembered and restored
The selected mode SHALL persist in the viewer's own browser so the next visit opens in it without asking again, and a viewer who has never chosen SHALL start on follow-the-system.

#### Scenario: Choice survives a return visit
- **WHEN** a viewer selects dark, closes the app, and returns later
- **THEN** the app opens in dark without the viewer choosing again

#### Scenario: First visit follows the system
- **WHEN** a viewer opens the app for the first time with no stored choice
- **THEN** the theme follows the operating system's own light/dark preference

#### Scenario: Choice is per browser, not per account
- **WHEN** one browser stores a dark choice and another browser signs in as the same viewer
- **THEN** each browser keeps its own stored theme

### Requirement: Follow-the-system tracks the operating system
A viewer on follow-the-system SHALL have the theme track the operating system's preference, including a change made while the app is open.

#### Scenario: System changes while the app is open
- **WHEN** a viewer on follow-the-system changes the operating system from light to dark
- **THEN** the app switches to dark without a reload

#### Scenario: Unsupported system preference falls back to light
- **WHEN** a viewer on follow-the-system uses a browser or operating system that reports no preference
- **THEN** the app renders light

### Requirement: An explicit choice overrides the operating system
A viewer who has explicitly selected light or dark SHALL keep that theme whatever the operating system reports, until the viewer changes the selection.

#### Scenario: Pinned light wins over a dark system
- **WHEN** a viewer has selected light while the operating system reports dark
- **THEN** the app renders light

#### Scenario: Pinned dark wins over a light system
- **WHEN** a viewer has selected dark while the operating system reports light
- **THEN** the app renders dark

#### Scenario: Switching back to follow-the-system
- **WHEN** a viewer who has pinned a theme switches to follow-the-system
- **THEN** the app immediately adopts the operating system's current preference

### Requirement: The dark theme applies the Carbon Gray 100 palette
The dark theme SHALL apply the IBM Carbon Gray 100 token set defined in `DESIGN.md` to every surface, keeping IBM Blue `#0f62fe` as the accent and leaving flat-square corners, hairline borders, and IBM Plex Sans typography unchanged.

#### Scenario: Dark canvas and ink
- **WHEN** the dark theme is active
- **THEN** surfaces, ink, borders, and charts use the Carbon Gray 100 values from `DESIGN.md` rather than the light values

#### Scenario: Accent preserved in both themes
- **WHEN** either theme is active
- **THEN** the interactive accent remains IBM Blue `#0f62fe` and the footer remains the inverted charcoal surface

#### Scenario: Every screen is covered
- **WHEN** the dark theme is active
- **THEN** all five app screens, the sign-in screen, and the empty, loading, and error states render without a light surface

### Requirement: The theme applies without a flash of the wrong canvas
The viewer's theme SHALL already be applied on the first paint, so no screen flashes the light canvas before a dark viewer's theme is set up.

#### Scenario: Dark viewer's first paint
- **WHEN** a viewer with a stored dark preference loads any screen
- **THEN** the first painted frame is already dark and no light flash is visible

#### Scenario: System viewer's first paint
- **WHEN** a viewer with no stored choice whose operating system reports dark loads a screen
- **THEN** the first painted frame is already dark and no light flash is visible

### Requirement: Theme selector labels are localized
The selector's label, its accessible name, and the three mode names SHALL come from the localized catalogue, so they read in the active locale under both `en` and `vi`.

#### Scenario: English labels
- **WHEN** the locale is `en` and the selector opens
- **THEN** its label and its three options read in English

#### Scenario: Vietnamese labels
- **WHEN** the locale is `vi` and the selector opens
- **THEN** its label and its three options read in Vietnamese
