# Tasks

## 1. Scope resolution

- [x] 1.1 Add `"employees-in-department"` to `AuditScopeCode` in `frontend/src/lib/mes/queries/access.ts`, and extend `AuditScope` with the employee-in-department read and a `canChooseDepartment` flag, then verify `cd frontend && bunx tsc --noEmit -p tsconfig.json` reports no new error.
- [x] 1.2 Update `auditScopeFor` in `frontend/src/lib/mes/queries/access.ts` so `SUPER_ADMIN`/`TECH_LEAD`/`HR_MANAGER` get all three scopes with a choosable department, `DEPT_HEAD` gets `company` plus `employees-in-department` with a fixed department, and `EMPLOYEE` gets no selectable scopes; verify by extending `frontend/src/lib/mes/queries/access.test.ts` with one case per role asserting the scope list, the employee read, and `canChooseDepartment`, and running `cd frontend && bun test src/lib/mes/queries/access.test.ts` — every case passes.
- [x] 1.3 Find and update every consumer that assumed `AuditScopeCode` had exactly two members (the scope selector's label keys, the `effectiveScope` fallback in `frontend/src/components/performance/performance-view.tsx`, and `frontend/src/components/performance/audit-chart-and-table.tsx`), then verify `cd frontend && bunx tsc --noEmit -p tsconfig.json` is clean and `cd frontend && bun run lint` reports no error.

## 2. Department data and filter forwarding

- [x] 2.1 Extract the audit filter-variable construction out of `readAuditPeriod` in `frontend/src/components/performance/use-audit-period.ts` into a pure exported function in a new `frontend/src/components/performance/audit-filter.ts` that takes a period and an optional `departmentId` and includes `departmentId` only when it is a non-empty string; verify with a new `frontend/src/components/performance/audit-filter.test.ts` covering an absent, an empty-string, and a present `departmentId`, run via `cd frontend && bun test src/components/performance/audit-filter.test.ts` — all cases pass.
- [x] 2.2 Thread `departmentId` through `UseAuditPeriodArgs` and the hook's serialized effect key so changing the department re-issues the reads, resolve it through the employee-in-department read rather than the company or department read, and verify `cd frontend && bunx tsc --noEmit -p tsconfig.json` is clean.
- [x] 2.3 Confirm no backend change is required by reading `getAuditLevel3` in `backend/src/domain/kpi.ts` and `KpiAuditFilter` in `API_CONTACT_SPECIFICATION.md` and verifying the employee-in-department read needs no new operation or field, then verify `cd backend && bun test` still passes with 0 failures and that no backend file appears in `git status --short -- backend/src`.

## 3. Department selector, prompt state, and messages

- [x] 3.1 Add a pure `effectiveDepartmentId(selected, viewerDepartmentId)` resolver in `frontend/src/lib/mes/audit-merge.ts`'s neighbourhood — a new `frontend/src/lib/mes/audit-department.ts` — that returns the selected department when one is chosen, otherwise the viewer's own department, otherwise `null`; verify with `frontend/src/lib/mes/audit-department.test.ts` covering selected, fallback, and neither, run via `cd frontend && bun test src/lib/mes/audit-department.test.ts` — all cases pass.
- [x] 3.2 Add `selectedDepartmentId` to the selection-state object in `frontend/src/components/performance/performance-view.tsx`, and render a department selector beside the existing scope and time-frame selectors only while the `employees-in-department` scope is active, following the `schedule-toolbar.tsx` pattern (shadcn `Select`, options keyed by `department.id` with `department.name` as content, populated from `DEPARTMENTS_QUERY`), disabled when `canChooseDepartment` is false; verify `cd frontend && bunx tsc --noEmit -p tsconfig.json` is clean and `cd frontend && bun run lint` reports no error.
- [x] 3.3 Render the third grain in `frontend/src/components/performance/audit-chart-and-table.tsx` — chart and table both narrow to the department's employees with the existing employee-level column set, the department selector's target flows through the hook, and a no-department-selected state asks the viewer to choose a department instead of showing an empty table; verify `cd frontend && bunx tsc --noEmit -p tsconfig.json` is clean.
- [x] 3.4 Add the new scope's label, the department selector's label, and the choose-a-department prompt's title and description to `performance.audit` in `frontend/messages/en.json` and `frontend/messages/vi.json`, verify `cd frontend && bun test src/lib/mes/i18n/locale-parity.test.ts` and `cd frontend && bun test src/lib/mes/queries/registries.test.ts` both pass, and that every new key is used by a component so no orphan key remains.

## 4. E2E coverage

- [x] 4.1 Extend `frontend/tests/pages/performance/dashboard.ts` with a `departmentSelect` locator and a `selectDepartment` action for the new scope, then verify the file compiles under `cd frontend && bunx tsc --noEmit -p tsconfig.json`.
- [x] 4.2 Add cases to `frontend/tests/performance/kpi.spec.ts` covering: the department selector appearing with the new scope; choosing a department narrowing the chart and table to that department's employees; a `DEPT_HEAD` seeing a disabled department selector; and an `EMPLOYEE` not being offered the new scope; then verify with `cd frontend && bunx playwright test tests/tests/performance/ --project=chromium --reporter=line` — every performance test passes.

## 5. Integration verification

- [x] 5.1 Apply the delta in this change's spec file to `openspec/specs/frontend/performance/spec.md` so the main spec carries the three-scope behaviour, then verify with `openspec validate "frontend/performance" --type spec --strict` and `openspec validate "add-employees-in-department-audit-scope" --strict` — both valid.
- [x] 5.2 Run the frontend verification sweep — `cd frontend && bunx tsc --noEmit -p tsconfig.json`, `cd frontend && bun run lint`, and `cd frontend && bun test src/` — and verify types clean, lint clean, and every unit test passing.
- [x] 5.3 Run the backend suite with `cd backend && bun test` and verify it passes with no change to the API contract, confirming this change is frontend-only.
- [x] 5.4 Run the performance e2e suite with `cd frontend && bunx playwright test tests/tests/performance/ --project=chromium --reporter=line` and verify all performance specs pass, noting that any failure outside `tests/tests/performance/` is the pre-existing `demo@mes.local` breakage left out of scope.

## Workflow follow-up

- Commit to `main` directly per the single-branch convention, with a conventional commit message and a `Co-authored-by: AI Agent <agent@local>` trailer.
- Archive the change with `/opsx-archive` once the implementation is reviewed and accepted.
