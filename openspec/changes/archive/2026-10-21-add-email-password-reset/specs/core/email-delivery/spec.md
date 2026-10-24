# Spec Delta

## Purpose

Sends the password-reset message over a configuration-selected SMTP server, and reports what actually happened. It exists so the deployment can move from a hosted provider to a local mail server by changing configuration alone, and so a message that was never delivered is never presented as a success.

## ADDED Requirements

### Requirement: Transport mode follows the configured endpoint
The system SHALL send mail through the SMTP endpoint named by the configured mail URL, selecting implicit TLS for a `smtps` endpoint, STARTTLS for a plain `smtp` endpoint carrying credentials, and unauthenticated plain delivery for an endpoint carrying none. Changing servers SHALL require only a configuration change.

#### Scenario: Implicit TLS endpoint
- **WHEN** the configured endpoint is an `smtps` host on port 465 with credentials
- **THEN** the message is delivered over a TLS connection established before the SMTP conversation

#### Scenario: STARTTLS endpoint
- **WHEN** the configured endpoint is a plain `smtp` host with credentials
- **THEN** the message is delivered after the connection is upgraded to TLS

#### Scenario: Local unauthenticated endpoint
- **WHEN** the configured endpoint is a local host on port 1025 with no credentials
- **THEN** the message is delivered without authentication and without TLS

### Requirement: Reset mail links to the web application
The reset message SHALL direct the recipient to the web application's reset route carrying the issued token, and SHALL NOT point at the API service's own origin.

#### Scenario: Link targets the web application
- **WHEN** a reset message is composed
- **THEN** its link uses the configured web origin's reset route and includes the issued token

#### Scenario: Message identifies the configured sender
- **WHEN** the message is delivered
- **THEN** its sender address is the configured reset sender identity

### Requirement: Every delivery attempt records its outcome
The system SHALL record each reset-mail delivery attempt with its outcome — delivered or failed — and SHALL record a reason when it failed.

#### Scenario: Successful delivery is recorded
- **WHEN** the mail server accepts the message
- **THEN** the attempt is recorded as delivered

#### Scenario: Failed delivery records a reason
- **WHEN** the mail server refuses the connection, rejects authentication, or refuses the message
- **THEN** the attempt is recorded as failed together with the reported reason

### Requirement: A failed delivery is never reported as success
A reset request whose message was attempted and failed SHALL report a failure to the caller. A request that was deliberately not sent because the address is unknown SHALL still report the neutral success response, so account existence is not disclosed.

#### Scenario: Transport failure surfaces
- **WHEN** a reset is requested for an existing address and delivery fails
- **THEN** the request reports a failure rather than success

#### Scenario: Unknown address stays neutral
- **WHEN** a reset is requested for an address with no account
- **THEN** the request reports the neutral success response and no message is sent

### Requirement: Missing mail configuration is reported explicitly
When no mail endpoint is configured, the system SHALL refuse the reset request with an explicit unavailable-mail-sender failure and SHALL NOT attempt delivery.

#### Scenario: No endpoint configured
- **WHEN** a reset is requested while no mail endpoint is configured
- **THEN** the request fails with an explicit unavailable-mail-sender error

### Requirement: The mail credential is never disclosed
The system SHALL NOT write the mail credential to logs, error messages, API responses, or committed files.

#### Scenario: Failure report omits the credential
- **WHEN** a delivery fails and the failure is reported or recorded
- **THEN** neither the reported error nor the recorded reason contains the credential
