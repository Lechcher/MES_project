# Design

## Context

The stack is Compose-first. Every cross-service reference in the tracked
configuration uses a Compose service name, and nothing else:

- `docker/docker-compose.yml`: `MES_DATABASE_URL` (`postgres:5432`),
  `S3_ENDPOINT` (`garage:3900`), `MES_SMTP_URL` (`mailpit:1025`),
  `MES_API_URL` (`backend:3001`), the exporter's `DATA_SOURCE_NAME`
  (`postgres:5432`).
- `docker/prometheus.yml`: the `cadvisor`, `postgres_exporter`, `garage` scrape
  targets — and `prometheus` itself.
- `docker/grafana/provisioning/datasources/prometheus.yml`: `http://prometheus:9090`.
- `docker/Caddyfile`: upstreams `grafana:3000` and `frontend:3000`.

On a host whose runtime cannot create bridge networks (this machine's netavark:
`Netlink error: Operation not supported`), `docker compose up` fails and the
fallback is one Podman pod: all services in a single shared network namespace.
Observed on this host in that mode: the backend crashes at boot
(`getaddrinfo ENOTFOUND postgres`), Prometheus's targets fail DNS
(`lookup cadvisor`, `lookup postgres_exporter`, `lookup garage`), and Grafana
additionally dies with `bind: address already in use` — frontend and Grafana
both want port 3000. See `proposal.md` for the motivation.

Four facts, verified on this host during planning, shape the approach:

1. **Pod siblings resolve by container name.** In a pod, containers share one
   netns and `/etc/hosts` gains an entry per sibling, keyed by its *container
   name* (proved with a throwaway pod: a sibling named `postgres` made
   `getent hosts postgres` answer `127.0.0.1` from every container in the pod).
   Compose service names themselves mean nothing in a pod.
2. **`GF_SERVER_HTTP_PORT` is honored** by the pinned Grafana 13.2.6: with
   `GF_SERVER_HTTP_PORT=3100` the server listened on `[::]:3100` (health 200),
   and nothing listened on 3000.
3. **Caddy accepts env placeholders with defaults** in upstream positions:
   `reverse_proxy {$VAR:-default}` validates against the pinned Caddy image.
4. **Static configs can't be parameterized at runtime.** Prometheus 3 applies
   no environment expansion to `scrape_configs` (established in
   `add-grafana-monitoring`), and the datasource provisioning file is
   bind-mounted from the repo — so those references must resolve *by name*,
   which fact 1 provides.

## Goals / Non-Goals

**Goals:**

- The same tracked stack comes up whole in one shared namespace — same service
  names, same origin, same guards — with **zero divergence in any
  name-bearing config file**.
- The one genuine namespace conflict (frontend/Grafana on 3000) is resolved by
  exactly one new knob pair, with Compose defaults preserving today's behavior
  bit-for-bit.
- The mode is documented well enough that an operator follows it cold, and the
  documentation carries its own verification drill.

**Non-Goals:**

- **A pod builder script.** A `pod-run.sh` would be a second, parallel
  definition of the stack that drifts from `docker-compose.yml`. The runbook
  references compose as the source of truth; a script is a follow-up only if
  the mode proves durable.
- **Fixing the host's bridge networking.** Out of the repository's reach; the
  change exists *because* it is unreliable.
- **Host-override knobs for the other services** (e.g. `MES_DB_HOST`). Naming
  (decision 1) covers every tracked reference — including the static configs,
  which the knobs could not reach anyway — so they would add surface without
  coverage. The two Caddy knobs are the exceptions: they exist because one port
  genuinely collides (decision 2) and one bind address genuinely differs.
- **Changing any application code, dependency, schema, or GraphQL surface.**

## Decisions

### 1. Preserve the names; name the containers after the services

In shared-namespace mode the operator names each container after its Compose
service (`postgres`, `garage`, `mailpit`, `backend`, `frontend`, `caddy`,
`prometheus`, `grafana`, `postgres_exporter`, `cadvisor`). Fact 1 then makes
every reference above resolve without touching a single tracked file.
*Alternatives considered:* substituting `127.0.0.1` into the tracked configs —
impossible for the Prometheus targets and the datasource file without
env-parameterization that Prometheus 3 does not offer, and it forks the config
for a degraded mode; `--network-alias` — not available to pod members; the
`dnsname` plugin — not installed here; per-file mode variants — two configs to
maintain forever.

### 2. Two proxy knobs: Grafana's port, and where the web client is reached

Grafana's port: `GRAFANA_HTTP_PORT` (default `3000`) feeds
`GF_SERVER_HTTP_PORT`, and Caddy's Grafana upstream becomes
`{$GRAFANA_UPSTREAM:-grafana:3000}`, wired through Compose's `environment:` for
the caddy service (the placeholder is always present in the container, so the
Caddyfile never sees an unset variable). The Grafana healthcheck becomes
port-aware via a `$$`-escaped runtime expansion
(`$${GF_SERVER_HTTP_PORT:-3000}`, verified: compose collapses `$$` at runtime —
the `docker compose config` de-interpolated view shows the pre-collapse form).
*Verified during the drill:* the relocation must not land on 3001 — the API owns
it, and a Grafana on 3001 collides with the backend's bind (Grafana 404s
through the proxy because the backend answers). The runbook relocates to 3002.

