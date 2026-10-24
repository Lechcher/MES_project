# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Domain enums render as English labels`
- TO: `### Requirement: Domain enums render as natural-language labels`

## MODIFIED Requirements

### Requirement: Domain enums render as natural-language labels
Every user-visible rendering of a domain enum code SHALL show its natural-language name in the active locale. A bare token (`MEDIUM`, `PENDING`, `EXTENSION`, `DIVISION`) and a combined `Name (CODE)` form SHALL NOT be shown anywhere in the UI. The codes covered include ticket states, leave codes, priority, task type, approval status, task-request type, department type, audit modules, and roles.

#### Scenario: Priority cell
- **WHEN** a ticket row renders a `MEDIUM` priority ticket
- **THEN** the priority cell shows the locale's priority name ("Medium" in the English locale)

#### Scenario: State badge
- **WHEN** a ticket in state `PEN` is displayed
- **THEN** its badge shows the locale's state name with its documented color and no `PEN` token

#### Scenario: Approval status
- **WHEN** a leave request awaiting review renders its status
- **THEN** the pill shows the locale's status name ("Pending", "Approved", or "Rejected" in English), not the code

#### Scenario: Task-type select
- **WHEN** the ticket type dropdown opens
- **THEN** its options carry each task type's locale name, each still submitting the documented code

#### Scenario: Leave code
- **WHEN** a leave request or attendance record renders its leave code
- **THEN** it shows the locale's leave name, such as "Annual Leave" in English

#### Scenario: Request type
- **WHEN** a task request pending review renders its type
- **THEN** it shows the locale's request-type name ("Extension Request" or "Late Submission Explanation" in English), not the code

#### Scenario: Department type
- **WHEN** the Org Structure view renders a department's type
- **THEN** it shows the locale's type name ("Department" or "Division" in English)

#### Scenario: Vietnamese enum
- **WHEN** the active locale is Vietnamese and a ticket in state `PEN` is displayed
- **THEN** its badge shows the Vietnamese state name and no `PEN` token

### Requirement: One label registry with full coverage
All code registries and their canonical names SHALL live in a single documented registry module rather than being restated per component, and localized names SHALL be keyed by those same codes in the localization catalogues. Tests SHALL assert that every value of every covered enum has a canonical name and a message in every locale, so a new code cannot ship unlabeled.

#### Scenario: Coverage test guards new values
- **WHEN** a new enum value exists without a registry label or without a message in a supported locale
- **THEN** the coverage test fails until the label is added

#### Scenario: Localized names are not restated per component
- **WHEN** a screen needs a code's name
- **THEN** it resolves it from the registry and the localization catalogues rather than restating the mapping in the component

### Requirement: Related entities show their names
A department, role, or audit module displayed alongside another record SHALL show its natural-language name in the active locale rather than its code.

#### Scenario: Assignee options
- **WHEN** the assignee dropdown lists users
- **THEN** each option reads "Full Name · Department Name" using the locale's department name

#### Scenario: Audit module filter
- **WHEN** the Audit Log module filter opens
- **THEN** its options read each module's locale name ("Jobs & Projects", "Planning & Attendance", "Performance & Audit", "Settings & IAM", and "Audit Log" in English)

### Requirement: Descriptive copy uses labels
Instructional, empty-state, and confirmation text SHALL use the active locale's labels instead of code tokens when referring to a state or enum value.

#### Scenario: Leave form copy
- **WHEN** the Create Leave Request form describes submission
- **THEN** the copy names the pending state in the active locale, not "start PENDING"

### Requirement: Dense surfaces keep labels readable
Compact badges and calendar day cells SHALL show the active locale's label, truncating it within the cell and exposing the full label on hover, rather than falling back to a bare token.

#### Scenario: Calendar day cell
- **WHEN** a calendar day cell falls within an approved `AL` leave request
- **THEN** the cell shows a truncated locale name ("Annual Leave" in English) whose hover title carries the full name

### Requirement: Token preservation is a data-contract rule
Domain tokens SHALL NOT be renamed, translated, or paraphrased in the data and logic contract — queries, mutations, filters, and authorization keep the documented codes verbatim. User-facing rendering of those tokens SHALL follow this capability's label requirements instead.

#### Scenario: No verbatim-token requirement
- **WHEN** a screen renders any domain enum value
- **THEN** the displayed text is the active locale's label, and the underlying token remains available to queries, filters, and authorization unchanged
