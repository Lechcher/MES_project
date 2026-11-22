# Design

## Context

The stack in `docker/docker-compose.yml` is settled: `postgres`, `garage`,
`mailpit`, `backend`, `frontend`, and `caddy` as the single public origin
(`http://localhost:8080`). Secrets follow a fail-fast pattern
(`${VAR:?set VAR ...}` resolved from `docker/.env`, never tracked). See `proposal.md` for motivation and the capability spec
(`deployment/grafana-monitoring`) for the behavioral contract; this document
covers how to satisfy it.

Three constraints shape everything below:

1. **No application code changes.** The monitoring tier is deployment-only; the
   backend's public surface and the GraphQL contract stay untouched.
2. **Single origin.** Nothing new may be published as a second public entry
   point; Grafana rides the existing Caddy origin.
3. **Repo-tracked configuration.** Scrape targets, the Grafana datasource, and
   dashboards are files in `docker/`, with secrets supplied by the environment
   at run time — the same discipline the stack already applies to
   `garage.toml` and `prometheus.yml`-style config.

## Goals / Non-Goals

**Goals:**

- One compose stack, one command: metrics collection, storage, and dashboards
  come up with everything else and see the compose network by service name.
- Whole-stack coverage without touching app code: container resource metrics
  for every service, PostgreSQL metrics, Garage metrics when its token is set.
- Zero post-deploy click-ops: datasource and dashboards provisioned from files.
- Guarded access: basic auth at the proxy, anonymous access off, metrics
  plumbing unreachable from outside the machine.
- Restart resilience: history and dashboards survive via named volumes.

**Non-Goals:**

- **Alerting.** No Alertmanager, no Grafana-managed alert rules, no
  notification channels. Dashboards answer "look" questions; alert routing is a
  later change.
- **Log aggregation.** No Loki/Promtail; logs stay in the per-container log
  streams and, for the app, Sentry.
- **In-app RED metrics.** No Prometheus `/metrics` endpoint added to the
  backend (request rates, latencies). Container and infrastructure metrics only
  in this change; an app endpoint is a clean follow-up if wanted.
- **SSO/OAuth for Grafana.** Basic auth at the proxy plus Grafana's local admin
  account only.
- **Long-term metrics archival.** Bounded retention, no remote storage.

## Decisions

### 1. Prometheus as the metrics store

Prometheus scrapes the exporters over the compose network (service-name
targets), stores time series in a named volume, and serves as Grafana's
datasource. *Alternatives considered:* InfluxDB+Telegraf (push model, extra
moving parts, no Grafana-native fit); a hosted/cloud TSDB (introduces an
egress dependency and credentials for an external service — wrong shape for a
self-contained stack); Grafana Cloud (same). Prometheus is the only option that
is compose-native, file-configured, and dependency-free.

### 2. Exporters over in-app instrumentation

- `cadvisor` — container CPU/memory/network for every service, with
  verified-safe read-only host mounts (`/`, `/sys`, `/var/lib/containers`).
  `/var/run` is deliberately **not** mounted: a read-only `/run` breaks the
  stack's container runtime, and cAdvisor reads the cgroup filesystem directly
  for container metrics.
- `postgres_exporter` — PostgreSQL internals via `DATA_SOURCE_NAME` pointing at
  `postgres:5432`, credentials from the same `POSTGRES_PASSWORD` compose
  already threads to the backend. The exporter only reads `pg_stat_*` views.

*Alternative considered:* adding a Prometheus client endpoint to the Elysia
backend — rejected here because it changes application code and the API
surface (goal of the proposal is deployment-only), though it remains the right
follow-up for request-level metrics (see Non-Goals).

### 3. Grafana behind Caddy with two-layer auth

Caddy gains one route on the existing origin:

```
handle_path /grafana* {
  basic_auth { {$GRAFANA_BASIC_AUTH_USER} {$GRAFANA_BASIC_AUTH_HASH} }
  reverse_proxy grafana:3000
}
```

`handle_path` **strips** the `/grafana` prefix, and Grafana is told the public
path through `GF_SERVER_ROOT_URL=<public origin>/grafana` alone — with
`GF_SERVER_SERVE_FROM_SUBPATH` unset. *Verified during implementation:* the
non-stripping pairing (`handle` + `serve_from_sub_path=true`, the classic
combination) does not serve on Grafana 13.2.6 — every route, including
`/api/health`, answers 302 into a login redirect loop (routed as
`handler=notfound`) even on a fully booted fresh volume with a matching
`root_url`. The stripping pattern is the one that works in this version; the
capability spec only demands "served through the reverse proxy on the single
origin", so either is spec-compatible. Two auth layers are intentional: Caddy
basic auth guards the network edge with a shared credential (bcrypt hash in the
environment, never in the tracked Caddyfile — generated with
`docker run --rm caddy:2 caddy hash-password`), and Grafana's own admin
account governs actions inside (anonymous access disabled).

### 4. File-based provisioning

