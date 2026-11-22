# frontend/settings Specification

## Purpose

The Settings & IAM app screens: the user directory, org structure with Auto-forking configuration, RBAC permission management, Telegram webhook configuration, and the read-only system audit trail — with menus gated by role.

## Requirements

### Requirement: Settings app and menu visibility by role
The Settings app SHALL be fully hidden from `EMPLOYEE` and `DEPT_HEAD`. `HR_MANAGER` SHALL see only the User Directory menu. `TECH_LEAD` and `SUPER_ADMIN` SHALL see all technical menus: User Directory, Org Structure, RBAC, Telegram Webhook, and System Audit Logs.

#### Scenario: HR sees only users
- **WHEN** an `HR_MANAGER` opens the Settings app
- **THEN** only the User Directory is accessible

#### Scenario: Full menus for admins
- **WHEN** a `SUPER_ADMIN` opens the Settings app
- **THEN** all five menus are shown

### Requirement: User Directory management
The User Directory SHALL list users — searchable, filterable by department, role, and active status — and offer Create, Edit, Reset Password, and Deactivate (soft delete/lock) actions. Every management action SHALL append a system audit log entry.

#### Scenario: Create a user
- **WHEN** an `HR_MANAGER` creates a user with name, email, department, and role
- **THEN** the user appears in the directory with a server-assigned user code and an audit entry is recorded

#### Scenario: Reset password
- **WHEN** an admin resets a user's password
- **THEN** the action is recorded in the audit trail

### Requirement: RBAC permission management
The RBAC view SHALL list the five roles with their permissions grouped by module (`jobs`, `planning`, `performance`, `settings`, `audit-log`) and SHALL allow granting and revoking permissions per role. Only `TECH_LEAD` and `SUPER_ADMIN` may access it.

#### Scenario: Permissions grouped by module
- **WHEN** the RBAC view renders
- **THEN** each role's permissions are grouped under the five module codes

#### Scenario: Revoke a permission
- **WHEN** a `SUPER_ADMIN` revokes a permission from a role
- **THEN** the role's permission list updates and an audit entry is recorded

### Requirement: Telegram Webhook configuration
The webhook view SHALL expose the configured bot, alert group chat ID, webhook URL, and enabled toggle, with changes saved through the API. Only `TECH_LEAD` and `SUPER_ADMIN` may access it.

#### Scenario: Save webhook config
- **WHEN** an admin edits the alert group chat ID and saves
- **THEN** the persisted config is updated, an audit entry is recorded, and subsequent notifications use the saved destination

### Requirement: Read-only System Audit Logs trail
The System Audit Logs view SHALL list entries newest first with user, action, resource type, old and new values, timestamp, and IP address, filterable by user, action, resource type, and date range. It SHALL offer no edit or delete action anywhere — the trail is append-only. User identifiers the trail records SHALL display as readable labels (`FullName (userCode)`), never as raw hash codes.

#### Scenario: Newest first
- **WHEN** the trail opens
- **THEN** entries are ordered newest first

#### Scenario: No mutation controls
- **WHEN** any role views the trail
- **THEN** no edit or delete control exists on any entry

#### Scenario: Filter by user
- **WHEN** the trail is filtered to one user
- **THEN** only that user's entries are listed

#### Scenario: Resource identifiers read as names
- **WHEN** an entry's resource or old/new data references a known user
- **THEN** the view shows that user's name with their user code instead of a raw UUID

### Requirement: Org Structure management
The Org Structure view SHALL show the department/division hierarchy (code, name, type shown as "Department" or "Division", parent, manager, active state) with create and edit actions.

#### Scenario: Hierarchy rows render
- **WHEN** an admin opens the Org Structure view
- **THEN** each department/division row shows its code, name, type, parent, manager, and active state, with an edit action

### Requirement: The suggested default password is prefilled
The Create User and Reset Password dialogs SHALL prefill the password field with the suggested default password `password`, and the field SHALL remain editable so any other password can be entered.

#### Scenario: Create dialog suggests the default
- **WHEN** an admin opens the Create User dialog
- **THEN** the initial-password field is prefilled with `password` and can be edited

#### Scenario: Reset dialog suggests the default
- **WHEN** an admin opens the Reset Password dialog for a user
- **THEN** the new-password field is prefilled with `password` and can be edited

### Requirement: Created accounts carry an automated user code
Accounts created through the User Directory SHALL receive a server-assigned user code in the `V0000000`–`V9999999` range — the next free slot, zero-padded to seven digits — without the admin typing one, and the dialog SHALL not ask for a code.

#### Scenario: Create assigns the next code
- **WHEN** an admin creates a user without entering a code
- **THEN** the account is created with the next free code in the V range and the directory shows it

#### Scenario: No code input in the create dialog
- **WHEN** the Create User dialog is open
- **THEN** it offers no user-code field

### Requirement: The directory shows each user's code
The User Directory table SHALL include a User Code column listing each user's code beside their name.

#### Scenario: Code column visible
- **WHEN** the User Directory lists users
- **THEN** each row shows the user's code in a dedicated column
