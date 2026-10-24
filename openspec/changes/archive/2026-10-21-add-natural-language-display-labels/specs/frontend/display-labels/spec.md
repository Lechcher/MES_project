# frontend/display-labels Specification

## Purpose

The presentation rule that keeps internal codes out of the interface: every domain enum, every record identifier users do not need, and every code shown alongside another record renders as English natural language from one label registry, while the codes themselves remain the data and logic contract and survive only where they are the content of a technical surface.

## ADDED Requirements

### Requirement: Domain enums render as English labels
Every user-visible rendering of a domain enum code SHALL show its documented
English name. A bare token (`MEDIUM`, `PENDING`, `EXTENSION`, `DIVISION`) and a
combined `Name (CODE)` form SHALL NOT be shown anywhere in the UI. The codes
covered include ticket states, leave codes, priority, task type, approval
status, task-request type, department type, audit modules, and roles.

#### Scenario: Priority cell
- **WHEN** a ticket row renders a `MEDIUM` priority ticket
- **THEN** the priority cell shows "Medium"

#### Scenario: State badge
- **WHEN** a ticket in state `PEN` is displayed
- **THEN** its badge shows "Pending" with its documented color and no `PEN` token

#### Scenario: Approval status
- **WHEN** a leave request awaiting review renders its status
- **THEN** the pill shows "Pending" (or "Approved"/"Rejected"), not the code

#### Scenario: Task-type select
- **WHEN** the ticket type dropdown opens
- **THEN** its options read "Hourly", "Daily", and "Multi-day", each still
  submitting the documented code

#### Scenario: Leave code
- **WHEN** a leave request or attendance record renders its leave code
- **THEN** it shows the documented leave name, such as "Annual Leave"

#### Scenario: Request type
- **WHEN** a task request pending review renders its type
- **THEN** it shows "Extension Request" or "Late Submission Explanation", not the
  code

#### Scenario: Department type
- **WHEN** the Org Structure view renders a department's type
- **THEN** it shows "Department" or "Division"

### Requirement: Domain codes remain the data and logic contract
Code tokens SHALL remain verbatim in queries, mutations, filters, form values,
and access logic. Labels SHALL be a presentation layer only, so no API field,
stored value, or authorization input changes when a label is added or reworded.

#### Scenario: Filter still sends the code
- **WHEN** a viewer picks "Medium" in the priority filter
- **THEN** the request carries the code `MEDIUM` in its filter input

#### Scenario: Form still submits the code
- **WHEN** a creator picks "Hourly" as the task type
- **THEN** the create mutation submits `HOURLY`

### Requirement: One label registry with full coverage
All code-to-label mappings SHALL live in a single documented registry module
rather than being restated per component. A unit test SHALL assert that every
value of every covered enum has a label, so a new code cannot ship unlabeled.

#### Scenario: Coverage test guards new values
- **WHEN** a new enum value exists without a registry label
- **THEN** the coverage test fails until a label is added

### Requirement: Related entities show their names
A department, role, or audit module displayed alongside another record SHALL
show its English name rather than its code.

#### Scenario: Assignee options
- **WHEN** the assignee dropdown lists users
- **THEN** each option reads "Full Name · Department Name"

#### Scenario: Audit module filter
- **WHEN** the Audit Log module filter opens
- **THEN** its options read "Jobs & Projects", "Planning & Attendance",
  "Performance & Audit", "Settings & IAM", and "Audit Log"

### Requirement: Record identifiers are not displayed as content
Task code, user code, Employee ID, and department code columns and qualifiers
SHALL NOT be rendered on user-facing screens, for any role — including
confirmation messages that quote them. Records are identified by their
natural-language fields (ticket title, person's name, department's name).
Identifier form fields that capture a code SHALL remain unchanged as inputs to
the data contract.

#### Scenario: Jobs list without the code column
- **WHEN** any role opens the ticket list or the approval board
- **THEN** rows show title, state, priority, and the other business fields, and
  no task-code column is rendered

#### Scenario: People shown by name only
- **WHEN** a person appears as a row, row label, dropdown option, or nav entry
- **THEN** only the name is shown, not the user code

#### Scenario: Form inputs unchanged
- **WHEN** an administrator edits a user or department whose code is a form field
- **THEN** the code field remains an editable input even though no screen
  displays it as content

### Requirement: Technical surfaces keep codes as their content
On the apps already restricted to `TECH_LEAD` and `SUPER_ADMIN` — Settings' Org
Structure, RBAC, and System Audit Logs, plus the Audit Log app — codes SHALL
remain where they are the record's actual content: permission codes, audit
module/action/resource references, and the department code field. No other role
can reach these surfaces.

#### Scenario: RBAC permission list
- **WHEN** a `TECH_LEAD` opens the RBAC view
- **THEN** permission codes remain listed as the permission content, while roles
  and modules are shown by name

#### Scenario: Audit trail rows
- **WHEN** a `SUPER_ADMIN` reads System Audit Logs or the Audit Log app
- **THEN** module, action, and resource entries keep their codes as row content

#### Scenario: Org code field
- **WHEN** a `TECH_LEAD` opens Org Structure
- **THEN** the department code field remains visible and editable while the type
  column shows "Department" or "Division"

### Requirement: Descriptive copy uses labels
Instructional, empty-state, and confirmation text SHALL use English labels
instead of code tokens when referring to a state or enum value.

#### Scenario: Leave form copy
- **WHEN** the Create Leave Request form describes submission
- **THEN** the copy says requests start as Pending, not "start PENDING"

### Requirement: Dense surfaces keep labels readable
Compact badges and calendar day cells SHALL show the English label, truncating
it within the cell and exposing the full label on hover, rather than falling
back to a bare token.

#### Scenario: Calendar day cell
- **WHEN** a calendar day cell falls within an approved `AL` leave request
- **THEN** the cell shows a truncated "Annual Leave" whose hover title carries
  the full name

### Requirement: Token preservation is a data-contract rule
Domain tokens SHALL NOT be renamed, translated, or paraphrased in the data and
logic contract — queries, mutations, filters, and authorization keep the
documented codes verbatim. User-facing rendering of those tokens SHALL follow
this capability's label requirements instead.

#### Scenario: No verbatim-token requirement
- **WHEN** a screen renders any domain enum value
- **THEN** the displayed text is the English label, and the underlying token
  remains available to queries, filters, and authorization unchanged
