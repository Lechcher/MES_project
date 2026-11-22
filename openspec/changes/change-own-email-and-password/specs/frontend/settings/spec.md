# Spec Delta

## MODIFIED Requirements

### Requirement: Settings app and menu visibility by role
Every authenticated user SHALL be able to open the Settings app and SHALL see an Account tab for managing their own email and password. `EMPLOYEE` and `DEPT_HEAD` SHALL see only the Account tab. `HR_MANAGER` SHALL see the User Directory and the Account tab. `TECH_LEAD` and `SUPER_ADMIN` SHALL see all technical menus — User Directory, Org Structure, RBAC, Telegram Webhook, and System Audit Logs — plus the Account tab.

#### Scenario: HR sees only users
- **WHEN** an `HR_MANAGER` opens the Settings app
- **THEN** only the User Directory and the Account tab are accessible

#### Scenario: Full menus for admins
- **WHEN** a `SUPER_ADMIN` opens the Settings app
- **THEN** all five technical menus and the Account tab are shown

#### Scenario: Employee sees the Account tab only
- **WHEN** an `EMPLOYEE` opens the Settings app
- **THEN** only the Account tab is accessible

#### Scenario: Department head sees the Account tab only
- **WHEN** a `DEPT_HEAD` opens the Settings app
- **THEN** only the Account tab is accessible