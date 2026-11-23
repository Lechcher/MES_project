# Spec Delta

## MODIFIED Requirements

### Requirement: Authenticated API sessions
The system SHALL provide `login`, `logout`, `viewer`, password reset, password change, and self-service email change operations — a request naming the new address and a confirmation applying it — and SHALL require a valid unexpired session for protected operations. The `login` operation SHALL accept either an email address or a user code as the identifier — exactly one of the two — and SHALL report an unknown identifier with the same `UNAUTHENTICATED` failure a wrong password produces.

#### Scenario: Login and use a session
- **WHEN** a user submits valid credentials and uses the returned session token on a later request
- **THEN** the API returns the authenticated viewer and permits authorized operations

#### Scenario: Login by user code
- **WHEN** a user submits a valid user code with their password
- **THEN** the API returns the authenticated viewer and session, exactly as an email login does

#### Scenario: Login with both identifiers
- **WHEN** a login input carries both an email and a user code
- **THEN** the API rejects the input with `VALIDATION_FAILED`

#### Scenario: Reject an expired session
- **WHEN** a protected operation is called without a valid session
- **THEN** the API returns an `UNAUTHENTICATED` error

#### Scenario: Email change requires a session
- **WHEN** a self-service email-change request is called without a valid unexpired session
- **THEN** the request is rejected and the account's email does not change

#### Scenario: Confirmation is token-bound
- **WHEN** a valid confirmation token is presented without a session
- **THEN** the change is applied only to the account that requested it