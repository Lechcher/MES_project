# Spec Delta

## ADDED Requirements

### Requirement: Refuse a QR login that needs a cloud password with an actionable message
QR-code login SHALL be offered for accounts without a second factor. When a
scanned account requires a 2FA cloud password, the module SHALL refuse the QR
attempt with a message in the viewer's language that says the account has a
cloud password and points at the phone-number flow, and SHALL leave no record
and no connected client behind. A viewer SHALL NOT see a raw authentication
error, an untranslated failure string, or a silently hanging QR code.

#### Scenario: A 2FA account scans the QR code
- **WHEN** a viewer scans a QR code for a Telegram account that has a cloud password
- **THEN** the module shows the refusal message naming the phone-number flow as the way in, in the viewer's language
- **AND** no account record is created and no client stays connected

#### Scenario: A viewer retries through the phone flow
- **WHEN** a viewer whose QR attempt was refused completes the phone-number flow for the same account
- **THEN** the account links normally, its cloud password having been asked for during that flow