# Spec Delta

## MODIFIED Requirements

### Requirement: Domain enums render as English labels
Every user-visible rendering of a domain enum code SHALL show its documented English name. A bare token (`MEDIUM`, `PENDING`, `EXTENSION`, `DIVISION`) and a combined `Name (CODE)` form SHALL NOT be shown anywhere in the UI. The codes covered include ticket states, leave codes, priority, task type, approval status, task-request type, department type, audit modules, roles, and KPI point rules.

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
- **THEN** its options read "Hourly", "Daily", and "Multi-day", each still submitting the documented code

#### Scenario: Leave code
- **WHEN** a leave request or attendance record renders its leave code
- **THEN** it shows the documented leave name, such as "Annual Leave"

#### Scenario: Request type
- **WHEN** a task request pending review renders its type
- **THEN** it shows "Extension Request" or "Late Submission Explanation", not the code

#### Scenario: Department type
- **WHEN** the Org Structure view renders a department's type
- **THEN** it shows "Department" or "Division"

#### Scenario: KPI point rule
- **WHEN** the Performance app renders a KPI score event
- **THEN** the rule shows its documented name, such as "On-time ticket", and not `KPI_ON_TIME_TICKET`

## ADDED Requirements

### Requirement: KPI point rule names resolve for every supported locale
KPI point rule names SHALL come from the same localized catalogue as the other domain enums, so a rule renders in English under the `en` locale and in Vietnamese under the `vi` locale. The rule code SHALL remain the key and SHALL NOT be displayed.

#### Scenario: English rule name
- **WHEN** the locale is `en` and the Performance app renders `KPI_PERFECT_ATTENDANCE`
- **THEN** the rule reads "Month of excellent attendance" and no code is shown

#### Scenario: Vietnamese rule name
- **WHEN** the locale is `vi` and the Performance app renders `KPI_PERFECT_ATTENDANCE`
- **THEN** the rule reads the Vietnamese name of that rule and no code is shown

#### Scenario: Code unchanged underneath the label
- **WHEN** the Performance app requests KPI score events
- **THEN** the query carries and receives the `KPI_*` rule codes verbatim and only the rendering is localized

#### Scenario: New rule code without a message
- **WHEN** a KPI rule code has no localized message in the active locale
- **THEN** the registry's canonical English event name is shown, and the label coverage test fails until a message is added
