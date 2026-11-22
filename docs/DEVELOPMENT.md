# Development Guide

How to run, migrate, seed, and test the MES prototype locally.

The repository has two applications:

| Directory | Application | Stack |
| --- | --- | --- |
| `backend/` | API server implementing the GraphQL contract in `API_CONTACT_SPECIFICATION.md` | Bun + Elysia, Better Auth, Drizzle ORM, PostgreSQL |
| `frontend/` | Web client | Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn |

---

## 1. Prerequisites

- **Bun** 1.3 or newer (`bun --version`)
- **PostgreSQL** — a running server for the backend to connect to. The stack
  bundles one in `docker/` (§14); for local development the documented
  one-command instance is:

```bash
docker run -d --name mes-test-pg --network host \
  -e POSTGRES_USER=mes -e POSTGRES_PASSWORD=mes -e POSTGRES_DB=mes \
  docker.io/library/postgres:18-alpine
```

## 2. Install

```bash
bun install --cwd backend
bun install --cwd frontend
```

## 3. Configure environment variables

Configuration is environment-driven. Never commit `.env`.

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Required backend values:

| Variable | Purpose |
| --- | --- |
| `BETTER_AUTH_SECRET` | Signs sessions. Generate with `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Base URL of the backend, used for auth callback links |

Optional backend values and their local defaults: `MES_DATABASE_URL` (`postgres://mes:mes@localhost:5432/mes`), `MES_API_PORT` (`3001`), `MES_WEB_ORIGIN` (`http://localhost:3000`), `MES_EXPORT_DIR` (`./data/exports`), `NODE_ENV` (`development`), `MES_RESET_EMAIL_FROM`, `MES_SMTP_URL`.

`MES_DATABASE_URL` must use the `postgres://` or `postgresql://` scheme; a
missing or malformed value is rejected at startup with an actionable message.
(The prototype previously stored its data in a SQLite file through
`MES_DATABASE_PATH`; that variable is gone — point `MES_DATABASE_URL` at the
PostgreSQL server instead.)

`MES_SMTP_URL` is deliberately optional: when it is unset, password-reset requests fail with an explicit *mail sender unavailable* error instead of reporting a false success.

### Ticket attachment storage (Garage S3)

`S3_ENDPOINT`, `S3_REGION` (default `garage`), `S3_BUCKET`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` configure the bucket that holds ticket attachments; `MES_UPLOAD_MAX_FILE_BYTES` (default 25 MB) and `MES_UPLOAD_MAX_FILES_PER_REQUEST` (default 20) bound one upload request. They must be supplied as a set — a half-configured group is reported at startup rather than surfacing as an authentication failure at the first upload — and production refuses to start without them.

Setup and the per-format rules are in [`garage-s3-clients.md`](garage-s3-clients.md) §5: the bucket, key grant, accepted formats and the denylist, plus why the browser uploads through the backend instead of a presigned URL.


### Password-reset mail

The URL in `MES_SMTP_URL` selects the transport mode, so moving between a hosted provider and a local mail server is a configuration change with no code change:

| Endpoint | Mode | Use |
| --- | --- | --- |
| `smtps://<user>:<app-password>@smtp.zoho.com:465` | TLS from the start | Hosted provider |
| `smtp://<user>:<app-password>@smtp.zoho.com:587` | Upgraded to TLS | Hosted provider alternative |
| `smtp://localhost:1025` | Plain, no authentication | Local mail server |

A malformed value is rejected at startup, and a validation failure never echoes the credential.

Hosted providers need an app-specific password rather than the account password (for Zoho: Zoho Account > Security > App Passwords), the mailbox must have IMAP/SMTP access enabled, and the `MES_RESET_EMAIL_FROM` address must match the authenticated account or the provider rejects the message. A first self-addressed message commonly lands in the spam folder, so check the provider's *sent* folder before concluding delivery is broken.

To check delivery locally without a provider, run any SMTP sink that listens on `1025` and point `MES_SMTP_URL` at `smtp://localhost:1025`; nothing else changes.

Tests never send mail: the transport is injected, and the suite uses a recording fake.

Frontend: `MES_API_URL` (default `http://localhost:3001`) is the backend base URL used by the Next.js route handlers in `frontend/src/app/api/mes/`.

The backend validates required configuration at startup and reports every missing value together. A misconfigured service exits rather than failing later at first use.

## 4. Migrate the database

The database must exist before the first migration. Create it once against the
server (the local Docker instance from §1, for example):

```bash
docker exec mes-test-pg createdb -U mes mes     # or: createdb -h localhost -U mes mes
```

```bash
cd backend
bun run db:migrate     # applies every migration in backend/drizzle (idempotent)
```

Migrations are additive: applying them twice is a no-op, and the Better Auth tables and their data are never dropped or renamed.

After changing `backend/src/db/schema.ts`:

```bash
cd backend
bun run db:generate    # creates a new versioned migration in backend/drizzle
```

**A committed migration is immutable.** The runner decides whether to apply an
entry by comparing its journal timestamp against the newest application already
recorded in the database — never by the file's content — so regenerating or
editing a migration that a database has already applied makes the next boot
replay it and fail on the objects it created (`table ... already exists`).
Generate the migration *before* committing, and never regenerate an applied one.
Correcting an applied migration means a new migration, or a deliberate
development-database reset: stop the backend, back up (see below), drop the
affected tables, and delete the matching `__drizzle_migrations` row so the
committed file applies from scratch. The migration-set parity test
(`bun test src/db/migrate.test.ts`) catches the neighbouring failure — a
journal entry without its file, a file without its journal entry, or journal
timestamps that do not increase — before it can crash a boot.

