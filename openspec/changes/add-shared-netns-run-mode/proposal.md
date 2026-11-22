# Proposal

## Why

The stack currently only runs in exactly one network shape: the Compose bridge
network, where every cross-service reference (`postgres`, `garage`, `backend`,
`prometheus`, …) resolves by service name. On hosts whose container runtime
cannot create bridge networks (this machine's netavark fails with
`Operation not supported`), the documented bring-up fails and the operator's
fallback — running every service in one Podman pod, i.e. a single shared
network namespace — breaks the stack in nine places at once: the backend crashes
at boot (`getaddrinfo ENOTFOUND postgres`), Prometheus's scrape targets fail
DNS, and Caddy cannot reach its upstreams. A second breakage is independent of
names: frontend and Grafana both bind port 3000, so they cannot coexist in one
namespace. The stack should be bringable-up in a shared namespace without
forking its configuration.

## What Changes

- Make the stack runnable in a single shared network namespace by preserving
  the service-name contract instead of renaming references: containers in a
  shared namespace resolve sibling names through `/etc/hosts` when they are
  named after the Compose services, so every tracked configuration —
  `MES_DATABASE_URL`, `S3_ENDPOINT`, `MES_API_URL`, `prometheus.yml` targets,
  the Grafana datasource, and the Caddyfile upstreams — works unchanged once
  the containers carry the right names.
- Resolve the port-3000 collision by making Grafana's HTTP port configurable:
  `GRAFANA_HTTP_PORT` (default `3000`) feeds `GF_SERVER_HTTP_PORT`, and Caddy's
  Grafana upstream becomes the `GRAFANA_UPSTREAM` variable (default
  `grafana:3000`), wired through Compose into the Caddyfile's environment
  placeholder. Grafana's healthcheck becomes port-aware.
- Add `GRAFANA_HTTP_PORT` to `docker/.env.example` with the rule for when it
  must change.
- Document the degraded-mode bring-up in `docs/DEVELOPMENT.md` §14: when it
  applies, the container-naming recipe, the published-port table, how the
  environment is sourced, what still differs from the Compose run (volumes,
  the known cadvisor limitation), and a verification drill.
- Compose stays the default path: with the new variables unset or at their
  defaults, the stack's behavior is byte-for-byte what it is today.

## Capabilities

### New Capabilities

- `deployment/shared-netns-run`: the stack can be brought up in a single shared
  network namespace when bridge networking is unavailable, with its
  service-name contract preserved, the one required port relocation made
  explicit, and the runbook that says how.

### Modified Capabilities

None. No existing requirement changes; the Compose behavior of the existing
deployment capabilities is untouched.

## Impact

- `docker/docker-compose.yml` — Grafana gains `GF_SERVER_HTTP_PORT` (and a
  port-aware healthcheck); Caddy gains `GRAFANA_UPSTREAM` in its environment.
- `docker/Caddyfile` — the Grafana route's upstream becomes
  `{$GRAFANA_UPSTREAM:-grafana:3000}`.
- `docker/.env.example` — one new optional variable with a comment.
- `docs/DEVELOPMENT.md` §14 — a new runbook subsection for the shared-namespace
  bring-up.
- No application code changes, no new dependencies, no changes to the GraphQL
  contract, the database schema, or any spec'd behavior of an existing
  capability.