`docker/grafana/provisioning/datasources/` (Prometheus datasource, URL
`http://prometheus:9090`), `docker/grafana/provisioning/dashboards/` (folder
provider), and hand-authored dashboard JSON under `docker/grafana/dashboards/`
— all bind-mounted read-only. *Alternative considered:* an init script driving
the Grafana HTTP API — rejected (ordering/retry logic, not reproducible from
the repo in one glance, and the API changes across majors).

### 5. Exposure posture

| Service | Published | Why |
| --- | --- | --- |
| `grafana` | none | reached only via Caddy |
| `prometheus` | `127.0.0.1:9090` | the full metrics picture; loopback-only, deliberately unlike the stack's plain tooling ports (5432, 8025, …) |
| `postgres_exporter` | none | compose-network only |
| `cadvisor` | none | compose-network only |

### 6. Garage metrics via a container-local token file

The Garage bearer token reaches Prometheus through
`authorization.credentials_file`, **not** environment expansion: verified
against Prometheus 3.16, `${GARAGE_METRICS_TOKEN}` is sent literally in the
`authorization` block (env expansion is documented for `external_labels`
only), and `--enable-feature=expand-environment-variables` is not even a
valid v3 feature flag. The tracked `prometheus.yml` therefore reads
`/tmp/garage-metrics-token`, which the service's entrypoint writes from the
`GARAGE_METRICS_TOKEN` compose environment (`$$` escaped for compose
interpolation), `umask 077`, inside the container's own `/tmp` tmpfs — the
image runs as `nobody`, so `/run` (root-owned) is not writable. The token
never touches the host filesystem or a tracked file. With the token unset the
file is empty, Garage answers unauthenticated (any or no bearer is accepted on
an untokened endpoint), and the target scrapes fine — the spec's "skipped when
not configured" scenario degrades to "collected without credentials", which is
acceptable on the internal-only network; with the token set, the bearer is
sent and the target scrapes with authentication.

### 7. Image pinning and retention

Images are pinned to explicit tags chosen at implementation time against the
registry (matching the stack's pinned-image convention — `postgres:18-alpine`,
`garage:v2.4.1`, `caddy:2`). Prometheus retention is 15 days by default via
`--storage.tsdb.retention.time`, bounding the `prometheus-data` volume.

### 8. Service graph and healthchecks

`backend`/`frontend` do **not** gain a `depends_on` on the monitoring tier
(spec: app independent of monitoring). Grafana depends on nothing at boot —
the datasource URL resolves by name and Grafana retries connections — but gets
a healthcheck (`/api/health`) so readiness is visible. Prometheus
(`/-/healthy`) and postgres_exporter (`/metrics`) similarly carry spider-style
healthchecks so `docker compose ps` reports honesty. Cadvisor carries **no**
healthcheck: its image is distroless, so there is no shell to run one; its
readiness shows up as a Prometheus target instead.

## Risks / Trade-offs

- **cadvisor sees limited stats on this host** (observed, not hypothetical):
  under this machine's rootless container runtime cadvisor reports only the
  root cgroup (`id="/"`), with no per-container series — rootless cgroup
  delegation, not a config error. The dashboard queries filter `{name!=""}`,
  so they show real containers on a healthy runtime and empty panels here
  rather than garbage. Verification of per-container coverage (task 4.3)
  therefore cannot pass on this host; it needs the operator's runtime. No
  config fallback (`privileged: true`) is baked in — it would mask the host
  issue rather than fix it.
- **Caddy basic-auth env plumbing** (hash with `$2a$...` characters inside the
  Caddyfile) → kept out of the tracked file via `{$VAR}` substitution; the
  verification step asserts 401 without credentials and 200 with.
- **Grafana sub-path misconfiguration** (redirect loops, 404s on assets) →
  `ROOT_URL` + `SERVE_FROM_SUBPATH` set together; verified by an authenticated
  dashboard load.
- **postgres_exporter connects as the application role** → it only reads
  `pg_stat_*` views, but a dedicated read-only monitoring role via an init
  script is the hardening follow-up if the deployment wants least privilege.
- **New required env vars gate bring-up** (`${VAR:?...}`) → intentional
  fail-fast, matching existing guards; `.env.example` and §14 document all
  three with generation commands.
- **Metrics footprint** (cadvisor + 15d retention) → bounded by the retention
  policy; sizes are small for a single-node stack.
- **Verification of the running stack depends on the host's container
  runtime** — if compose networking is broken on the machine, the run-based
  verification tasks cannot execute here and are flagged for the operator
  rather than silently skipped.

## Migration Plan

Purely additive — no data, schema, or application changes.

1. Add the four services, two volumes, and env vars; regenerate `.env` from the
   updated `.env.example` (only the three new Grafana keys are added).
2. `docker compose up -d` — existing services are unaffected; the monitoring
   tier joins.
3. Sign in at `<origin>/grafana`; dashboards are already populated.

**Rollback:** remove the `grafana`, `prometheus`, `postgres_exporter`, and
`cadvisor` blocks (and the Caddyfile route) and run `docker compose down`;
delete `grafana-data`/`prometheus-data` when the metrics history should go too.
Nothing in the application state is involved, so rollback cannot harm data.

## Open Questions

None — the monitoring depth, the access model, and the exposure posture were
settled before drafting; dashboard panel breadth can grow later without
changing any requirement.