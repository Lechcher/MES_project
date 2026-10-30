# Design

## Context

See `proposal.md` — Why. This design assumes only what the profiler in Task 1 will confirm, so Task 1 runs before any fix lands. Current constraints that shape the approach:

- The dev DB is tiny (≤ ~660 rows/table) and already carries ~50 indexes, so the latency is a **query-pattern** cost, not data volume or missing indexes.
- GraphQL execution is graphql-js: object-type field resolvers run **per row**, so a nested collection field fires one query per parent row unless something batches it.
- Relation loaders for `user`/`department`/`project` already coalesce through the per-request memo cache (`cached()` in `backend/src/graphql/context.ts`, used by `loadUser`/`loadDepartment`/`loadProject` in `shapes.ts`). **Collection** loaders (a task's `progressLogs`/`stateTransitions`/`requests`/`journey`/`attachments`) do **not** — they query per row.
- `Task.badges` re-selects the task row it is resolved from and re-queries `taskRequests`, duplicating work already available on the request.
- `kpi_monthly_summaries` is a derived snapshot rebuilt by `recomputeMonthlySummary(ctx, userId, year, month)`; derived reads should reuse stored summaries + the per-request cache rather than recompute on every read.
- List reads already return `nodes`/`pageInfo` connections (the *List pagination and filtering* requirement), so bounding them is a refinement, not a contract change.
- `data/mes.db-wal` shows SQLite is already in WAL mode; any pragma tuning must not weaken durability.

## Goals / Non-Goals

**Goals:**

- The offending `LIMIT 100` list path drops from the >300s baseline to a sub-second budget, with a before/after number recorded.
- Query count for a page that nests relations is proportional to the number of relations on the page, not rows × relations.
- Every list read is bounded by a default and a maximum page size.
- `session` growth is bounded; hot read paths provably use their indexes.
- A repeatable query-count guard makes the fan-out regression non-silent.
- Whole-project scope honoured **through measurement**: frontend and infra work happens only where a number justifies it.

**Non-Goals:**

- No GraphQL contract shape changes (`nodes`/`pageInfo`, field names, scalars stay identical).
- No new runtime dependency (no DataLoader) unless the profiler proves the in-house batch path insufficient.
- No rewriting of correct, already-cheap reads; no speculative "add caching/index" churn.
- Not a data purge: pruning removes only expired sessions.

## Decisions

### 1. Measure first, then fix; keep only what beats the baseline

Task 1 reproduces the latency, counts SQL statements, and captures `EXPLAIN QUERY PLAN` before any change. Each later fix is re-measured with the same method; a change that is within noise is **reverted, not kept**, and every attempt (kept and reverted) is logged. **Alternative considered:** apply well-known fixes (batch + cap + prune) and declare victory — rejected because the perf skill mandates measured, attributable wins and the honest baseline is unknown.

### 2. Batch collection loads in the parent resolver, reusing the per-request cache

The list resolvers already hold the full page of task ids. After mapping rows, each resolver issues **one `inArray` query per relation** over the page's ids and populates the per-request cache under a per-`(task, relation)` key; the per-row field resolvers then read the cache and issue zero extra queries. This reuses the existing `cached()` memo, adds no dependency, and bounds query count. **Alternatives considered:** (a) graphql-js DataLoader-style deferred batching — rejected: new dependency and indirection for a SQLite-scale app; (b) per-row coalescing loader — rejected: lazy per-row resolution still ends up issuing one load per row without deferral, which is the current behavior.

### 3. Batch only the relations the selection set actually requested

Batching eagerly could load collections a client did not ask for. The parent resolver inspects the GraphQL selection set (via `info`) and batches only requested relations, so a scalar-only list stays a single query. Trade-off: slight coupling to `info`; acceptable given the alternative is bounded over-fetch vs. the current unbounded fan-out.

### 4. Clamp page size server-side from shared constants

Define `DEFAULT_PAGE_SIZE` and `MAX_PAGE_SIZE` once and clamp in `pageArgs`/resolvers, keeping the `nodes`/`pageInfo` shape. Over-large client limits (e.g. `limit: 200`) move behind the documented pagination. This aligns with the existing pagination requirement rather than changing it.

### 5. Read-side KPI uses stored summaries + cache

Dashboard/summary reads load `kpi_monthly_summaries` (already derived and written on mutation) and memoize per request, instead of recomputing. `recomputeMonthlySummary` stays the writer used by mutations and the seed; if the profiler shows a read must recompute, its internal query count is reduced instead. **Alternative considered:** recompute-on-every-read — rejected as the default because it re-derives identical rows on each read.

### 6. Prune expired sessions outside the hot path

A pruning step deletes `session` rows with `expiresAt < now` and is invoked from a maintenance/startup hook, never per request. Active sessions are retained. **Alternative considered:** delete on read — rejected; it puts cleanup on the request path and risks races.

### 7. Codify index adequacy in a guard test

A test runs `EXPLAIN QUERY PLAN` for each named hot read path and asserts an index is used (no full scan). This turns the *index-backed reads* scenario into an executable check and catches a dropped index at test time. **Alternative considered:** manual review — rejected; it does not fail CI.

## Risks / Trade-offs

- **Eager batch may over-fetch relations a client did not request** → Mitigated by Decision 3 (selection-set awareness); residual over-fetch is bounded by page size, and the guard flags any growth in query count.
- **Clamping limits changes result counts for over-limit callers** → aligns with the pagination requirement; frontend call sites are updated in the same change and e2e covers paging.
- **>300s root cause may be deeper than fan-out (e.g. a cross-join report or repeated full recompute)** → Task 1 confirms before fixes; if a distinct culprit appears, tasks are re-scoped there first rather than assuming.
- **Pruning could remove a row a concurrent request needs** → only expired rows (`expiresAt < now`) are removed; active sessions are never touched; prune is idempotent.
- **One-second budget may need adjusting once the real baseline is known** → Task 1 sets the baseline and confirms the target; the spec-level requirement is "bounded, batch-loaded reads," not a specific millisecond figure.
- **Whole-project scope invites unfocused churn** → strictly measurement-gated (Decision 1); frontend/infra tasks proceed only with a motivating number.

## Migration Plan

1. Land Task 1 instrumentation; record baseline; nothing else changes behavior yet.
2. Land batches, bounds, KPI read change, pruning, and index guard behind the existing pagination/derived-summary behavior — no schema migration unless Task 1.2 finds a genuinely missing index (then a minimal additive migration).
3. Re-measure; keep wins, revert neutrals.
4. Rollback: batch loaders revert to per-row (behavior-identical), bounds and pruning revert to prior values; no data migration to undo. Pruning is safe to disable/re-enable at any time.

## Open Questions

- Exact offending endpoint(s) and the precise baseline number — Task 1 produces these; they refine the budget, not the spec or approach.
- Whether infra pragma tuning yields a measured win — deferred to Task 6.3; if within noise it is reverted, so it does not affect the tracked requirements.
