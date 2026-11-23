# Tasks

## 1. Prerequisites and tooling

- [x] 1.1 Confirm `openspec/specs/deployment/backup-restore/spec.md` exists (operator archived `add-docker-backup-restore`); if missing, run `/opsx-archive` first, and re-run `openspec validate migrate-sqlite-to-postgres` to confirm the deployment delta resolves with no INFO warning
- [x] 1.2 Repair the host's system Node (`sudo pacman -Syu` on the operator's machine) and verify `bunx tsc --version` and `bunx biome --version` both run — every verification command below depends on working `bunx`
- [x] 1.3 Start the local test PostgreSQL (`docker run -d --name mes-test-pg -e POSTGRES_PASSWORD=mes -p 5432:5432 docker.io/library/postgres:18-alpine`) and verify a connection succeeds (`docker exec mes-test-pg pg_isready -U mes`)
- [x] 1.4 Update `backend/package.json`: add `pg` and `@types/pg`, remove `@libsql/client`; run `bun install` and verify `bun install --frozen-lockfile` succeeds with the updated lockfile

## 2. Schema and migration set

- [x] 2.1 Rewrite `backend/src/db/schema.ts` from `drizzle-orm/sqlite-core` to `drizzle-orm/pg-core` per the design type map (same tables, column names, constraint names, index names; `timestamptz(3)` + `defaultNow()`, native booleans, `double precision`, JSON as text) and verify `bun run typecheck` passes
- [x] 2.2 Delete the six SQLite-era files in `backend/drizzle/` and generate a single initial PostgreSQL migration with `bun run db:generate`; verify the generated SQL declares every table, constraint, and index the schema declares
- [x] 2.3 Apply the new migration set to a fresh local database (`createdb mes_pg_check` via the test container, then `MES_DATABASE_URL=postgres://mes:mes@localhost:5432/mes_pg_check bun run db:migrate`) and verify a second run applies no statement and does not fail
- [x] 2.4 Update `backend/src/db/migrate.test.ts` to run its journal-parity and idempotency scenarios against a real PostgreSQL database and verify `bun test src/db/migrate.test.ts` passes
- [x] 2.5 Update the seed helpers (`unixepoch()` defaults → Drizzle defaults) and verify `bun run db:seed` against the fresh migration database completes with the documented counts

## 3. Connection, configuration, and auth

- [x] 3.1 Replace `databasePath` with `databaseUrl` in `backend/src/config.ts` (`MES_DATABASE_URL`, default `postgres://mes:mes@localhost:5432/mes`, scheme validated at startup, fail-fast message naming the variable) and verify the config-dependent tests (`bun test src/config.test.ts src/db/...` as applicable) pass
- [x] 3.2 Rewrite `backend/src/db/index.ts` as the PostgreSQL connection factory (`createDatabase(url)` returning `NodePgDatabase & { $client: Pool }`, PRAGMAs removed, `closeDatabase()` helper for shutdown) and verify a startup smoke test: `MES_DATABASE_URL=postgres://mes:mes@localhost:5432/mes_pg_check bun run start` answers `/health`
- [x] 3.3 Update every production `createDatabase` caller (`backend/src/index.ts`, `seed.ts`, `graphql/`, `telegram/`, `files/`, `reports/`) and the startup/shutdown path (pool closed on exit) and verify `bun run typecheck` passes with no `$client.close()` or `bun:sqlite` import left in `src/`
- [x] 3.4 Switch the Better Auth adapter to `provider: "pg"` in `backend/src/auth/index.ts` and verify `bun test src/auth/` passes (auth, verify-credentials, password-reset)

## 4. Test suite conversion

- [x] 4.1 Add the shared PostgreSQL test helper (connect to the `postgres` maintenance database, create a uniquely named database, apply the committed migrations, return handle + drop-on-teardown) and verify it with one converted file (`bun test src/db/hot-read-indexes.test.ts` structure in place)
- [x] 4.2 Convert the remaining test files from temp-file fixtures to the helper (auth, graphql, domain, reports, files/attachments, telegram, seed) and verify `bun test` shows only the known pre-existing unrelated failures
- [x] 4.3 Rewrite `hot-read-indexes.test.ts` for PostgreSQL (assert declared indexes in `pg_indexes` plus index-scan plans on seeded rows) and verify it passes
- [x] 4.4 Replace the remaining raw `$client` uses in tests (`.exec` → pool query, `.close()` → `.end()`) and verify the affected files pass with no SQLite-specific SQL left

