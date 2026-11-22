# Tasks

## 1. Repair the developer database

- [x] 1.1 Stop the crash-looping watch backend on :3001 and back up `backend/data/mes.db` (plus `-wal`/`-shm`) per the procedure in `docs/DEVELOPMENT.md` §4; verify the backup files exist before any change.
- [x] 1.2 Delete the `__drizzle_migrations` row recorded at `created_at = 1793473579110`, then drop the five stale bot tables (`telegram_ai_models`, `telegram_bot_settings`, `telegram_link_codes`, `telegram_links`, `telegram_user_prefs`) while leaving `telegram_webhook_config` intact; verify with a read-only query that those five tables are gone, `telegram_webhook_config` survives, and the four older migration rows are untouched.
- [x] 1.3 Boot with `bun run dev` and verify: no migration error in the log, `GET /health` answers ok, the `[mes] telegram bot disabled` line appears, and all six bot tables exist including `telegram_ai_usage`; then run `bun run db:migrate` once more and verify it applies nothing and does not throw.

## 2. Guard the migration set

- [x] 2.1 Add a parity test to `backend/src/db/migrate.test.ts` that asserts, against `DEFAULT_MIGRATIONS_FOLDER`: every journal entry tag has a matching `<tag>.sql`, every `.sql` file has exactly one journal entry, tags are unique, and journal `when` values strictly increase in entry order — no snapshot requirement (the user's uncommitted `0002`/`0003` entries are hand-maintained without snapshots); verify with `cd backend && bun test src/db/migrate.test.ts` that the whole file passes, so the check is green against the WIP journal too.
- [x] 2.2 Include a negative case in that parity test: copy the migrations folder to a temp path, add a stray `0009_stray.sql` with no journal entry (and trim the journal so an entry loses its file), and verify the parity check reports both inconsistencies; verify the suite stays green after restoring nothing (the temp copy is discarded).
- [x] 2.3 Add the missing `telegram_ai_usage` assertion to the clean-schema table list in the same test file; verify `bun test src/db/migrate.test.ts` still passes and that temporarily removing the assertion for `telegram_ai_usage` from the *migration* side fails the test (guards against the exact table the stale application skipped).

## 3. Document the immutability rule

- [x] 3.1 Add to `docs/DEVELOPMENT.md` §4, beside the `db:generate` instructions: a committed migration is immutable — regenerate *before* committing, never after; correcting an applied migration means a new migration or a deliberate dev-database reset (drop the affected tables and delete the matching `__drizzle_migrations` row, per the backup step above), never an in-place edit; verify by re-reading the section that the rule renders with the surrounding steps intact.

## 4. Commit and final verification

- [x] 4.1 Run `cd backend && bun test` and verify the result matches the pre-change baseline (all pass except the known pre-existing `src/db/seed.test.ts` date-boundary failure, which is the user's uncommitted WIP and unrelated to migrations), and run `bunx biome check` plus `bunx tsc --noEmit` on the touched files only, verifying no new findings.
- [x] 4.2 Commit per the repo rules — Conventional Commits (`fix:`), the `Co-authored-by: AI Agent <agent@local>` trailer, direct to `main` — reconstructing the `migrate.test.ts` additions on the HEAD base so the user's uncommitted WIP tests stay out of the commit; verify with `git show --stat` that only this change's files are in the commit and that the staged diff carries no WIP markers (`nextUserCode`, `auto_forking`, `collectAuditUserIds`), and that the working tree still holds the WIP afterwards.

## Workflow follow-up

- After implementation, run `/opsx-archive fix-migration-replay-crash` to sync the delta into `openspec/specs/backend/persistence` and archive the change.

Applied as `414f58a` (`fix(db)`, Conventional Commits + `Co-authored-by: AI Agent <agent@local>`, direct to `main`; the `migrate.test.ts` additions were reconstructed on the HEAD base so the user's uncommitted WIP tests stayed out, and the working tree was restored afterwards — verified by the WIP spot checks and the WIP-marker scan of the staged diff). Boot verified live: `/health` ok, `[mes] telegram bot @tayecommerce_bot started (long polling)` (the dev environment enables the bot with a real token), all six bot tables present, `bun run db:migrate` re-runs as a no-op. Suites: backend 476 pass / 1 pre-existing date-boundary failure in the user's uncommitted `seed.test.ts`; biome + tsc clean on every file this change touches. Left running: the user's dev backend on :3001 (now healthy) and its frontend on :3000.
