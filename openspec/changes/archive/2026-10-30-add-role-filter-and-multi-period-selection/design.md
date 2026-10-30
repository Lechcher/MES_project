# Design

## Context

See `proposal.md` — Why.

The Performance app currently owns one selection-state object in `PerformanceView` (`tab`, `auditScope`, `timeFrame`, `anchorYear`, `anchorMonth`, `trendYear`) so the ranking chart and the detail table can never describe different periods. Four facts shape this change:

- The KPI tables are keyed by `(periodYear, periodMonth)`. A quarter or a year is therefore *assembled* from monthly rows: `auditPeriods()` in `frontend/src/lib/mes/audit-period.ts` expands a frame into months, `useAuditPeriod` issues one read per month, and `audit-merge.ts` merges the monthly rows into one row per entity. The merge rules (counts sum, rates average over the months that reported, identity carried once) are already unit-tested.
- The audit levels expose no role information today. The GraphQL `User` type does expose `roles { id code name }` (the settings screens already select it), but the audit row queries use `USER_BRIEF`, which does not.
- The personal tab is the heaviest reader in the app: `PersonalDashboard` issues one `personalKpiDashboard` read for its month, and `usePersonalTrend` issues twelve more to plot the year. `personalKpiDashboard` is a single-period operation, so a year costs thirteen requests.
- The backend aggregates nothing across months. `getPersonalDashboard`, `getAuditLevel1/2/3`, `printKpiReport`, and `exportAuditWorkbook` all take one `(periodYear, periodMonth)`, and `printKpiReport`/`exportAuditWorkbook` build the artifact server-side, so a server-side artifact can only ever describe one month.

The period and the role dimensions are therefore the two places where the client and the server disagree about what a period is: the client can merge months, the server cannot.

## Goals / Non-Goals

**Goals:**

- One period selection for the whole Performance app, expressed in the app's existing Month/Quarter/Year vocabulary, that can name several periods at once.
- One period model across the whole Performance API surface, so a screen and the artifact it exports describe the same months.
- A role dimension on the audit surface: each employee row names its person's role, and a viewer can display several roles' rows at once.
- Keep the authorized scope exactly as it is. Nothing in this change may widen what a role may read.

**Non-Goals:**

- No change to any role's data scope. `EMPLOYEE` still reads only their own row; the role filter narrows and never widens.
- No peer-evaluation or rating workflow. The role dimension makes the people an evaluator is responsible for findable and comparable; it introduces no evaluation records.
- No Week time frame, and no change to the ranking scope set (Company-wide, Department-wide, Employees in department).
- No change to the KPI scoring rules, the Jobs, Planning, Settings, or Audit Log apps, or the database schema.

## Decisions

**The period selection is a time frame plus a set of period keys, and one function expands it to months.**

A selection is `{ frame: "month" | "quarter" | "year", keys: string[] }`, where a key is `YYYY-MM` for the month frame, `YYYY-Qn` for the quarter frame, and `YYYY` for the year frame. `monthsForSelection(frame, keys)` is the single expansion point: a month key covers one month, a quarter key covers its three months (quarters never straddle a year), a year key covers its twelve months; the result is ordered oldest-first and de-duplicated.

Keeping the frame in the model (rather than letting the viewer pick raw months) preserves the Month/Quarter/Year vocabulary the time-frame selector already owns and keeps the frame's unit the thing the viewer manipulates. The alternative — a free month-range picker over raw months — was rejected because it cannot express a non-contiguous choice such as January 2026, March 2026, and February 2025, and because it would leave the Quarter and Year frames with nothing to mean.

The selection's months, not the keys, are what any read receives. Every read in the app — audit, dashboard, print, export — is given the same list, so there is no second notion of "the period" anywhere.

**The API's Performance period becomes a month list everywhere.**

The contract gains:

```graphql
input KpiMonthInput { periodYear: Int!  periodMonth: Int! }
input KpiPeriodSelectionInput { months: [KpiMonthInput!]! }
input KpiAuditFilter { months: [KpiMonthInput!]!  departmentId: ID }
```

`personalKpiDashboard`, `kpiScoreEvents`, and `printKpiReport` take `KpiPeriodSelectionInput`; the three audit levels and `exportAuditWorkbook` take the month-list `KpiAuditFilter`. `KpiPeriodInput` is removed rather than kept alongside.

Two shapes were considered and rejected. Keeping `periodYear`/`periodMonth` and adding an optional `months` field would leave one input with two ways to express a period, and every call site would have to know which form is in force. Keeping the API single-month and aggregating in the client would leave the server-side artifacts (the printed PDF, the exported workbook) describing one month while the screen describes several — the screen and its own export would disagree, which is the exact failure the consolidated selection state was built to prevent.

This is a breaking contract change, and it is deliberate: the frontend in this repository is the only client of the API, `API_CONTACT_SPECIFICATION.md` is updated in the same change, and the old single-month input is deleted rather than deprecated alongside the new one.

**The personal dashboard aggregates on the server; the audit rows keep merging in the client.**

The dashboard is a period-shaped object, so the server owns its aggregate. `PersonalKpiDashboard` reports the selected `months`, a `monthlyTotals` entry per month, and one period `summary` in place of the single month's summary. The personal tab then costs one request instead of the thirteen it costs today (one dashboard plus twelve trend reads), and `usePersonalTrend` disappears — the chart plots the months the dashboard already reports.

