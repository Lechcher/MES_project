# Spec Delta

## MODIFIED Requirements

### Requirement: Documented app operations
The system SHALL expose the documented queries and mutations for Jobs, Planning, Performance, Settings & IAM, and Audit Log, including the shared ticket-state and leave-code registries. User creation SHALL accept no user code and assign one automatically, and audit log queries SHALL return readable labels — `FullName (userCode)` — wherever an entry references a user by identifier. The Jobs surface SHALL additionally expose the completion-request read and mutation operations, and a task SHALL expose its journey of completion requests and its planned stage count. The API SHALL additionally expose the Telegram-account operations — reading the viewer's linked accounts, linking (upserting) a Telegram account, and removing one — on the same versioned endpoint, with every operation scoped to the authenticated viewer and a session string never appearing in error messages or logs.

#### Scenario: Read and mutate a task
- **WHEN** an authorized client queries tasks and accepts a task in `REQ`
- **THEN** the API returns task data and the task transitions to `ACT`

#### Scenario: Register leave
- **WHEN** an authenticated client registers a valid leave request
- **THEN** the API returns the created request in `PENDING`

#### Scenario: Submit a completion request
- **WHEN** an authenticated assignee submits a `FULL_JOB` completion request for an `ACT` ticket
- **THEN** the API returns the created request in `PEN` and the ticket in `PEN`

#### Scenario: Create a user without a code
- **WHEN** an authorized admin creates a user without supplying a user code
- **THEN** the user is created with the next free code in the `V0000000`–`V9999999` range

#### Scenario: Read the audit stream
- **WHEN** an authorized technical role queries audit events
- **THEN** the API returns the filtered activity data with user references rendered as readable labels

#### Scenario: Exhausted code range fails explicitly
- **WHEN** every code in the `V0000000`–`V9999999` range is already taken and a user is created
- **THEN** the API reports a `CONFLICT` failure and creates no user

#### Scenario: Read the viewer's Telegram accounts
- **WHEN** an authenticated viewer queries their linked Telegram accounts
- **THEN** the API returns exactly that viewer's accounts — profile information and the session material needed to restore them — and no other viewer's accounts

#### Scenario: Link a Telegram account twice
- **WHEN** a viewer links a Telegram account they already have linked
- **THEN** the API updates the viewer's existing record for that Telegram identity instead of creating a second one

#### Scenario: Remove a Telegram account
- **WHEN** a viewer removes one of their linked Telegram accounts
- **THEN** the API deletes that viewer's record for that Telegram identity and leaves the viewer's other accounts unchanged

#### Scenario: Telegram account operations stay viewer-scoped
- **WHEN** one authenticated viewer attempts to read or remove another viewer's Telegram account
- **THEN** the API refuses with the same failure shape an out-of-scope resource produces, revealing nothing about the other viewer's accounts