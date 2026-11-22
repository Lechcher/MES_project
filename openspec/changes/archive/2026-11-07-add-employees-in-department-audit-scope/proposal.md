# Proposal

## Why

The audit surface offers only two grains: one row per employee company-wide, and one row per department. A viewer who wants the employees of *one* department — not the whole company, and not an aggregate — has no way to ask for it, even though the API's `KpiAuditFilter` already accepts `departmentId` and `kpiAuditLevel3Employee` already serves exactly that grain.

## What Changes

- Add a third ranking scope, **Employees in department**, alongside Company-wide and Department-wide. Selecting it adds a department selector, and the ranking chart and detail table then list that department's employees.
- The new scope reuses the existing per-employee grain and column set; it narrows rows to one department rather than introducing a new row shape.
- Scope availability follows the existing rule: the scope is offered only where a role has an authorized Level 3 read. A `DEPT_HEAD`'s department is fixed by the backend, so its picker is disabled; an `EMPLOYEE` is not offered the scope at all.
- The selected department becomes part of the selection state the performance view already owns, so the chart and the table can never describe different scopes.
- No backend, database, migration, or GraphQL contract change. No `API_CONTACT_SPECIFICATION.md` change.

## Capabilities

### New Capabilities
<!-- None. This extends an existing capability rather than introducing a new one. -->

### Modified Capabilities
- `frontend/performance`: the audit surface's scope set grows from two grains to three, a department selector appears and constrains the employee grain, and the ranking chart and detail table gain the third grain's behavior.

## Impact

- `frontend/src/lib/mes/queries/access.ts` — `AuditScopeCode` gains a member and `auditScopeFor` reports the department-list grain and whether a viewer may choose the department.
- `frontend/src/components/performance/performance-view.tsx` — owns the selected department in the existing selection-state object and renders the department selector when the new scope is active.
- `frontend/src/components/performance/audit-chart-and-table.tsx` — renders the third grain's chart and table.
- `frontend/src/components/performance/use-audit-period.ts` — forwards `departmentId` in the audit filter for the new scope.
- `frontend/src/lib/mes/queries/performance.ts` — no change; `kpiAuditLevel3Employee` is already reachable through `KPI_AUDIT_QUERY`.
- `frontend/messages/en.json` and `frontend/messages/vi.json` — the new scope's label, the department selector's labels, and the no-department-selected state.
- `frontend/src/lib/mes/audit-merge.ts` and `frontend/src/lib/mes/audit-period.ts` — unchanged; the new grain merges through the existing employee merge.
- Tests: unit coverage for the scope resolution and the filter forwarding, plus e2e coverage for the selector, the narrowed rows, and the prompt state.
- Out of scope: the export workbook still exports the selected month rather than the selected time frame, which remains a separate open question.
