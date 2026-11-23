# deployment/container-stack Specification

## Purpose

Defines how the MES system is packaged and run as a set of containers: one
command brings up the frontend, the API, attachment storage, local mail, and a
reverse proxy, with state that survives a restart.

## Requirements

### Requirement: One command brings up the whole system

The stack SHALL start every MES service — web client, API, attachment storage,
local mail, and reverse proxy — from a single Compose invocation in the `docker/`
directory, without any service requiring manual steps first.

#### Scenario: Full stack starts

- **WHEN** an operator runs the documented Compose command from `docker/`
- **THEN** the web client, API, Garage S3, Mailpit, and reverse proxy all reach a running state

#### Scenario: A service waits for its dependency

- **WHEN** the stack starts and the API is not yet accepting connections
- **THEN** the reverse proxy does not serve the app as ready until the API is healthy

### Requirement: The web client is served on one public origin

The reverse proxy SHALL be the only public entry point a browser needs, serving
the web client on a single origin, and the browser SHALL NOT need a second host
or port to reach the API.

#### Scenario: Opening the app

- **WHEN** a browser opens the proxy's published host and port
- **THEN** the MES web client loads and its API calls succeed through the same origin

#### Scenario: Backend is not the browser's origin

- **WHEN** an operator inspects the running stack's published ports
- **THEN** the API is reachable by the web client over the internal network and is not required to be published to the browser

### Requirement: The API reports health

The API service SHALL expose a health endpoint, and the stack SHALL use it to
decide when the API is ready, so the web client is not served before the API can
answer.

#### Scenario: Healthy API

- **WHEN** the API has started inside the stack
- **THEN** a request to its health endpoint returns a success status reporting the service name and environment

#### Scenario: Unhealthy API blocks readiness

- **WHEN** the API has not become healthy
- **THEN** dependent services do not treat it as ready

### Requirement: Attachment storage is available from the stack

The stack SHALL include a bundled S3-compatible storage service and SHALL make it
reachable to the API over the internal network, so ticket attachments work
without an external storage deployment.

#### Scenario: Attachments work end to end

- **WHEN** a viewer uploads a file to a ticket and then downloads it
- **THEN** the file is written to and streamed from the bundled storage service

#### Scenario: Storage is configured as a set

- **WHEN** the API starts in the stack
- **THEN** it is given the storage endpoint, region, bucket, and credentials together, and refuses to start if they are incomplete

### Requirement: Local mail is captured

The stack SHALL include a local SMTP sink and SHALL point the API at it, so
password-reset mail is delivered and inspectable without a hosted provider.

#### Scenario: Reset mail is captured

- **WHEN** a password reset is requested while the stack runs
- **THEN** the message is received by the local sink and is inspectable in its web interface

### Requirement: State survives container recreation

Database, generated exports, and stored attachments SHALL be kept on persistent
volumes so that stopping and recreating the containers does not lose them.

#### Scenario: Data survives a restart

- **WHEN** the stack is stopped and started again
- **THEN** previously created records, exported artifacts, and stored attachments are still present

### Requirement: Production images run unprivileged and self-contained

Each application image SHALL build the application in a build stage and run from a
runtime stage that does not contain build tooling, SHALL run its process as a
non-root user, and SHALL NOT depend on host-mounted source at runtime.

#### Scenario: Non-root runtime

- **WHEN** the running application container's user is inspected
- **THEN** it is not the root user

#### Scenario: Built artifact, not mounted source

- **WHEN** the application container runs
- **THEN** it serves the built application and requires no source bind mount

### Requirement: Configuration is externalized and validated

Service configuration SHALL be supplied through environment values read by the
Compose stack, SHALL have a tracked example template, and the API SHALL fail fast
and report missing required values rather than starting misconfigured.

#### Scenario: Missing required values fail fast

- **WHEN** the API starts without a required secret or storage setting in production
- **THEN** it exits with a message naming the missing values instead of starting

#### Scenario: Example template lists the values

- **WHEN** an operator reads the tracked example environment file
- **THEN** it lists every value the stack needs, with placeholder or local defaults and no real secrets

### Requirement: No secret values are committed

The stack SHALL keep real credentials in a gitignored environment file and SHALL
commit only an example template, so passwords, tokens, and storage keys never
enter version control.

#### Scenario: Only the template is tracked

- **WHEN** the repository's tracked files are inspected
- **THEN** the example environment file is present and any real environment file is excluded
