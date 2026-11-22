# Spec Delta

## Purpose

Operational monitoring of the MES container stack: a metrics store and a
visualization UI that come up with the stack, measure its services and database,
survive restarts, and are reachable only through the stack's single guarded
origin — so an operator can answer "is the stack healthy, and what is it doing?"
without shelling into containers.

## ADDED Requirements

### Requirement: A monitoring tier ships with the stack

The stack SHALL include a metrics store and a visualization service as
first-class members of the same compose stack, so they start and stop with the
stack and see the stack's internal network. The application services SHALL NOT
depend on the monitoring tier: the application starts and serves even when the
monitoring services are stopped or failing.

#### Scenario: Monitoring comes up with the stack
- **WHEN** the operator brings the stack up with the documented command
- **THEN** the metrics store and the visualization service start as part of it and begin collecting from the stack's services

#### Scenario: The application is independent of monitoring
- **WHEN** the monitoring services are stopped, fail, or are still starting
- **THEN** the API, web client, database, and attachment store keep serving normally

### Requirement: The stack's services, database, and storage are measured

The stack SHALL collect container-level resource metrics for every service and
database metrics from the PostgreSQL service, and SHALL collect attachment-store
metrics when that store's metrics token is configured. When the token is absent,
the stack SHALL still start and serve everything else; the attachment-store
metrics are simply not collected.

#### Scenario: Every service reports resource usage
- **WHEN** the operator opens the stack-overview dashboard
- **THEN** every running service of the stack appears with its current CPU, memory, and network values

#### Scenario: Database health is visible
- **WHEN** the operator opens the database dashboard
- **THEN** connection count, transaction rate, and buffer-cache hit ratio for the application database are shown, current as of the last scrape

#### Scenario: Attachment-store metrics appear when configured
- **WHEN** the attachment store's metrics token is set in the environment
- **THEN** its metrics are scraped and available to dashboards

#### Scenario: Attachment-store metrics are skipped when not configured
- **WHEN** the attachment store's metrics token is absent
- **THEN** the stack still starts fully and the remaining dashboards work, with no error visible to the operator

### Requirement: Grafana is provisioned automatically from tracked files

Grafana SHALL come up already connected to the stack's metrics store and with
its dashboards loaded — no operator setup through the UI after a deploy. The
whole monitoring configuration — scrape targets, datasource definition, and
dashboard definitions — SHALL live as files tracked in the repository, and no
secret SHALL appear in any tracked configuration file.

#### Scenario: A fresh deploy needs no UI setup
- **WHEN** the operator brings the stack up on a fresh checkout with the documented environment file
- **THEN** signing in to Grafana shows the preconfigured datasource and the documented dashboards, all populated with current data

#### Scenario: Configuration is reproducible and secret-free
- **WHEN** the repository's monitoring configuration files are read
- **THEN** they define every scrape target, the datasource, and the dashboards, and contain no password, token, or key material

### Requirement: Grafana is reachable only through the guarded origin

Grafana SHALL be served through the stack's existing reverse proxy as a path on
the single public origin, in front of which HTTP basic authentication is
required (its credential supplied by a bcrypt hash from the environment).
Grafana SHALL additionally reject anonymous access. The metrics store and the
metrics exporters SHALL NOT be reachable from outside the machine: the metrics
store is published, if at all, on the loopback interface only, and the
exporters are published on no interface.

#### Scenario: An unauthenticated request is refused
- **WHEN** a request to the monitoring path on the public origin carries no valid basic-auth credential
- **THEN** the reverse proxy answers 401 and no dashboard data is returned

#### Scenario: An authenticated request sees the dashboards
- **WHEN** a request carries the configured basic-auth credential and a valid Grafana sign-in
- **THEN** the dashboards are served on the same origin as the application

#### Scenario: The metrics plumbing stays private
- **WHEN** a client outside the machine probes the metrics store or an exporter's published ports
- **THEN** the connection is refused, because neither is reachable beyond loopback (if the store is published at all)

### Requirement: Monitoring state survives restarts

The metrics store's collected history and Grafana's own state (provisioned
datasources, dashboards, and any operator-added accounts or annotations) SHALL
persist across container restarts through named volumes, bounded by the metrics
store's own retention policy.

#### Scenario: A restart keeps history and dashboards
- **WHEN** the stack is stopped and started again
- **THEN** Grafana still has its datasource and dashboards, and the metrics store still serves the history it kept within its retention window