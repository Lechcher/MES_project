# Spec Delta

## ADDED Requirements

### Requirement: Self-service credential operations need only a session
The self-service credential operations — changing the caller's own password, and requesting or confirming a change to the caller's own email — SHALL be granted to any authenticated viewer, independent of role permission codes, and SHALL always act on the caller's own account.

#### Scenario: Employee with no settings permission
- **WHEN** an `EMPLOYEE` changes their own password or requests an email change
- **THEN** the operation proceeds without requiring any settings permission

#### Scenario: Operations act on the caller only
- **WHEN** a self-service credential operation is called by any authenticated viewer
- **THEN** it applies to that caller's own account and offers no parameter selecting another account