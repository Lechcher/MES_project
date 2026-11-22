# Design

## Context

See `proposal.md` for motivation. Today `backend/src/db/seed.ts` seeds: code registries (already complete), 4 departments + 1 project, 5 demo users via Better Auth, 10 tasks, 7 attendance rows, 3 leave requests, 4 balance entries, 2 overtime records and 3 KPI events — all deterministic, all `onConflictDoNothing`, all anchored to "today". Constraints that shape the design:

- Demo users are created through Better Auth's `signUpEmail` with a temporary `userCode` additional-field default (the field is `required` with no default), because Better Auth owns password hashing. Additional staff must follow the same path.
- `kpi_monthly_summaries` rows are **derived**: `domain/kpi.ts#recomputeMonthlySummary(ctx, userId, year, month)` rebuilds them from score events + attendance. Hand-written summary rows would drift from the application's own output.
- `attachments` rows point at object-store keys (S3 or the memory store); a row without stored bytes 404s on download.
- Organic dev-DB task codes are `T<YYYY><MM>-####` (see `nextTaskCode`); seeded codes are `T-####`, so the two ranges never collide.
- The matrix calendar renders one row per **active** user and one cell per day (`matrixCalendar`), so population comes from users + day-level attendance + day-covering tasks.

## Goals / Non-Goals

**Goals:**

- A fresh development database (or `bun run db:seed` on an existing one) produces a populated demo world: enough users per department, enough tasks spread over weeks, a current month of attendance, full ledgers, KPI events, and audit rows to exercise every module screen.
- Preserve the five documented demo accounts byte-for-byte (email, `userCode`, role, password) so existing walkthroughs, docs and e2e expectations keep working.
- Keep the seed deterministic, idempotent, fast (< ~2s) and refused in production.
- KPI summaries produced by the application's own computation, not authored by the seed.

**Non-Goals:**

- No schema, migration, API, or frontend changes; no new dependencies.
- No attachment file bytes in the object store (attachments stay unseeded unless a store write path is added — out of scope).
- No production seeding, no seeded `session`/`account` rows (Better Auth normal sign-in creates those).
- No change to how the seed is invoked (`bun run db:seed`, dev/test only).

## Decisions

### 1. Staff accounts created through Better Auth, same as the demo five

New staff users go through `auth.api.signUpEmail` with the same temporary-`defaultValue` trick and `DEV_SEED_PASSWORD`. **Alternative considered:** direct `user`+`account` inserts with a precomputed hash — rejected: it reimplements Better Auth's hashing and breaks on auth config changes.

### 2. Fixed, hand-authored fixture tables — not random generation

Users, departments, projects, tasks and leaves are explicit rows in the source (like `DEMO_USERS` today). **Alternative considered:** seeded PRNG generation — rejected for the core entities: determinism and reviewability matter more than volume (an archived frontend change already demonstrated the hand-authored scale: ~15 users, 40+ tasks, full-month attendance). Randomness is used only for *pattern* placement inside a deterministic derivation (per-user, per-day hash), never for identity.

### 3. Concrete scale targets

| Table | Before | After (target) |
| --- | --- | --- |
| departments | 4 | 6 (two more divisions) |
| projects | 1 | 4 |
| users | 5 | 15 (5 documented + 10 staff, 1 staff account inactive) |
| tasks | 10 | ~55 (10 original + 45 new, codes `T-0101`+, spanning -14…+14 days) |
| task state transitions | 10 | ~55 |
| task progress logs | 0 | ~20 |
| task requests (EXTENSION / LATE_EXPLANATION) | 0 | ~6 |
| task completion requests (MILESTONE / FULL_JOB) | 0 | ~10 |
| attendance records | 7 | ~420 (month start → today for 14 active users) |
| leave requests | 3 | ~12 (approved / pending / rejected across registrable codes) |
| leave balance entries | 4 | ~40 (AL + TOIL accrual/usage/adjustment) |
| overtime records | 2 | ~10 |
| kpi score events | 3 | ~40 (current + previous month, bonus + penalty) |
| kpi monthly summaries | derived | recomputed per user for both months |
| system audit logs | 0 | ~30 (jobs / planning / settings / audit-log modules) |

