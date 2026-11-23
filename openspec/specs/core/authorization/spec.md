# core/authorization Specification

## Purpose

Applies the shared role and permission model to both app visibility and server-side operations. It prevents unauthorized actions and restricts returned records to the caller's permitted organizational scope.

## Requirements

### Requirement: Enforce app and operation permissions
The system SHALL evaluate permissions on the server for every protected query and mutation, independently of whether the corresponding app, tab, or action is rendered in the client.

#### Scenario: Deny a forbidden mutation
- **WHEN** a `TECH_LEAD` attempts to assign `UAL` or `USL`
- **THEN** the operation is denied with `FORBIDDEN` and no attendance or KPI record changes

#### Scenario: Restrict technical apps
- **WHEN** an `HR_MANAGER` requests Audit Log data
- **THEN** the request is denied even if the client calls the API directly

### Requirement: Enforce role-based record scopes
The system SHALL restrict each read and write to the caller's permitted scope: personal for `EMPLOYEE`, department-only for `DEPT_HEAD`, company-wide for `HR_MANAGER`, and all authorized data for `TECH_LEAD` and `SUPER_ADMIN`.

#### Scenario: Employee cannot read another employee's task
- **WHEN** an `EMPLOYEE` queries a task assigned to another user
- **THEN** the API does not return that task's data

#### Scenario: Department Head sees only their department
- **WHEN** a `DEPT_HEAD` queries calendar or performance records
- **THEN** results contain only records within the Head's own department

### Requirement: Preserve documented role asymmetries
The system SHALL allow account management to `HR_MANAGER` and `SUPER_ADMIN`, RBAC and webhook management to `TECH_LEAD` and `SUPER_ADMIN`, penalty-leave assignment to `HR_MANAGER` and `SUPER_ADMIN`, and Audit Log access only to `TECH_LEAD` and `SUPER_ADMIN`.

#### Scenario: HR manages users but not RBAC
- **WHEN** an `HR_MANAGER` manages the user directory and then requests role permissions
- **THEN** user management is permitted and role-permission management is denied

#### Scenario: Department Head reviews scoped work
- **WHEN** a `DEPT_HEAD` reviews work for their department
- **THEN** the review is permitted only for in-scope records and no company-wide audit view is exposed

### Requirement: Schedule write permissions
`HR_MANAGER`, `TECH_LEAD`, and `SUPER_ADMIN` SHALL create, update, move, duplicate, delete, and import tasks in any department. `DEPT_HEAD` SHALL do so only for tasks and assignees in their own department. `EMPLOYEE` SHALL NOT call these operations and keeps only the existing own-task actions.

#### Scenario: HR edits another department
- **WHEN** an `HR_MANAGER` updates a task in the Sales department
- **THEN** the update succeeds

#### Scenario: Department Head outside their department
- **WHEN** a `DEPT_HEAD` moves a task onto an employee of another department
- **THEN** the API denies it with `FORBIDDEN` and the task is unchanged

#### Scenario: Employee cannot delete
- **WHEN** an `EMPLOYEE` calls `deleteTask` on their own task
- **THEN** the API denies it with `FORBIDDEN`

#### Scenario: Import outside scope
- **WHEN** a `DEPT_HEAD` imports a row assigned to another department's employee
- **THEN** that row is reported as a scope error and nothing is committed
