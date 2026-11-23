# Design

## Context

See `proposal.md` — Why. The facts that shape this design, confirmed by reading
the code and docs:

- The browser only ever talks to the **frontend** origin. Session, GraphQL, file,
  event, and export calls go through same-origin route handlers under
  `frontend/src/app/api/mes/*`, which attach the session token server-side and
  call `<MES_API_URL>` (`frontend/src/lib/mes/server.ts`). The backend's
  `/api/auth/*` (Better Auth) is never called by the browser directly; auth flows
  through the GraphQL `login` mutation.
- The backend (`backend/src/index.ts`) reads all config from environment
  (`backend/src/config.ts`), runs Drizzle migrations at boot
  (`MIGRATIONS` in `backend/src/db/migrate.ts`, folder resolved as
  `../../drizzle` relative to `src/db`), and in **production refuses to start**
  without `BETTER_AUTH_SECRET` plus a complete storage group
  (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`).
- Attachment storage uses Bun's built-in `S3Client` (`backend/src/storage/s3.ts`),
  path-style, against Garage. No S3 SDK is installed.
- `bun:sqlite` and `Bun.S3Client` are runtime built-ins, so the backend has no
  native build step to carry into the runtime image.
- The frontend pins `turbopack.root` / `outputFileTracingRoot` to `frontend/`
  (`frontend/next.config.ts`) because the repository root has its own `bun.lock`.
- `db:seed` refuses to run when `NODE_ENV=production`.
- The stub `docker/frontend/Dockerfile` and `docker/backend/Dockerfile` begin
  `FROM oven/bun:latest AS base`; `docker/docker-compose.yml` and
  `docker/setup-compose.toml` are empty.

The reference Garage deployment at `~/Desktop/Projects/Docker/garagehq` runs
`dxflrs/garage:v2.4.1` as a single node with `garage.toml` (ports `3900-3904`,
`region = garage`, SQLite metadata, bind-mounted `meta/` and `data/`), plus a
web UI. Its parameters inform the bundled `garage.toml`.

## Goals / Non-Goals

**Goals:**

- A single Compose project under `docker/` that runs the whole system for a
  production-style deployment: web client, API, Garage S3, Mailpit, Caddy.
- Production images that are self-contained, unprivileged, and built from the
  committed sources and lockfiles.
- State (database, exports, attachments, mail, proxy certs) that survives
  container recreation.
- Configuration supplied through a gitignored `docker/.env` with a tracked
  `docker/.env.example`; no secrets committed.

**Non-Goals:**

- Changing any application behavior, GraphQL contract, or the attachment-storage
  or persistence specs. This change packages the existing system.
- A development hot-reload compose file (the user chose production images).
  Local `bun run dev` remains the development path in `docs/DEVELOPMENT.md`.
- Automated Garage web UI, multi-node Garage, or TLS certificate automation with
  a public CA.
- Kubernetes, CI registry push, or image publishing.

## Decisions

### D1 — Bundle Garage in the stack (vs. join the external `garagehq` stack)

The compose file ships its own single-node `garage` service and `docker/garage.toml`
(ports `3900-3904`, `region = garage`, path-style). Rationale: `docker compose up`
is self-contained and reproducible on any machine, matching the "one command"
goal; the existing external-network approach (`garagehq_default`, http://garage:3900)
remains documented in `docs/garage-s3-clients.md` as an alternative. The bundled
`garage.toml` mirrors the reference parameters but generates its own `rpc_secret`
and admin/metrics tokens via `docker/.env` rather than copying committed values.

### D2 — Multi-stage production images (vs. single-stage dev images)

Each application image has a `deps`/`build` stage and a slim runtime stage; the
runtime holds no build tooling and runs as a non-root user.

- **Backend**: `oven/bun` build stage runs `bun install --frozen-lockfile`; the
  runtime stage copies `backend/src`, `backend/drizzle`, `backend/package.json`,
  and installed dependencies (including dev deps are pruned where safe — see D7
  for why migrations need only `drizzle-orm`, which is a runtime dependency).
  `bun run start` boots Elysia and applies migrations at startup.
- **Frontend**: Next.js **standalone** output (D3), run with `bun` or `node`
  against `.next/standalone/server.js`.

Runner uses `USER bun` (the image's built-in non-root user) or an added
`node`-style user; the app directories are `chown`ed to it.

### D3 — Next.js `output: "standalone"` (vs. copying full `node_modules`)

Add `output: "standalone"` to `frontend/next.config.ts` so the runtime image
contains only the traced server bundle, `.next/static`, and `public/`. Alternative
considered: copy the full `node_modules` and run `next start` — simpler config but
a much larger image and slower build. The standalone change is one line and is
already compatible with the `withSentryConfig`/`withNextIntl` wrappers. Per
`docs/DEVELOPMENT.md` the tracing root is pinned to `frontend/`, so the
standalone layout is `frontend/.next/standalone/`.

### D4 — Caddy as the reverse proxy (vs. nginx / Traefik)

Caddy gives a single small `Caddyfile`, sane default headers, and upstream
health-aware routing with no templating. nginx needs a hand-written config with
more boilerplate; Traefik adds service-discovery machinery not needed for a
fixed five-service stack. Caddy publishes the single public origin (host port
`8080`) and reverse-proxies to `frontend:3000`. The browser needs no second host:
the frontend's `/api/mes/*` handlers reach the API over the internal network.

### D5 — Mailpit as the local SMTP sink

`axllent/mailpit` listens on `1025` (SMTP) and `8025` (web UI). The backend is
pointed at `MES_SMTP_URL=smtp://mailpit:1025`, exercising the plain/no-auth mode
the backend already supports. Password-reset mail is captured and inspectable
without a hosted provider.

### D6 — One public origin over `localhost` (secure-cookie constraint)

The frontend sets `secure: true` on its session cookie when
`NODE_ENV=production` (`frontend/src/app/api/mes/session/route.ts`). The bundled
stack therefore exposes the app as `http://localhost:8080`, where browsers allow
`Secure` cookies on the loopback origin. For any non-loopback hostname, Caddy
terminates TLS (`tls internal`) or a real certificate so the cookie is accepted;
this trade-off is recorded under Risks.

### D7 — Application state on named volumes, Garage on bind mounts

Application state ships on **named volumes**; only Garage uses bind mounts under
`docker/volumes/` (mirroring the reference `garagehq/{meta,data}` layout, and
added to `.gitignore`):

| Service | Storage | Container path | Holds |
| --- | --- | --- | --- |
| backend | named volume `backend-data` | `/app/backend/data` | `mes.db` (+ WAL), `exports/` |
| garage | bind `docker/volumes/garage/meta` | `/var/lib/garage/meta` | Garage metadata |
| garage | bind `docker/volumes/garage/data` | `/var/lib/garage/data` | stored objects |
| mailpit | named volume `mailpit-data` | `/data` | captured mail |
| caddy | named volumes `caddy-data`, `caddy-config` | `/data`, `/config` | certs, autosave |

Rationale (revised during implementation): under rootless Podman, a container
process running as the non-root `bun`/`node` user maps to a sub-UID and **cannot
write** a host-owned bind mount, so a bind-mounted `backend-data` would fail to
create `mes.db`. Named volumes are initialized with the image's ownership, so the
non-root user can write them; Garage keeps bind mounts because its container runs
as root in-container and mirrors the user's existing layout. This is the fallback
the risk section below allows.

### D8 — Environment split: compose interpolation, runtime env, build args

`docker/.env` (gitignored) holds per-deployment values (auth secret, public
origin, storage credentials, tokens). Compose interpolates them into each
service. Distinctions that matter:

- **Build-time (frontend)**: `NEXT_PUBLIC_*` values (`NEXT_PUBLIC_SENTRY_DSN`,
  `NEXT_PUBLIC_SENTRY_ENVIRONMENT`) are inlined by Next at build, so the compose
  passes them as `build.args`. Absent values build a Sentry-disabled frontend.
- **Runtime (frontend)**: `MES_API_URL=http://backend:3001` (server-only, read by
  route handlers).
- **Runtime (backend)**: `BETTER_AUTH_URL` and `MES_WEB_ORIGIN` set to the public
  origin; `S3_ENDPOINT=http://garage:3900`; `MES_SMTP_URL=smtp://mailpit:1025`;
  `NODE_ENV=production`; `MES_DATABASE_PATH` and `MES_EXPORT_DIR` under the bind
  mount.

`docker/.env.example` mirrors `backend/.env.example` for the values the stack
needs, with placeholders and no real secrets.

### D9 — Garage bucket/key provisioning

Garage requires a bucket and an access key with an `RW` grant, and the CLI runs
inside the Garage container (as in the reference and `docs/garage-s3-clients.md`).
Rather than a separate init service that cannot reach the node's RPC context
cleanly, this change adds a documented, idempotent `docker/init-garage.sh` that
execs `garage bucket create` / `key create` / `bucket allow` inside the running
container and prints the key id and secret for the operator to place in
`docker/.env`. Alternative considered: an automated init container — deferred
because the Garage CLI's remote-admin support is version-sensitive and the manual
step already exists in the guide.

### D10 — Seeding demo data

The stack runs `NODE_ENV=production`, and `db:seed` refuses in production. Demo
data is loaded with a documented one-off override,
`docker compose exec -e NODE_ENV=development backend bun run db:seed`, run against
the same mounted database. This keeps the running service in production posture
while still allowing a populated local stack.

## Risks / Trade-offs

- **Secure cookie over HTTP on a non-loopback host** → Document `localhost:8080`
  as the default origin; for other hostnames enable Caddy internal TLS and use
  `https`.
- **Bind-mount ownership vs. non-root container** → Resolved by putting
  application state on named volumes (D7); a rootless non-root container cannot
  write a host-owned bind mount. Garage keeps bind mounts because it runs as root
  in-container.
- **Build-time `NEXT_PUBLIC_*`** → Values are frozen into the image; changing
  Sentry config requires a rebuild. Documented in `docker/.env.example`.
- **Frontend standalone + Sentry source maps** → With no `SENTRY_AUTH_TOKEN`,
  upload is skipped (`silent: true`) and the build still succeeds; source maps are
  absent. Acceptable for local/self-hosted; note it.
- **Garage provisioning is a manual one-time step** → The stack's services come up
  in one command, but attachments require running `docker/init-garage.sh` once.
  Called out in the guide and in `docs/DEVELOPMENT.md`.
- **Podman on this host** (`docker` is emulated by Podman 6.1.4) → The compose
  file uses standard Compose semantics; `podman compose`/`docker compose` with the
  Compose provider is expected to work. Verify on bring-up.
- **Duplicate Garage stacks** → The bundled Garage publishes `3900/3903`, clashing
  with a running `garagehq`. Mitigation: stop the external stack, or override the
  published ports in the compose file.

## Migration Plan

1. Add images, `garage.toml`, `Caddyfile`, `docker-compose.yml`,
   `docker/.env.example`, `.dockerignore` files, and `docker/init-garage.sh`.
2. Add the one-line `output: "standalone"` to `frontend/next.config.ts`.
3. Create `docker/volumes/` and add it to `.gitignore`.
4. Bring up the stack, run `docker/init-garage.sh`, place credentials in
   `docker/.env`, restart the backend, and seed.
5. Rollback: `docker compose down`; remove `docker/volumes/` (or keep it for the
   data). The application sources are untouched apart from the standalone config
   line, which is safe to revert.

## Open Questions

- Whether to replace the manual Garage provisioning with an automated init
  container, once the Garage CLI's remote-admin behavior is verified for the
  pinned `v2.4.1`. Deferrable: the manual step ships in this change either way.
