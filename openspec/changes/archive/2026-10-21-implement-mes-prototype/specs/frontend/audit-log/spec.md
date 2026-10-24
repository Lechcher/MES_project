# Spec Delta

## Purpose

Gives technical administrators a read-only interface for reviewing the shared system audit trail. The app exposes system-wide and per-module activity without permitting changes to recorded events.

## ADDED Requirements

### Requirement: Restrict Audit Log app access
The Audit Log app SHALL be visible and available only to `SUPER_ADMIN` and `TECH_LEAD`.

#### Scenario: Employee does not see Audit Log
- **WHEN** an `EMPLOYEE`, `DEPT_HEAD`, or `HR_MANAGER` opens the dashboard
- **THEN** no Audit Log entry is rendered

#### Scenario: Technical role opens Audit Log
- **WHEN** a `TECH_LEAD` opens the dashboard and selects Audit Log
- **THEN** the system-wide activity view is available

### Requirement: Review filtered system and module activity
The app SHALL list newest events first, support filters for module, user, action, resource type, resource ID, and date range, and show event-count and last-activity summaries for modules.

#### Scenario: Filter a module's events
- **WHEN** an authorized user selects the `planning` module and a date range
- **THEN** only matching planning events are shown and the module summary reflects that period

#### Scenario: Show newest events first
- **WHEN** the activity stream loads
- **THEN** events are ordered newest first

### Requirement: Keep audit activity read-only
The app SHALL offer no controls to edit or delete audit events and SHALL provide export of the currently filtered events as XLSX or CSV.

#### Scenario: Export filtered events
- **WHEN** an authorized user exports the current activity filter
- **THEN** a file containing the matching events is generated without changing the audit trail
