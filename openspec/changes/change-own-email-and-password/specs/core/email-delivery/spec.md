# Spec Delta

## ADDED Requirements

### Requirement: Email-change verification mail links to the web application
The verification message sent for a self-service email change SHALL be addressed to the new address, SHALL carry the issued confirmation token in a link to the web application's confirmation route, and SHALL NOT point at the API service's own origin.

#### Scenario: Link targets the web application
- **WHEN** a verification message is composed for an email change
- **THEN** its link uses the configured web origin's confirmation route, includes the issued token, and is addressed to the new email address

#### Scenario: Message identifies the configured sender
- **WHEN** a verification message is delivered
- **THEN** its sender address is the configured sender identity used by the system's other outbound messages

### Requirement: Email-change mail failures surface like reset failures
A verification-mail delivery attempt SHALL be recorded with its outcome. A failure SHALL be reported to the caller as a failure and never as a success, and with no mail endpoint configured the email-change request SHALL fail with an explicit unavailable-sender error without sending anything.

#### Scenario: Failed delivery is reported
- **WHEN** a valid email-change request is submitted and the mail server refuses the message
- **THEN** the request reports a failure, the failed attempt is recorded with its reason, and the account's email is unchanged

#### Scenario: No endpoint configured
- **WHEN** an email-change request is submitted while no mail endpoint is configured
- **THEN** the request fails with an explicit unavailable-sender error, nothing is sent, and the account's email is unchanged