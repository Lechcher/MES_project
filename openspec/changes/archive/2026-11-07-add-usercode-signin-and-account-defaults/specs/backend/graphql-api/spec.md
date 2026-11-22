# Spec Delta

## MODIFIED Requirements

### Requirement: Authenticated API sessions
The system SHALL provide `login`, `logout`, `viewer`, password reset, and password change operations, and SHALL require a valid unexpired session for protected operations. The `login` operation SHALL accept either an email address or a user code as the identifier — exactly one of the two — and SHALL report an unknown identifier with the same `UNAUTHENTICATED` failure a wrong password produces.

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

### Requirement: Documented app operations
The system SHALL expose the documented queries and mutations for Jobs, Planning, Performance, Settings & IAM, and Audit Log, including the shared ticket-state and leave-code registries. User creation SHALL accept no user code and assign one automatically, and audit log queries SHALL return readable labels — `FullName (userCode)` — wherever an entry references a user by identifier.

#### Scenario: Read and mutate a task
- **WHEN** an authorized client queries tasks and accepts a task in `REQ`
- **THEN** the API returns task data and the task transitions to `ACT`

#### Scenario: Register leave
- **WHEN** an authenticated client registers a valid leave request
- **THEN** the API returns the created request in `PENDING`

#### Scenario: Create a user without a code
- **WHEN** an authorized admin creates a user without supplying a user code
- **THEN** the user is created with the next free code in the `V0000000`–`V9999999` range

#### Scenario: Read the audit stream
- **WHEN** an authorized technical role queries audit events
- **THEN** the API returns the filtered activity data with user references rendered as readable labels

#### Scenario: Exhausted code range fails explicitly
- **WHEN** every code in the `V0000000`–`V9999999` range is already taken and a user is created
- **THEN** the API reports a `CONFLICT` failure and creates no user
