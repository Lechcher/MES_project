# Tasks

## 1. Localized KPI rule names

- [x] 1.1 Add `KPI_RULE_CODES` and `KPI_RULE_LABELS` (all eight `KPI_*` codes, canonical English event names from the documented rule table) to `frontend/src/lib/mes/queries/registries.ts`, and verify the existing "no label table contains an empty entry" test still passes with `KPI_RULE_LABELS` added to its table list.
- [x] 1.2 Add `kpiRule(code)` to `useDomainLabels()` in `frontend/src/lib/mes/i18n/labels.ts`, resolving through `resolveDomainLabel(t, "kpiRules", code, KPI_RULE_LABELS[code])`, and add a case to `frontend/src/lib/mes/i18n/labels.test.ts` asserting an unknown rule code falls back to the registry name rather than the code itself.
- [x] 1.3 Add `enums.kpiRules.<CODE>` for all eight codes to `frontend/messages/en.json` and `frontend/messages/vi.json`, and verify `bun test src/lib/mes/queries/registries.test.ts` and `bun test src/lib/mes/i18n/locale-parity.test.ts` both pass.
- [x] 1.4 Add a `kpiRules` entry to the `COVERAGE` array in `frontend/src/lib/mes/queries/registries.test.ts` with `values: KPI_RULE_CODES` and `catalogueGroup: "kpiRules"`, and verify the "every kpiRules value has a label" and "every kpiRules value has an enums message in every locale" tests both run and pass (a deliberately missing message must make them fail).
- [x] 1.5 Render the localized rule name in the recent-events table and the score-composition donut segments in `frontend/src/components/performance/personal-dashboard.tsx`, and add a unit test asserting the rendered label for `KPI_ON_TIME_TICKET` is the localized name with no `KPI_` token in the output.

## 2. Personal KPI score by month chart

- [x] 2.1 Extract the shared Chart.js bar options block from `frontend/src/components/performance/ranking-chart.tsx` into a `bar-chart.tsx` primitive carrying the Carbon styling, and verify `RankingChart` still renders with the same options (tsc clean plus the existing chart behaviour unchanged).
- [x] 2.2 Add `frontend/src/components/performance/score-trend-chart.tsx` wrapping the bar primitive with month labels and per-month values, and add a unit test that a month with no recorded summary contributes a zero value rather than being dropped from the axis.
- [x] 2.3 Add a `trendYear` state, a year switcher, and the twelve-month trend section to `frontend/src/components/performance/personal-dashboard.tsx`, sourced from the monthly summaries already read for the personal dashboard, and verify switching the year replots without a full-page reload (existing tests still pass, no new network helper needed).
- [x] 2.4 Add the `performance.personal` messages for the trend section title, description, year switcher label, and empty state to both `frontend/messages/en.json` and `frontend/messages/vi.json`, and verify `bun test src/lib/mes/i18n/locale-parity.test.ts` passes.

## 3. Audit scope and time frame foundations

- [x] 3.1 Replace `canSeeCompanyAudit`/`canSeeDepartmentAudit` with `auditScopeFor(role)` in `frontend/src/lib/mes/queries/access.ts` returning the selectable scopes and the row source per the design's table, update every caller, and verify `bun test src/lib/mes/queries/access.test.ts` passes with new cases for all five roles including `EMPLOYEE` and `DEPT_HEAD`.
- [x] 3.2 Collapse `KPI_AUDIT_LEVEL1_QUERY`, `KPI_AUDIT_LEVEL2_QUERY`, and `KPI_AUDIT_LEVEL3_QUERY` into one `KPI_AUDIT_QUERY` factory in `frontend/src/lib/mes/queries/performance.ts` keyed on the row source, keeping each row type's selection set intact, and verify `bunx tsc --noEmit` reports no unused-export or type errors.
- [x] 3.3 Add period helpers that resolve a time frame and anchor to the list of `{ periodYear, periodMonth }` values it covers (Month → 1, Quarter → 3, Year → 12) and expose only Month/Quarter/Year, and add a unit test covering each frame, year boundaries, and the absence of a Week frame.
- [x] 3.4 Add the `useAuditPeriod` hook that issues the scope's audit query per month through `useApiQuery` and merges rows (additive integers summed, `totalKpiScore` summed, rate columns meaned and weighted by `totalEmployees` for department rows, identity columns taken from the row that carries them), and add a unit test asserting a gap month contributes nothing to a rate while still summing the counts.

## 4. Combined audit chart and table

- [x] 4.1 Rename `frontend/src/components/performance/audit-tables.tsx` to `audit-chart-and-table.tsx` and replace its three sections with one `SectionHeader`-less single table plus one chart section, sharing the scope and time frame from props, and verify the file compiles and no "Audit Table 1/2/3" heading string remains anywhere in `src/`.
- [x] 4.2 Add a pure `personalAuditRow(summary)` adapter in `audit-chart-and-table.tsx` that maps `personalKpiDashboard.summary` onto the employee-row shape for an `EMPLOYEE`, and add a unit test asserting every employee-level column it feeds resolves to a defined value rather than `undefined`.
- [x] 4.3 Give `RankingChart` a localized `seriesLabel` prop replacing the hardcoded `"TOTAL PERFORMANCE SCORE"` dataset label, and verify the label string no longer appears as a literal in `src/components/performance/`.
- [x] 4.4 Own the `{ tab, auditScope, timeFrame, anchor, trendYear }` selection state in `frontend/src/components/performance/performance-view.tsx`, render the audit tab for every role, rename the tab label, and add the scope and time frame selectors, and verify `bunx tsc --noEmit` is clean after removing the old `showAudit` gating.
- [x] 4.5 Rename the `performance.view` and `performance.audit` message keys in both `frontend/messages/en.json` and `frontend/messages/vi.json` — the tab becomes "Audit chart and table", the ranking title becomes "Performance score ranking", the detail table becomes "Detail performance KPI score" — remove the per-level keys that no longer have a caller, and verify `bun test src/lib/mes/i18n/locale-parity.test.ts` and `grep -rn "level1Title\|level2Title\|level3Title" src/` both show nothing left over.
- [x] 4.6 Update `frontend/src/app/(app)/performance/page.tsx` if its metadata or labels name the old tab, and verify the route still builds with `bunx tsc --noEmit` clean and no stale generated types referencing removed components.

## 5. Documentation and integration verification

- [x] 5.1 Update `openspec/specs/frontend/performance/spec.md` and `openspec/specs/frontend/display-labels/spec.md` content that this change's deltas replace, so the main specs describe the merged audit surface and the localized rule names after archive, and verify `openspec validate --strict` passes on the change.
- [x] 5.2 Run `cd frontend && bunx biome check --write` and verify it reports no remaining fixes on the touched files.
- [x] 5.3 Run `cd frontend && bun test src/` and verify the full unit suite passes with no failures.
- [x] 5.4 Run `cd backend && bun test` and verify the backend suite still passes, confirming no API contract was disturbed.
- [x] 5.5 Update `frontend/tests/pages/performance/dashboard.ts` and `frontend/tests/tests/performance/kpi.spec.ts` to drive the renamed tab, the scope and time frame selectors, and the monthly trend chart, and verify `cd frontend && bun run test:e2e` reports the performance specs passing.

## Workflow follow-up

- Run `/opsx-apply` to implement this change once the user approves the artifacts.
- Archive the change with `/opsx-archive` after implementation and verification are complete.
