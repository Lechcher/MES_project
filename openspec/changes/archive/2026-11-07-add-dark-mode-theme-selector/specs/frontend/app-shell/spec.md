# Spec Delta

## MODIFIED Requirements

### Requirement: Global layout applies the DESIGN.md theme
Every screen SHALL follow the IBM Carbon direction in `DESIGN.md`: light theme by default — white surfaces, charcoal ink, a single IBM Blue `#0f62fe` accent, flat-square corners, hairline borders, and IBM Plex Sans typography — and the IBM Carbon Gray 100 dark theme when the viewer's theme preference selects dark. Shared layout and semantic state colors SHALL remain consistent across apps in both themes, and where `AGENTS.md` still summarises the theme as dark, `DESIGN.md` is authoritative.

#### Scenario: Theme conformance
- **WHEN** any screen renders in either theme
- **THEN** the screen uses that theme's canvas and ink from `DESIGN.md` — white canvas and charcoal ink under light, the Carbon Gray 100 values under dark — with IBM Blue accents, flat-square corners, and IBM Plex Sans typography

#### Scenario: Footer inversion
- **WHEN** the footer renders on any screen in either theme
- **THEN** it uses an inverse charcoal surface with inverse ink while remaining distinguishable from the page canvas of the active theme
