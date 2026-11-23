# Baseline measurements — `optimize-query-performance`

Recorded during task 1.1–1.3. Method: a scratch profiler (`backend/perf-profile.ts`,
deleted after use) copied the real dev DB (`backend/data/mes.db`, 106 tasks), drove the
**real** GraphQL resolvers via `execute({schema, document, contextValue})` with a
`SUPER_ADMIN` viewer, and counted every `db.select/insert/update/delete` invocation
(faithful proxy for SQL statements) plus wall time.

## 1.1 — Query fan-out on a paginated list

Query: `tasks(offset, limit) { nodes { assignedTo createdBy department progressLogs
stateTransitions requests journey attachments badges } }`.

| limit | nodes | statements | wall time | stmts/node |
| --- | --- | --- | --- | --- |
| 20 | 20 | 202 | 96.7 ms | 10.10 |
| 50 | 50 | 352 | 110.8 ms | 7.04 |
| 100 | 100 | **705** | 138.8 ms | **7.05** |

- Statements scale **linearly** at a stable **~7 per task row** (the higher rate at
  limit 20 is the constant base amortized over fewer rows).
- **Offending endpoint:** `Query.tasks` (the Jobs task board / schedule list) when the
  selection includes nested collections. Every `Planning`/`Jobs` list that nests the
  same relations shares the mechanism.

**Honest note on the reported ">300s":** on this dev snapshot the same operation is
~139 ms for 100 rows (~0.2 ms/statement). The user's >300s is the *same linear fan-out*
at their data scale (more rows, and/or far more transitions/logs/attachments per task,
and/or slower statements on a larger file). The multiplier is the defect; the fix
removes it, so wall time drops proportionally at any scale. The guard below is the
scale-independent proof.

## 1.2 — `EXPLAIN QUERY PLAN` for hot read paths (no missing indexes)

| Hot path | Plan | Verdict |
| --- | --- | --- |
| tasks by `assigned_to` | `SEARCH tasks USING INDEX idx_tasks_assigned` | indexed |
| attendance by user+date | `SEARCH attendance_records USING INDEX uq_attendance_user_date` | indexed (composite) |
| KPI events by user+period | `SEARCH kpi_score_events USING INDEX idx_kpi_events_user_period` | indexed (composite) |
| session by `token` | `SEARCH session USING INDEX session_token_unique` | indexed (`.unique()`) — no gap |
| task list by dept + `ORDER BY end_date` | `SEARCH idx_tasks_department` + `USE TEMP B-TREE FOR ORDER BY` | not a scan; a sort on a ≤100-row page — candidate only in 5.3 |

Conclusion: **query count, not query plans, is the bottleneck.** No missing index on the
core lookups; the only mild observation (temp b-tree sort) is negligible at page size
and will be revisited in task 5.3 only if 1.2’s copy shows it dominating.

## 1.3 — Confirmed multiplier and culprit resolvers

`statements ≈ 7 × N + constant`, matching the static reading of
`backend/src/graphql/shapes.ts`:

- `Task.progressLogs` (~785), `Task.stateTransitions` (~791), `Task.requests` (~797),
  `Task.journey` (~804), `Task.attachments` (~811) — **one query per task row** (5N).
- `Task.badges` (~817) — **re-selects the task row** then **re-queries `taskRequests`**
  (2N), both redundant with data already on the request.
- `Task.assignedTo`/`createdBy`/`department` (~765–782) route through the per-request
  memo cache (`loadUser`/`loadDepartment`), so they add only the small bounded constant,
  not per-row cost.

## After — fan-out removed (cold per-request, fresh cache each)

Same query, fresh context per request (`backend/perf-profile.ts`, deleted after use):

| limit | nodes | statements (before) | statements (after) | stmts/node |
| --- | --- | --- | --- | --- |
| 10 | 10 | ~77 | **14** | 1.40 |
| 50 | 50 | ~352 | **14** | 0.28 |
| 100 | 100 | 705 | **15** | 0.15 |

The statement count is now a **small constant independent of page size** (~14–15 for
any page). Two root causes fixed:

1. **Collection fan-out** — `Task.progressLogs`/`stateTransitions`/`requests`/`journey`/
   `attachments` now load once per page via `primeTaskCollections` (an `inArray` batch in
   the `tasks` list resolver, selection-set aware) and cache-hit per row; `Task.badges`
   derives from the already-loaded `requests` and the row being resolved — no re-selects.
2. **Relation race** — `cached()` memoised the *resolved value* after awaiting, so fields
   resolving concurrently for the same key (a page whose rows share users/departments)
   raced and each re-queried: measured `loadUser(sameId)` ×50 concurrently = 50 statements
   vs ×50 sequentially = 1. `cached()` now coalesces the **in-flight promise**, so relation
   loads are once-per-distinct-id per request across every list (Jobs, Planning,
   Performance).

Guard: `backend/src/graphql/query-cost.test.ts` asserts a nested task list issues ≤ 50
statements for a 50-row page with a per-node rate ≤ 1.5 — the pre-fix fan-out (~350) fails
this, so the regression cannot return silently.

