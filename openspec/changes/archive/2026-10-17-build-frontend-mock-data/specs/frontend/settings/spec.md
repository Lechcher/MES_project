# Spec Delta

## Purpose

The Settings & IAM app screens: the user directory, org structure with Auto-forking configuration, RBAC permission management, Telegram webhook configuration, and the read-only system audit trail — with menus gated by role.

## ADDED Requirements

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
- **WHEN** an `HR_MANAGER` creates a user with name, email, code, department, and role
- **THEN** the user appears in the directory and an audit entry is recorded

#### Scenario: Reset password
- **WHEN** an admin resets a user's password
- **THEN** the action is recorded in the audit trail

### Requirement: Org Structure management with Auto-forking
The Org Structure view SHALL show the department/division hierarchy (code, name, type `DEPARTMENT`/`DIVISION`, parent, manager, active state) with create and edit actions, plus a per-department Auto-forking toggle controlling whether new tickets replicate to the department's members.

#### Scenario: Toggle Auto-forking
- **WHEN** a `SUPER_ADMIN` turns Auto-forking off for a department
- **THEN** the setting is saved in mock state and the Jobs create form no longer offers Auto-forking for that department

### Requirement: RBAC permission management
The RBAC view SHALL list the five roles with their permissions grouped by module (`jobs`, `planning`, `performance`, `settings`, `audit-log`) and SHALL allow granting and revoking permissions per role. Only `TECH_LEAD` and `SUPER_ADMIN` may access it.

#### Scenario: Permissions grouped by module
- **WHEN** the RBAC view renders
- **THEN** each role's permissions are grouped under the five module codes

#### Scenario: Revoke a permission
- **WHEN** a `SUPER_ADMIN` revokes a permission from a role
- **THEN** the role's permission list updates and an audit entry is recorded

### Requirement: Telegram Webhook configuration
The webhook view SHALL expose bot token, alert group chat ID, webhook URL, and an enabled toggle, with a mock save. Only `TECH_LEAD` and `SUPER_ADMIN` may access it.

#### Scenario: Save webhook config
- **WHEN** an admin edits the alert group chat ID and saves
- **THEN** the mock config updates and an audit entry is recorded

### Requirement: Read-only System Audit Logs trail
The System Audit Logs view SHALL list entries newest first with user, action, resource type, old and new values, timestamp, and IP address, filterable by user, action, resource type, and date range. It SHALL offer no edit or delete action anywhere — the trail is append-only.

#### Scenario: Newest first
- **WHEN** the trail opens
- **THEN** entries are ordered newest first

#### Scenario: No mutation controls
- **WHEN** any role views the trail
- **THEN** no edit or delete control exists on any entry

#### Scenario: Filter by user
- **WHEN** the trail is filtered to one user
- **THEN** only that user's entries are listed
