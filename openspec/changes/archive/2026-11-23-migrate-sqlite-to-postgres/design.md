# Design

## Context

The prototype runs entirely on SQLite: `backend/src/db/index.ts` opens a
`bun:sqlite` file handle, the Drizzle schema in `backend/src/db/schema.ts` is
authored against `drizzle-orm/sqlite-core`, Better Auth is configured with the
`sqlite` Drizzle adapter provider, and the stack persists the database as a file
in the `backend-data` named volume. ~44 call sites construct the database
through `createDatabase(path)`, tests open temporary files and assert SQLite
query plans, and the backup scripts copy the database file plus its WAL.

The logical model itself is engine-neutral: application-generated text UUID ids,
code registries as constrained text, Unix-millisecond timestamps, booleans,
`real` numbers, JSON as text, plus FK/uniqueness/CHECK constraints and the query
indexes. Motivation for the switch is in `proposal.md` (Why).

## Goals / Non-Goals

**Goals:**

- Same logical model, same GraphQL contract, same domain vocabulary, same seed
  behavior — moved onto PostgreSQL with PG-native column types.
- One cutover path that is reversible: the SQLite stack stays runnable from git
  history with its untouched volume until the Postgres cutover is verified.
- Tests run against a real PostgreSQL (the operator's Docker image), so the
  suite exercises the production engine rather than a stand-in.
- Backup/restore survives the switch with operator-visible mechanics unchanged
  (manifest, checksums, `KEEP`, pre-restore snapshot), only the capture
  mechanism and archive directory change (`docker/database/`).

**Non-Goals:**

- No data migration of the existing SQLite rows (operator chose fresh start +
  reseed; the old data is demo data).
- No adoption of the reference schema's PostgreSQL-only constructs (native enum
  types, database-generated UUIDs, `jsonb`, views, `updated_at` triggers).
- No connection-pool tuning beyond a sane default, no read replicas, no
  pgAdmin/ops tooling, no CI pipeline.
- No change to attachment storage (Garage S3), exports on disk, or the
  frontend.

## Decisions

### 1. Driver: `pg` + `drizzle-orm/node-postgres`, not Bun's built-in SQL

Better Auth's Drizzle adapter is configured with `provider: "pg"` and expects a
`drizzle-orm/node-postgres` handle backed by a `pg.Pool`. Bun's built-in SQL
client (`drizzle-orm/bun-sql`) has no documented Better Auth adapter path and is
newer; `pg` is pure JavaScript, so the multi-stage Docker build (which prides
itself on "no native build step") stays simple.

*Alternative considered:* `drizzle-orm/bun-sql` (zero extra dependency, built
into the Bun runtime). Rejected: unproven Better Auth interop and a second,
runtime-specific code path to test.

### 2. Schema: faithful move to `pg-core`, PG-native columns

`sqliteTable` → `pgTable`, keeping every table, column name, constraint name,
and index name. Type mapping:

| SQLite (today) | PostgreSQL (after) | JS type |
| --- | --- | --- |
| `text` | `text` | `string` (unchanged) |
| `integer({ mode: "boolean" })` | `boolean` | `boolean` (unchanged) |
| `integer({ mode: "timestamp_ms" })` + `unixepoch()*1000` defaults | `timestamptz(3)` + `now()` defaults | `Date` (unchanged) |
| `real` | `double precision` | `number` (unchanged) |
| `text` (JSON columns) | `text` | `string` (unchanged) |
| `check(...)` constrained registries | same `CHECK` constraints, same names | unchanged |
| text PK/FK ids (app-generated UUIDs) | unchanged (no database-side UUID generation) | unchanged |

The `timestampMs`/`createdAt`/`updatedAt` helpers become
`timestamp({ withTimezone: true, precision: 3 })` factories; `.default(nowMs)`
becomes `.defaultNow()`. CHECK constraint identifiers are reused verbatim so
Postgres error surfaces stay readable.

