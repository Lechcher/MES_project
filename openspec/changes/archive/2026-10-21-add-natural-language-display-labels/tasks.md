# Tasks

## 1. Label registry and the technical-role gate

- [x] 1.1 Extend `frontend/src/lib/mes/queries/registries.ts` with label tables for every user-facing enum — `PRIORITY_LABELS` (Low/Medium/High/Urgent), `TASK_TYPE_LABELS` (Hourly/Daily/Multi-day), `APPROVAL_STATUS_LABELS` (Pending/Approved/Rejected), `TASK_REQUEST_TYPE_LABELS` (Extension Request/Late Submission Explanation), `DEPARTMENT_TYPE_LABELS` (Department/Division), `EXPORT_FORMAT_LABELS`, and `ROLE_CODE_LABELS` (Super Admin/Tech Lead/HR Manager/Department Head/Employee) — plus a shared `MODULE_LABELS` hoisted from `MODULE_NAMES` in `rbac.tsx` and aligned with `AUDIT_LOG_MODULES` in `access.ts`, and a `labelFor(code, table)` helper whose fallback returns the input unchanged for non-enum strings; verify with `bun test` unit tests asserting a lookup per enum and the identity fallback for an unknown code.
- [x] 1.2 Add a registry-coverage test asserting every value of every covered enum (values mirroring the canonical lists in `backend/src/db/enums.ts`) has a non-empty label and that no label merely repeats its code; verify with `bun test`, and confirm it fails when a label is temporarily removed, then restored.
- [x] 1.3 Update `TASK_STATE_BADGE_LABELS` to the "Active — …" forms ("Active — Urgent Processing", "Active — Progress Update", "Active — Awaiting Extension Approval", "Active — Awaiting Progress Verification") in `registries.ts`, keeping `taskStateBadgeLabel`'s percentage interpolation; verify the existing badge-label test (or a new one) still passes with `bun test`.
- [x] 1.4 Add one `isTechnicalViewer(role)`-style predicate beside the existing access helpers in `frontend/src/lib/mes/queries/access.ts` (`TECH_LEAD` or `SUPER_ADMIN`) and use it to guard the codes-as-content surfaces (RBAC permission list, audit trail rows, the Org Structure code field); verify with `bun test` unit tests asserting true for exactly those two role codes.

## 2. Shared badges

- [x] 2.1 Update `frontend/src/components/shared/state-badge.tsx` to render the English name alone (no `(CODE)` suffix) for both ticket states and leave codes, and make `compact` render the truncated name with the full name as its `title` instead of the bare code; verify by reading the component and confirming no branch renders the raw code, and that the planning calendar/approval-board usages still show a label through `bun test` or a manual page check.
- [x] 2.2 Update `frontend/src/components/shared/secondary-badge.tsx` so its badge text comes from the new registry labels (no `ACT - ` prefix); verify the label renders as "Active — Progress Update (X%)" style text in a quick manual check.

## 3. Jobs sweep — enums and identifiers

- [x] 3.1 Update `frontend/src/components/jobs/jobs-view.tsx`: state, priority, and task-type filter dropdowns list English labels ("All states"/"All priorities"/"All types" retained), the priority/task-type cells show labels, and the task-code column is removed from the table; verify with `grep` that no SelectItem, cell, or column renders the raw enum values or `task.taskCode`, plus a manual Jobs-list check showing "Medium", "Daily", "Pending" and no code column.
- [x] 3.2 Update `frontend/src/components/jobs/quick-add-view.tsx`: the priority cell shows its label and the task-code cell is removed; verify with `grep` that `task.taskCode` and the raw priority are gone, plus a manual quick-add check.
- [x] 3.3 Update `frontend/src/components/jobs/task-detail-view.tsx`: priority, task type, request type, and the `StateBadgeStatus` status pill show labels, and the page title no longer quotes the task code; verify with `grep` and a manual ticket-detail check.
- [x] 3.4 Update `frontend/src/components/jobs/task-request-review.tsx` so the pending request shows an English status label instead of the raw code; verify with `grep` and a manual request-review check.
- [x] 3.5 Update `frontend/src/components/jobs/create-ticket-view.tsx`: task-type and priority select options render labels, and the assignee dropdown shows the department's name (`· ${user.department.name}`); verify with `grep` and a manual create-form check listing "Hourly", "Medium", and a named department.

## 4. Planning sweep — enums and identifiers

