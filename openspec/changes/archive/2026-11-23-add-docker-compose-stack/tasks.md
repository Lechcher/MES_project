# Tasks

## 1. Compose scaffolding and build hygiene

- [x] 1.1 Create `docker/volumes/{backend,garage/meta,garage/data,mailpit,caddy/data,caddy/config}` placeholder directories and add `docker/volumes/` plus `docker/.env` to `.gitignore`; verify `git status` does not list anything under `docker/volumes/` or `docker/.env`
- [x] 1.2 Add a root `.dockerignore` excluding `**/node_modules`, `.next`, `docker/volumes`, `.env*` (keeping `.env.example`), `openspec/`, and `.git`; verify each image build context stays small by checking the build output's "transferring context" size
- [x] 1.3 Add `frontend/.dockerignore` and `backend/.dockerignore` so each image context excludes its own `node_modules`, `.next`, `data`, and `.env`; verify `docker build` for each context succeeds without copying those paths (check with a build-stage `ls`)

## 2. Backend image

- [x] 2.1 Rewrite `docker/backend/Dockerfile` as a multi-stage build: a `build` stage on `oven/bun` running `bun install --frozen-lockfile`, and a runtime stage that copies `backend/src`, `backend/drizzle`, `backend/package.json`, and installed dependencies; verify `docker build -f docker/backend/Dockerfile backend` completes
- [x] 2.2 Add a non-root runtime user, `chown` the app and data directories to it, and set `USER`; verify `docker run --rm <image> id -u` prints a non-zero uid
- [x] 2.3 Set the runtime command to `bun run start` with `EXPOSE 3001`, and confirm migrations run at boot by starting the container and checking logs for a clean startup plus a created `data/mes.db`
- [x] 2.4 Confirm the runtime stage contains no build tooling or dev-only sources by listing the image's `/app/backend` contents (expect `src`, `drizzle`, `node_modules`, `package.json` only)

## 3. Frontend image

- [x] 3.1 Add `output: "standalone"` to `frontend/next.config.ts`; verify `cd frontend && bun run build` produces `.next/standalone/server.js` and that `bunx tsc --noEmit` still passes
- [x] 3.2 Rewrite `docker/frontend/Dockerfile` as a multi-stage build: a build stage installing with `bun install --frozen-lockfile` and running `bun run build` (accepting `NEXT_PUBLIC_*` as `ARG`s), and a runtime stage copying `.next/standalone`, `.next/static`, and `public/`; verify `docker build --build-arg NEXT_PUBLIC_SENTRY_DSN= -f docker/frontend/Dockerfile frontend` completes
- [x] 3.3 Run the runtime stage as a non-root user with `HOSTNAME=0.0.0.0`/`PORT=3000`, `EXPOSE 3000`; verify `docker run` serves the app on `/` and `MES_API_URL` is read at runtime, not baked (grep the built server for a hard-coded backend URL returns nothing)

## 4. Garage service

- [x] 4.1 Add `docker/garage.toml` mirroring the reference parameters (single node, ports `3900-3904`, `region = garage`, SQLite metadata, `/var/lib/garage/{meta,data}`); verify it parses by starting the `garage` service and reading a clean startup log
- [x] 4.2 Add the `garage` service (image `dxflrs/garage:v2.4.1`) to `docker-compose.yml` with the config and `volumes/garage/*` bind mounts, publishing `3900` (S3) and `3903` (admin); verify `docker compose exec garage /garage status` reports a healthy single node
- [x] 4.3 Add `docker/init-garage.sh` that idempotently creates the `ticket-jobs-attachment-files` bucket and an access key, grants `RW`, and prints the key id and secret; verify running it twice does not error on the second run
- [x] 4.4 Confirm secret values (`rpc_secret`, admin/metrics tokens) come from `docker/.env` rather than committed literals; verify `grep` for the reference `garagehq` secret values in tracked files returns nothing

## 5. Mailpit and reverse proxy

- [x] 5.1 Add the `mailpit` service (`axllent/mailpit`) publishing `1025` (SMTP) and `8025` (web UI) with a `volumes/mailpit` bind mount; verify the web UI loads and a manually sent message appears in it
- [x] 5.2 Add `docker/Caddyfile` reverse-proxying the public origin to `frontend:3000` (with the `Host` header preserved) and add the `caddy` service publishing `8080` with `volumes/caddy/*` bind mounts; verify `curl -I http://localhost:8080/` returns the Next.js app and `caddy validate`/startup logs report no config error
- [x] 5.3 Verify the browser needs only the proxy origin: load `http://localhost:8080`, and confirm app API calls succeed without a second published API host (backend is reachable only over the internal network)

## 6. Compose wiring and configuration

- [x] 6.1 Write `docker/.env.example` listing every value the stack needs (auth secret, public origin, storage endpoint/region/bucket/keys, Garage tokens, SMTP URL, `NEXT_PUBLIC_*`) with placeholders and no real secrets; verify it matches the values referenced by `docker-compose.yml` with no leftovers
- [x] 6.2 Wire `docker-compose.yml` environment: backend gets `NODE_ENV=production`, `BETTER_AUTH_URL`/`MES_WEB_ORIGIN` = public origin, `S3_ENDPOINT=http://garage:3900`, `MES_SMTP_URL=smtp://mailpit:1025`, and data paths under `/app/backend/data`; frontend gets runtime `MES_API_URL=http://backend:3001` and `NEXT_PUBLIC_*` as build args; verify each var reaches its container via `docker compose config`
- [x] 6.3 Add a backend healthcheck on `/health` and `depends_on` ordering (backend → garage/mailpit; caddy → frontend/backend; frontend → backend); verify Compose reports the backend healthy and that Caddy only serves once dependencies are up
- [x] 6.4 Verify the API fails fast on incomplete config: start the backend with the storage group half-set and confirm it exits naming the missing values

## 7. Documentation

- [x] 7.1 Add a Docker section to `docs/DEVELOPMENT.md` covering prerequisites, `docker compose up`, `docker/init-garage.sh`, placing credentials in `docker/.env`, the seed override, the public origin, and `docker compose down`; verify every command runs as written against the running stack
- [x] 7.2 Note in `docs/DEVELOPMENT.md` that this stack bundles Garage locally and that the external `garagehq` network option in `docs/garage-s3-clients.md` §5 remains available; verify the cross-reference resolves
- [x] 7.3 Update `AGENTS.md` with a one-line pointer to the container workflow if the run/test guidance references local startup; verify the link resolves

## 8. Integration verification

- [x] 8.1 Bring the whole stack up from a clean checkout on one Compose invocation and confirm all five services reach a running state
- [x] 8.2 After `init-garage.sh` and credentials, upload a ticket attachment through `http://localhost:8080` and download it back; verify the object exists in Garage (e.g. `rclone ls` or `/garage` CLI)
- [x] 8.3 Trigger a password reset and verify the message arrives in Mailpit's web UI at `http://localhost:8025`
- [x] 8.4 Stop and recreate the containers, then verify the previously created record, exported artifact, and stored attachment are still present
- [x] 8.5 Run the existing checks unchanged to confirm packaging did not alter behavior: `cd backend && bun test && bunx tsc --noEmit && bunx biome check` and `cd frontend && bun test && bunx tsc --noEmit && bunx biome check`

## Workflow follow-up

- Archive the change after the review requirements are satisfied.
- Verify the archived result and that `openspec/specs/deployment/container-stack/spec.md` reflects the shipped stack.
