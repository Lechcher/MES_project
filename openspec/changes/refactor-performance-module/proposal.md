# Proposal

## Why

The Performance screen shows raw KPI rule codes (`KPI_ON_TIME_TICKET`) in "Recent KPI events" and "Score composition", which violates the `frontend/display-labels` presentation rule and is unreadable for non-technical staff in either locale. The audit surface is also split into three separately-gated tables plus a chart that only three of the five roles can ever open, and an employee has no way to see how their score moves across months.

## What Changes

- **Natural-language KPI rule labels.** "Recent KPI events" and "Score composition" render the rule's name instead of its code, from a localized label catalogue keyed by the rule code, in both `en` and `vi`. The code stays the data contract in queries, filters, and access logic.
- **New "KPI score by month" bar chart.** Added to the Personal KPI Dashboard: the viewer's total KPI score per month across the twelve months of a selected year, with a year switcher. This is a personal trend view and is not role-gated.
- **Rename and re-gate the audit surface.** The "Audit Tables" tab becomes "Audit chart and table" and is rendered for every role. Row-level data scope is unchanged: the backend still restricts which rows a viewer may read, so an `EMPLOYEE` sees only their own row and the company/department selectors are disabled for them.
- **Performance score ranking chart.** The company-wide ranking chart is replaced by a "Performance score ranking" chart whose scope and period are selectable — Company-wide or Department-wide over a Month, Quarter, or Year time frame.
- **One combined detail table.** Audit Tables 1, 2, and 3 collapse into a single "Detail performance KPI score" table. A Company-wide/Department-wide selector switches the table's row grain: department rows in one scope, employee rows in the other, with the column set following the grain. The time frame selector applies to the table as well.

Time frames are Month, Quarter, and Year only. Week is not offered — the KPI summaries the UI reads are monthly, so a weekly grain cannot be derived from them without an event-ledger aggregation, which is out of scope here.

## Capabilities

### New Capabilities

(none — every behavior touched here already lives in an existing capability.)

### Modified Capabilities

- `frontend/performance`: the Personal KPI Dashboard gains a monthly trend chart and localized rule labels; the audit surface becomes one chart plus one table under Company-wide/Department-wide scope and Month/Quarter/Year time frames, visible to every role with the documented data scope preserved.
- `frontend/display-labels`: KPI point rule codes join the catalogue of domain enums that render as natural language in every locale, with the coverage test extended to cover them.

## Impact

- `frontend/src/components/performance/performance-view.tsx` — tab rename, the audit tab becomes role-agnostic, and the period header gains time-frame controls.
- `frontend/src/components/performance/personal-dashboard.tsx` — localized rule labels for recent events and donut segments, plus the new monthly bar chart and year switcher.
- `frontend/src/components/performance/audit-tables.tsx` — replaced by a single combined chart-and-table component.
- `frontend/src/components/performance/ranking-chart.tsx` — extended to accept a selectable scope, a time frame, and a localized series label.
- `frontend/src/components/performance/donut-chart.tsx` — unchanged in shape; segment labels now arrive pre-localized.
- `frontend/src/lib/mes/queries/performance.ts` — the three audit queries collapse to one reusable audit query with a scope parameter.
- `frontend/src/lib/mes/queries/access.ts` — the audit gate no longer splits company vs. department visibility.
- `frontend/src/lib/mes/i18n/labels.ts` — a KPI rule label resolver is added next to the existing enum bridges.
- `frontend/messages/en.json`, `frontend/messages/vi.json` — new and renamed `performance` messages plus the KPI rule names for both locales.
- `frontend/src/app/(app)/performance/page.tsx` — route entry only; no change expected.
- No backend, database, or GraphQL contract change: `KpiPeriodInput`, `KpiAuditFilter`, and every audit resolver keep their current shape, and `API_CONTACT_SPECIFICATION.md` is not rewritten.