- [x] 4.1 Update `frontend/src/components/planning/leave-requests.tsx`: `StatusPill` shows the English status label and the leave-code filter lists leave names; verify with `grep` and a manual Leave Requests check ("Pending", "Annual Leave").
- [x] 4.2 Update `frontend/src/components/planning/approval-board.tsx`: pending request types render as labels, the task-code cells are removed, and the approve/return confirmation messages no longer quote the task code or state codes (e.g. "Ticket approved — positive KPI recorded." with the state change expressed in words or omitted); verify with `grep` that no cell or message renders `task.taskCode` or `PEN → APP`-style tokens.
- [x] 4.3 Update `frontend/src/components/planning/attendance-summary.tsx` so the leave column beside the name shows the leave name (the redundant code cell is removed) and the Employee ID column is removed from the summary table; verify with a manual Attendance & Balances check showing names and leave names only.
- [x] 4.4 Update `frontend/src/components/planning/matrix-calendar.tsx` so person row labels show the name (not the user code) and day-cell badges render the truncated leave name with the full name as `title`; verify with a manual matrix-calendar check.
- [x] 4.5 Update `frontend/src/components/planning/penalty-leave.tsx` so the assignee options read the person's name without the parenthesized user code; verify with a manual penalty-leave check.
- [x] 4.6 Replace the `PENDING` code mentions in `frontend/src/components/planning/create-leave-view.tsx` (toast + description) and `frontend/src/components/planning/planning-view.tsx` (description) with "Pending"; verify with `grep -rn "PENDING"` over `src/components/planning` returning no display copy.

## 5. Performance, Settings, Audit Log, and shell sweep

- [x] 5.1 Update `frontend/src/components/performance/audit-tables.tsx`: remove the Employee ID columns (Levels 1 and 3) and the Department Code column (Level 2), and show the department's name in the Level 2 name column; verify with `grep` that those headers and `user.userCode` renders are gone, plus a manual Performance check.
- [x] 5.2 Update `frontend/src/components/performance/personal-dashboard.tsx` to drop the KPI rule code column (event + description carry the meaning); verify with a manual Personal KPI Dashboard check.
- [x] 5.3 Update `frontend/src/components/settings/user-directory.tsx`: remove the user-code column from the directory listing while the create/edit form keeps its code input; verify with `grep` that no table cell renders `user.userCode` and the draft input still binds `userCode`, plus a manual User Directory check.
- [x] 5.4 Update `frontend/src/components/settings/org-structure.tsx`: the type column and the create/edit select show Department/Division, and the code column stays as the technical-surface content (guarded by the 1.4 predicate where the component branches on role); verify with `grep` that the raw `DIVISION` option is gone and the code field remains, plus a manual Org Structure check as a technical role.
- [x] 5.5 Update `frontend/src/components/settings/rbac.tsx`: role listings show role names (dropping `code — name`), module group headings show module names from the shared registry, and permission codes stay as the RBAC content; verify with `grep` that the local `MODULE_NAMES` map is gone and no role code is displayed, plus a manual RBAC check.
- [x] 5.6 Update `frontend/src/components/audit-log/audit-log-view.tsx` so the module filter lists module names and the technical-role gate from 1.4 leaves audit row codes (module/action/resource) as content; verify with a manual Audit Log check as a technical role ("Jobs & Projects" in the filter, codes intact in rows).
- [x] 5.7 Update `frontend/src/components/shell/app-nav.tsx` so the viewer's entry shows the name and role without the user code; verify with `grep` that `viewer.userCode` is no longer rendered, plus a manual nav check.

## 6. Verification

- [x] 6.1 Run `bun test` in `frontend/` (registry, coverage, access-predicate, badge-label, and existing suites) and confirm everything passes; verify the run reports 0 failures.
- [x] 6.2 Grep `frontend/src` for remaining raw-enum and identifier render sites — `{task.priority}`, `{task.taskType}`, `{request.status}`, `{request.requestType}`, `.department.code` used as a qualifier, `{task.taskCode}`, `{user.userCode}`, `PENDING|EXTENSION|HOURLY|MEDIUM|DIVISION` in JSX — and fix any leftovers; verify the grep returns only legitimate logic comparisons (filters, conditionals, form inputs) and no displayed text.
- [x] 6.3 Run `bun run lint` in `frontend/`, the backend `bun test` suite, backend `bun run typecheck`, and `next build` in `frontend/`; verify all exit 0 and the build shows the module pages prerendered unchanged.
- [x] 6.4 Manually walk the app as a non-technical role (e.g. `HR_MANAGER`) and then as `TECH_LEAD`: every enum surface reads as English labels, no task/user/employee/department identifier appears on user-facing screens, and the technical apps (Org Structure, RBAC, System Audit Logs, Audit Log) keep their codes as content; record the observed screens in the change's review notes.

## Workflow follow-up

- After implementation review: `/opsx-archive add-natural-language-display-labels` merges the new capability into `openspec/specs/frontend/display-labels/` and the removals/modifications into the existing specs.
- Optional after archive: sweep `docs/` for any doc that documents code display in the UI and align it with the label rule.
