# Spec Delta

## ADDED Requirements

### Requirement: Authorize commerce operations under the module permission matrix
The system SHALL register the `shoptify` module in the same permission model as the platform's other apps — its module access, its operations, and each role's effective data scope — and SHALL authorize every commerce query and mutation on the server under that matrix, independently of what the client renders.

#### Scenario: Commerce operation denied without module access
- **WHEN** a caller whose role has no `shoptify` module access calls a commerce query or mutation directly
- **THEN** the operation is denied and no commerce data is returned or changed

#### Scenario: Commerce operation allowed for granted role
- **WHEN** a caller whose role is granted `shoptify` access performs a permitted commerce operation
- **THEN** the operation executes within that role's data scope, and results contain no data outside the scope

#### Scenario: Commerce matrix is data, not code paths
- **WHEN** an administrator changes the commerce module's role access in the permission matrix
- **THEN** subsequent authorization decisions and app launcher rendering follow the change without a deployment