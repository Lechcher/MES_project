# Spec Delta

## MODIFIED Requirements

### Requirement: Link a Telegram account inside the embedded client

A signed-in viewer SHALL be able to link a Telegram account they control
through the embedded Telegram Web client's own login — phone number plus OTP,
2FA cloud password when the account has one, or QR-code login. On a completed
login the module SHALL record the account against the viewer, keep exactly one
record per viewer and Telegram identity (a re-link refreshes it), and capture
that account's session material for backup. An abandoned login SHALL leave no
record.

A viewer with no linked account SHALL reach the client's own login on opening
the module: the module mounts the embedded client at a linking slot by itself,
with no module-owned button or wizard in the way. A viewer with linked
accounts SHALL see them restored, exactly as before.

#### Scenario: Link with phone and OTP
- **WHEN** a signed-in viewer completes the embedded client's phone + OTP (and 2FA when required) flow for a Telegram account they control
- **THEN** the viewer's linked-account list gains that account with its profile information, and it survives a page reload

#### Scenario: A fresh viewer's module opens the client's login on open
- **WHEN** a signed-in viewer with no linked account opens the Telegram module
- **THEN** the embedded client is mounted at a linking slot and its own login screen is offered immediately, without any click on a module-owned affordance

#### Scenario: No module-owned linking affordance
- **WHEN** a signed-in viewer with no linked account looks at the Telegram module
- **THEN** the module offers no button, wizard, or form of its own for linking an account — the client's own login is the only linking surface

#### Scenario: Session material written before the module session is not absorbed
- **WHEN** a viewer opens the module in a browser whose storage still holds another viewer's account session material (a shared browser, or the same viewer after a sign-out)
- **THEN** that pre-existing material is not recorded against the signed-in viewer; only sessions the embedded client writes or rotates while the module is open are captured

#### Scenario: Re-linking updates in place
- **WHEN** a viewer re-links a Telegram account already present in their list
- **THEN** the viewer still has exactly one record for that Telegram identity, refreshed from the new login

#### Scenario: Abandoned login leaves nothing
- **WHEN** a viewer cancels the login before it completes
- **THEN** no account record is created for the unauthenticated Telegram identity