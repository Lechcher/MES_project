# Design

## Context

The audit surface settled on one selection-state object in `PerformanceView` (`tab`, `auditScope`, `timeFrame`, `anchorYear`, `anchorMonth`, `trendYear`) so the ranking chart and the detail table can never describe different periods. Rows come from `useAuditPeriod`, which resolves the grain from `AuditScope` and issues one read per covered month, then merges through `audit-merge.ts`.

Two shaping facts matter for this change:

- `KpiAuditFilter` already carries `departmentId`, and `kpiAuditLevel3Employee` is already reachable via `KPI_AUDIT_QUERY("level3")`. The only gap is that `useAuditPeriod` never puts `departmentId` in the filter object. This is a frontend-only gap.
- `getAuditLevel3` in the backend forces `departmentId = auditDepartmentScope(ctx) ?? filter.departmentId`, so a `DEPT_HEAD`'s department is fixed server-side no matter what the selector says. The frontend must not pretend otherwise.

`schedule-toolbar.tsx` already holds the project's department-filter precedent: a shadcn `Select` beside the other selectors, options keyed by `department.id` with `department.name` as the option's content, from `DEPARTMENTS_QUERY` typed as `{ departments: DepartmentRef[] }`.

## Goals / Non-Goals

**Goals:**

- Add a third ranking scope whose rows are the employees of one chosen department.
- Keep the chart and the table on one selection state, extending the existing object rather than adding a second source of truth.
- Derive scope availability from `auditScopeFor`, not from new role booleans.
- Reuse the existing employee merge and the existing employee-level column set, so the new grain adds no new row shape.

**Non-Goals:**

- No backend, schema, migration, or `API_CONTACT_SPECIFICATION.md` change.
- No change to `audit-merge.ts` or `audit-period.ts`; the new grain merges through the existing employee merge.
- No nested/expandable department rows, and no change to the Department-wide scope's own rows.
- No change to the export workbook's period, which remains a separate open question.

## Decisions

**The new scope is a third `AuditScopeCode`, not a modifier on `company`.**
`"employees-in-department"` joins `AuditScopeCode` as a first-class member. Making it a modifier on the company scope would have forced every consumer of `AuditScopeCode` to reason about two variables at once; a third member keeps one variable that names one grain. The alternative — reusing `"company"` with an optional `departmentId` — was rejected because "Company-wide" would then mean two different row sets depending on a filter, and the existing message keys and e2e selectors would be describing a scope that no longer means what they say.

**`auditScopeFor` reports the new grain rather than new booleans.**
`AuditScope` gains a `departmentSource` field for the employee-in-department read and a `canChooseDepartment` flag. Fields, not booleans, because the existing shape already reports "which rows may this role read" — `level3` for a company-wide or department-wide viewer, `personal` for an `EMPLOYEE` — and a boolean pair would have restated the same information twice. Concretely:

| Role | `scopes` | employee read | department read | may choose a department |
| --- | --- | --- | --- | --- |
| `SUPER_ADMIN`/`TECH_LEAD`/`HR_MANAGER` | `company`, `department`, `employees-in-department` | `level1` | `level2` | yes |
| `DEPT_HEAD` | `company`, `employees-in-department` | `level3` | `null` | no |
| `EMPLOYEE` | — | `personal` | `null` | no |

`DEPT_HEAD` gets the new scope because it is the grain they are already confined to, and offering it makes their confinement visible rather than hidden behind a "Company-wide" label that quietly means "my department". `EMPLOYEE` is not offered it, since no per-department employee read is authorized for them.

**`departmentId` is forwarded into the audit filter only for the new scope.**
`readAuditPeriod` takes an optional `departmentId` and includes it in `variables.filter` when present. `level1` and `level2` keep their current unfiltered behavior — passing a stray `departmentId` to them would silently change what company-wide ranking means. The parameter lives in `readAuditPeriod` rather than in a new function so there stays exactly one place that builds audit filter variables.

**The department selector reads `DEPARTMENTS_QUERY` and is disabled when the role cannot choose.**
It appears only while the new scope is active, matching `schedule-toolbar.tsx`'s pattern, and is disabled for a `DEPT_HEAD` where the backend forces the department anyway. Disabled rather than hidden, so the surface still tells that viewer which department their rows are scoped to. A disabled `Select` whose value is the forced department id is the honest rendering — the label comes from the department list read.

**The default department is the viewer's own, and absent any department the surface prompts.**
Pre-selecting the viewer's own department avoids an empty chart on first open and matches what a `DEPT_HEAD` would see. When the viewer has no department of their own and has chosen none, the hook resolves no rows and the component renders a prompt asking them to choose a department — an explicit selection prompt, which is distinct from the existing "no KPI summaries in scope for this period" empty state, so it gets its own messages rather than reusing those keys.

**`selectedDepartmentId` lives in the existing selection object.**
It joins `PerformanceSelection` rather than becoming a second `useState`. This is the same reason the state was consolidated before: one render's chart and table must agree.

## Risks / Trade-offs

- **A disabled scope selector for `EMPLOYEE` now describes three scopes it cannot pick.** → The selector's disabled state and its message explain that the role's data scope decides the rows, as it already does for the two existing scopes. No new explanatory copy is invented.
- **The Department/Division column repeats the chosen department on every row.** → Kept rather than removed, so the employee grain's columns stay identical to Company-wide and the chart and table keep one column set. Repetition of a genuinely constrained value is not the same as showing a record identifier, which the spec forbids.
- **A department with no KPI summaries in the period reads as empty.** → The existing "no KPI summaries are available in scope for that period" empty state covers it; the new prompt state is only for "no department chosen", so the two are not conflated.
- **`DEPARTMENTS_QUERY` returns every department regardless of period.** → Acceptable: the read is one request, cached by `useApiQuery`, and the list is small. The audit reads still carry the time frame, so adding a department cannot widen the period.
- **A department id that is later deactivated or deleted could persist in selection.** → The hook treats a missing-department read as an empty result rather than an error, so the surface degrades to the empty state instead of a broken table.

## Migration Plan

Frontend-only, additive. No schema, data, or contract change, so there is nothing to migrate and no rollback beyond reverting the commit. `openspec/specs/frontend/performance/spec.md` is updated by this change's delta at archive time.

## Open Questions

None. The scope's shape, role availability, default department, and prompt state are all resolved above; the export workbook's period is deliberately left to a separate change.