**Backup before migrating an existing database.** A `pg_dump` capture is the
PostgreSQL equivalent (run it against the database named by `MES_DATABASE_URL`):

```bash
pg_dump -Fc -d mes > data/mes-db-$(date +%Y%m%d%H%M%S).dump
```

To restore, create an empty database and load the dump (`createdb` + `pg_restore
--no-owner`). Restore from a backup only when migration or data-integrity
verification requires it; never remove user or session data as part of a routine
rollback.

## 5. Seed development data

```bash
cd backend
bun run db:seed
```

The seed is deterministic, repeatable, and anchored to the current date so yesterday/today/tomorrow views stay meaningful. It loads the code registries (ticket states, leave codes, modules, roles, permissions, KPI point rules), departments, a project, exactly one demo account per role, and task/attendance/leave fixtures covering every ticket state and task type.

Seeding **refuses to run in production** (`NODE_ENV=production`): sample records and demo credentials never reach a production database.

## 6. Run the applications

```bash
# Terminal 1 — API on http://localhost:3001
cd backend && bun run dev

# Terminal 2 — web client on http://localhost:3000
cd frontend && bun run dev
```

Health check:

```bash
curl -s http://localhost:3001/health
```

GraphQL endpoint: `POST http://localhost:3001/api/v1/graphql`.

### The frontend declares its own project root

`frontend/next.config.ts` names the `frontend/` application directory as the
project root (`turbopack.root` and `outputFileTracingRoot`). It has to, because
the repository has a `bun.lock` at its root for its tooling alongside the app's
own, and Next.js walks upward from the app directory picking up both — so it
settles on the repository directory instead and warns that it "inferred your
workspace root ... We detected multiple lockfiles".

Leave the declaration in place. Removing it brings the warning back in
`next dev`, `next build`, and `next start` alike, because Next.js reads either
key and skips its inference as soon as one is set. If the application ever
imports a package installed above its own directory, widen the declaration to
that shared parent instead of deleting it.

### The development server's network origin

`frontend/next.config.ts` also sets `allowedDevOrigins`. The dev server serves
its own dev-only resources — hot reload, source maps — only to `localhost` and
the hostname it was started with, so opening the app through the advertised
`Network:` address (`127.0.2.2:3000` in development) is a cross-origin request
that the server blocks with `403`:

> ⚠ Blocked cross-origin request to Next.js dev resource /_next/hmr from
> "127.0.2.2".

Entries are matched against the `Origin` header's **hostname only**, so they carry
no scheme and no port: write `127.0.2.2`, not `http://127.0.2.2:3000`. If the
dev server advertises a different network address on your machine, read the
`Network:` line it prints on startup and update the entry to match.

### Reading the logs

The backend records its own run: a line when it starts (the port, the
environment, and the locations it depends on), a line when it stops, every
unhandled failure with its stack trace, every GraphQL request that returned
errors (the operation and the returned `extensions.code`), and every
password-reset mail delivery outcome (sent, or failed with its reason and code).
Each line carries the time it happened, its severity, and one event — and it
goes to the terminal *and* to a file, so a run can be watched live and reviewed
afterwards.

The log files live in `backend/data/logs/` (`MES_LOG_DIR`, default
`./data/logs`), created at startup — an unusable path fails the run with an
actionable message rather than at the first event. `backend/data/logs/` is
gitignored, so nothing there is ever committed.

```
2026-11-22T09:15:00.000Z INFO service listening on port 3001 env=development ...
2026-11-22T09:16:12.480Z ERROR graphql request failed: operation=GetTicketStates status=200 codes=UNAUTHENTICATED
```

Read a run:

```bash
tail -f backend/data/logs/mes-backend.log      # follow it live
grep ERROR backend/data/logs/mes-backend.log   # only the failures
```

