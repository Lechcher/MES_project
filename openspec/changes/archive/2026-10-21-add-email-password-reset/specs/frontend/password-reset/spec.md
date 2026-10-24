# Spec Delta

## Purpose

Lets a user who has forgotten their password recover access without an administrator: request a reset message from the sign-in screen, then follow its link to a public page that sets a new password.

## ADDED Requirements

### Requirement: A reset can be requested from sign-in
The sign-in screen SHALL let a visitor request a password-reset message for an email address, and SHALL show a neutral confirmation that does not reveal whether that address has an account.

#### Scenario: Request accepted
- **WHEN** a visitor submits an email address on the sign-in screen
- **THEN** a neutral confirmation is shown and the reset request is issued

#### Scenario: Delivery failure is shown
- **WHEN** the reset request fails because the message could not be delivered
- **THEN** the screen shows an explicit failure instead of the confirmation

### Requirement: The reset page consumes a token
A public reset route SHALL read the token from the link, require a new password meeting the password policy, submit it, and on success direct the visitor to sign in.

#### Scenario: Valid token sets a new password
- **WHEN** a visitor opens a valid reset link, enters a conforming password, and submits
- **THEN** the password is changed and the visitor is directed to sign in with it

#### Scenario: Password below policy is rejected
- **WHEN** the entered password does not meet the password policy
- **THEN** the form reports the policy failure and no password change is requested

### Requirement: The password policy matches the administrative reset
The reset route SHALL apply the same minimum password length the administrative password reset enforces.

#### Scenario: Policy parity
- **WHEN** a password accepted by the administrative reset is entered on the reset route
- **THEN** the reset route accepts it too

### Requirement: Invalid or expired tokens are reported distinctly
The reset route SHALL report an invalid or expired token as such and SHALL offer to request a new reset message, rather than showing a generic failure.

#### Scenario: Expired token
- **WHEN** a visitor opens a reset link whose token has expired
- **THEN** the route reports the token as invalid or expired and offers a way to request a new message

### Requirement: The reset route is reachable without a session
The reset route SHALL be reachable by a visitor with no session and SHALL NOT redirect them to sign in.

#### Scenario: Anonymous visitor
- **WHEN** a visitor with no session opens the reset route
- **THEN** the reset form is shown

### Requirement: The new password is not persisted in the browser
The reset form SHALL mask the entered password and SHALL NOT store the password in browser storage.

#### Scenario: No stored credential
- **WHEN** a password is entered and submitted on the reset route
- **THEN** the value is masked while entering and is not written to browser storage
