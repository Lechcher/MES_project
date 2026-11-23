# Proposal

## Why

A single paginated list read — `SELECT … LIMIT 100` — takes **over 300 seconds** on the development database, which is about 1 MB with no table above ~660 rows. That is orders of magnitude too slow for the data volume, and it is not a data-size problem: the schema is already well-indexed (~50 indexes, including composite ones such as `uq_attendance_user_date` and `idx_kpi_events_user_period`). The cost is in the query **pattern**: the GraphQL object-type field resolvers in `backend/src/graphql/shapes.ts` fan out one query per row per nested collection (`progressLogs`, `stateTransitions`, `requests`, `journey`, `attachments`, plus a `badges` field that re-selects the task row it already holds and re-queries `requests`), so a 100-row page that requests those fields issues hundreds of redundant queries. The just-merged expanded seed multiplies the rows these fan-outs iterate, so latency grows with every populated screen. This change measures the offending path first, removes the fan-out and unbounded reads, and keeps only the fixes that measurably beat the baseline (reverting neutral ones), because optimizing without measurement is guessing.

## What Changes

- **Profile first**: instrument the offending list endpoint(s), capture query count, per-query timing, and `EXPLAIN QUERY PLAN` against a seeded DB to confirm the root cause and record a reproducible baseline (target: a `LIMIT 100` page well under a one-second budget).
- **Eliminate per-row fan-out**: batch the `Task` relation collections into a bounded `inArray` query per page — one query per relation instead of one per row — and delete the redundant re-selects in `Task.badges`.
- **Bound every read**: enforce default and maximum page limits consistently and retire over-large client limits (for example the `limit: 200` attendance call) behind the documented pagination contract. This aligns with the existing *List pagination and filtering* requirement; it is not a breaking contract change.
- **Cheapen performance reads**: reduce the query count behind KPI dashboard/summary reads and reuse the existing per-request memo cache so repeated derivations do not re-query.
- **Storage hygiene**: prune the unbounded-growth table `session` (~660 rows, never cleaned) and confirm the hot read paths actually use their indexes via `EXPLAIN QUERY PLAN`.
- **Whole-project follow-on** (chosen scope): add frontend budgets (bundle size, render cost, Core Web Vitals within "Good") and infra checks (SQLite pragmas/WAL, prepared-statement reuse) — but **only** where measurement shows they matter; neutral results are reverted, not kept.
- Add a repeatable query-cost guard so the fan-out regression cannot silently return.

## Capabilities

### New Capabilities

None. This tightens existing behavior rather than introducing a new capability.

### Modified Capabilities

- `backend/graphql-api`: strengthen the read/execution requirements — list reads are bounded by default and maximum limits, and relation collections load in bounded batches instead of fanning out one query per row (modifies *List pagination and filtering* and adds a bounded-execution requirement).
- `backend/persistence`: add a storage-hygiene requirement — unbounded-growth tables are pruned and hot read paths use indexes that a query plan confirms.

## Impact

- `backend/src/graphql/shapes.ts` — batch the `Task` relation loaders and remove the redundant selects (the primary fix).
- `backend/src/graphql/resolvers/*.ts`, `backend/src/domain/kpi.ts`, `backend/src/domain/tasks.ts`, `backend/src/domain/schedule.ts` — enforce limits, reduce query counts, reuse the per-request cache.
- `backend/src/db/index.ts` (DB handle setup) and a maintenance step — session pruning, pragma/config verification.
- Tests: a new query-cost guard plus adjusted coverage. No GraphQL contract or scenario-shape changes; no new runtime dependencies. Frontend and infra items land only where measurement justifies them.
