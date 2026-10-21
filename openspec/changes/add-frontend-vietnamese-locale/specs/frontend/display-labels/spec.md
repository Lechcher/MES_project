# Spec Delta

## MODIFIED Requirements

### Requirement: Domain enums render as English labels
Every user-visible rendering of a domain enum code SHALL show its documented name in the language the viewer has selected, and English in the English locale. A bare token (`MEDIUM`, `PENDING`, `EXTENSION`, `DIVISION`), a combined `Name (CODE)` form, and an English label shown while a Vietnamese viewer has selected Vietnamese SHALL NOT appear anywhere in the UI. The codes covered include ticket states, leave codes, priority, task type, approval status, task-request type, department type, audit modules, and roles.

#### Scenario: Priority cell
- **WHEN** a ticket row renders a `MEDIUM` priority ticket
- **THEN** the priority cell shows the selected language's label for `MEDIUM` — "Medium" in English, "Trung bình" in Vietnamese

#### Scenario: State badge
- **WHEN** a ticket in state `PEN` is displayed
- **THEN** its badge shows the selected language's label for `PEN` with its documented color and no `PEN` token

#### Scenario: Approval status
- **WHEN** a leave request awaiting review renders its status
- **THEN** the pill shows the selected language's label for `PENDING` and no `PENDING` token

#### Scenario: Task-type select
- **WHEN** the ticket type dropdown opens
- **THEN** its options read the selected language's labels for `HOURLY`, `DAILY`, and `MULTI_DAY`, each still submitting the documented code

#### Scenario: Leave code
- **WHEN** a leave request or attendance record renders its leave code
- **THEN** it shows the selected language's documented leave name — "Annual Leave" in English, "Nghỉ phép năm" in Vietnamese

#### Scenario: Request type
- **WHEN** a task request pending review renders its type
- **THEN** it shows the selected language's label for `EXTENSION` or `LATE_EXPLANATION`, not the code

#### Scenario: Department type
- **WHEN** the Org Structure view renders a department's type
- **THEN** it shows the selected language's label for `DEPARTMENT` or `DIVISION`

### Requirement: One label registry with full coverage
All code-to-label mappings SHALL live in a single documented registry module rather than being restated per component, with each label delivered through the translation catalogs. A check SHALL assert that every value of every covered enum has an entry in every supported language's catalog, so a new code cannot ship unlabeled and a missing translation cannot ship unreported.

#### Scenario: Coverage test guards new values
- **WHEN** a new enum value exists without a registry label
- **THEN** the coverage test fails until a label is added

#### Scenario: Coverage across every language
- **WHEN** an enum value has an English label but no Vietnamese entry
- **THEN** the coverage check fails and names the missing entry for that code and language

### Requirement: Related entities show their names
A department, role, or audit module displayed alongside another record SHALL show its name in the selected language rather than its code. A label delivered by code that has no catalog entry for it SHALL fall back to the record's own stored name.

#### Scenario: Assignee options
- **WHEN** the assignee dropdown lists users
- **THEN** each option reads "Full Name · Department Name"

#### Scenario: Audit module filter
- **WHEN** the Audit Log module filter opens
- **THEN** its options read the selected language's module names — "Jobs & Projects", "Planning & Attendance", "Performance & Audit", "Settings & IAM", and "Audit Log" in English

#### Scenario: Role labels follow the language
- **WHEN** a role renders in the nav, a table cell, or a filter for a Vietnamese viewer
- **THEN** it shows the Vietnamese role label, not the role code and not the English one

#### Scenario: Stored name remains the fallback
- **WHEN** a department or person's record has no catalog entry keyed to it
- **THEN** its stored name is shown unchanged rather than a code

### Requirement: Descriptive copy uses labels
Instructional, empty-state, and confirmation text SHALL use the selected language's labels instead of code tokens when referring to a state or enum value.

#### Scenario: Leave form copy
- **WHEN** the Create Leave Request form describes submission in Vietnamese
- **THEN** the copy says requests start as the Vietnamese label for `PENDING`, with no code token anywhere in the sentence

### Requirement: Dense surfaces keep labels readable
Compact badges and calendar day cells SHALL show the selected language's label, truncating it within the cell and exposing the full label on hover, rather than falling back to a bare token.

#### Scenario: Calendar day cell
- **WHEN** a calendar day cell falls within an approved `AL` leave request
- **THEN** the cell shows a truncated label for `AL` in the selected language whose hover title carries the full name

### Requirement: Token preservation is a data-contract rule
Domain tokens SHALL NOT be renamed, translated, or paraphrased in the data and logic contract — queries, mutations, filters, and authorization keep the documented codes verbatim. User-facing rendering of those tokens SHALL follow this capability's label requirements instead.

#### Scenario: No verbatim-token requirement
- **WHEN** a screen renders any domain enum value
- **THEN** the displayed text is the label for the selected language, and the underlying token remains available to queries, filters, and authorization unchanged
