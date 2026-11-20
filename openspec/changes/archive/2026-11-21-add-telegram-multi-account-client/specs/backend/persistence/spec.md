# Spec Delta

## MODIFIED Requirements

### Requirement: Durable MES records
The system SHALL persist users, organization units, roles, permissions, projects, tasks, task completion requests and their attachments, workflow history, attendance, leave, overtime, KPI records, settings, notifications, and audit events. The system SHALL also persist each viewer's linked Telegram accounts — one record per viewer and Telegram identity — with the Telegram profile information, the masked phone number, the device fingerprint, and the encrypted session material, cascading from the owning viewer.

#### Scenario: Records survive restart
- **WHEN** a user creates a task and the service restarts successfully
- **THEN** the task and its recorded state remain available afterward

#### Scenario: Read committed leave balance
- **WHEN** a leave request or approved overtime changes a tracked balance
- **THEN** subsequent balance reads reflect the committed ledger entries

#### Scenario: Completion requests survive restart
- **WHEN** an assignee submits a completion request and the service restarts successfully
- **THEN** the request, its state, and its attachments remain available afterward

#### Scenario: Linked Telegram account survives restart
- **WHEN** a viewer links a Telegram account and the service restarts successfully
- **THEN** the viewer's account record remains available — its encrypted session restorable to that viewer only — with no second record for the same viewer and Telegram identity permitted

#### Scenario: Deleting the owner removes the record's meaning
- **WHEN** a viewer whose Telegram accounts are linked is removed
- **THEN** their Telegram account records go with them and no orphaned session material remains restorable