# Spec Delta

## MODIFIED Requirements

### Requirement: Create Ticket form captures ticket data
The create form SHALL capture title, description, project (defaulting to General Operations when none is selected), priority (default `MEDIUM`), one or more assignees, and department. New tickets SHALL start in `REQ`, and the `+ Create New Ticket` button SHALL be offered to every role except `EMPLOYEE`.

#### Scenario: Defaults
- **WHEN** a `TECH_LEAD` submits the create form without selecting a project
- **THEN** the ticket is created under General Operations with priority `MEDIUM` in state `REQ`

#### Scenario: Employee cannot create
- **WHEN** an `EMPLOYEE` uses the Jobs app
- **THEN** the `+ Create New Ticket` button is not rendered

## REMOVED Requirements

### Requirement: Task type rules and Auto-forking
**Reason:** Auto-forking (the automatic replication of a ticket to every active department member, controlled by a per-department setting reachable only by HQ technical roles) is retired; explicit multi-assignee selection replaces it. The task-type deadline rules survive unchanged and move to the added requirement below.
**Migration:** Use the create form's multi-assignee combobox to create one ticket per selected employee. The deadline behavior is now specified by "Task type deadline rules".

## ADDED Requirements

### Requirement: Task type deadline rules
The create form SHALL set deadlines by task type: `HOURLY` uses the slots 10:30, 14:00, 16:30; `DAILY` defaults to 17:00/18:00 the same day; `MULTI_DAY` takes start and end dates.

#### Scenario: Hourly task
- **WHEN** a `TECH_LEAD` creates an hourly task with the 14:00 slot
- **THEN** the ticket is created in `REQ` with its deadline at 14:00

### Requirement: Multi-assignee ticket creation
The create form SHALL let the creator pick assignees from the selected department's active members through a multi-select combobox, offering the creator themselves as the default selection. Submitting with N selected employees SHALL create N `REQ` tickets — one per employee, in the selected department, sharing the entered title, description, project, task type, priority, and deadlines. At least one assignee SHALL be required.

#### Scenario: Assign to several employees at once
- **WHEN** a creator selects 3 employees of the Engineering department and submits the form
- **THEN** 3 `REQ` tickets are created, one assigned to each selected employee, all in Engineering with the same title, type, priority, and deadlines

#### Scenario: Defaults to the creator
- **WHEN** a creator opens the form and changes nothing
- **THEN** the assignee combobox holds the creator themselves as the single selection

#### Scenario: Empty selection is refused
- **WHEN** a creator clears the assignee combobox and submits
- **THEN** the submission is refused with a validation message and no ticket is created
