# Design

## Context

See `proposal.md` — Why for motivation; the spec deltas in this change define the required behavior.

The current state that constrains the approach:

- **The API contract is fixed for this change.** `KpiPeriodInput` is `{ periodYear, periodMonth }`, `KpiAuditFilter` is `{ periodYear, periodMonth?, departmentId? }`, and `kpi_monthly_summaries` is keyed `(user_id, period_year, period_month)`. Week/monthly grain is the finest available aggregation.
- **Audit-level authorization is role-keyed, not scope-keyed.** In `backend/src/graphql/access.ts`: `kpiAuditLevel1Company` and `kpiAuditLevel2Department` are `SUPER_ADMIN`/`TECH_LEAD`/`HR_MANAGER`; `kpiAuditLevel3Employee` is those three plus `DEPT_HEAD`; `personalKpiDashboard` and `kpiScoreEvents` are all roles. An `EMPLOYEE` therefore has **no** authorized audit-level query.
- `resolveKpiScope` returns `ALL` for SA/TL/HR, `DEPARTMENT` (department-scoped) for `DEPT_HEAD`, and `PERSONAL` for everyone else, and the audit queries apply `auditDepartmentScope` server-side.
- The frontend already resolves locale names through one bridge: `useDomainLabels()` → `resolveDomainLabel(t, "enums.<group>.<code>", registryFallback)`, backed by `registries.ts` and the `enums.*` catalogues in `messages/en.json` and `messages/vi.json`.
- The seeded `kpi_point_rules.event` values are machine keys (`on_time_ticket`) and the runtime `KPI_RULES` catalogue is English-only, so neither can serve the `vi` locale. Display text must come from the message catalogues.

## Goals / Non-Goals

**Goals:**

- A single reusable label path for KPI rule names that serves both locales and reuses the existing domain-label bridge.
- One chart + one table audit surface whose scope, time frame, and row grain are driven by one selection state object.
- Time frames built by composing the existing monthly reads, with no backend change.
- Visibility derived from the viewer's `DataScope` rather than a hardcoded two-boolean pair, so the "every role" rule is expressed once.

**Non-Goals:**

- Any backend, database, migration, or `API_CONTACT_SPECIFICATION.md` change. The GraphQL documents sent are unchanged in shape.
- A Week time frame, or any sub-month grain. Weekly aggregation needs the event ledger and is out of scope.
- Changing which *rows* a role can read. Row-level scope is the backend's decision and stays there.
- Changing the print/export operations, which keep taking the selected month.

## Decisions

### D1 — KPI rule names join the `enums` catalogue as a `kpiRules` group

Add `KPI_RULE_LABELS` (canonical English fallback for all eight `KPI_*` codes, transcribed from the documented rule table) to `registries.ts`, expose `useDomainLabels().kpiRule(code)` via `resolveDomainLabel(t, "kpiRules", code, ...)`, and add `enums.kpiRules.<CODE>` to both locale files.

*Why not reuse `KpiPointRule.event`:* it is one fixed string per rule, its seeded values are machine keys, and it cannot carry a Vietnamese translation. Reusing it would re-introduce the exact problem this change removes and would bypass the one-registry rule in `frontend/display-labels`.

*Why not a `performance.kpiRules` group:* enum codes resolve through `enums.<group>.<code>`, so a second location would fork the resolution path and the coverage test.

The `kpiPointRules` read stays as-is and still supplies points and descriptions; only its display text is replaced by the localized name.

### D2 — The viewer's `DataScope`, not two booleans, decides the audit surface

Replace `canSeeCompanyAudit`/`canSeeDepartmentAudit` with `auditScopeFor(role)` returning `{ scopes: AuditScope[], rowSource }`, where `AuditScope = "company" | "department"`:

| Roles | `DataScope` | Selectable scopes | Company-wide row source | Department-wide row source |
| --- | --- | --- | --- | --- |
| `SUPER_ADMIN`, `TECH_LEAD`, `HR_MANAGER` | `ALL` / `COMPANY_WIDE` | both | `kpiAuditLevel1Company` | `kpiAuditLevel2Department` |
| `DEPT_HEAD` | `DEPARTMENT_ONLY` | company only | `kpiAuditLevel3Employee` (server already scopes) | none — selector disabled |
| `EMPLOYEE` | `PERSONAL` | none | `personalKpiDashboard` (own row) | none — selector disabled |

*Why:* it encodes "every role sees the surface, the contract still decides the rows" in one place. A `DEPT_HEAD` loses no access; an `EMPLOYEE` gets the surface with their own row, which is the only thing their scope can authorize.

*Alternative considered:* relaxing the backend audit roles to `ALL_ROLES`. Rejected — it is a contract change the user scoped out, and it would expose company-wide rankings to every employee.

### D3 — One audit query document selected by scope, not three

Collapse the three `KPI_AUDIT_LEVEL*_QUERY` constants into one `KPI_AUDIT_QUERY(document)` factory keyed on the row source, keeping each row type's selection set intact. The combined table renders whichever node shape arrives, driven by the scope.

