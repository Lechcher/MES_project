# Spec Delta

## ADDED Requirements

### Requirement: Authenticate Telegram users before any bot use
The system SHALL refuse every bot command except `/start`, `/help`, `/login`,
and `/link` until the Telegram identity is linked to an active MES user.
Linking SHALL be possible through a single-use, time-limited link code
generated on the website for the signed-in user, or through in-bot credentials
fallback that verifies the same password the web login verifies. A revoked or
expired link SHALL behave exactly like an unlinked identity.

#### Scenario: Unauthenticated user opens the bot
- **WHEN** a Telegram user that has no active link sends any command other than `/start`, `/help`, `/login`, or `/link`
- **THEN** the bot replies with the login instructions and executes nothing

#### Scenario: Link code login (preferred flow)
- **WHEN** a signed-in user generates a link code on the website and sends it to the bot with `/link`
- **THEN** the bot marks the Telegram identity as linked to that user and confirms the login
- **AND** the code is rejected on any second use

#### Scenario: Link code expiry
- **WHEN** a link code is older than its expiry or has already been consumed
- **THEN** the bot rejects it and asks the user to generate a new code

#### Scenario: Credentials fallback login
- **WHEN** an unlinked user sends valid MES credentials with `/login`
- **THEN** the bot links the Telegram identity to that account and deletes the credential message where Telegram allows
- **AND** invalid credentials produce the same generic failure as a wrong password, without revealing which accounts exist

#### Scenario: Revoked link loses access
- **WHEN** a linked account is revoked from the website (or the MES account is deactivated)
- **THEN** subsequent bot commands behave like an unlinked identity

### Requirement: Configure the bot from environment and website
Every bot setting (enable flag, bot token, AI endpoint, default model, push
alerts) SHALL be resolvable from the backend environment and from the website,
with a documented precedence: per-user preference → website setting →
environment variable → built-in default. Secrets SHALL never appear in bot
messages, logs, or GraphQL responses unmasked.

#### Scenario: Environment bootstrap
- **WHEN** a deployment provides bot settings only through environment variables
- **THEN** the bot starts with those values without any website configuration

#### Scenario: Website overrides environment
- **WHEN** an operator saves a different value in the website's Telegram settings
- **THEN** the website value takes precedence for new sessions, and the environment value is used again when the website value is cleared

#### Scenario: Secret masking
- **WHEN** bot settings (including the AI API key and bot token) are read through any surfacing other than the settings editor
- **THEN** only the masked form is shown, and no secret is written to logs or audit records

#### Scenario: Per-user model preference overrides the global default
- **WHEN** a user selects a model inside the bot
- **THEN** that model is used for their subsequent questions, without changing the default for other users

### Requirement: Maintain the AI model catalog from an OpenAI-compatible endpoint
The system SHALL fetch the available model list from the configured
OpenAI-compatible base URL, cache it, and make switching models possible from
inside the bot. A failed fetch SHALL keep the last known catalog rather than
leaving the user without options.

#### Scenario: Catalog refresh
- **WHEN** the bot starts or an operator requests a refresh
- **THEN** the models reported by the endpoint's catalog route are stored with their identifiers and shown to users on request

#### Scenario: Catalog unavailable
- **WHEN** the endpoint's catalog route fails or is unreachable
- **THEN** the bot keeps serving the last cached catalog and reports that the list may be stale

#### Scenario: User switches model
- **WHEN** a user runs the model command with an identifier from the catalog
- **THEN** subsequent answers for that user use the selected model and the change survives bot restarts

### Requirement: Answer questions through a read-only tool-calling AI agent
The AI agent SHALL answer user questions only by calling a fixed set of
read-only tools. Tools SHALL execute through the same domain query functions
and the same authorization as the web/GraphQL surface, scoped to the linked
viewer. The agent SHALL NOT execute plain-text SQL or any write operation, and
SHALL report a refusal instead of returning data the viewer may not see.

#### Scenario: Question answered through tools
- **WHEN** an authenticated user asks a question the tools can answer
- **THEN** the answer is grounded in tool results for the data the viewer is allowed to see, with no invented figures

#### Scenario: Out-of-scope data
- **WHEN** the answer would require records the viewer's roles and department forbid
- **THEN** the agent states the limitation instead of returning the data

