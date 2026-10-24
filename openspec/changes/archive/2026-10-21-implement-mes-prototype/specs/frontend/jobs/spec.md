# Spec Delta

## MODIFIED Requirements

### Requirement: Approve, Return, and Cancel are restricted to approver roles
Approve (`APP`) and Return (`REJ`) SHALL be offered to every role except `EMPLOYEE`. Cancel Ticket SHALL be offered to `SUPER_ADMIN`, `TECH_LEAD`, `HR_MANAGER`, and `DEPT_HEAD`, and to an `EMPLOYEE` only for their own ticket, with a mandatory reason, following the API contract.

#### Scenario: Employee sees no approve actions
- **WHEN** an `EMPLOYEE` opens a `PEN` ticket's detail
- **THEN** no Approve or Return action is rendered

#### Scenario: Cancel with reason
- **WHEN** a `TECH_LEAD` cancels a ticket and enters a reason
- **THEN** the ticket moves to `CAN` and the reason is recorded

#### Scenario: Employee cancels own ticket
- **WHEN** an `EMPLOYEE` cancels their own ticket and enters a reason
- **THEN** the ticket moves to `CAN` and the reason is recorded

### Requirement: Jobs print/export entry points
The app SHALL offer Print (a generated PDF assignment slip with time log and comments) and Export (a generated `.xlsx` or `.csv` task list per the active filters). For `EMPLOYEE`, both SHALL be limited to their own tickets.

#### Scenario: Print slip
- **WHEN** a reviewer presses Print on a ticket
- **THEN** a PDF assignment slip is generated with the ticket's time log and comments

#### Scenario: Export employee tasks
- **WHEN** an `EMPLOYEE` exports the task list
- **THEN** a generated file contains only that employee's tickets matching the active filters
