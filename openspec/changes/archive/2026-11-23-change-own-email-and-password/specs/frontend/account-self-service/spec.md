# Spec Delta

## Purpose

Lets a signed-in user manage their own account credentials from the Settings app: change their password with current-password verification, and change their email through a verification link sent to the new address, with session and audit consequences handled.

## ADDED Requirements

### Requirement: Change password from the Account tab
The Account tab SHALL let a signed-in user change their own password by providing the current password and a new password meeting the shared minimum-length policy. A wrong current password SHALL produce an actionable failure with no password change. On success every other session SHALL be revoked while the current session stays signed in, and an audit event SHALL be recorded.

#### Scenario: Change succeeds
- **WHEN** a signed-in user submits the correct current password and a new password of at least the minimum length
- **THEN** the password changes, the user stays signed in on the current session, other sessions no longer authenticate, and an audit event is recorded

#### Scenario: Wrong current password
- **WHEN** a signed-in user submits an incorrect current password
- **THEN** the change fails with a message that identifies the current password as the problem and no other session is affected

#### Scenario: New password below policy
- **WHEN** a signed-in user submits a new password shorter than the minimum length
- **THEN** the form reports the policy failure before any request is issued

#### Scenario: No stored credential
- **WHEN** a password is entered and submitted on the Account tab
- **THEN** the values are masked while entering and are not written to browser storage

### Requirement: Change email through a verification link
The Account tab SHALL let a signed-in user start an email change by providing their current password and the new address. The system SHALL send a verification link to the new address, and the account's email SHALL change only after that link is confirmed; until then the previous address remains the account's email.

#### Scenario: Link confirms the change
- **WHEN** a user submits the correct current password with a new address and then opens the verification link sent to that address
- **THEN** the account's email becomes the new address, the session stays signed in, and an audit event is recorded

#### Scenario: Change waits for confirmation
- **WHEN** the verification link has not yet been opened
- **THEN** the account's email is still the previous address, which continues to work for signing in

#### Scenario: Duplicate address
- **WHEN** a signed-in user requests a change to an address already used by another account
- **THEN** the request is rejected as a conflict, no verification message is sent, and no audit event is recorded

#### Scenario: Wrong current password
- **WHEN** a signed-in user requests an email change with an incorrect current password
- **THEN** the request fails, no verification message is sent, and no audit event is recorded

### Requirement: Verification link failures are reported distinctly
The confirmation SHALL report an invalid or expired link as such and SHALL offer a way to start the email change again, rather than showing a generic failure. A confirmed link SHALL NOT be reusable.

#### Scenario: Expired link
- **WHEN** a user opens a verification link whose token is invalid or has expired
- **THEN** the screen reports the link as unusable and offers a way to request a new one

#### Scenario: Reused link
- **WHEN** a user opens a verification link that was already confirmed earlier
- **THEN** the screen reports the link as unusable and the account's email is unchanged

#### Scenario: Confirmation needs no session
- **WHEN** a user who is not signed in opens a valid verification link
- **THEN** the change is applied to the account that requested it and the screen reports the result without asking the user to sign in

### Requirement: Mail delivery failures and missing configuration are explicit
When a verification message cannot be delivered, the email-change request SHALL report an explicit failure and SHALL NOT apply the change. With no mail endpoint configured, the request SHALL fail with an explicit unavailable-sender failure without applying the change.

#### Scenario: Delivery fails
- **WHEN** a valid email-change request is submitted and the mail server refuses the message
- **THEN** the user sees an explicit failure, the account's email is unchanged, and the failed delivery is recorded

#### Scenario: No mail sender configured
- **WHEN** an email-change request is submitted while no mail endpoint is configured
- **THEN** the request fails with an explicit unavailable-sender error and the account's email is unchanged

### Requirement: The Account tab acts on the signed-in account only
Both forms SHALL target the signed-in user's own account. The Account tab SHALL offer no way to name another user, and starting a password change or an email change SHALL require a valid session — a request without one is rejected regardless of role.

#### Scenario: No other account selectable
- **WHEN** a signed-in user opens the Account tab
- **THEN** the forms act on the user's own account and present no field naming another account

#### Scenario: Session required to start a change
- **WHEN** a password change or an email-change request is called without a valid unexpired session
- **THEN** the request is rejected and neither the email nor the password changes

### Requirement: No credential material in the audit trail
Audit events recorded for credential changes SHALL identify the actor, action, resource, and timestamp, and SHALL NOT contain any password value, verification token, or credential hash.

#### Scenario: Password change audited without the password
- **WHEN** a password change succeeds and its audit event is read
- **THEN** the event shows who changed their password and when, and contains neither password

### Requirement: Account tab is localized
Every label, field, policy hint, and result message on the Account tab SHALL be rendered in the active locale for every supported locale.

#### Scenario: Vietnamese locale
- **WHEN** a signed-in user opens the Account tab with the locale set to Vietnamese
- **THEN** all visible strings are Vietnamese

#### Scenario: English locale
- **WHEN** a signed-in user opens the Account tab with the locale set to English
- **THEN** all visible strings are English