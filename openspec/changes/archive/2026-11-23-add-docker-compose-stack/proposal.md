# Proposal

## Why

Running MES today means starting the backend and frontend by hand in two terminals
and keeping a separate Garage S3 stack running for ticket attachments. The
`docker/` directory holds only stubs — two one-line `Dockerfile`s and empty
`docker-compose.yml` / `setup-compose.toml` — so there is no committed,
reproducible way to bring the whole system up on one command, and no production
image definition at all.

## What Changes

- Replace the stub `docker/frontend/Dockerfile` and `docker/backend/Dockerfile`
  with multi-stage, production-oriented images (dependency install, build, then a
  slim runtime copy; non-root user; no source mounts).
- Write `docker/docker-compose.yml` that runs the full stack together: the
  Next.js frontend, the Elysia/Bun backend, a bundled single-node **Garage** S3
  service for attachments, **Mailpit** as a local SMTP sink, and a **Caddy**
  reverse proxy that fronts the app on a single public origin.
- Add supporting config beside the compose file: a bundled `garage.toml`, a
  `Caddyfile`, a `docker/.env.example` for compose-level values, and
  `.dockerignore` files so build contexts stay small.
- Make the backend run in production mode inside the stack: persisted SQLite
  database and export directory on a volume, storage and auth secrets supplied as
  a set, `next build` / `next start` for the frontend.
- Document the one-command workflow and the required values in
  `docs/DEVELOPMENT.md` (a Docker section), pointing at the existing
  `docs/garage-s3-clients.md`.

## Capabilities

### New Capabilities

- `deployment/container-stack`: defines the observable behavior of the MES
  container deployment — a single command brings up a working stack, each service
  is reachable and healthy, attachments work against the bundled Garage, local
  mail is captured, state survives a restart, and the production images run as a
  non-root user.

### Modified Capabilities

<!-- None: no existing spec requirement changes. The container stack consumes the
     existing backend/attachment-storage, backend/persistence, and
     core/email-delivery behavior without changing it. -->

## Impact

- **New files**: `docker/docker-compose.yml`, `docker/frontend/Dockerfile`,
  `docker/backend/Dockerfile`, `docker/garage.toml`, `docker/Caddyfile`,
  `docker/.env.example`, `.dockerignore` (root plus per-package).
- **Modified**: `docs/DEVELOPMENT.md` (new Docker workflow section);
  `AGENTS.md` if the stack table or run instructions need a pointer.
- **Removed**: the empty `docker/docker-compose.yml` and `docker/setup-compose.toml`
  stubs are replaced by real definitions.
- **Runtime ports** (host-published): Caddy on `8080` (public origin), Garage S3
  on `3900`, Garage admin on `3903`, Mailpit SMTP on `1025` and its web UI on
  `8025`.
- **Dependencies**: no new application packages. Images only: `oven/bun`,
  `dxflrs/garage`, `axllent/mailpit`, `caddy`.
- **Config**: compose reads `docker/.env` (gitignored); `docker/.env.example` is
  the tracked template. No secret values are committed.
