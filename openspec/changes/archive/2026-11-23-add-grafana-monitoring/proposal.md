# Proposal

## Why

The production-style container stack (backend, frontend, PostgreSQL, Garage,
Mailpit, Caddy) currently gives an operator no operational visibility: there is
no metrics store, no dashboard, and no way to see database health, container
resource usage, or storage behaviour without shelling into containers and
running ad-hoc commands. Sentry covers application errors, but nothing answers
"is the stack healthy, and what is it doing?" — a question the moment
something looks slow in production. Now is the right time because the stack is
settled (fresh PostgreSQL service, Caddy as the single origin) and monitoring
is a deployment concern that belongs with the rest of `docker/`.

## What Changes

- Add a monitoring tier to `docker/docker-compose.yml`: `prometheus`,
  `grafana`, `postgres_exporter` (database metrics), and `cadvisor` (container
  CPU/memory/network metrics), with named volumes `prometheus-data` and
  `grafana-data` for their state.
- Add `docker/prometheus.yml`: scrape targets for the exporters and for the
  services that already expose metrics (Garage's metrics endpoint, active when
  `GARAGE_METRICS_TOKEN` is set). Prometheus runs with environment expansion so
  the Garage token comes from the container environment, never the checked-in
  config.
- Provision Grafana from files under `docker/grafana/`: the Prometheus
  datasource is configured on first boot and a small set of purpose-built
  dashboards (stack overview, PostgreSQL) is loaded automatically — no
  click-ops after deploy.
- Serve Grafana through the existing Caddy origin at `/grafana`, in front of
  which sits HTTP basic auth (bcrypt hash supplied via a new `.env` secret);
  Grafana keeps its own admin login behind that. No second public entry point.
- Add `GRAFANA_ADMIN_USER`, `GRAFANA_ADMIN_PASSWORD`, and `GRAFANA_BASIC_AUTH`
  to `docker/.env.example` with generation commands, and document the
  monitoring tier in `docs/DEVELOPMENT.md` §14.
- Backend and Caddy Prometheus endpoints are explicitly **not** added — no
  application code changes in this change; their health remains observable via
  Caddy's proxying, the existing healthchecks, and cadvisor's container
  metrics.

## Capabilities

### New Capabilities

- `deployment/grafana-monitoring`: operational monitoring of the MES container
  stack — what is scraped and retained, how Grafana is provisioned and
  authenticated, and what the operator can rely on seeing. A new deployment
  capability that grows with the stack (new services, new dashboards) without
  touching application specs.

### Modified Capabilities

None. No existing requirement changes; this adds a deployment-only capability.

## Impact

- `docker/docker-compose.yml` — four new services, two new volumes, two new
  required-from-environment variables (with loopback-only publication for
  Prometheus tooling access).
- `docker/Caddyfile` — one guarded `/grafana*` route with basic auth.
- `docker/.env.example` — the three Grafana variables with documented
  generation commands (`openssl rand -base64`, `caddy hash-password`).
- New tracked config: `docker/prometheus.yml`,
  `docker/grafana/provisioning/datasources/`,
  `docker/grafana/provisioning/dashboards/`, and dashboard JSON under
  `docker/grafana/dashboards/`.
- `docs/DEVELOPMENT.md` §14 — monitoring subsection (endpoints, credentials,
  what is and is not covered).
- No backend/frontend code changes, no new app dependencies, no changes to the
  GraphQL contract or the database schema. The API's public surface is
  unchanged; `/grafana` is the only new path on the existing origin.