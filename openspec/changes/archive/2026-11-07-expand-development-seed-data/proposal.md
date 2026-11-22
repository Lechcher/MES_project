# Proposal

## Why

The development seed (`backend/src/db/seed.ts`) loads only a minimal fixture set — 5 users (one per role), 4 departments, 1 project, 10 tasks, 7 attendance rows, 3 leave requests, 2 overtime records and 3 KPI events. That is enough to prove each code registry exists, but not enough to exercise the screens that depend on populated data: the department matrix calendar, task lists with filters and pagination, multi-day schedule bars, leave/balance ledgers, and KPI leaderboards all look thin on a fresh development database. Meanwhile the frontend's archived mock layer was built with roughly 15 users, 40+ tasks and a full month of attendance, so backend-driven UI work happens against far less data than the mock-driven work did.

## What Changes

- **Organization**: broaden the seeded org tree (more departments/divisions) and seed several projects instead of one.
- **Users**: keep exactly one documented demo account per role (`SUPER_ADMIN`, `TECH_LEAD`, `HR_MANAGER`, `DEPT_HEAD`, `EMPLOYEE`) with their existing emails/codes/credentials, and add additional staff accounts — `EMPLOYEE` role only — spread across the divisions, including at least one inactive/deactivated account for IAM and scoping checks. (No spec-level conflict: `frontend/mock-data` requires one demo account per role in the *mock layer*; that invariant is preserved.)
- **Tasks**: seed a much larger task set covering every state, task type and priority across many assignees and weeks around today — hourly slots, daily work, multi-day bars — with state-transition history, progress logs, and `EXTENSION`/`LATE_EXPLANATION` task requests and completion requests (`MILESTONE`/`FULL_JOB`) in each decision state.
- **Attendance & leave**: seed a full current month of attendance per user — weekday check-in/check-out patterns with occasional late/early badges, leave days across leave codes, penalty `UAL`/`USL` cases — plus more leave requests (approved/pending/rejected), leave balance entries (accrual/usage/adjustment) and approved/pending overtime records.
- **Performance**: seed more KPI score events across users and months (bonus and penalty rules), then recompute each user's monthly summary through the existing `recomputeMonthlySummary` domain function instead of hand-writing `kpi_monthly_summaries` rows, so dashboards and leaderboards read consistent derived data.
- **Audit**: seed a modest set of system audit log rows so the audit module screens show data on a fresh database.
- Keep the seed deterministic and idempotent (stable ids, `ON CONFLICT DO NOTHING`, dates anchored to "today"), still refused in production, and update `backend/src/db/seed.test.ts` to assert the expanded invariants instead of the exact old row counts.
- Out of scope: writing attachment **file bytes** into the object store (rows would 404 without a store); seed rows for `attachments` are added only where they are meaningful without stored objects — otherwise attachments stay unseeded.

## Capabilities

### New Capabilities

None. This change broadens an existing behavior rather than introducing a new capability.

### Modified Capabilities

- `backend/persistence`: the **Repeatable development seed data** requirement — the dev/test seed must cover a multi-user, multi-department population (current-month calendar coverage, multi-week task sets with workflow history, richer leave/overtime/balance data, KPI summaries, audit rows) rather than a minimal one-row-per-scenario fixture set, while remaining deterministic, idempotent, and development/test-only.

## Impact

- `backend/src/db/seed.ts` — major expansion of the seeded rows; production guard unchanged.
- `backend/src/db/seed.test.ts` — assertions move from exact minimal counts to expanded coverage invariants.
- No GraphQL API, schema, or migration changes; no new dependencies.
- No frontend changes: Playwright fixtures seed their own minimal data through the API and are unaffected.
- Documentation of the documented demo credentials stays in code comments; `docs/DEVELOPMENT.md` needs no change (`bun run db:seed` unchanged).
