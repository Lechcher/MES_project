# Spec Delta

## ADDED Requirements

### Requirement: Generate Schedule reports
The system SHALL export scheduled tasks as PDF (A4 landscape table), CSV, or XLSX, filtered by department, date range, and optional state, limited to the caller's scope. Each row SHALL include task code, title, category, priority, state, assignee, department, start, end, and progress.

#### Scenario: Scoped CSV export
- **WHEN** a `DEPT_HEAD` exports the schedule as CSV for one week
- **THEN** the file contains only their department's tasks overlapping that week

### Requirement: Provide the task import template
The system SHALL provide downloadable CSV and XLSX import templates whose header row is `title, category, priority, assigneeEmail, startDate, endDate, hourSlot, description`, with one example row and dates in `DD/MM/YYYY`.

#### Scenario: Template round-trip
- **WHEN** a user fills the downloaded template with valid rows and uploads it
- **THEN** the import preview reports no errors
