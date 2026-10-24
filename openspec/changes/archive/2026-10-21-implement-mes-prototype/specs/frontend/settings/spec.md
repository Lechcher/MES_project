# Spec Delta

## MODIFIED Requirements

### Requirement: Org Structure management with Auto-forking
The Org Structure view SHALL show the department/division hierarchy (code, name, type `DEPARTMENT`/`DIVISION`, parent, manager, active state) with create and edit actions, plus a per-department Auto-forking toggle controlling whether new tickets replicate to the department's members.

#### Scenario: Toggle Auto-forking
- **WHEN** a `SUPER_ADMIN` turns Auto-forking off for a department
- **THEN** the setting is persisted and subsequent Jobs ticket creation does not offer or perform Auto-forking for that department

### Requirement: Telegram Webhook configuration
The webhook view SHALL expose the configured bot, alert group chat ID, webhook URL, and enabled toggle, with changes saved through the API. Only `TECH_LEAD` and `SUPER_ADMIN` may access it.

#### Scenario: Save webhook config
- **WHEN** an admin edits the alert group chat ID and saves
- **THEN** the persisted config is updated, an audit entry is recorded, and subsequent notifications use the saved destination