Variables (see `backend/.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `MES_LOG_DIR` | `./data/logs` | Directory the log files are written to. |
| `MES_LOG_LEVEL` | `info` | Minimum recorded severity: `debug`, `info`, `warn`, `error`. The default records lifecycle and errors only. |
| `MES_LOG_FILE` | `mes-backend.log` | Base name of the live log file. |
| `MES_LOG_MAX_BYTES` | `5242880` | Size at which the live file rolls (5 MB). |
| `MES_LOG_KEEP_FILES` | `3` | Rolled files retained besides the live one. |

Rotation is by size, bounded by the retained count: when the live file reaches
`MES_LOG_MAX_BYTES` it is rolled to `mes-backend.1.log`, the existing numbered
files shift up, and the oldest beyond `MES_LOG_KEEP_FILES` is discarded — so a
long-running dev server cannot fill the disk, and the most recent events stay.
Every name still ends in `.log`, which the repository's `.gitignore` covers.

Credential material never reaches either sink: the mail endpoint's URL and the
auth secret are not recorded, and the startup line carries only their
locations. A line that would carry a connection URL's password has it masked,
in plain and percent-encoded form.

## 7. Test and check

```bash
cd backend  && bun test && bunx tsc --noEmit && bunx biome check
cd frontend && bun test && bunx tsc --noEmit && bunx biome check && bun run build
```

Biome formats and lints both packages; do not add Prettier or ESLint configuration.

### Lint configuration

Biome is configured in two places, and only two:

| Path | Role |
| --- | --- |
| `biome.json` (repository root) | The **single root** configuration. It owns the project-wide rules and applies to every package. |
| `frontend/biome.json` | A nested extension: `"root": false` plus `"extends": ["../biome.json"]`. It declares only what the frontend differs on. |

The frontend's differences are space indentation, `css.parser.tailwindDirectives`,
the `next` and `react` lint domains, and exclusions for build output and
dependencies. It also sets `rules.nursery.noTailwindArbitraryValue` to `"off"`,
because the root raises that rule to `error` and the frontend's shadcn/Base UI
components are built on arbitrary Tailwind selectors and CSS functions. That
override is explicit on purpose: a rule level set in the root is not a default, so
a domain override in the nested file cannot soften it — an explicit rule override
is the only thing that can.

**The backend has no Biome configuration of its own.** It inherits the root
configuration, and its tab indentation already matches the root's
`indentStyle`, so it needs nothing overridden. Add `backend/biome.json` as a
nested extension (`"root": false` plus `"extends": ["../biome.json"]`) only when
the backend needs a setting the root does not give it — a package-specific
exclusion, or a rule that should differ. Never add a second file that declares
itself a root: a repository-wide `biome check` aborts with *"Found a nested root
configuration, but there's already a root configuration."* before it checks a
single file, which is exactly the failure the two-file structure exists to avoid.

The root configuration also excludes files this repository does not author, so a
repository-wide lint is decided by authored sources rather than by vendored or
generated output: `.agents/` (skills vendored from GitHub, recorded in
`skills-lock.json`), `skills-lock.json`, and `backend/drizzle/` (Drizzle's
generated schema and migrations).

Per-package commands, from either package's directory:

```bash
bun run lint     # biome check
bun run format   # biome format --write
```

And from the repository root, which checks both packages at once:

```bash
bunx biome check
```

Only errors cause a non-zero exit; warnings are still reported. The backend's
`noExplicitAny` warnings are long-standing and expected.

`bun test` is the runner for both packages. The backend suite never delivers mail: the transport is injected and the tests use a recording sender, so no SMTP server needs to be running. Frontend test files are excluded from the Next.js type-check pass (`frontend/tsconfig.json`), which keeps `next build` green while `bun test` still runs them.

## 8. Sessions and API access

The browser never holds the session token. Sign-in posts to the same-origin route handler `POST /api/mes/session`, which obtains a session from the backend, stores the token in an httpOnly cookie, and returns the viewer. `POST /api/mes/graphql` attaches that token as `Authorization: Bearer <token>` when forwarding to the backend.

Scripted clients can talk to the backend directly:

```bash
curl -s -X POST http://localhost:3001/api/v1/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"mutation($input: LoginInput!){ login(input:$input){ session { token } viewer { user { fullName } } } }","variables":{"input":{"email":"employee@mes.local","password":"<seed password>"}}}'
```

Then pass the returned token as `Authorization: Bearer <token>`.

## 9. Live updates

Open screens follow backend changes without a manual reload. The backend
streams change events over `GET /api/v1/events` (Server-Sent Events); the
same-origin route handler `GET /api/mes/events` proxies that stream with the
session token attached — the same trust model as the GraphQL proxy, because
`EventSource` cannot send an `Authorization` header of its own. Every
successful mutation publishes the domain area it invalidated (tickets, leave,
performance, users, audit), and each open view refetches its queries when its
area's event arrives. There is one connection per browser tab.

To see it: sign in, open a module screen in two browsers, make a change in one,
and watch the other update. In DevTools, the Network tab filtered by
`EventStream` shows the long-lived `/api/mes/events` connection and its frames
(event names `connected`, `change`; comment lines are heartbeats).

The shell's status indicator shows the channel's state: **Live** (green), or
**Offline** (red) — the latter after repeated failures, when the last-known
data stays on screen and a manual refresh remains the fallback. The connection
re-establishes itself, and a reconnect refetches the open views to catch up on
anything missed while it was down.

## 10. Generated reports

Print and export operations write real files under `MES_EXPORT_DIR` and record an `export_artifacts` row. Authorized clients download them from `GET /api/v1/exports/:id`. Generated artifacts stay outside source control and may be deleted at any time; the audit trail keeps the record of what was produced.

## 11. Theme

The visual authority is [`DESIGN.md`](../DESIGN.md): a light IBM Carbon direction — white surfaces, charcoal ink, a single IBM Blue `#0f62fe` accent, flat-square corners, IBM Plex Sans, hairline borders, and footer-only inversion. `AGENTS.md` points at `DESIGN.md` for the palette. Prefer shadcn components over raw markup.

## 12. Localization (frontend)

The frontend is bilingual: English (`en`, the default) and Vietnamese (`vi`), built on `next-intl`. The active locale is a client-side concern — the server always renders the English baseline — so a language switch applies without a reload and no route classification changes.

- **Catalogues:** `frontend/messages/en.json` (source of truth) and `frontend/messages/vi.json` (mirrors the same key set), organized by surface: `common`, `shell`, `auth`, `jobs`, `planning`, `performance`, `settings`, `auditLog`, `errors`, and `enums`.
- **Typed keys:** `frontend/global.d.ts` types next-intl's messages from `typeof en.json`, so an invented key fails `bunx tsc --noEmit` in `frontend/` while a real one passes.
- **Locale choice:** the `mes_locale` cookie (path `/`, `SameSite=Lax`, one year) holds the viewer's preference; `src/lib/mes/i18n/config.ts` is the locale contract and `src/lib/mes/i18n/provider.tsx` applies it. English formats through the `en-GB` Intl tag to keep the app's original date/time conventions.

### Add a message

1. Add the key to **both** catalogues in the same edit: `frontend/messages/en.json` and `frontend/messages/vi.json`. Keys name the meaning (`jobs.list.emptyTitle`), not the English wording; values with data use ICU placeholders (`{count}`), never string concatenation.
2. Consume it with `useTranslations("<namespace>")` from `next-intl` in a client component.
3. Run the checks from the repository root or `frontend/`:

```bash
cd frontend && bunx tsc --noEmit && bun test
```

`tsc` fails on a key that is not in the catalogue; `bun test` fails the parity test if the key exists in one locale but not the other.

### Add a locale

1. Copy `frontend/messages/en.json` to `frontend/messages/<locale>.json` and translate the values (keep the keys identical).
2. Register the locale in `frontend/src/lib/mes/i18n/config.ts` (`MES_LOCALES`, and the Intl tag in the provider's `INTL_LOCALES` map if the locale needs a region-specific convention, like `en → en-GB`).
3. Add the catalogue to `CATALOGUES` in `frontend/src/lib/mes/i18n/provider.tsx` and the language's own name to the switcher in `frontend/src/components/shell/language-switcher.tsx`.
4. Re-run the checks above; the parity and coverage tests enumerate anything missed.

### The coverage tests

`frontend/src/lib/mes/queries/registries.test.ts` guards completeness:

- **Label coverage** — every code in every registry (ticket states, leave codes, priority, task type, approval status, task-request type, department type, roles, modules, export formats, secondary badges) has an `enums.*` message in **every** locale. A new enum value fails the test until it is translated everywhere.
- **Key parity** — `en.json` and `vi.json` expose identical key sets. A message added to one locale but not the other fails the test.

```bash
cd frontend && bun test   # includes the label coverage and catalogue parity tests
```

Domain enum labels resolve through `useDomainLabels()` (`frontend/src/lib/mes/i18n/labels.ts`): the active locale's `enums.*` message first, the registry's canonical English name as fallback, and the code unchanged only for values neither knows. Data, queries, mutations, and filters always carry the documented code tokens verbatim — the locale affects rendered text only.

## 13. Telegram bot

The backend carries an inbound Telegram bot (architecture:
[`TELEGRAM_BOT_ARCHITECTURE.md`](../TELEGRAM_BOT_ARCHITECTURE.md), design:
`openspec/changes/add-telegram-bot/design.md`). It runs **inside the backend
process** and receives updates by **long polling**, so it needs no public URL
and no tunnel — a `@BotFather` token is the whole infrastructure cost.

### Configuration

Every setting exists in both places, with the precedence
**per-user preference → website setting → environment variable → built-in
default** (resolved in `backend/src/telegram/settings.ts`):

| Setting | Environment variable | Website (Settings → Telegram) |
| --- | --- | --- |
| Bot enable flag | `TELEGRAM_BOT_ENABLED` | enable toggle |
| Bot token | `TELEGRAM_BOT_TOKEN` | token field (masked when read back) |
| AI endpoint | `TELEGRAM_AI_BASE_URL` | base URL field |
| AI API key | `TELEGRAM_AI_API_KEY` | API key field |
| Default model | `TELEGRAM_AI_MODEL` | default model field |
| `/ask` budget | `TELEGRAM_AI_MONTHLY_QUOTA` | — |
| Link-code TTL | `TELEGRAM_LINK_CODE_TTL_MINUTES` | — |
| Push alerts | — | push-alert toggle |

A fresh deployment boots from `.env.example` values alone; anything saved on
the website overrides them without a restart. Clearing a website value
re-applies the environment one. The model catalog is fetched from
`<TELEGRAM_AI_BASE_URL>/models` (OpenAI-compatible) and cached, so `/model`
works even while the endpoint is briefly unreachable.

### Logging in

Nothing works before the Telegram identity is linked to a MES account:

1. Sign in to the web app, open **Settings → Telegram**, and generate a link
   code.
2. Send `/link <CODE>` to the bot — the code is single-use and expires after
   `TELEGRAM_LINK_CODE_TTL_MINUTES`.
3. Or fall back to `/login <email|userCode> <password>` (the bot deletes the
   credential message where Telegram allows; prefer the link code).

Revoke a link from the website's linked-accounts list, or with `/logout` in
the chat. Roles, department scoping, and audit rules are exactly the web
app's — the bot reuses the same domain functions and `authorize()`.

### Running it

`TELEGRAM_BOT_ENABLED=true` with a token starts polling on backend boot;
`/ask` additionally needs `TELEGRAM_AI_BASE_URL`. With the flag off (the
default) the bot stays completely inert — no token is read, no request is
made. Guard tests and unit suites always run with the bot disabled.

## 14. Run the whole stack with Docker

The `docker/` directory packages the backend, frontend, a PostgreSQL database,
a Prometheus/Grafana monitoring tier, a bundled single-node Garage S3, Mailpit
(a local SMTP sink), and Caddy (a reverse proxy) into one production-style
Compose stack. The reverse proxy is the
only published app entry point, so the browser never talks to the API directly —
the frontend's same-origin route handlers reach it over the compose network.

Prerequisites: Docker (or Podman with the Compose provider) and a running engine.
Images are built locally from the committed sources and lockfiles.

### Bring the stack up

```bash
cd docker
cp .env.example .env      # then fill in the required secrets
docker compose up -d --build
```

`.env` is gitignored; only `.env.example` is tracked. Required values:

| Variable | Purpose |
| --- | --- |
| `BETTER_AUTH_SECRET` | Signs sessions. `openssl rand -base64 32` |
| `POSTGRES_PASSWORD` | Password of the `mes` PostgreSQL role. `openssl rand -base64 24` |
| `GARAGE_RPC_SECRET` | Garage inter-node secret. `openssl rand -hex 32` |
| `GARAGE_ADMIN_TOKEN` | Garage admin token. `openssl rand -base64 32` |
| `GRAFANA_ADMIN_PASSWORD` | Grafana's admin sign-in. `openssl rand -base64 24` |
| `GRAFANA_BASIC_AUTH_USER` | Basic-auth username in front of Grafana |
| `GRAFANA_BASIC_AUTH_HASH` | Basic-auth bcrypt hash. `docker run --rm docker.io/library/caddy:2 caddy hash-password --plaintext '<password>'` |

### Provision attachments (one time)

The bundled Garage starts empty. Apply the node layout and create the bucket and
access key once:

```bash
./init-garage.sh
```

It prints `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`; put them in `docker/.env`
and restart the backend:

```bash
docker compose up -d backend
```

The API refuses to start in production without a complete storage group, so this
step is required before the stack serves uploads. `init-garage.sh` is idempotent.

### Open the app

| Surface | URL |
| --- | --- |
| Web client (through the proxy) | `http://localhost:8080` |
| Garage S3 API (host tooling) | `http://localhost:3900` |
| Garage admin API | `http://localhost:3903` |
| Mailpit web UI | `http://localhost:8025` |
| Mailpit SMTP | `smtp://localhost:1025` |

Use `localhost` as the origin: the frontend sets a `Secure` session cookie when
`NODE_ENV=production`, and browsers accept it on the loopback origin over plain
HTTP. For any other hostname, terminate TLS at Caddy and use `https://`.

### Seed demo data

The running service is in production posture, and the seed refuses in production.
Load demo data with a one-off development override against the same database:

```bash
docker compose exec -e NODE_ENV=development backend bun run db:seed
```

### Stop

```bash
docker compose down          # keeps state (named volumes and docker/volumes)
docker compose down -v       # also removes the named volumes and their data
```

State lives in named volumes (`pgdata` for the database, `backend-data` for the
exported reports, `prometheus-data` for the metrics history, `grafana-data` for
Grafana's state, `mailpit-data`, `caddy-data`, `caddy-config`) and, for Garage,
in `docker/volumes/garage/`.

### Backup and restore

All durable state — the PostgreSQL database (`pgdata`), the exported reports
(`backend-data`), and the attachment store (`volumes/garage/`) — is captured by
one command:

```bash
./backup.sh
```

- Writes `docker/database/mes-backup-<timestamp>.tar.gz` (owner-only, mode 600)
  containing `manifest.txt`, `database.dump` (a custom-format `pg_dump` of the
  application database), `exports.tar`, `garage-meta.tar`, and
  `garage-data.tar` (attachments). The manifest records the format version,
  capture time, and each member's size and SHA-256.
- The database is captured through `pg_dump`, which produces a consistent
  snapshot of the running database, so the stack keeps serving while it is
  dumped. The file-based state — exported reports and the Garage directories —
  is captured only while the services that write it (`backend`, `garage`) are
  stopped; they are started again afterwards, while `frontend`, `caddy`, and
  `mailpit` keep serving throughout.
- On an already-stopped stack the backup still runs: the `postgres` service is
  started only for the dump and stopped again afterwards, and nothing else is
  started.
- After a success the newest `KEEP` archives are kept (default 7; `KEEP=0`
  disables pruning). Pre-restore snapshots (`mes-pre-restore-*`) are never
  auto-deleted.
- `docker/database/` is gitignored and excluded from image build contexts;
  archives are owned by whoever runs the script.
  Archives are plain copies of application data (password hashes included) —
  keep them with the same care as the database itself.
- Not captured: Mailpit mail history and Caddy state (disposable), and
  `docker/.env` (credentials — keep it together with your backups). The
  archive does carry the Garage access-key credentials that Garage itself
  stores in its metadata database; a restore needs them to keep attachments
  working.

Restore picks an archive and puts it back:

```bash
./restore.sh database/mes-backup-<timestamp>.tar.gz
```

- The archive is verified first (manifest present, every member's SHA-256 and
  size match); an invalid or unrelated file is refused and nothing changes.
- The stack stops, the current state is snapshotted to
  `docker/database/mes-pre-restore-<timestamp>.tar.gz`, the database is
  recreated and loaded from the archive's dump with `pg_restore`, the exports
  and attachments are replaced, and the stack starts again — the command
  reports success only when the API answers.
- The snapshot makes a restore undoable:

```bash
./restore.sh database/mes-pre-restore-<timestamp>.tar.gz
```

**Fresh checkout / lost `.env`.** Clone the repo, `cd docker`, recreate
`docker/.env` (reuse the original values so sessions and S3 keys keep working),
build and restore:

```bash
cp .env.example .env          # fill in the original values
docker compose up -d --build  # images only; the data still comes from the archive
./restore.sh database/mes-backup-<timestamp>.tar.gz
```

If `docker/.env` is lost, recreate it from `.env.example` with fresh secrets,
restore the archive, then run `./init-garage.sh`: it is idempotent and prints
the S3 access-key secret the restored Garage already holds. A new
`BETTER_AUTH_SECRET` invalidates existing sessions — users sign in again.
Restore with the same or a newer checkout; migrations only run forward.

**Regular backups.** Scheduling is a host choice — for example, nightly at
03:00 in the host crontab (adjust the path):

```cron
0 3 * * * cd /path/to/MES_project/docker && ./backup.sh >> /var/log/mes-backup.log 2>&1
```

### Monitor the stack

The stack ships with a small monitoring tier — `prometheus` (metrics store),
`grafana` (dashboards), `postgres_exporter` (database metrics), and `cadvisor`
(container CPU/memory/network) — all started by the same `docker compose up -d`.

- **Open it:** <http://localhost:8080/grafana> — the same origin as the app.
  Two credentials are asked for: Caddy's HTTP basic auth (`GRAFANA_BASIC_AUTH_USER`
  / `GRAFANA_BASIC_AUTH_HASH` from `docker/.env`), then Grafana's admin sign-in
  (`GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD`).
- **Dashboards** (MES — Stack overview, MES — PostgreSQL) are provisioned from
  the tracked files in `docker/grafana/` — no UI setup after a deploy. The
  datasource points at `http://prometheus:9090`.
- **What is measured:** every service's container CPU, memory, and network
  traffic; PostgreSQL connection counts, transaction rate, and buffer-cache hit
  ratio; Garage metrics when `GARAGE_METRICS_TOKEN` is set (open `docker/.env`).
- **Retention:** 15 days in the `prometheus-data` volume. Both `prometheus-data`
  and `grafana-data` survive `docker compose down`/`up`; only `down -v` removes
  them.
- **Direct access (tooling):** Prometheus's own UI at
  <http://127.0.0.1:9090> — loopback only, so the full metrics picture never
  leaves the machine. The exporters publish nothing.
- **Rotate credentials:** edit the variables in `docker/.env` (regenerate the
  basic-auth hash with `docker run --rm docker.io/library/caddy:2 caddy
  hash-password --plaintext '<new-password>'`), then
  `docker compose up -d grafana caddy`.
- **Not included (by design):** alerting (no Alertmanager), log aggregation (no
  Loki), and request-level RED metrics from the backend. Container, database,
  and storage monitoring only — those follow-ups do not need any of this torn
  out to add them.

### Run in one shared network namespace (fallback)

Use this only when the runtime cannot create bridge networks — on this machine
netavark intermittently fails with `Netlink error: Operation not supported
(os error 95)`, and `docker compose up -d` dies creating the project network.
Everything then runs in a single Podman pod: one shared network namespace, with
peers reachable on `127.0.0.1`. Service names still work, because each pod
container gets an `/etc/hosts` entry under *its container name* — so the whole
stack keeps working unchanged if the containers are named after the Compose
services. A standard Docker host (working bridges) never needs this; `docker
compose up -d` remains the standard bring-up.

**1. Build the app images** (the build needs no network):

```bash
cd docker
docker compose build backend frontend
```

**2. Source the same environment** Compose would interpolate:

```bash
set -a; . ./.env; set +a
```

**3. Reserve Grafana's port, and point the proxy at the pod.** In one namespace
only one process can bind a given port: the web client owns 3000 and the API
owns 3001, so Grafana moves to 3002 — set both of its variables together (they
are the pair Caddy proxies to). The web client binds the namespace's primary
address rather than loopback, so the frontend upstream becomes the *pod's* name:

```bash
export GRAFANA_HTTP_PORT=3002
export GRAFANA_UPSTREAM=grafana:3002
export MES_FRONTEND_UPSTREAM=mes:3000
```

**4. Create the pod and start every service by name.** Run from `docker/`;
`-v "$PWD/..."` binds the tracked configs. Ports are published **on the pod**
(pod members cannot publish their own). The volume names match Compose's
(`mes_pgdata`, `mes_backend-data`, `mes_prometheus-data`, `mes_grafana-data`,
`mes_mailpit-data`, `mes_caddy-data`, `mes_caddy-config`), so a later
`docker compose up -d` — and `backup.sh`/`restore.sh` — read the same state.
Check `ss -ltn` first: when bridge creation fails the pod can end up sharing the
host's network namespace, in which case a container's port is the host's port.

```bash
docker pod create --name mes \
  -p 8080:80 -p 5432:5432 -p 3900:3900 -p 3903:3903 -p 1025:1025 -p 8025:8025 \
  -p 127.0.0.1:9090:9090

# state services first
docker run -d --pod mes --name postgres --restart unless-stopped \
  -e POSTGRES_USER=mes -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" -e POSTGRES_DB=mes \
  -v mes_pgdata:/var/lib/postgresql docker.io/library/postgres:18-alpine
docker run -d --pod mes --name garage --restart unless-stopped \
  -e GARAGE_RPC_SECRET="$GARAGE_RPC_SECRET" -e GARAGE_ADMIN_TOKEN="$GARAGE_ADMIN_TOKEN" \
  -e GARAGE_METRICS_TOKEN="$GARAGE_METRICS_TOKEN" \
  -v "$PWD/garage.toml:/etc/garage.toml:ro" \
  -v "$PWD/volumes/garage/meta:/var/lib/garage/meta" \
  -v "$PWD/volumes/garage/data:/var/lib/garage/data" \
  docker.io/dxflrs/garage:v2.4.1
docker run -d --pod mes --name mailpit --restart unless-stopped \
  -e MP_MAX_MESSAGES=500 -v mes_mailpit-data:/data \
  docker.io/axllent/mailpit:latest

docker exec postgres pg_isready -U mes -d mes    # wait for "accepting connections"

# application — the API restarts until its S3 keys exist (see init-garage below)
docker run -d --pod mes --name backend --restart unless-stopped \
  -e NODE_ENV=production -e BETTER_AUTH_SECRET="$BETTER_AUTH_SECRET" \
  -e BETTER_AUTH_URL="$MES_PUBLIC_ORIGIN" -e MES_WEB_ORIGIN="$MES_PUBLIC_ORIGIN" \
  -e MES_API_PORT=3001 \
  -e MES_DATABASE_URL="postgres://mes:$POSTGRES_PASSWORD@postgres:5432/mes" \
  -e MES_EXPORT_DIR=/app/backend/data/exports \
  -e S3_ENDPOINT=http://garage:3900 -e S3_REGION=garage -e S3_BUCKET="$S3_BUCKET" \
  -e S3_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" -e S3_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
  -e MES_SMTP_URL="$MES_SMTP_URL" -e MES_RESET_EMAIL_FROM="$MES_RESET_EMAIL_FROM" \
  -e TELEGRAM_BOT_ENABLED="$TELEGRAM_BOT_ENABLED" -e TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN" \
  -e TELEGRAM_AI_BASE_URL="$TELEGRAM_AI_BASE_URL" -e TELEGRAM_AI_API_KEY="$TELEGRAM_AI_API_KEY" \
  -e TELEGRAM_AI_MODEL="$TELEGRAM_AI_MODEL" \
  -v mes_backend-data:/app/backend/data/exports docker.io/library/mes-backend:latest
docker run -d --pod mes --name frontend --restart unless-stopped \
  -e MES_API_URL=http://backend:3001 docker.io/library/mes-frontend:latest

# monitoring — Prometheus last: /etc/hosts entries appear as siblings start
docker run -d --pod mes --name postgres_exporter --restart unless-stopped \
  -e DATA_SOURCE_NAME="postgresql://mes:$POSTGRES_PASSWORD@postgres:5432/mes?sslmode=disable" \
  docker.io/prometheuscommunity/postgres-exporter:v0.19.1
docker run -d --pod mes --name cadvisor --restart unless-stopped \
  -v /:/rootfs:ro -v /sys:/sys:ro -v /var/lib/containers:/var/lib/containers:ro \
  gcr.io/cadvisor/cadvisor:v0.52.0
docker run -d --pod mes --name grafana --restart unless-stopped \
  -e GF_SECURITY_ADMIN_USER="$GRAFANA_ADMIN_USER" \
  -e GF_SECURITY_ADMIN_PASSWORD="$GRAFANA_ADMIN_PASSWORD" \
  -e GF_AUTH_ANONYMOUS_ENABLED=false -e GF_USERS_ALLOW_SIGN_UP=false \
  -e GF_SERVER_ROOT_URL="$MES_PUBLIC_ORIGIN/grafana" \
  -e GF_SERVER_HTTP_PORT="$GRAFANA_HTTP_PORT" \
  -v mes_grafana-data:/var/lib/grafana \
  -v "$PWD/grafana/provisioning:/etc/grafana/provisioning:ro" \
  -v "$PWD/grafana/dashboards:/var/lib/grafana/dashboards:ro" \
  docker.io/grafana/grafana:13.2.6
docker run -d --pod mes --name prometheus --restart unless-stopped --entrypoint /bin/sh \
  -e GARAGE_METRICS_TOKEN="$GARAGE_METRICS_TOKEN" \
  -v "$PWD/prometheus.yml:/etc/prometheus/prometheus.yml:ro" -v mes_prometheus-data:/prometheus \
  docker.io/prom/prometheus:v3.16.0-busybox \
  -c 'umask 077; printf "%s" "$GARAGE_METRICS_TOKEN" > /tmp/garage-metrics-token; \
     exec /bin/prometheus --config.file=/etc/prometheus/prometheus.yml \
     --storage.tsdb.path=/prometheus --storage.tsdb.retention.time=15d \
     --web.listen-address=0.0.0.0:9090'

# the origin last
docker run -d --pod mes --name caddy --restart unless-stopped \
  -e GRAFANA_BASIC_AUTH_USER="$GRAFANA_BASIC_AUTH_USER" \
  -e GRAFANA_BASIC_AUTH_HASH="$GRAFANA_BASIC_AUTH_HASH" \
  -e GRAFANA_UPSTREAM="$GRAFANA_UPSTREAM" \
  -e MES_FRONTEND_UPSTREAM="$MES_FRONTEND_UPSTREAM" \
  -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v mes_caddy-data:/data -v mes_caddy-config:/config \
  docker.io/library/caddy:2
```

Run `./init-garage.sh` once, exactly as in the Compose run — it targets the
published `3900` and works unchanged. The API refuses to boot until its S3 keys
exist, so run it before (or alongside) the backend, then restart the backend if
it had already started.

**5. What differs from the Compose run.** No `depends_on` — start in the order
above and let `restart: unless-stopped` absorb a too-early backend; service
names resolve through the pod's `/etc/hosts`, whose entries appear as containers
start (a container that starts before its targets may need a restart — one
`docker restart prometheus` after everything is up is enough); the web client
binds the namespace's primary address, hence the `MES_FRONTEND_UPSTREAM` step;
on this host's rootless runtime cadvisor reports only the root cgroup, so the
stack-overview dashboard shows fewer per-container series (a runtime limitation,
not a config error). Everything else — the origin, the `/grafana` basic-auth
guard, the dashboards, the datasource, the loopback-only Prometheus publish — is
the same.

**6. Drill — confirm the stack is whole:**

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/                                  # 200/307, the app
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/grafana/                          # 401, unauthenticated
curl -s -o /dev/null -w '%{http_code}\n' -u "$GRAFANA_BASIC_AUTH_USER:<hash password>" \
  http://127.0.0.1:8080/grafana/login                                                              # 200, the login page
curl -s -c jar.txt -o login.json -w '%{http_code}\n' -u "$GRAFANA_BASIC_AUTH_USER:<hash password>" \
  -X POST -H 'content-type: application/json' \
  -d "{\"user\":\"$GRAFANA_ADMIN_USER\",\"password\":\"$GRAFANA_ADMIN_PASSWORD\"}" \
  http://127.0.0.1:8080/grafana/login                                                              # 200 + {"message":"Logged in"}
curl -s 'http://127.0.0.1:9090/api/v1/targets' | grep -o '"health":"[a-z]*"'                      # up for every job
```

The Grafana sign-in posts to `/grafana/login` — through the proxy, which strips
the prefix to Grafana's own `/login`. Teardown is `docker pod rm -f mes` plus
the `mes-*` volumes you want to keep — they persist and the next
`docker compose up -d` reuses them.


### Bundled vs external Garage

This stack bundles its own Garage node. The external-network option — joining a
separate `garagehq` deployment over `garagehq_default` — remains available and is
documented in [`garage-s3-clients.md`](garage-s3-clients.md) §5. Do not run both
at once on the same host: they publish the same `3900`/`3903` ports.

## 15. Multi-account Telegram web client

The Telegram module (`frontend/src/app/(app)/telegram/`) lets a signed-in
viewer work with several of their own Telegram accounts at once inside MES.
Account management is the client's own: telegram-tt ships a native account
switcher, add-account, and logout, so MES renders none of those — it only
restores every linked account on open and backs their sessions up. The chat
surface is the real Telegram Web client — telegram-tt, bundled at
`frontend/public/telegram-web/` and served at `/telegram-web/`, embedded in an
iframe (`/telegram-web/index.html?account=<slot>&theme=<light|dark>`). MES wraps it with the session
bridge only: it captures each account's session material from the embedded
client, backs it up encrypted (AES-256-GCM) to the backend, and hydrates
every account back before mounting the iframe — so every later sign-in
restores every account with no OTP/QR, and the client's own switcher moves
between them freely. See
[`TELEGRAM_MULTI_ACCOUNT_ARCHITECTURE.md`](../TELEGRAM_MULTI_ACCOUNT_ARCHITECTURE.md)
for the structure. This is distinct from the inbound bot of §13: the bot uses
the Bot API with a bot token; this module drives the viewer's own MTProto
sessions through the embedded client, and the two code paths never share
state.

telegram-tt brings its own multi-account scheme: one `?account=N` slot per
account, with per-slot localStorage keys (`account<N>` — the whole session
material) and per-slot IndexedDB databases. MES implements no multi-account
storage of its own; it maps each linked account to a stable slot that the
backend assigns and records, so two viewers sharing one browser never claim
the same slot on the shared origin.

**Environment.** One value, in `.env.example` — copy it to `.env` (never
commit `.env`):

| File | Variable | Purpose |
| --- | --- | --- |
| `backend/.env` | `TELEGRAM_ENCRYPTION_KEY` | 32-byte AES-256 key, generated with `openssl rand -hex 32`. Encrypts the stored session material |

With no encryption key the module refuses to link an account (an actionable
configuration error) rather than storing a session unencrypted.

**The vendored client build.** `frontend/public/telegram-web/` is a production
build of telegram-tt, committed as a build artifact (GPL-3.0-or-later — see
[`NOTICES.md`](../NOTICES.md)). Refresh it with
`cd frontend && bun run vendor:telegram-web` after updating the clone in
`sample/telegram-tt`: the script first applies the tracked MES patches from
`frontend/scripts/telegram-tt-patches/` to the clone (the theme bridge is the
only local modification — see NOTICES.md; a patch that no longer applies
aborts the run instead of shipping an unpatched build), then rebuilds the
source in the clone and copies `dist/` into `public/` (source maps, the
bundle-size report, and home-screen emoji tiles excluded). The build needs
the Telegram API credentials as environment variables —
`TELEGRAM_API_ID` and `TELEGRAM_API_HASH` (never write them to a file); the
api pair the current bundle was built with is recoverable from the committed
worker bundle itself. Update the version note in `NOTICES.md` when you
refresh. Verify the copy with `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/telegram-web/index.html`
— 200 means the static path is served.

**Smoke test (manual, env-gated — never automated in CI).** With both servers
running and `TELEGRAM_ENCRYPTION_KEY` set on the backend: open the Telegram
module from the dashboard launcher and link an account through the embedded
client's own login (phone + OTP — accept the Telegram code on your phone —
or QR). Watch the account connect; reload the page and the module reconnects
with no prompt. Switch accounts with the client's own switcher (an account
added there is captured and backed up the same way). Open a second browser
(or an incognito window),
sign in as the same viewer, open the module — the account restores from the
backend's session material with no OTP/QR again. Send a text message and one
file in a chat; from Telegram's own "Active Sessions" revoke one session and
watch that account no longer connect while the others keep working. With the
shell in dark mode, open the module and watch the client's first paint come
up dark (no white flash); switch the shell theme and watch the client
re-theme in place without the frame reloading. When a QR
login is rejected on the phone with "This account is already logged in from
this app", the account still holds an older session from this same api_id
(its browser-UA entry in the phone's Settings → Devices): terminate that
session there, or log the account in by phone + OTP instead, then scan a
fresh QR. A failed run
usually means a missing
`TELEGRAM_ENCRYPTION_KEY` on the backend or a stale
`frontend/public/telegram-web/` (refresh it with
`bun run vendor:telegram-web`).
