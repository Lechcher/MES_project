# Spec Delta

## ADDED Requirements

### Requirement: Schedule read operation
The API SHALL expose `scheduledTasks(input: { departmentId, fromDate, toDate, state })` returning, in the caller's scope, every non-deleted task whose start-to-end interval overlaps the range, with its assignee and department.

#### Scenario: Overlapping tasks returned
- **WHEN** a task runs 30 Oct to 3 Nov and the range is 1 to 7 Nov
- **THEN** the task is returned

#### Scenario: Deleted tasks excluded
- **WHEN** a task was deleted
- **THEN** `scheduledTasks` does not return it

### Requirement: Edit, delete, and duplicate tasks
The API SHALL expose `updateTask` (title, description, taskType, priority, assignee, department, start, end, isUrgentHourly), `deleteTask` (soft delete), and `duplicateTask` (new `REQ` copy, optional new assignee and start). Each SHALL record a state transition or audit event and publish a `tickets` live change.

#### Scenario: Update dates
- **WHEN** an authorized caller updates a task's start and end
- **THEN** the task returns with the new dates and other fields unchanged

#### Scenario: End before start rejected
- **WHEN** `updateTask` receives an end earlier than the start
- **THEN** the API returns a `BAD_USER_INPUT` error and the task is unchanged

#### Scenario: Duplicate
- **WHEN** an authorized caller duplicates a task
- **THEN** a new task with a new `taskCode`, state `REQ`, and 0% progress is returned

### Requirement: Task import operations
The API SHALL expose `previewTaskImport(file)` that parses CSV or XLSX and returns each row with its parsed values and validation errors without writing, and `commitTaskImport(file)` that creates all rows in one transaction only if every row is valid.

#### Scenario: Invalid row blocks commit
- **WHEN** `commitTaskImport` receives a file with one invalid row
- **THEN** no task is created and the API returns `BAD_USER_INPUT` with the row errors

#### Scenario: Unsupported file
- **WHEN** a file that is neither CSV nor XLSX is uploaded
- **THEN** the API returns `BAD_USER_INPUT`