*Alternative considered:* rewrite `schema.ts` to the reference PostgreSQL design
in `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` (native enums, DB-generated UUIDs,
`jsonb`, views). Rejected by the operator: it cascades into domain code, seed,
tests, and the id-type surface of the API contract for no behavioral gain.

### 3. Migration set is regenerated as one initial migration

`backend/drizzle/` (the six SQLite-era migrations and their journal) is
replaced by a single generated initial PostgreSQL migration. This is safe only
because the cutover is a fresh start: no PostgreSQL database has applied any
migration yet. The journal-parity, idempotency, and immutability semantics the
persistence spec requires are unchanged and stay covered by
`migrate.test.ts`, re-pointed at PostgreSQL.

*Alternative considered:* hand-write a conversion migration that replays the old
set against PostgreSQL. Rejected: the old SQL is SQLite-dialect (`unixepoch()`,
no `timestamptz`), so it does not apply cleanly; generating one initial
migration from the new schema is exact and testable.

### 4. Connection factory and lifecycle

`createDatabase(url: string)` replaces `createDatabase(path: string)`; the
PRAGMA block (WAL, foreign keys) disappears — PostgreSQL enables foreign keys
by default and its WAL is internal. `DatabaseHandle` becomes
`NodePgDatabase<typeof schema> & { $client: Pool }`. The resolved type rename
(`resolveDatabasePath` → URL parsing/validation) lives in `config.ts`.

Config: `MES_DATABASE_URL` replaces `MES_DATABASE_PATH` (breaking; see Risks).
Default for development: `postgres://mes:mes@localhost:5432/mes`. It is
validated at startup with `new URL()` (scheme `postgres:` or `postgresql:`)
through the same fail-fast path as the other required values; test env keeps
secrets optional as today.

Startup flow is unchanged in shape: `loadConfig()` → `assertConfig()` →
`runMigrations()` → `createDatabase()` → `createAuth()`. Pool shutdown is added
at process exit (`pool.end()`) so the container stops cleanly; `db.$client.end()`
replaces the `$client.close()` calls in seed and tests.

### 5. Docker: a `postgres` service with its own volume

`docker-compose.yml` gains:

```yaml
postgres:
  image: docker.io/library/postgres:18-alpine
  restart: unless-stopped
  environment:
    POSTGRES_USER: mes
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in docker/.env}
    POSTGRES_DB: mes
  volumes:
    - pgdata:/var/lib/postgresql/data
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U mes -d mes"]
    interval: 10s
    timeout: 3s
    retries: 5
```

The backend gets `MES_DATABASE_URL: postgres://mes:${POSTGRES_PASSWORD}@postgres:5432/mes`
and `depends_on: postgres: condition: service_healthy`; the `backend-data`
volume stays but now holds only `exports/` (exports are still files on disk).
`POSTGRES_PASSWORD` is added to `docker/.env.example` (the real value stays in
gitignored `.env`), and `docker/.dockerignore`/`.gitignore` move their backup
exclusion from `docker/backups/` to `docker/database/`.

### 6. Tests: real PostgreSQL, per-run databases

The backend suite needs a reachable PostgreSQL; the documented local command is
`docker run -d --name mes-test-pg -e POSTGRES_PASSWORD=mes -p 5432:5432 postgres:18-alpine`.
A shared test helper connects to the server (maintenance database `postgres`),
creates a uniquely named database, applies the committed migration set to it,
and returns a handle plus a teardown that drops the database. Test files replace
temp-file fixtures with the helper, which gives per-file isolation and fixes the
existing macOS-path flakiness in passing.

The index-adequacy guard is rewritten for PostgreSQL semantics: the schema
declares the indexes (assert against `pg_indexes`) and the plans for the hot
reads are asserted to use them (`EXPLAIN` output mentions an index scan) after
seeding a few rows — PostgreSQL chooses a sequential scan on empty tables, so
the guard must seed to stay meaningful.

`migrate.test.ts` keeps its parity scenarios (missing file, orphan file,
out-of-order timestamps, re-apply no-op) against a real database created by the
helper.

### 7. Backup/restore: `pg_dump`, archives under `docker/database/`