*Why:* the three documents are now two live shapes (employee rows, department rows) reached through one selector. Keeping three top-level constants plus three `useApiQuery` calls would leave dead wiring for a scope that is no longer independently reachable.

Rows are still sorted `TOTAL_KPI_SCORE_DESC` server-side via the existing `orderBy` argument, so no client re-sort is needed. Where the source omits ordering, the row order is preserved from the response.

### D4 — Time frames compose monthly reads in one hook

`useAuditPeriod({ scope, timeFrame, anchor })` resolves the selection to a list of `{ periodYear, periodMonth }` (Month → 1, Quarter → 3, Year → 12), issues the scope's query per month through `useApiQuery` (so the existing variable-change refetch applies), and merges:

- Additive integer columns (`totalTasksAssigned`, `completedOnTime`, `overdueTasks`, `unapprovedLeaveCount`, `immediateApprovalCount`, `returnedCount`, `perfectAttendanceBonus`, `totalEmployees`) — **summed**.
- `totalKpiScore` — **summed** across months (each month's score is already bonus minus penalty).
- Rate columns (`attendanceRate`, `avgAttendanceRate`, `avgDepartmentKpiScore`) — **mean across the months present**, weighted by `totalEmployees` for department rows. This is an approximation; see Risks.
- `department.manager` and `department.name` — **identity columns**, taken from the row that carries them rather than merged.
- Months with no summary contribute nothing, so a gap does not zero out a rate.

The Year frame issues twelve parallel queries. This is accepted for a prototype; see Risks.

*Alternative considered:* a server-side timeframe enum on `KpiAuditFilter`. Rejected — it changes the contract and requires aggregation SQL for grain the schema does not store.

*Alternative considered:* deriving quarters from the event ledger (`kpiScoreEvents`). Rejected — its authorization is app-scope, not level-scoped, so it cannot reproduce the audit rows, and it reintroduces per-event row assembly in the client.

### D5 — One shared Chart.js bar primitive

Extract the existing `RankingChart` Chart.js block into a `bar-chart.tsx` primitive carrying the Carbon styling (`IBM Plex Sans` 11px ticks, `#e0e0e0` y-grid, no x-grid, no legend). `ranking-chart.tsx` wraps it for the audit ranking (adding a `seriesLabel` prop, replacing the hardcoded `"TOTAL PERFORMANCE SCORE"`), and a new `score-trend-chart.tsx` wraps it for the personal twelve-month trend.

*Why:* the two charts would otherwise duplicate the options object, and `RankingChart`'s hardcoded English series label is itself a leftover of the code-leak problem.

`donut-chart.tsx` is unchanged — its segment labels now arrive pre-localized from D1.

### D6 — Selection state lives in `PerformanceView`, not in the tab

`PerformanceView` owns one state object `{ tab, auditScope, timeFrame, anchor, trendYear }` and passes the resolved slice to each panel. The page header's month stepper keeps driving the export/print operations (which take a single `KpiPeriodInput`) and acts as the anchor for the audit time frames.

*Why:* the scope and time frame selectors must stay in sync between the chart and the table. Two local states would drift and produce a chart and table describing different periods.

## Risks / Trade-offs

- **Rate columns are approximated across a quarter or year** → a quarter's `attendanceRate` is the mean of its monthly rates, not a recomputation from raw attendance records, so it can differ from a server-side figure by rounding. Mitigation: the approximation is stated in the table footnote, and the exported workbook remains the monthly source of truth.
- **Twelve parallel queries for the Year frame** → visible request churn and a slower first paint on a cold cache. Mitigation: `useApiQuery` already shares the live-channel subscription, and the queries are independent so they resolve concurrently; if it proves too slow, the frame can be capped to Month and Quarter without touching the specs.
- **An `EMPLOYEE`'s personal row is a different node shape from the audit rows** → the table needs a personal-row adapter so the shared columns render from `personalKpiDashboard.summary`. Mitigation: the adapter is a pure mapping function with its own unit test, so the divergence is visible and covered rather than a silent `undefined`.
- **`kpiPointRules` points and descriptions stay English** → only the rule *name* is localized; points are locale-neutral and the description column stays English. Mitigation: the description column is the one place English prose remains, and it is not a code token, so `frontend/display-labels` is not violated.
- **Renaming i18n keys orphans nothing only if both locales move together** → a key present in `en.json` and missing from `vi.json` silently falls back. Mitigation: add both locales in the same change, and the existing locale-parity test catches drift.

## Migration Plan

- Frontend-only: no migration, no data backfill, no API version bump.
- Rollback: revert the change. The old `jobs.list`-style leftovers are already gone and nothing here depends on them; the deleted route remains deleted.
- Order of work is inside the frontend package, so no coordinated deploy step exists.

## Open Questions

- Whether the Export workbook should eventually follow the selected time frame instead of the selected month. It can be answered later without changing the specs, because both mutations keep their monthly filter either way.
- Whether the monthly trend should move from the personal dashboard into the audit tab as a company comparison. The specs only require the personal placement, so the audit placement can be added later without a spec change.