## 5. Docker stack

- [x] 5.1 Add the `postgres` service (`docker.io/library/postgres:18-alpine`, `pgdata` volume, `pg_isready` healthcheck, `POSTGRES_PASSWORD` required from `docker/.env`), point the backend at it via `MES_DATABASE_URL` with `depends_on: service_healthy`, and keep `backend-data` for exports only; verify `docker compose config` parses and the healthcheck gates the backend
- [x] 5.2 Update `docker/backend/Dockerfile` (remove the SQLite comments, the `MES_DATABASE_PATH` default, and the database-file ownership note; keep the exports directory) and verify `docker compose build backend` succeeds
- [x] 5.3 Add `POSTGRES_PASSWORD` to `docker/.env.example` with no real secret and verify the example lists every value the stack requires
- [x] 5.4 Cutover drill: `docker compose up -d --build`, `bun run db:seed`, sign in as `super.admin@mes.local` with the documented seed password, load the jobs/calendar views, then `docker compose down && docker compose up -d` and verify seeded records, exports, and attachments survive (state-survives-restart scenario)

## 6. Backup and restore rewrite

- [x] 6.1 Rewrite `docker/backup.sh` and `docker/backup-lib.sh` for PostgreSQL (`pg_dump` archive member, output under `docker/database/` with 0700/0600 permissions, file-state writers stopped only for the file copy, `postgres` started only to dump when the stack is stopped) and verify a backup taken while the stack runs produces a complete archive and leaves every previously running service running
- [x] 6.2 Rewrite `docker/restore.sh` (manifest + SHA-256 verification before touching state, `pg_restore --clean --if-exists`, pre-restore snapshot under `docker/database/`, success only after the API answers) and verify: restore onto a wiped stack serves the archived data; a corrupt archive is rejected with the stack untouched; restoring the pre-restore snapshot undoes the restore
- [x] 6.3 Move the gitignore/dockerignore backup exclusions from `docker/backups/` to `docker/database/` and verify `git status` stays clean with an archive present and neither image build context contains it
- [x] 6.4 Rewrite the backup/restore section of `docs/DEVELOPMENT.md` (§14) for `pg_dump`, `docker/database/`, retention, scheduling, fresh-checkout restore, and lost `docker/.env`, and verify each documented command runs as written against the running stack

## 7. Documentation and final integration

- [x] 7.1 Update `docs/DEVELOPMENT.md` §1 prerequisites (external PostgreSQL via Docker) and §4 migration steps (including the `createdb` one-liner and the breaking `MES_DATABASE_URL` change) and update the root `AGENTS.md` stack table to "Drizzle ORM (PostgreSQL via `node-postgres`)"; verify every documented command runs
- [x] 7.2 Replace `MES_DATABASE_PATH` with `MES_DATABASE_URL` in `backend/.env.example` and update the header note in `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` (reference design; the runtime now matches its dialect) and verify no example file carries a real secret
- [x] 7.3 Final integration pass: `bun run lint`, `bun run typecheck`, `bun test` in `backend/`, `bun run contract-diff` (GraphQL contract unchanged), and `openspec validate migrate-sqlite-to-postgres --strict`; verify results match the documented pre-existing-failure baseline with nothing new failing
- [x] 7.4 Smoke the full stack end to end once more after the documentation pass (login, create and transition a ticket `REQ` → `ACT`, read attendance, trigger an export) and verify each behavior works against PostgreSQL

## Workflow follow-up

- Archive `add-docker-backup-restore` before this change is validated or applied (the deployment delta targets `openspec/specs/deployment/backup-restore/`).
- After implementation passes review, archive this change with `/opsx-archive` and verify the archived result.