`backup.sh` runs `docker compose exec -T postgres pg_dump --format=custom` (or
against the service name in use) into an archive member `database.dump`, copies
`exports/` and the Garage meta/data directories as before, and assembles the
same tar.gz + manifest + SHA-256 layout. Writers of file-based state
(backend, garage) are still stopped for the file copy; the database dump relies
on PostgreSQL's snapshot consistency instead of stopping the writer, so a
backup no longer pauses database writes. With the stack fully stopped, the
script starts `postgres` only, dumps, and stops it again.

Archives land in `docker/database/` per the operator's instruction (0700 dir,
0600 files). `restore.sh` verifies the manifest, snapshots current state into a
`pre-restore-*` archive in the same directory (never auto-pruned), loads the
dump with `pg_restore --clean --if-exists` (database recreated through the
`postgres` service), restores files, starts the stack, and waits for the API to
answer before reporting success. Script names and library structure
(`backup-lib.sh`) stay; only mechanics and paths change.

### 8. Dependencies and tooling

Add `pg` (runtime) and `@types/pg` (dev); remove `@libsql/client` (it only
existed to let `drizzle-kit studio` talk to SQLite — `pg` covers the same need
now). `drizzle-kit` gains `dialect: "postgresql"` + `dbCredentials.url`, so
`bun --bun drizzle-kit studio` keeps working against the new database. The
root `AGENTS.md` stack table and `docs/DEVELOPMENT.md` tables are updated.

## Risks / Trade-offs

- **`MES_DATABASE_URL` is a breaking configuration change** → both `.env.example`
  templates, `docs/DEVELOPMENT.md`, and the compose file change together; the
  startup error message names the variable to set.
- **Backend tests now require a running PostgreSQL** → documented
  one-command `docker run`; the suite bootstrap fails with an actionable
  message (not a connection stack trace) when the server is unreachable.
- **`timestamptz(3)` vs integer milliseconds** → data is millisecond-grained
  and read as `Date` today, so no JS-visible change; any query comparing
  legacies by raw integer must be re-pointed (none found — time logic uses
  Drizzle column comparisons and `Date` arithmetic).
- **Better Auth on the `pg` provider** → its schema-management expectations
  (tables it owns) are unchanged because the adapter schema maps the same four
  tables; auth tests run as the verification gate.
- **Single initial migration means the old journal is deleted** → git history
  keeps it; the parity test blocks any later hand-edit drift.
- **Docker Compose here is emulated by Podman** → the `postgres` service is a
  plain image reference, so it works the same as the Garage/Mailpit services;
  keep images fully qualified (`docker.io/library/postgres:18-alpine`).
- **Pre-existing backend failures (99 tests with macOS temp paths, 3 tsc
  errors)** → unrelated to this change; the helper conversion removes the temp
  paths it touches, the rest is left as-is and reported.
- **Rollback risk during cutover** → the SQLite stack and its volume are
  untouched; rollback is "check out the previous commit and `docker compose up`".

## Migration Plan

1. Operator archives `add-docker-backup-restore` (prerequisite for the
   deployment delta; also archives cleanly before this change touches it).
2. Backend lands: schema, config, connection factory, migrate runner, auth
   adapter, package changes, tests.
3. Local verification against the test PostgreSQL: migrate on an empty
   database, seed, run the suite, smoke GraphQL reads.
4. Docker lands: compose service, Dockerfile comment/dir updates, backup and
   restore rewrite, `.env.example` templates, gitignore/dockerignore paths.
5. Cutover: stop the stack, bring up the new stack (`docker compose up -d --build`
   creates the `pgdata` volume), run `db:seed`, smoke the login/jobs/calendar
   paths, take a first backup into `docker/database/`.
6. Rollback at any point before cutover is verified: previous commit + old
   `backend-data` volume, since nothing was written to it.

## Open Questions

- Whether a future CI job should spin its own PostgreSQL container (deferrable;
  no CI configuration exists in the repository today).
- Exact pool sizing for production (`pg.Pool` default of 10 is assumed
  adequate for the single-backend topology; tune with load data later).