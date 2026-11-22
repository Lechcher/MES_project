# Proposal

## Why

The dev backend crash-loops on boot: `bun run dev` throws inside `runMigrations`
with `SQLiteError: table telegram_ai_models already exists`, and `bun --watch`
relaunches into the same failure. The `0004_mes_telegram_bot` migration was
regenerated while the bot feature was implemented, after the watch-mode backend
had already applied an earlier generation of that same migration to
`backend/data/mes.db`. The journal timestamp advanced, so drizzle replays the
whole file on every boot and dies on the tables the earlier generation created.

## What Changes

- Repair the developer database so the committed `0004` applies: drop the five
  stale `telegram_*` bot tables and delete the stale `__drizzle_migrations`
  record. Verified lossless — every bot table is empty (no settings row, links,
  link codes, cached models, or user prefs) — and the repair creates the final
  intended state, including `telegram_ai_usage`, which the stale application
  never created.
- Add a migration-set parity test: every journal entry names an existing
  migration file, every migration file is named by exactly one journal entry,
  tags are unique, and journal timestamps strictly increase. A dangling or
  missing migration file then fails the suite instead of crashing the service
  at boot.
- Add the missing `telegram_ai_usage` assertion to the clean-schema table list
  in `backend/src/db/migrate.test.ts` (the list names five of the six bot
  tables; the sixth is the one the stale application skipped).
- Document the migration immutability rule in `docs/DEVELOPMENT.md` §4: a
  committed migration is immutable — regenerate before committing, never after;
  a post-commit correction means a new migration or a deliberate dev-database
  reset, never an in-place edit of an applied file.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `backend/persistence`: add requirement "Consistent migration set" — the
  journal and the migration files agree (every entry has its file, every file
  has exactly one entry, timestamps strictly increase), and applying the set to
  a database that already applied it performs no statements and does not fail.

## Impact

- `backend/data/mes.db` — developer database only; the dropped bot tables are
  verified empty, so no data is lost. No other database is touched.
- `backend/src/db/migrate.test.ts` — parity test plus the missing table
  assertion. (This file also carries the user's uncommitted WIP tests; the
  commit must keep them out, per the repo's WIP-isolation discipline.)
- `docs/DEVELOPMENT.md` §4 — the immutability rule beside the existing
  generate/backup instructions.
- No GraphQL, frontend, dependency, or seed changes. Runtime behavior for a
  fresh database is unchanged: `0000`→`0004` already applies cleanly end to end
  (verified during the bot feature's implementation).

Out of scope: editing the committed `0004` SQL (for example `IF NOT EXISTS`),
changing the migration runner, and any production or seed data.