The audit levels keep their per-month grain, because their rows *are* monthly rows and the ranking chart needs one row per person per period merged into one row per person. `audit-merge.ts` stays the single owner of those merge rules and stays unit-tested; the server is not asked to re-implement them. The audit surface therefore keeps its existing fan-out — one read per selected month, each with the existing per-read row limit — and the month-list filter is what lets a single read carry several months for the export.

**The role dimension is additive and client-side.**

The audit row queries select `user { roles { id code name } }` alongside the existing brief fields; the `User` type already exposes them. The merged employee row carries `roles`, the detail table renders a Role column, and a multi-select role filter narrows the merged rows by role code.

Filtering client-side was chosen over a server-side `roleCode` filter because the rows are already in hand, because a filter can only ever remove rows the viewer may read, and because a server-side role filter would need a new filter field, a new join, and a new authorization question (who may filter by role?) for a narrowing that the client can do without trusting the client for anything but narrowing.

The role code is the filter's contract and the role name is its rendering, exactly as `frontend/display-labels` already requires for every other enum. The control is offered only when the authorized rows expose more than one distinct role — a `DEPT_HEAD` whose department holds one role, or an `EMPLOYEE` with their own row, are not shown a control that can only narrow to itself.

A "by role" ranking grain (one row per role) was considered and rejected: it replaces the people an evaluator is responsible for with an aggregate over them, which is the opposite of "make several roles visible so I can evaluate the people in them".

**The scope note names the viewer's role.**

`scopeLockedNote` becomes a message with a `{role}` value filled from the role label registry. The note is the only explanation the surface gives a fixed-scope viewer of why they see one row; naming the role answers "which role am I in this as?" without exposing a code, and it is the smallest honest improvement available to a viewer whose authorized rows the API will not widen.

**Both new controls are the existing multi-select combobox, and the option lists are bounded.**

The period picker and the role picker are the same Base UI `Combobox` in multiple mode with chips, which this codebase already uses for multi-select assignment. The period picker's options are bounded so the list stays usable: 36 months (the three calendar years ending with the current year), 12 quarters (the same three years), and 7 years (the current year ±5, biased to the past). The window is derived from the current date rather than from the data, so it does not need a read to render and cannot silently change when a summary is recorded.

**The single-month anchor controls are removed from the Performance app.**

The header's `‹ ›` month stepper and the personal dashboard's year switcher are replaced by the shared selection. Two period controls on one screen would let the score card and the chart describe different periods, which is the failure mode the consolidated selection state exists to prevent. The dashboard's score card, summary, composition, event list, and trend chart all describe the selection's months.

**The merge rules are defined once and mirrored where the server owns the artifact.**

Counters (tasks assigned, completed on time, overdue, returned, extensions, unapproved leave, perfect-attendance bonus) and the total KPI score sum across the selected months; the attendance rate is the mean of the months that reported one, rounded to two decimals, matching the existing `round2` behaviour in `audit-merge.ts`. The server owns this rule for the dashboard aggregate and the printed report; the client owns it for the audit-row merge. Both are covered by tests, and both report the same numbers for the same months.

## Risks / Trade-offs

- **A wide period selection issues one audit read per month.** The Year frame already issues twelve reads today, so this is the existing pattern scaled by the viewer's choice, bounded at 36 months by the option window. → Each read is independent and a month that fails drops out of the merge instead of failing the surface, which is the behaviour the current fan-out already has.
- **The exported workbook grows with the number of selected months.** The artifact is generated server-side and already contains one row per summary; a 36-month selection is 36× the rows. → The option window bounds the selection, and the workbook remains a single artifact rather than one per month.
- **The contract change is breaking for any client outside this repository.** → The frontend is the only client here, the contract document is updated in the same change, and the old input is removed rather than left as a second way to say the same thing.
- **The personal dashboard's "Monthly summary" table now summarises several months.** → It is retitled to a period summary and the score card names the selected period, so the reader is never told a multi-month total is a month.
- **A month in the selection with no recorded summary contributes nothing to the dashboard aggregate.** → It is reported in `monthlyTotals` and plots as a zero-height bar, matching the existing trend behaviour for a month with no summary.
- **The role filter can hide every row.** → The empty state already explains that no KPI summaries are in scope for the period; the role filter's contribution is named in the message so the reader knows it was their narrowing, not missing data.
- **Two role sets on one row (a user with more than one role) would need a row-level rule.** → The Role column renders every role the person holds, and the filter matches a row when it holds any selected role, so a multi-role person stays visible under either role.

## Migration Plan

No database migration: the tables, the columns, and the scoring rules are untouched, and the month list is a query input, not stored state.

The contract change ships as one commit that updates the GraphQL schema, the resolvers, the domain functions, the report generators, the frontend queries and components, and `API_CONTACT_SPECIFICATION.md` together, because the frontend and the backend are deployed from this repository as one application. Rollback is a revert of that commit; there is no persisted state to unwind and no data written by the new period model.

## Open Questions

None. The selection's shape, the option window, the role filter's semantics, the aggregate rules, and the contract's month-list inputs are all resolved above.
