# Tasks

## 1. Organization & accounts

- [x] 1.1 Extend `DEPARTMENT_SEED` with two more divisions (e.g. an engineering QA and a fabrication division under `dept-eng`) and add three more projects (`PROJECT_SEED`) tied to the seeded departments, keeping deterministic ids and `onConflictDoNothing`; verify by seeding a clean temp DB and querying `departments` (6 rows) and `projects` (4 rows)
- [x] 1.2 Add a `STAFF_USERS` fixture of 10 employees (deterministic ids `V0000005`–`V0000014`, unique emails, one marked inactive) spread across the ENG/HQ divisions, and create them through the same Better Auth `signUpEmail` + temporary `userCode` default path as the demo five; verify `bun test src/db/seed.test.ts` reports 15 users and each staff account can authenticate with `DEV_SEED_PASSWORD`
- [x] 1.3 Confirm the five documented demo accounts are untouched by the expanded seed (email, `userCode`, role, department) and that exactly one account per non-`EMPLOYEE` role exists; verify with a test asserting `DEMO_USERS` rows are byte-identical before/after and the added accounts all hold the `EMPLOYEE` role

## 2. Jobs & schedule data

- [x] 2.1 Add ~45 seeded tasks with codes `T-0101`+ spanning -14…+14 days around today, covering every state × task type × priority combination, multi-day bars crossing week boundaries, per spec scenario "Multi-week task coverage"; verify with a query that each of the 7 states and 3 types has ≥2 rows and seeded `startDate` values include days before and after today
- [x] 2.2 Seed matching `taskStateTransitions` rows for every new task (creation transition plus the appropriate follow-up transitions for non-`REQ` states) and a distinct `tst-` id per transition; verify every new task has ≥1 transition and non-`REQ` tasks have a transition into their state
- [x] 2.3 Seed ~20 `taskProgressLogs` rows for multi-day and reported tasks including manager-verified entries; verify each `MULTI_DAY` task with `progressPercentage > 0` has ≥1 progress log
- [x] 2.4 Seed ~6 `taskRequests` rows mixing `EXTENSION` and `LATE_EXPLANATION` types in each status (`PENDING`, `APPROVED`, `REJECTED`) with reviewer and comment on decided rows; verify a query returns all three statuses per type
- [x] 2.5 Seed ~10 `taskCompletionRequests` rows mixing `MILESTONE` and `FULL_JOB` scopes in each state (`PEN`, `APP`, `REJ`), with `decisionReason` present on every `REJ` row and at most one `PEN` per task; verify the unique pending index holds and each task's request set is consistent with the task's own state

## 3. Attendance, leave & overtime

- [x] 3.1 Implement the deterministic per-(user, day) attendance generator (weekends skipped, weekday present/late/early/half-day patterns, leave-code days from seeded leave requests, penalty `UAL`/`USL` days for two employees) and seed from the current month's first day through today for the 14 active users; verify every active user has a row for every non-weekend day so far this month
- [x] 3.2 Seed ~12 `leaveRequests` rows across registrable codes with `APPROVED`, `PENDING` and `REJECTED` statuses, dates around today, and `totalDays` matching the inclusive day count; verify each status has ≥2 rows and no `endDate < startDate` violations occur
- [x] 3.3 Seed ~40 `leaveBalanceEntries` rows — `AL` and `TOIL` accruals per active user, `USAGE` rows referencing approved balance-tracked leave requests, and a few `ADJUSTMENT` rows — keeping `periodYear` and references consistent with the referenced rows; verify per-user balances equal the sum of their ledger entries
- [x] 3.4 Seed ~10 `overtimeRecords` rows mixing approved and pending, including weekend work, and confirm the week's approved overtime matches the `TOIL` balance entries that reference them; verify every `TOIL` accrual referencing an overtime record points at a row with 8 approved hours

## 4. Performance & audit

- [x] 4.1 Seed ~40 `kpiScoreEvents` rows across the current and previous month for multiple users, covering the bonus and penalty rules (`on_time`, `overdue`, `returned`, `extension_request`, `unapproved_leave`, `first_time_approval`, `perfect_attendance`) with `periodYear`/`periodMonth` matching `occurredAt`; verify each rule code has ≥1 event and both months are represented
- [x] 4.2 After events and attendance are seeded, call `recomputeMonthlySummary` (from `domain/kpi.ts`) per user for the current and previous month with a `ViewerContext` built from `{ db, config }`, instead of hand-writing `kpi_monthly_summaries` rows; verify a seeded user's summary row equals a fresh `recomputeMonthlySummary` call for the same period
- [x] 4.3 Seed ~30 `systemAuditLogs` rows across the `jobs`, `planning`, `settings` and `audit-log` modules with varied resource types, JSON `oldData`/`newData` payloads and actor attribution to demo accounts; verify a read of the audit module returns events for ≥3 module codes
- [x] 4.4 Update the seed's header docblock to describe the expanded coverage (population, coverage targets, derived summaries, dev-only guard) and keep `DEV_SEED_PASSWORD`/`DEMO_USERS` documented exports unchanged; verify the docblock matches the seeded contents by re-reading `seed.ts` after authoring

## 5. Seed tests & integration verification

- [x] 5.1 Rework `seed.test.ts` from exact counts to coverage assertions per design decision 7: five demo accounts unchanged, ≥15 users with multiple staff per department root and one inactive, state × type coverage, tasks before/after today, month-long attendance, penalty cases, ledger minimums, audit/KPI minimums; verify `cd backend && bun test src/db/seed.test.ts` passes
- [x] 5.2 Add tests for the new spec behaviors: idempotent second run with identical counts, `EMPLOYEE`-only staff accounts, one inactive account, KPI summary equals recomputed output, and production still refused writing nothing; verify `cd backend && bun test src/db/seed.test.ts` passes with the new cases
- [x] 5.3 Run the full backend suite (`cd backend && bun test`) and confirm nothing outside the seed broke; then run `bun run db:seed` against a scratch copy of `backend/data/mes.db` and confirm the new rows land beside the existing data without unique-key errors; verify the seed's printed counts match the design scale targets
- [x] 5.4 Run `bunx biome check --write` at the repo root and re-run the backend seed tests; verify formatting and linting pass with no changes to fixtures

## Workflow follow-up

- Archive the change after review (`/opsx-archive` or `openspec archive expand-development-seed-data`).
- After archive, confirm the modified `backend/persistence` main spec reflects the expanded seed-data requirement.
- Optionally recreate a fresh dev database (`rm backend/data/mes.db && bun run db:seed`) to view the populated dataset end to end.