Frontend's upstream: the drill established that Next 16's standalone server
binds the namespace's **primary address**, not loopback — its own log line reads
`Network: http://<pod-name>:3000`, and the image's baked `HOSTNAME=0.0.0.0`
(and an explicit `HOSTNAME=127.0.0.1`) are both ignored, so `frontend:3000`
resolves to loopback and is refused. Compose hides this (service DNS returns the
same IP the client bound); a shared namespace does not. Caddy's frontend
upstream therefore becomes `{$MES_FRONTEND_UPSTREAM:-frontend:3000}` with the
same compose wiring, and the runbook sets it to the **pod's name** (`mes:3000`),
which `/etc/hosts` maps to that same primary address. *Alternatives considered:*
moving the frontend instead — breaks `MES_API_URL`'s port and gains nothing;
patching the frontend image to force a loopback bind — application-level change,
out of scope for a deployment change, and the documented `HOSTNAME` route
doesn't take in this Next 16 build; publishing Grafana on a host port and
proxying `host.containers.internal` — reintroduces path/host complexity for no
gain; running Grafana outside the pod — its name would not resolve inside the
pod netns, so Caddy would need the same knob anyway.

Why only Grafana moves: the namespace port inventory has exactly one collision
(frontend 3000 / Grafana 3000). Every other service owns a distinct port:
5432 (postgres), 3900/3903 (garage), 1025/8025 (mailpit), 3001 (backend),
3000 (frontend), 80 (caddy), 8080 (cadvisor), 9187 (postgres_exporter),
9090 (prometheus) — so the relocation target must be outside that set (3002).
The runbook states the table and the rules: **set `GRAFANA_HTTP_PORT` and
`GRAFANA_UPSTREAM` together**, and **set `MES_FRONTEND_UPSTREAM` to the pod's
name**.

### 3. A runbook, not a second configuration

`docs/DEVELOPMENT.md` §14 gains a subsection — presented as a fallback with the
condition that justifies it (bridge networking unavailable) — that documents:
the pod recipe with per-service container names and the compose image
references; how the operator sources `docker/.env` (`set -a; . ./.env; set +a`)
so every secret matches the Compose run; the published-port table and the
relocation rules; the state-volume mapping (named volumes with the same
names Compose creates — `mes_pgdata`, `mes_backend-data`, … — so a later
Compose run finds the same data); and the known differences (cadvisor sees only
the root cgroup on this host, already recorded under the monitoring change;
`restart: unless-stopped` per container; no `depends_on` — the runbook lists the
start order). The standard `docker compose up -d` remains the documented path.

Two mechanics the drill forced into the runbook's shape:

- **Ports are published on the pod, not the member.** `docker run --pod X -p …`
  is rejected by podman; the recipe puts every `-p` on `pod create` (the first
  drill attempt failed exactly here). When bridge creation fails the pod can end
  up sharing the host's network namespace — then a container's port *is* the
  host's port, so the runbook tells the operator to check `ss -ltn` first.
- **`/etc/hosts` entries appear as siblings start.** Entries are added as
  containers join the pod (and are visible to running siblings), but a container
  that starts before a target it needs may miss the entry — hence the runbook
  starts Prometheus last and notes one `docker restart prometheus` after the pod
  is whole. The API refusing to boot until its S3 keys exist (it treats the
  compose default — empty — as missing) is documented next to `init-garage.sh`.

### 4. The drill is the acceptance

The runbook ends with a drill an operator can run cold: the origin answers
(200/307), `/grafana` is 401 without credentials and 302-to-login with them,
the sign-in posts to `/grafana/login` (through the proxy, which strips the
prefix to Grafana's own `/login`), and Prometheus's targets page shows every
job up. During implementation these were verified in a throwaway pod on this
host: the origin served the app through the pod-name frontend upstream (200),
`/grafana` answered 401 → 302 → 200 on the relocated port with both services
coexisting, the tracked `prometheus.yml` showed all four jobs up (including the
token-authenticated Garage scrape), and the provisioned datasource reported
"Successfully queried the Prometheus API" with both dashboards loaded.

## Risks / Trade-offs

- [Naming reliance] → `/etc/hosts` entry injection is podman behavior, not a
  documented contract with a stability promise. If it changed, the mode would
  fail loudly (DNS errors, backend crash-loop) — never silently wrong. The
  naming rule is spec'd as a requirement, and the drill confirms it before the
  operator trusts the run.
- [Runbook rot] → the runbook hard-codes env lists that mirror
  `docker-compose.yml`. Mitigation: a task cross-checks the two before the
  change is done, and the runbook points at the compose file as the source of
  truth.
- [Half-set knob] → setting `GRAFANA_HTTP_PORT` without `GRAFANA_UPSTREAM`
  (or vice versa) makes `/grafana` answer 502; the same applies to
  `MES_FRONTEND_UPSTREAM` for the app origin. Mitigation: the docs pair them
  explicitly; the drill catches the pair; Compose defaults keep them
  consistent for the standard path.
- [Next 16 bind behavior] → the web client binds the namespace's primary
  address, ignoring `HOSTNAME` (the documented escape), so loopback callers are
  refused until the frontend upstream points at the pod name. Mitigation: the
  knob + the documented rule; a runtime that changes the bind behavior would
  only remove the need for the knob. The upstream knob is also the pattern an
  application-level fix would supersede later (see the spec's out-of-scope).
- [Two volume namespaces] → pod-mode state lives in operator-created named
  volumes. Mitigation: the runbook maps them to Compose's names, which keeps a
  later Compose run reading the same data — the fallback can't strand state.
- [Fallback permanence] → a degraded mode can quietly become the only mode.
  Mitigation: the capability spec requires the docs to present Compose as the
  standard and the fallback as conditional.