### 4. Deterministic attendance patterns

For each active user and each day from month start through today, one row per `(user, workDate)`:

- Weekends: no attendance row (except ~2 Saturday overtime records, which are separate overtime rows, not attendance).
- Weekdays: default present `08:00`–`17:00` (8.0h).
- Deterministic pattern from a per-(user, day) hash: every ~7th working day late (`checkIn 09:10`, `isLate`), every ~11th early-leave (`checkOut 16:00`, `isEarlyLeave`), every ~13th day a light half-day (4.0h).
- Days covered by seeded leave requests carry the leave code, no check-in/out, `working_hours 0`, and a note naming the code.
- 2 employees get one `UAL` and one `USL` penalty day each on past weekdays.

Rationale: the matrix calendar and attendance filters only need cell-level signals; hash-derived patterns give variety without sacrificing determinism.

### 5. KPI summaries recomputed via the domain function

After inserting events and attendance, the seed calls `recomputeMonthlySummary` per user for the current and previous month, with a `ViewerContext` built from `{ db, config }` the same way `kpi.test.ts` does. This guarantees seeded summaries equal what the app computes (spec requirement "Seeded KPI summaries are recomputed, not authored"). **Alternative considered:** inserting summaries directly — rejected: they would drift from ledger-derived truth.

### 6. Idempotence and upsert semantics

- Static rows: deterministic ids + `onConflictDoNothing` (unchanged mechanism).
- Users: resolve-by-email, then update profile fields in place (existing behavior) — re-runs are no-ops.
- Derived summaries: `upsertMonthlySummary` already upserts on `(user, year, month)`.
- Counts reported in `SeedResult` so silently-skipped unique-key conflicts are visible in the seed output.

### 7. Test rework (behavioral, not exact-count)

`seed.test.ts` moves from exact counts to coverage assertions: the five demo accounts unchanged; ≥15 users with ≥6 per seeded department root and one inactive; every ticket state × task type present; tasks spanning < today and > today; attendance rows span ≥ the current month's worked days; penalty codes present; balance/leave/OT/audit/KPI minimums; idempotence (two runs identical); a summary equals `recomputeMonthlySummary` output; production still refused. Exact registries (states/leave codes/permissions/rules) keep their existing assertions since those tables are unchanged.

### 8. Rollout / rollback

No migration: the change only affects the seed script. Rollout: run `bun run db:seed`; existing dev rows are untouched and new rows land alongside them. Rollback: revert `seed.ts`/`seed.test.ts` (no data migration needed; stale seeded rows in a dev DB can be dropped by recreating the DB).

## Risks / Trade-offs

- **Attendance volume (~420 rows) slows the seed** → Batching per user and a single insert per table keeps a full run well under a second on SQLite; measured in tests.
- **Unique-key collisions on existing dev DBs** (`task_code`, `(user, work_date)`) silently skip rows → deterministic ranges chosen to avoid organic codes (`T-0101`+) and `SeedResult.counts` surfaces insertions; e2e is unaffected (its fixtures seed via the API).
- **`user_code` uniqueness for staff** → assigned a contiguous documented range above the demo codes (`V0000005`–`V0000014`); the seed fails loudly rather than skipping when a code collides.
- **Bigger seed = bigger claim on test runtime** → seed tests reuse one temp DB where assertions allow, and temp files are removed in `afterAll` (existing pattern).
- **Hand-authored fixtures rot as features change** → mitigation: each fixture row is a plain row in a table with a comment pointing at the spec scenario it covers; the coverage test fails when a scenario loses its example row.

## Open Questions

None blocking. The exact per-user fixture names/emails are implementation detail decided during authoring; the chosen range and counts above are the contract.
