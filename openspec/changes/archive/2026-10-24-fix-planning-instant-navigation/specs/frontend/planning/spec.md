# Spec Delta

## ADDED Requirements

### Requirement: Planning page segment declares instant navigation may block

The planning page segment SHALL declare that a navigation into it may block the immediately rendered UI, because the viewer is resolved in the browser after the response is sent. This declaration covers only the planning page segment; screens reachable without a session SHALL remain subject to the development server's navigation-instantness validation.

#### Scenario: Viewer is resolved after the response

- **WHEN** the planning page is opened in the browser
- **THEN** the shell shows its session-loading state before the viewer's content appears, because the viewer is resolved in the browser

#### Scenario: Development server reports no dropped segment

- **WHEN** the development server validates the planning page segment
- **THEN** it reports no failure that a segment was dropped from rendering and no navigation-instantness error for that segment

#### Scenario: Instant navigation declaration is present

- **WHEN** the planning page segment configuration is inspected
- **THEN** it declares `export const instant = false`
