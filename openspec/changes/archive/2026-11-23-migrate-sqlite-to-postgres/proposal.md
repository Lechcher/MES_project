# Proposal

## Why

SQLite was the right engine for the prototype: embedded, zero-ops, no external
service. The system has outgrown it — a single-writer WAL file, file-level
permissions and copy-the-file backups are all prototype-grade, while the
documented expansion-ready design (`DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql`) was
written in PostgreSQL from the start. Moving to PostgreSQL makes the stack run
like a production deployment, gives real write concurrency and transactional
DDL, and replaces hand-rolled file backups with `pg_dump`. The operator already
plans to run a Postgres Docker image, so the test and stack paths align.

## What Changes

- Drizzle dialect switch `sqlite` → `postgresql`; `backend/src/db/schema.ts`
  moves from `sqlite-core` to `pg-core` with the same logical model:
  application-generated text UUID ids, constrained-text code registries,
  `timestamptz` timestamps, native booleans, double precision, and JSON kept as
  text. No GraphQL contract change and no domain-vocabulary change.
- Connection factory and migration runner move from `bun:sqlite` to a
  `node-postgres` pool; SQLite `PRAGMA`s (WAL, foreign keys) are replaced by
  their PostgreSQL equivalents; migrations run through the pg migrator.
- Migration set is regenerated as a single initial PostgreSQL migration —
  **fresh start + reseed** (operator's decision). The existing SQLite data is
  demo data and is not carried over; the old volume is left untouched so the
  SQLite stack can still run until cutover is verified.
- Configuration: `MES_DATABASE_PATH` is replaced by `MES_DATABASE_URL`
  (**BREAKING** configuration change), validated at startup through the same
  fail-fast path as the other required values.
- Better Auth's Drizzle adapter switches `provider: "sqlite"` → `"pg"`.
- Docker: a `postgres` service with a persistent `pgdata` volume joins the
  stack; the backend waits for it to be healthy; the `backend-data` volume and
  the SQLite path env values are removed; `docker/.env.example` gains
  `POSTGRES_PASSWORD`.
- Tests: the backend suite runs against a real local Postgres (Docker image),
  with per-run databases created and dropped by the suite bootstrap; the
  index-adequacy guard is rewritten for PostgreSQL `EXPLAIN` plans.
- Backup/restore is rewritten for Postgres: captures use `pg_dump` instead of
  copying a database file plus its WAL, and backup archives are written under
  **`docker/database/`** (operator's instruction) instead of `docker/backups/`.
  Manifest, SHA-256 verification, `KEEP` retention, pre-restore snapshot and
  "no secrets captured" behavior are preserved.
- Documentation and env templates are updated (`docs/DEVELOPMENT.md` §1/§4/§14,
  the root `AGENTS.md` stack table, `backend/.env.example`,
  `docker/.env.example`, and the reference-schema header note).
- Dependency changes: add `pg` (+ `@types/pg` dev); remove the now-useless
  `@libsql/client` devDependency (added only for Drizzle Studio against SQLite).

## Capabilities

### New Capabilities

None. The persistence behavior stays the same; only the engine and the
operational mechanics around it change.

### Modified Capabilities

- `backend/persistence`: PostgreSQL replaces SQLite as the persistence engine;
  the connection is configured through `MES_DATABASE_URL`; the migration-set
  requirement is reworded for the PostgreSQL migration set (journal parity,
  idempotent re-apply, and immutable committed migrations are unchanged).
- `deployment/backup-restore`: captures use a `pg_dump` snapshot instead of a
  stopped-writer file copy; archives are written under `docker/database/`;
  restore replaces the database from the dump and the pre-restore snapshot
  lives in the same directory.

## Impact

- Backend code: `backend/src/db/` (index, migrate, schema, maintenance, seed),
  `backend/src/config.ts`, `backend/src/auth/index.ts` (adapter provider),
  `backend/drizzle.config.ts`, `backend/drizzle/**` (replaced by the initial
  PostgreSQL migration), `backend/package.json` + `bun.lock`, and the backend
  test suite (`createDatabase` callers, `migrate.test.ts`,
  `hot-read-indexes.test.ts`, seed/auth/graphql/telegram tests).
- Docker: `docker/docker-compose.yml`, `docker/backend/Dockerfile`,
  `docker/backup.sh`, `docker/restore.sh`, `docker/backup-lib.sh`,
  `docker/.env.example`; `.gitignore` / `.dockerignore` entries move from
  `docker/backups/` to `docker/database/`.
- Docs: `docs/DEVELOPMENT.md`, root `AGENTS.md` (stack table), and the header
  note in `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` (it stops being
  "not the runtime schema" for the engine, staying the reference design).
- Prerequisite: `openspec/changes/add-docker-backup-restore` must be archived
  into `openspec/specs/deployment/backup-restore/` **before** this change is
  validated or applied (the operator runs `/opsx-archive`); otherwise this
  change's deployment delta has no target spec.
- Assumptions recorded for design: image `postgres:18-alpine`; dev/test
  Postgres at `localhost:5432`; `pg`/`drizzle-orm/node-postgres` chosen over
  Bun's built-in SQL client for Better Auth adapter compatibility; existing
  SQLite data is discarded (fresh + reseed); backup archives live in
  `docker/database/`.