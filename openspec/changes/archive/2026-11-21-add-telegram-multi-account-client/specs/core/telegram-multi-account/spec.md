# Spec Delta

## Purpose

How a viewer links their own Telegram accounts to their MES account, restores
those sessions automatically in the browser, and works across several accounts
in one workspace — with every credential protected from storage through
restore.

## ADDED Requirements

### Requirement: Link a Telegram account to the signed-in viewer
A signed-in viewer SHALL be able to link a Telegram account they control by
phone number plus OTP (and 2FA cloud password when the account has one) or by
QR-code login. On success the system SHALL record the Telegram identity and
persist the session for that viewer. The same Telegram account linked again by
the same viewer SHALL update the existing record rather than create a second
one, and the linking flow SHALL run entirely under the viewer's own
authenticated session.

#### Scenario: Link with phone and OTP
- **WHEN** a signed-in viewer completes phone-number, OTP, and (when required) 2FA verification for a Telegram account they control
- **THEN** the viewer's linked-account list gains that Telegram account with its profile information, and it survives a page reload

#### Scenario: Re-linking updates in place
- **WHEN** a viewer re-links a Telegram account already present in their list
- **THEN** the viewer still has exactly one record for that Telegram identity, refreshed from the new login

#### Scenario: Abandoned flow leaves nothing
- **WHEN** a viewer cancels the linking flow before the Telegram login completes
- **THEN** no account record is created for the unauthenticated Telegram identity

### Requirement: Store Telegram sessions encrypted at rest
The system SHALL store each Telegram session string only in encrypted form,
using AES-256-GCM with a server-held key, and SHALL never write it to logs,
audit records, error reports, or non-owner responses. Phone numbers SHALL be
stored masked, and masked profile information is all the module's list views
need — the session material itself SHALL be returned only to the owning
viewer's own account request.

#### Scenario: Session at rest is ciphertext
- **WHEN** a linked account's stored session is inspected in the database
- **THEN** the persisted value is ciphertext produced by the server-held key, and no plaintext session appears in any log or audit record

#### Scenario: Decrypted session reaches only its owner
- **WHEN** a viewer's account list is read over the API
- **THEN** the viewer's own sessions are restored to that viewer, and no operation exposes any session belonging to another viewer

### Requirement: Restore every linked account automatically on sign-in
When a signed-in viewer opens the Telegram module, the system SHALL restore
every linked account's session without asking for credentials again, and the
restores SHALL run together rather than one at a time. A restore that fails
SHALL affect only its own account.

#### Scenario: All accounts reconnect without re-authentication
- **WHEN** a viewer with several linked Telegram accounts opens the module after signing in to MES
- **THEN** every linked account reconnects from its stored session with no phone number, OTP, or 2FA prompt

#### Scenario: One dead account does not block the others
- **WHEN** one linked account's session is no longer valid while the others are
- **THEN** the valid accounts connect and the invalid one is reported as disconnected

### Requirement: Isolate dead sessions without losing the account list
A session Telegram has revoked or unregistered SHALL leave the account listed
and marked disconnected for its owner, with a way to re-link, while every
other account keeps working. The module SHALL NOT crash, clear the viewer's
session, or hide the other accounts because one session died.

#### Scenario: Revoked session is marked, not fatal
- **WHEN** Telegram reports that a stored session has been revoked
- **THEN** that account shows a disconnected state with a re-link affordance, the other accounts remain connected and usable, and the viewer stays signed in to MES

### Requirement: Keep one device fingerprint per account for every reconnection
The system SHALL persist the device identity (device model, system version,
app version) generated at the account's first login and SHALL reuse it for
every later reconnection of that account, so Telegram does not read a routine
restore as a suspicious session change. A new fingerprint SHALL be generated
only when the account is linked for the first time or re-linked.

#### Scenario: Reconnected account keeps its device identity
- **WHEN** a linked account reconnects after a sign-out, a browser restart, or a page reload
- **THEN** the connection presents the same stored device identity as the original login

### Requirement: Track per-account unread and connection state in real time
The module SHALL attach live message listeners to every connected account and
SHALL keep each account's unread count and connection status current — on the
switcher rail and in the chat list — even while the viewer is working in
another account's chat or elsewhere in MES.

#### Scenario: Unread badge updates for a background account
- **WHEN** a new message arrives in an account that is not the active chat
- **THEN** that account's unread badge and chat-list row update without the viewer switching to it

#### Scenario: Connection dot follows the session
- **WHEN** an account's client disconnects or fails to connect
- **THEN** that account's status indicator shows disconnected and returns to connected when the client recovers

### Requirement: Present a three-column multi-account workspace
The module SHALL render a switcher rail listing every linked account with its
avatar, unread badge, and connection indicator plus an add-account action; a
chat-list sidebar for the active account with search and All/Unread/Groups/
Channels filters; and a chat window for the selected conversation showing its
header, message history, and a composer that sends text, replies, and basic
file or image attachments.

#### Scenario: Send a message in the active chat
- **WHEN** a viewer types text in the composer of the active chat and sends it
- **THEN** the message is delivered through the active account's Telegram session and appears in the conversation history

#### Scenario: Filter the chat list
- **WHEN** a viewer selects the Unread filter in the chat-list sidebar
- **THEN** only conversations with unread messages are listed for the active account

#### Scenario: Switch accounts
- **WHEN** a viewer selects a different account in the switcher rail
- **THEN** the sidebar and chat window show that account's conversations and the previously selected account's session stays connected

### Requirement: Unlink a Telegram account from the viewer
A viewer SHALL be able to remove a linked Telegram account. Removal SHALL
delete that account's stored record and session, disconnect its client, and
leave every other account untouched. A removed account SHALL not be restored
on any later app load.

#### Scenario: Remove one account
- **WHEN** a viewer removes a linked Telegram account
- **THEN** its record and session are deleted, its client disconnects, the switcher rail no longer offers it, and the remaining accounts keep working

### Requirement: Configure Telegram API material from the deployment
The module SHALL take its Telegram api id and api hash from deployment
configuration, and its session-encryption key from server-side configuration;
neither SHALL be hardcoded from a shared public source. A deployment missing
the encryption key SHALL refuse to store sessions with an actionable
configuration error rather than falling back to an insecure default.

#### Scenario: Missing encryption key fails safely
- **WHEN** the backend starts without a configured session-encryption key and a viewer attempts to link an account
- **THEN** linking fails with a configuration error and no session material is stored in any form