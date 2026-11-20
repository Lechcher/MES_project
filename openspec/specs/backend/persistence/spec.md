# backend/persistence Specification

## Purpose

Keeps the MES's identity, organization, operational records, settings, and history available across requests and application restarts. It defines durable system behavior independent of the storage implementation.

## Requirements

### Requirement: Durable MES records
The system SHALL persist users, organization units, roles, permissions, projects, tasks, workflow history, attendance, leave, overtime, KPI records, settings, notifications, and audit events.

#### Scenario: Records survive restart
- **WHEN** a user creates a task and the service restarts successfully
- **THEN** the task and its recorded state remain available afterward

#### Scenario: Read committed leave balance
- **WHEN** a leave request or approved overtime changes a tracked balance
- **THEN** subsequent balance reads reflect the committed ledger entries

#### Scenario: Linked Telegram account survives restart
- **WHEN** a viewer links a Telegram account and the service restarts successfully
- **THEN** the viewer's account record remains available — its stable slot and encrypted session restorable to that viewer only — with no second record for the same viewer and Telegram identity permitted

#### Scenario: Deleting the owner removes the record's meaning
- **WHEN** a viewer whose Telegram accounts are linked is removed
- **THEN** their Telegram account records go with them and no orphaned session material remains restorable

### Requirement: Consistent workflow updates
The system SHALL commit each state-changing operation and its required related records together, or leave all affected records unchanged if the operation fails.

#### Scenario: Record task transition history
- **WHEN** an authorized user accepts a `REQ` task
- **THEN** the task becomes `ACT` and its actor-attributed transition is persisted as one consistent change

#### Scenario: Roll back invalid business mutation
- **WHEN** a leave or task mutation fails validation or violates a business rule
- **THEN** no partial domain or history records are committed

### Requirement: Repeatable development seed data
The system SHALL provide deterministic local development and test data covering each ticket state, task type, role, and documented leave and attendance examples without replacing production records.

#### Scenario: Seed a local test database
- **WHEN** the development seed is applied to a clean database
- **THEN** the documented role and workflow scenarios can be exercised consistently
