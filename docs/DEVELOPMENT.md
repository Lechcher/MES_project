# Development Guide

How to run, migrate, seed, and test the MES prototype locally.

The repository has two applications:

| Directory | Application | Stack |
| --- | --- | --- |
| `backend/` | API server implementing the GraphQL contract in `API_CONTACT_SPECIFICATION.md` | Bun + Elysia, Better Auth, Drizzle ORM, SQLite |
| `frontend/` | Web client | Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn |

---

## 1. Prerequisites

- **Bun** 1.3 or newer (`bun --version`)
- No external database server: SQLite is embedded

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

Optional backend values and their local defaults: `MES_DATABASE_PATH` (`./data/mes.db`), `MES_API_PORT` (`3001`), `MES_WEB_ORIGIN` (`http://localhost:3000`), `MES_EXPORT_DIR` (`./data/exports`), `NODE_ENV` (`development`), `MES_RESET_EMAIL_FROM`, `MES_SMTP_URL`.

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

**Backup before migrating an existing database.** SQLite keeps the whole database in one file plus its write-ahead log:

```bash
# Stop the backend first, then copy the database and its WAL alongside it.
cp data/mes.db data/mes.db.backup-$(date +%Y%m%d%H%M%S)
cp -f data/mes.db-wal data/mes.db-shm data/ 2>/dev/null || true
```

To restore, stop the service and copy the backup over `data/mes.db`, then delete any stale `-wal`/`-shm` files. Restore from a backup only when migration or data-integrity verification requires it; never remove user or session data as part of a routine rollback.

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
