# Spec Delta

## ADDED Requirements

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
