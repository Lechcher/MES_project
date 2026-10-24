# Spec Delta

## Purpose

Defines how the backend service reports its own runtime — what it writes to the
terminal while running, and what it persists to log files so that a failure can be
checked after the run rather than having to be reproduced live.

## ADDED Requirements

### Requirement: The service records its lifecycle to the terminal
The service SHALL write a line to the terminal when a run begins, recording the port it is listening on and the environment it is running in, so that an operator can see that a run has started and confirm which configuration it picked up without opening a file.

#### Scenario: Startup is reported
- **WHEN** the service begins listening
- **THEN** a line recording the port and the environment is written to the terminal

#### Scenario: Shutdown is reported
- **WHEN** the service stops
- **THEN** a line recording that the run has ended is written to the terminal

### Requirement: Runtime events are written to the terminal as they happen
The service SHALL write each event it records to the terminal at the moment the event occurs, so an operator watching a running service sees the same information the log file holds.

#### Scenario: An event reaches the terminal while the service runs
- **WHEN** the service records an event while running
- **THEN** that event is written to the terminal, not only to the log file

### Requirement: A failure that ends the run is recorded with its stack trace
When the service fails in a way that terminates the run, it SHALL record the failure together with its stack trace, so the cause can be identified after the process is gone.

#### Scenario: An unhandled failure is recorded before the run ends
- **WHEN** the service encounters a failure that it does not handle
- **THEN** the failure and its stack trace are recorded before the run terminates

### Requirement: A failing GraphQL request is recorded with its cause
When a GraphQL request returns errors, the service SHALL record the operation involved and the stable error code returned, so a client-visible failure can be traced to what the service did.

#### Scenario: A rejected operation is recorded with its error code
- **WHEN** a GraphQL request returns one or more errors
- **THEN** the operation involved and the error code returned are recorded

#### Scenario: A malformed request is recorded
- **WHEN** a GraphQL request cannot be parsed as a valid operation
- **THEN** the rejection is recorded with the error code returned to the client

### Requirement: A mail delivery attempt records its outcome
When the service delivers password-reset mail it SHALL record that the delivery succeeded; when delivery fails it SHALL record the failure and the reason, so an email that never arrives can be diagnosed without reproducing the request.

#### Scenario: A successful delivery is recorded
- **WHEN** password-reset mail is accepted for delivery
- **THEN** the delivery is recorded as having been sent

#### Scenario: A failed delivery records the reason
- **WHEN** password-reset mail cannot be delivered
- **THEN** the failure is recorded together with the reason it failed

### Requirement: Recorded events are persisted to a log file
The service SHALL append each event it records to a log file in the configured log directory, so the events of a run can be reviewed after that run has ended.

#### Scenario: An event reaches the log file
- **WHEN** the service records an event
- **THEN** that event is appended to a log file in the configured log directory

#### Scenario: The log file is readable one event per line
- **WHEN** a log file written by the service is read
- **THEN** each recorded event occupies its own line, carrying the time it occurred, its severity, and what it describes

### Requirement: Log files are bounded in the space they may consume
The service SHALL bound the size of its log files so a long-running service cannot fill the available disk, and when the bound is reached it SHALL retain the most recent events for review.

#### Scenario: A log that reaches its size bound is rolled over
- **WHEN** a log file grows beyond the configured size bound
- **THEN** the service continues recording into a new file and retains the most recent events, bounded by a fixed number of retained files

#### Scenario: Oldest log files are discarded first when the bound is exceeded
- **WHEN** the number of retained log files already exceeds the configured limit
- **THEN** the oldest file is discarded before a new one is retained

### Requirement: Credential material is never written to a log
The service SHALL NOT write credential material to the terminal or to a log file; a connection URL that carries a password SHALL be recorded with that credential masked.

#### Scenario: A connection URL is recorded with its password masked
- **WHEN** an event records a connection URL that contains a password
- **THEN** the password is replaced with a mask and the credential itself never appears in the recorded line

#### Scenario: The auth secret is not written
- **WHEN** the service records its configuration
- **THEN** the auth secret used to sign sessions is not included in the recorded line
