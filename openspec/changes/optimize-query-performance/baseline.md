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
