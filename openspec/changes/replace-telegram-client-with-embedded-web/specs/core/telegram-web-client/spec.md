# Spec Delta

## Purpose

How a viewer opens their Telegram accounts inside MES: the module embeds the
Telegram Web client, one slot per linked account, with the sessions backed up
to the viewer's MES account so every later sign-in restores them
automatically — no phone number, OTP, or QR code again.

## ADDED Requirements

### Requirement: Open the Telegram module from the dashboard

The dashboard SHALL offer the Telegram module to every role. The module is a
viewer-personal workspace: it lists only the signed-in viewer's own linked
Telegram accounts, scoped by the viewer's authenticated session.

#### Scenario: Employee opens the module
- **WHEN** an `EMPLOYEE` opens the Telegram module from the dashboard
- **THEN** the viewer's own linked Telegram accounts are offered and no other viewer's accounts can be reached from the surface

#### Scenario: Viewer isolation
- **WHEN** two different viewers use the same browser, one after the other
- **THEN** each viewer's module shows only that viewer's own linked accounts

### Requirement: Link a Telegram account inside the embedded client

A signed-in viewer SHALL be able to link a Telegram account they control
through the embedded Telegram Web client's own login — phone number plus
OTP, 2FA cloud password when the account has one, or QR-code login. On a
completed login the module SHALL record the account against the viewer, keep
exactly one record per viewer and Telegram identity (a re-link refreshes it),
and capture that account's session material for backup. An abandoned login
SHALL leave no record.

#### Scenario: Link with phone and OTP
- **WHEN** a signed-in viewer completes the embedded client's phone + OTP (and 2FA when required) flow for a Telegram account they control
- **THEN** the viewer's linked-account list gains that account with its profile information, and it survives a page reload

#### Scenario: Re-linking updates in place
- **WHEN** a viewer re-links a Telegram account already present in their list
- **THEN** the viewer still has exactly one record for that Telegram identity, refreshed from the new login

#### Scenario: Abandoned login leaves nothing
- **WHEN** a viewer cancels the login before it completes
- **THEN** no account record is created for the unauthenticated Telegram identity

### Requirement: Back up session material encrypted at rest
The captured session material SHALL be stored only in encrypted form, using
AES-256-GCM with a server-held key, and SHALL never appear in logs, audit
records, error reports, or responses to anyone but the owning viewer. Phone
numbers SHALL be stored masked.

#### Scenario: Session at rest is ciphertext
- **WHEN** a linked account's stored session is inspected in the database
- **THEN** the persisted value is ciphertext produced by the server-held key, and no plaintext session appears in any log or audit record

#### Scenario: Decrypted session reaches only its owner
- **WHEN** a viewer's accounts are read over the API
- **THEN** the viewer's own sessions are restorable to that viewer, and no operation exposes any session belonging to another viewer

### Requirement: Take the deployment's configuration for session protection
The module SHALL take its session-encryption key from server-side
configuration; the key SHALL NOT be hardcoded from a shared public source.

#### Scenario: Missing encryption key fails safely
- **WHEN** the backend starts without a configured session-encryption key and a viewer attempts to link an account
- **THEN** linking fails with a configuration error and no session material is stored in any form

### Requirement: Restore linked accounts automatically on module open

When a signed-in viewer opens the module, every linked account's session
SHALL be restored from the backend without asking for credentials again —
no phone number, OTP, or 2FA prompt — and each restore SHALL affect only its
own account. The restores SHALL run together before the client mounts, so
the client's own account switcher can move between accounts with no login
step.

#### Scenario: All accounts reconnect without re-authentication
- **WHEN** a viewer with several linked Telegram accounts opens the module after signing in to MES, on the same or a different browser or device
- **THEN** every linked account reconnects from its stored session with no phone number, OTP, or 2FA prompt

#### Scenario: One dead account does not block the others
- **WHEN** one linked account's session is no longer valid while the others are
- **THEN** the valid accounts connect and the invalid one is reported as disconnected with a re-link affordance, while the other accounts remain connected and usable


### Requirement: Give every linked account a stable slot

Each linked account SHALL be assigned a stable slot identifying it in the
embedded client's own account scheme, recorded at link time and reused for
every later restore, so a routine restore is not a new session to Telegram
and two viewers sharing one browser never claim the same slot.

#### Scenario: Slot survives reload and device
- **WHEN** a linked account is restored on any later sign-in, in any browser
- **THEN** it is restored into the same slot recorded at its link time

#### Scenario: No slot collisions between viewers
- **WHEN** two different viewers have linked accounts and use the same browser
- **THEN** their accounts occupy different slots and each viewer's module only ever hydrates that viewer's own session material into its own slots

### Requirement: Present the module as an embedded Telegram workspace

The module SHALL mount the embedded Telegram Web client as the chat surface
— its full conversation, sticker, media, folder, and search features for the
viewer's accounts. MES SHALL implement no chat UI, account switcher, or
Telegram protocol logic of its own: the embedded client's own account
switcher switches between the viewer's linked accounts, and MES only mounts
the client and keeps the accounts' sessions restored.

#### Scenario: Send a message in the active chat
- **WHEN** a viewer composes and sends a message in the active conversation
- **THEN** the message is delivered through the active account's Telegram session and appears in the conversation history

#### Scenario: Embedded client features
- **WHEN** a viewer opens a conversation in the workspace
- **THEN** the viewer has the embedded client's full chat surface (stickers, attachments, folders, search) for the active account

#### Scenario: Switching accounts happens inside the client
- **WHEN** a viewer switches accounts using the embedded client's own switcher
- **THEN** the client moves to that account with no login step — its session was restored on module open — and the other accounts remain restored for the next switch

#### Scenario: No peer crash from one dead account
- **WHEN** one account's session has been revoked by Telegram
- **THEN** the viewer stays signed in to MES, the account no longer connects (the client itself offers its own re-login), and the other accounts keep working

### Requirement: Unlink a Telegram account from the viewer

The viewer's linked Telegram accounts SHALL be removable through the
module's own API surface: removal deletes that account's stored record and
session material and clears its slot's data in the viewer's browser, leaving
every other account untouched. A removed account SHALL not be restored on
any later app load.

#### Scenario: Remove one account
- **WHEN** a linked Telegram account is removed for the viewer
- **THEN** its record and session material are deleted, its slot's data is cleared from the browser, and the remaining accounts keep working — including on every later app load