# Spec Delta

## MODIFIED Requirements

### Requirement: Review filtered system and module activity
The app SHALL list newest events first, support filters for module, user, action, resource type, resource ID, and date range, and show event-count and last-activity summaries for modules. Events that reference a known user SHALL show that user's name with their user code wherever the event's resource or old/new data carries the user's identifier, so no raw UUID is displayed.

#### Scenario: Filter a module's events
- **WHEN** an authorized user selects the `planning` module and a date range
- **THEN** only matching planning events are shown and the module summary reflects that period

#### Scenario: Show newest events first
- **WHEN** the activity stream loads
- **THEN** events are ordered newest first

#### Scenario: User references read as names
- **WHEN** an event's resource identifier or old/new data names a user by their identifier
- **THEN** the row shows the user's name with their user code instead of the raw identifier

#### Scenario: Unresolved identifiers stay verbatim
- **WHEN** an event's resource identifier matches no known user
- **THEN** the identifier is shown exactly as recorded
