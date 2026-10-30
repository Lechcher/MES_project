# Proposal

## Why

The Audit chart and table can describe only one month at a time, and its employee rows never say which role each person holds, so an evaluator cannot compare several periods or several roles in one view; the only thing an `EMPLOYEE` sees is their own row next to a "your role's data scope limits you to your own rows" note. Period and role are the two dimensions an evaluator needs to find and compare the people they evaluate, and the KPI tables already aggregate on `(periodYear, periodMonth)` per person, so both dimensions can be exposed without touching the scoring rules.

## What Changes

- The Performance app's period model becomes a **period selection**: a Month/Quarter/Year time frame plus the set of selected periods of that frame. The selection expands to the list of months it covers, and that list drives every Performance read — the Audit chart and table, the Personal KPI Dashboard, the print action, and the export action.
- **BREAKING** (GraphQL contract): the Performance period inputs become month-list inputs. `KpiPeriodInput` is replaced by `KpiPeriodSelectionInput { months: [KpiMonthInput!]! }`, `KpiAuditFilter` replaces `periodYear`/`periodMonth` with `months`, and `PersonalKpiDashboard` reports the selected months, their per-month totals, and a period aggregate instead of one month's summary.
- The audit rows carry each person's roles. The employee detail table gains a **Role** column, and the surface gains a multi-select **Role filter**, so several roles can be displayed and compared at once. The filter can only narrow the rows the viewer is already authorized to read.
- The Personal KPI Dashboard renders the selected period: an aggregate score card and summary, a score composition and recent-event list across the selected months, and a "KPI score by month" chart that plots the selected months instead of one fixed year.
- The print and export actions cover the selected period: the personal KPI PDF and the audit workbook are generated for every selected month.
- The `EMPLOYEE` data scope is unchanged: an employee still reads only their own row, now labelled with their role, and the scope note names the viewer's role instead of stating a bare limitation.

## Capabilities

### New Capabilities
<!-- None. This extends the existing Performance, GraphQL API, and report-export capabilities rather than introducing a new one. -->

### Modified Capabilities
- `frontend/performance`: the audit surface gains a role dimension (a Role column and a multi-select role filter) and a multi-period selection that replaces the single-month anchor; the Personal KPI Dashboard renders the selected period instead of one month; the print and export actions follow the selection.
- `backend/graphql-api`: the Performance period inputs become month-list inputs, the audit filter selects a set of months rather than one, and the personal dashboard reports the selected months and a period aggregate.
- `core/report-exports`: the Performance personal PDF and audit workbook are generated for the whole selected period rather than for one month.

## Impact

- `frontend/src/lib/mes/audit-period.ts` — the period model becomes a frame plus a set of selected period keys, with the expansion to months, the bounded option window, and the period labels.
- `frontend/src/lib/mes/audit-merge.ts` — the merged employee row carries the person's roles so the table and the role filter can use them.
- `frontend/src/components/performance/performance-view.tsx` — owns the shared period selection, the role filter state, and the controls that replace the single-month anchor and the dashboard's year switcher.
- `frontend/src/components/performance/audit-chart-and-table.tsx` — renders the Role column, applies the role filter to the chart and the table, and labels the selected periods.
- `frontend/src/components/performance/personal-dashboard.tsx` and `use-personal-trend.ts` — render the selected period and plot the selected months; the separate per-year trend read is folded into the period selection.
- `frontend/src/lib/mes/queries/performance.ts` — the audit row selections carry the user's roles, and the period inputs become month lists.
- `frontend/messages/en.json` and `frontend/messages/vi.json` — the period picker, the role filter, the Role column, the aggregate-period labels, and the role-named scope note.
- `backend/src/graphql/schema.ts`, `backend/src/graphql/resolvers/performance.ts`, `backend/src/domain/kpi.ts`, `backend/src/reports/exports.ts` — the month-list inputs, the period aggregate, the multi-month audit filter, and the multi-month personal PDF and audit workbook.
- `API_CONTACT_SPECIFICATION.md` — the Performance section's inputs, types, and operation signatures.
- Tests: frontend unit coverage for the period expansion and the role filter, backend unit coverage for the multi-month dashboard, audit filter, and reports, and e2e coverage for the period picker, the role filter, and the role-named scope note.
- Out of scope: no role's data scope changes (`EMPLOYEE` still reads only their own row), no peer-evaluation or rating workflow is introduced, the Week time frame is still not offered, and the Jobs, Planning, Settings, and Audit Log apps are untouched.
