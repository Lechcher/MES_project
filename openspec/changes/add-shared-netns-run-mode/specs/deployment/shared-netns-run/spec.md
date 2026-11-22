# Spec Delta

## Purpose

The MES container stack can be brought up in a single shared network namespace
when the host's container runtime cannot provide a per-service network, so an
operator on such a host gets the same working stack — same names, same
guarantees — without a second set of configuration.

## ADDED Requirements

### Requirement: The stack runs in a single shared network namespace

The stack SHALL be bringable-up with all of its services in one shared network
namespace, with the containers named after the Compose services, so that every
service-to-service reference resolves without any configuration change. A
shared-namespace run SHALL reach the same ready state as the Compose run on the
same public origin.

#### Scenario: A shared-namespace bring-up resolves every peer
- **WHEN** the operator brings the stack up in a single shared namespace following the documented runbook, with the containers named after the Compose services
- **THEN** each service resolves the others by the same names the tracked configuration already uses — the API reaches its database, attachment store, and mail sink; the web client reaches the API; the metrics scrapes reach every target; the reverse proxy reaches both upstreams — and the stack serves the application and the guarded monitoring path on the origin as in the Compose run

#### Scenario: The Compose bring-up is unchanged
- **WHEN** the stack is brought up with the documented Compose command, with the new variables absent or at their defaults
- **THEN** the stack behaves exactly as it did before this capability existed: the same services, the same published ports, the same upstreams, the same ready state

### Requirement: Grafana's HTTP port can be relocated without breaking the origin

Grafana SHALL bind a configurable HTTP port (default `3000`), and the reverse
proxy SHALL route to whatever port Grafana is bound to, so that Grafana can
coexist with the web client — which owns port 3000 — in a single namespace. No
other pair of stack services SHALL need to bind the same TCP port in one
namespace under the documented settings.

#### Scenario: Defaults preserve Compose behavior
- **WHEN** the Grafana port and its proxy upstream are unset or at their defaults
- **THEN** Grafana serves on port 3000 and the monitoring path on the public origin reaches it, exactly as before

#### Scenario: The relocated port coexists with the web client
- **WHEN** the operator sets a Grafana HTTP port other than 3000 and the matching proxy upstream, in a namespace the web client also occupies
- **THEN** Grafana serves on the configured port, the monitoring path on the public origin still answers through the proxy behind its basic-auth guard, and the web client keeps its own port

### Requirement: The degraded-mode bring-up is documented and verifiable

The project SHALL document the shared-namespace bring-up as an explicitly
degraded fallback for hosts where bridge networking is unavailable: when it
applies, the naming rule for the containers, the published ports, how the
environment is sourced, what still differs from the Compose run (state volumes,
the known container-metrics limitation of this host's runtime), and a
verification drill an operator can run to confirm the stack is whole.

#### Scenario: An operator on a broken-bridge host can follow the runbook
- **WHEN** an operator whose runtime cannot create bridge networks follows the documented runbook from a clean host state
- **THEN** the stack reaches the ready state the runbook describes, verified by the runbook's own drill: the application answers on the origin, the monitoring path is guarded by basic auth, and the metrics targets scrape

#### Scenario: The fallback is not mistaken for the default
- **WHEN** an operator reads the deployment documentation
- **THEN** the Compose command is presented as the standard bring-up, and the shared-namespace mode is presented as a fallback with the condition that justifies it

### Requirement: The degraded mode keeps the stack's security posture

A shared-namespace run SHALL preserve the guarantees of the standard run: no
secret in any tracked configuration file, the monitoring UI reachable only
through the single origin behind basic authentication, and the metrics store
and exporters reachable, at most, on the loopback interface.

#### Scenario: No secret and no second public entry point
- **WHEN** the tracked configuration of the stack is read, or a client from outside the machine probes the metrics store or an exporter
- **THEN** no password, token, or key material appears in any tracked file, and the monitoring plumbing answers only within the machine's loopback