#### Scenario: Write request through the agent
- **WHEN** a user asks the agent to change data
- **THEN** the agent explains it is read-only and points at the bot's dedicated command (for example `/newticket`) or the web app

#### Scenario: Query budget
- **WHEN** a user exceeds the configured per-user AI query budget
- **THEN** further `/ask` requests are refused until the budget window resets

### Requirement: Show the viewer's newest notifications
An authenticated user SHALL be able to list their recent notifications —
including new job openings and job-status changes — from the bot, newest
first, with pagination. Notification records SHALL be the same records the web
surface sees; the bot reads, it does not invent a parallel history.

#### Scenario: List recent notifications
- **WHEN** an authenticated user requests notifications
- **THEN** the bot lists their most recent notification records (template, channel, status, timestamp) and offers the next page when more exist

#### Scenario: No notifications
- **WHEN** the viewer has no notification records
- **THEN** the bot says so plainly instead of showing an empty error

### Requirement: Create job tickets from the bot for authorized roles
The bot SHALL offer a guided job-ticket creation flow to users holding one of
the roles permitted to create tickets on the web surface (Department Head, HR
Manager, Super Admin, Tech Lead). Creation SHALL go through the existing task
creation domain function, produce the same initial ticket state and audit
record as the web flow, and be refused for every other role.

#### Scenario: Authorized user creates a ticket
- **WHEN** a user with a permitted role completes the guided creation flow
- **THEN** a ticket is created through the existing domain path with its identifier reported back, and an audit entry records the action as coming from the bot

#### Scenario: Unauthorized user attempts creation
- **WHEN** a user without a permitted role starts the creation flow
- **THEN** the bot refuses before asking for any details

#### Scenario: Abandoned flow
- **WHEN** a user cancels or stops answering mid-flow
- **THEN** no ticket is created and no partial record remains

### Requirement: Look up jobs, planning, and performance information
The bot SHALL provide read-only lookup of Jobs & Projects, Planning &
Attendance, and Performance & Audit information, scoped by exactly the same
authorization rules and department visibility as the GraphQL surface.

#### Scenario: Lookup within permissions
- **WHEN** an authenticated user requests information in a module their roles permit
- **THEN** the bot returns the same records, fields, and scope the viewer would see on the web surface

#### Scenario: Lookup outside permissions
- **WHEN** the requested module or record is outside the viewer's permissions
- **THEN** the bot refuses with the access-denied reason and returns nothing

### Requirement: Show audit log and server status
The bot SHALL show recent audit-log entries to users authorized for them on the
web surface, and a server status summary to technical roles containing service
health and recent recorded failures. Status data SHALL never include secrets,
tokens, or credential material.

#### Scenario: Audit entries
- **WHEN** an authorized user requests recent audit entries
- **THEN** the bot lists them newest-first with the same fields the audit log exposes, paginated

#### Scenario: Audit without permission
- **WHEN** a user not authorized for audit data requests it
- **THEN** the bot refuses before reading any rows

#### Scenario: Status summary
- **WHEN** a user with a technical role requests status
- **THEN** the bot reports service health and recent failures (for example recent failed notification deliveries and recent error events) without exposing credentials

### Requirement: Deliver notification alerts to linked Telegram accounts
The notification engine SHALL support Telegram as an additional delivery
channel: when an authenticated user has an active link and push alerts are
enabled for them, a newly recorded notification SHALL be delivered to their
Telegram chat through the same best-effort, failure-isolated path as the
existing webhook delivery. Delivery failure SHALL never roll back or fail the
domain change that triggered it.

#### Scenario: Push delivered
- **WHEN** a workflow event records a notification for a user who has an active link with push alerts enabled
- **THEN** the message is sent to that user's Telegram chat and the record's delivery outcome is updated as usual

#### Scenario: Push disabled or unlinked
- **WHEN** the user has no active link, or push alerts are disabled
- **THEN** no Telegram message is attempted and the existing delivery path is unaffected

#### Scenario: Push failure isolation
- **WHEN** Telegram delivery fails (blocked bot, unreachable API)
- **THEN** the notification record is marked failed with the reason and the triggering domain change stays committed