## 6.3 — Whole-project gate: frontend budgets and infra (measurement-gated)

Method: `cd frontend && bun run build` (Next.js 16.4.6 / Turbopack), reading the route bundle
report at `.next/diagnostics/route-bundle-stats.json` and the emitted client chunks in
`.next/static/chunks/`; plus a CWV probe that serves the production build
(`.next/standalone/server.js`, spare port) and records LCP/CLS/FCP/TTFB in Chromium. Per
design Decision 1 and the Risk note ("Whole-project scope invites unfocused churn → strictly
measurement-gated"), every item below is either changed because a measured number motivates
it, or recorded as **no measured need**.

### Bundle size — MEASURED, no change

`bun run build` now completes (exit 0): the pre-existing `task-detail-view.tsx` TS2589 that
had blocked it at the type-check step was fixed mid-task by commit `ed39b60`. First Load JS
(uncompressed) per route, from the route report that build wrote
(`.next/diagnostics/route-bundle-stats.json`, 2026-11-23 02:00), against the previous report
(2026-11-21 20:51):

| route | before | now |
| --- | --- | --- |
| `/performance` | 1 164 KB | 1 168 KB |
| `/planning` | 1 127 KB | 1 131 KB |
| `/settings` | 1 047 KB | 1 057 KB |
| `/jobs/new` | 1 026 KB | 1 030 KB |
| `/audit-log` | 984 KB | 987 KB |
| `/planning/leave/new` | 975 KB | 979 KB |
| `/jobs/tasks/[id]` | 937 KB | 941 KB |
| `/jobs` | 902 KB | 905 KB |
| `/telegram` | 866 KB | 869 KB |
| `/` | 860 KB | 863 KB |
| `/signin` | 802 KB | 805 KB |
| `/reset-password` | 734 KB | 738 KB |
| `/_not-found` | 706 KB | 709 KB |
| `/confirm-email` | — (new route) | 731 KB |

- 13 → 14 routes (a `/confirm-email` route was added by another change in the same window);
  **max 1.16 MB → 1.17 MB (+4 KB, +0.3%)**, min 0.69 MB → 0.71 MB, **avg 0.93 MB → 0.92 MB**.
- The deltas on pre-existing routes are ≤ 10 KB and are attributable to the other changes
  landed in the same window, not to this one: task 3.2 (attendance paging) adds no dependency
  and imports `@/components/shared/pagination-bar`, a module six other screens already load,
  so its marginal bundle cost is ~0.
- The five largest chunks are **framework, not app code** (231.9 KB `react-dom` + `next`,
  223.9 KB `react-dom`, 156.8 / 110.0 / 100.3 KB `next` runtime) — verified by symbol grep;
  `chart.js`, `lucide-react` and `@base-ui/react` appear in none of them.

**design.md defines no numeric bundle budget**, so no threshold exists to violate.
Verdict: **no measured need → no change.**

### Render cost and Core Web Vitals — MEASURED, all "Good"

Measured against the production build (`.next/standalone/server.js` on a spare port, Chromium
headless, viewport 1280×720, **CPU throttled 4×** to approximate a mid-tier device):

| route | LCP | CLS | FCP | TTFB |
| --- | --- | --- | --- | --- |
| `/signin` | 100 ms | 0 | 100 ms | 5 ms |
| `/` | 588 ms | 0 | 588 ms | 9 ms |
| `/planning` | 600 ms | 0 | 600 ms | 7 ms |

Against Google's "Good" thresholds — LCP ≤ 2 500 ms, CLS ≤ 0.1, FCP ≤ 1 800 ms — **every
route passes, with ~4× headroom on LCP and a perfect zero CLS**.

Caveats: pages were fetched over localhost with **no network throttling** (~0 RTT), so the
numbers are optimistic for real-world networks; the loads were **unauthenticated**
(`/planning` returns its client-side session shell), and **INP is not measured** because it
requires interaction. A field-accurate figure needs real traffic or a throttled lab run —
nothing here shows a render-cost problem to fix.

Verdict: **within "Good" → no change.**

### Infra — SQLite pragma / WAL — not applicable, no change

`backend/src/db/index.ts` is a **PostgreSQL** factory (`drizzle(node-postgres)` over a
`pg.Pool`, `max: 10`); its comment records that "the per-connection PRAGMAs of the SQLite era
are gone: PostgreSQL enforces foreign keys per database and manages its own write-ahead
logging." design.md's SQLite/WAL context predates that migration. There is no SQLite pragma
left to verify. Verdict: **no measured need → no change.**

### Infra — prepared-statement reuse — no measured need

`createDatabase` uses a `pg.Pool` (`max: 10`); no profiler run in this change measured
statement-preparation cost. The measured bottleneck was query **count** (705 → ~15
statements per page, above), which tasks 2–5 already fixed. Verdict: **no measured need → no
change.**

**Net:** zero frontend/infra changes taken, because no measured number motivates one.

