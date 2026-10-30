# Tasks

## 1. Baseline and profiling (measure first)

- [x] 1.1 Reproduce the >300s list read: run the dev servers against a seeded DB and time the `LIMIT 100` list read the user reported, and instrument the DB handle to count SQL statements and per-statement timing. Verify: a written baseline exists (wall time + total statement count) and the offending endpoint(s) are named in `openspec/changes/optimize-query-performance/`.
- [x] 1.2 Capture `EXPLAIN QUERY PLAN` for the hot read paths named in the `backend/persistence` delta (tasks by assignee, attendance by user+date, KPI events by user+period, session by token) on the seeded DB. Verify: each plan is recorded and any full scans on hot paths are listed for task 5.3.
- [x] 1.3 Confirm the fan-out: assert the offending page's statement count is disproportionate to page size (≈6× rows plus the redundant `badges` re-selects) and isolate the culprit resolvers in `backend/src/graphql/shapes.ts`. Verify: the measured multiplier matches the predicted fan-out, so the fix targets the right code.
- [x] 1.4 Add a query-count guard harness (a wrapper that counts statements a resolver path issues) wired as a test. Verify: the guard reproduces the task 1.1 baseline count before any fix, proving it can detect the regression.

## 2. Eliminate per-row fan-out (`backend/graphql-api`)

- [x] 2.1 Batch the `Task` relation collections (`progressLogs`, `stateTransitions`, `requests`, `journey`, `attachments`) into page-scoped `inArray` loads stored in the per-request cache, per design decision 2. Verify: the query guard shows one statement per relation per page instead of one per row, and `cd backend && bun test src/graphql` stays green.
- [x] 2.2 Remove the redundant selects in `Task.badges` (no re-select of the task row, no re-query of `taskRequests`) by reusing already-loaded request data. Verify: the guard count drops by roughly 2× the page size and badges output is unchanged by a unit test.
- [x] 2.3 Apply the same batch pattern to any other list path task 1.3 flagged (e.g. attendance/leave list nested fields). Verify: the guard is green for each converted path and `cd backend && bun test src/domain` passes.
- [x] 2.4 Add unit tests asserting batched loaders return byte-identical results to the per-row version for a page of rows. Verify: the new tests pass and fail if a batch drops or duplicates rows.

## 3. Bound every read (`backend/graphql-api`)

- [x] 3.1 Introduce shared `DEFAULT_PAGE_SIZE`/`MAX_PAGE_SIZE` and clamp list reads in `pageArgs`/resolvers, keeping the `nodes`/`pageInfo` shape. Verify: a test asserts a no-limit read returns the default and an over-max limit is capped rather than unbounded.
- [ ] 3.2 Replace over-large client limits (e.g. the frontend `limit: 200` attendance call) with the documented pagination. Verify: `cd frontend && bunx tsc --noEmit` passes and the affected screen still pages correctly (Playwright e2e if present).

## 4. Cheapen performance reads (`backend/graphql-api` / KPI)

- [ ] 4.1 Make KPI dashboard/summary reads use stored `kpi_monthly_summaries` plus the per-request cache instead of recomputing on every read; if a read must recompute, reduce `recomputeMonthlySummary`'s internal query count. Verify: the guard shows a bounded, minimal statement count for the performance read and `cd backend && bun test src/domain/kpi.test.ts` passes.
- [ ] 4.2 Add tests locking the reduced performance-read query count. Verify: the new test passes and fails if the per-row fan-out returns.

## 5. Storage hygiene (`backend/persistence`)

- [ ] 5.1 Implement expired-session pruning (delete `expiresAt < now`, retain active sessions) invoked from the maintenance/startup path, not the request path. Verify: a test seeds expired and active sessions, runs prune, and asserts only expired rows are removed; `cd backend && bun test src/db` passes.
- [ ] 5.2 Add an index-guard test that runs `EXPLAIN QUERY PLAN` for each hot read path and asserts an index is used (no full scan). Verify: the test passes on the seeded schema and fails when a named index is temporarily removed inside the test.
- [ ] 5.3 If task 1.2 lists a hot path with a missing index, add the smallest covering index via a migration. Verify: `EXPLAIN QUERY PLAN` shows the index used after the migration and the migration applies cleanly against a copy of the dev DB.

## 6. Measure, keep, and guard (integration/verification)

- [ ] 6.1 Re-measure the offending endpoint after tasks 2–5 using the same method as task 1.1 and record before/after. Verify: the `LIMIT 100` page drops from the >300s baseline to under the confirmed one-second budget, and the delta is documented in the change folder.
- [ ] 6.2 Keep only fixes whose before/after beats the baseline; revert neutral ones and log the attempt. Verify: every retained change has a recorded number and neutral changes are reverted, not kept.
- [ ] 6.3 Whole-project gate: only where measurement shows a need, address frontend budgets (bundle size, render cost, Core Web Vitals within "Good") and infra (SQLite pragma/WAL verification, prepared-statement reuse). Verify: a measured number motivates each frontend/infra change taken, and skipped items are recorded as "no measured need."
- [ ] 6.4 Run the full backend suite (`cd backend && bun test`) and the frontend checks touched above; keep all green. Verify: 0 failures and the query-count guard is part of the suite.

## Workflow follow-up

- Review the recorded before/after measurements and the query-count guard before archiving.
- Archive the change after review with `/opsx-archive` (this syncs the `backend/graphql-api` and `backend/persistence` deltas into the main specs).
