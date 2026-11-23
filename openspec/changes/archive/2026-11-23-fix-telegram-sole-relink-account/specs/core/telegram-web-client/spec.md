# Spec Delta

## MODIFIED Requirements

### Requirement: Restore linked accounts automatically on module open

When a signed-in viewer opens the module, every linked account's session
SHALL be restored from the backend without asking for credentials again —
no phone number, OTP, or 2FA prompt — and each restore SHALL affect only
its own account. The restores SHALL run together before the client mounts,
so the client's own account switcher can move between accounts with no login
step.

An account whose session no longer restores SHALL be reported as needing a
re-link whenever the viewer has one, whether or not other accounts still
connect: the module opens such an account, mounting the embedded client at a
linking slot with its own login screen on show, and shows the re-link
affordance for it. Completing that login SHALL refresh the same account
record in place — one record per viewer and Telegram identity, the stable
slot kept — after which the account restores like any other.

#### Scenario: All accounts reconnect without re-authentication
- **WHEN** a viewer with several linked Telegram accounts opens the module after signing in to MES, on the same or a different browser or device
- **THEN** every linked account reconnects from its stored session with no phone number, OTP, or 2FA prompt

#### Scenario: One dead account does not block the others
- **WHEN** one linked account's session is no longer valid while the others are
- **THEN** the valid accounts connect and the invalid one is reported as disconnected with a re-link affordance, while the other accounts remain connected and usable

#### Scenario: A viewer whose only account no longer restores is offered its re-link
- **WHEN** a signed-in viewer opens the module and none of their linked accounts restores (their only account's session is gone, or every account's is)
- **THEN** the module opens the first such account — the embedded client is mounted at a linking slot with its own login screen — and the re-link affordance is shown, rather than an empty module with no affordance and no client

#### Scenario: Re-linking the dead account refreshes it in place
- **WHEN** the viewer completes the embedded client's own login for an account that no longer restored
- **THEN** the viewer still has exactly one record for that Telegram identity, restored and usable like any other linked account, with the account it already had keeping its stable slot