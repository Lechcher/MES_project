# Design

## Context

See proposal.md for the symptom and the numbers. The behavior that produced it,
verified against the installed drizzle-orm source:

- `readMigrationFiles` (`node_modules/drizzle-orm/migrator.js`) reads each journal
  entry and pairs it with `<tag>.sql`; `folderMillis` is the journal entry's
  `when`, `hash` is `sha256(file contents)`.
- `SQLiteSyncDialect.migrate`
  (`node_modules/drizzle-orm/sqlite-core/dialect.js`) loads the newest recorded
  row (`ORDER BY created_at DESC LIMIT 1`) and applies every migration whose
  `folderMillis >` that row's `created_at`. The hash is stored on insert and
  never consulted for the apply decision — **the decision is purely the journal
  timestamp**.

So the failure requires two things to be true at once: the database recorded an
earlier generation of a migration, and the migration's journal `when` later
advanced. Both happened here: the watch-mode backend applied the generation
journaled at `1793473579110` (five bot tables) mid-implementation, and the
committed entry carries `1793481373316` (six tables, after the budget table was
added and the migration regenerated).

Developer-database state at the time of the fix (verified read-only):

| Fact | Value |
| --- | --- |
| Recorded migration rows | 5 — the last at `created_at=1793473579110` |
| Bot tables present | `telegram_ai_models`, `telegram_bot_settings`, `telegram_link_codes`, `telegram_links`, `telegram_user_prefs` (missing `telegram_ai_usage`) |
| Bot rows in those tables | none — settings `[]`, links/codes/models/prefs `0` |
| `departments.auto_forking_enabled` | already dropped (the user's `0003` applied) |

## Goals / Non-Goals

**Goals:**

- Restore boot with the *committed* migration set unmodified: the dev database
  reaches the intended final state (all six bot tables) through the normal
  runner, not through hand-written schema surgery.
- Make the dangling/missing migration file and out-of-order journal timestamp
  classes fail in CI instead of at boot.
- Leave a written rule that stops the regenerate-after-apply pattern.

**Non-Goals:**

- Changing the runner or drizzle's replay decision (migrations must fail loudly
  on genuine problems).
- Editing the committed `0004` SQL.
- Any production, seed, or frontend work.

## Decisions

**Repair by dropping the stale tables, not by marking the migration applied.**
Dropping the five empty bot tables and deleting the stale record row lets the
runner apply `0004` from scratch, creating all six tables (including
`telegram_ai_usage`) and recording the committed hash. Alternatives:

- *Insert a `__drizzle_migrations` row for the committed `0004`* — rejected: the
  row would suppress the replay without creating `telegram_ai_usage`, so the app
  would move the crash from boot to the first budget query. Repairing "as
  applied" also requires fabricating a hash the runner never checks, which hides
  the drift instead of resolving it.
- *Add `CREATE TABLE IF NOT EXISTS` to `0004`* — rejected: it diverges from
  generated output, silently tolerates partial applications (the very state that
  is unsafe — five of six tables), and leaves the bogus record row in place.

**Guard with a parity test, not a migrator change.** The durable failure class
is an inconsistent migration set (a journal entry without its file throws at
boot; a file without its entry never applies; an out-of-order `when` sets up a
replay). A parity test in `backend/src/db/migrate.test.ts` encodes exactly that.
It checks `.sql` files against the journal only — **no snapshot requirement** —
because the user's uncommitted `0002`/`0003` migrations are hand-maintained
without snapshots, and the change must stay green against the WIP tree.

**Record the immutability rule where migrations are documented.** The rule lives
in `docs/DEVELOPMENT.md` §4 next to `db:generate` and the backup step, so the
next person editing `schema.ts` reads it in the same breath.

## Risks / Trade-offs

- [Dropping dev tables loses data the user typed into Settings → Telegram] →
  verified empty before the drop (proposal table); the docs §4 backup precedes
  the repair; the panel is trivially re-fillable.
- [The parity test fails against the user's WIP journal style] → it validates
  only `.sql`↔journal pairing, unique tags, and strictly increasing timestamps,
  all of which hold for their hand-maintained entries.
- [A regenerate-after-apply can still happen] → the parity test does not catch
  it (the set stays internally consistent); the docs rule is the control, and a
  dev-database reset is the documented remedy.
- [`migrate.test.ts` is WIP-entangled] → the commit reconstructs my additions on
  the HEAD base, keeping the user's untracked tests out of the commit.

## Migration Plan

1. Stop the crash-looping dev backend (kill the watch process on :3001).
2. Back up `data/mes.db` (+ `-wal`/`-shm`) per docs §4.
3. Delete the `__drizzle_migrations` row whose `created_at` is `1793473579110`,
   then `DROP TABLE` the five stale bot tables (never `telegram_webhook_config`,
   which belongs to `0000`).
4. Boot: `0004` applies cleanly and records the committed hash; verify all six
   bot tables exist and the API answers `/health`.
5. Rollback (code parts): revert the commit — the repaired database stays valid,
   since `0004` is the committed file in either case.

## Open Questions

None.
