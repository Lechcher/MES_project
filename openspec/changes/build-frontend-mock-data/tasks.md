# Tasks

## 1. Branch & scaffold hygiene

- [x] 1.1 Verify the working branch is `ai/opencode/build-frontend-mock-data` (create it with exactly that name only if missing; never commit to a protected branch). Record `git status --porcelain` at the start so the pre-existing unrelated uncommitted changes are known and excluded from every later commit. Verify: `git branch --show-current` prints the branch name.
- [x] 1.2 Replace the create-next-app remnants: rewrite `frontend/src/app/page.tsx` as a temporary launcher placeholder and set real app metadata ("MES Prototype") in `frontend/src/app/layout.tsx`. Verify: `bun run dev` inside `frontend/` renders the placeholder with the new title and no template content.
- [x] 1.3 Update `frontend/README.md` to describe the MES frontend prototype, the run commands (`bun install`, `bun run dev`), and that it runs on mock data only. Verify: a read-through matches the actual scripts in `package.json`.

## 2. Theme foundation (current `DESIGN.md`)

- [x] 2.1 Re-token `frontend/src/app/globals.css` to the current `DESIGN.md`: canvas `#ffffff`, primary IBM Blue `#0f62fe`, ink scale `#161616`/`#525252`/`#8c8c8c`, surfaces `#f4f4f4`/`#e0e0e0`, hairlines, semantic success `#24a148` / warning `#f1c21b` / error `#da1e28`; collapse the radius scale to 0 (4px for dropdown menus per `DESIGN.md`); map `--chart-*` to the semantic palette; remove the `.dark` block (light-only app). Verify: the running app renders a white page with IBM Blue primaries and no visible rounded corners.
- [x] 2.2 Switch fonts in `frontend/src/app/layout.tsx` to IBM Plex Sans (weights 300/400/600) via `next/font/google`, fix the self-referential `--font-sans` wiring in `globals.css`, and remove Geist. Verify: the computed `font-family` on `body` is IBM Plex Sans and no Geist variable remains.
- [x] 2.3 Add the shadcn primitives this build needs via the shadcn CLI in `frontend/` — card, badge, table, tabs, input, label, textarea, select, checkbox, switch, separator, avatar, tooltip, dropdown-menu, dialog, skeleton, pagination — composing any the registry lacks from existing primitives. Verify: the files exist under `frontend/src/components/ui/` and `bun run build` passes.
- [x] 2.4 Conform the primitives to the flat-square aesthetic: replace hardcoded `rounded-*` classes with token-driven radii so buttons, cards, and inputs render 0px corners (2px small badges and 4px dropdown menus only). Verify: a visual scan of a scratch page shows no rounded buttons, cards, or inputs.
- [x] 2.5 Commit the theme work on the branch, staging only `frontend/**`, with the AI co-author trailer per `AGENTS_GIT.md`. Verify: `git log` shows the commit and `git status` still lists the pre-existing unrelated changes unstaged.

## 3. Mock data layer (`frontend/src/lib/mock/`)

- [x] 3.1 Create `types.ts` (domain types mirroring the GraphQL contract: camelCase fields, `OffsetPageInfo`, nullable relations) and `registries.ts` (ticket-state registry `REQ`/`ACT`/`PEN`/`APP`/`REJ`/`CAN`/`OVERDUE` with names, colors, terminal flags; leave-code registry `AL`/`UAL`/`SL`/`USL`/`PL`/`ML`/`CL`/`EL`/`LWP`/`TOIL`/`VTO` with categories, payroll rules, penalty/balance flags; KPI point rules — all from the SQL seed). Verify: `bunx tsc --noEmit` passes and every code matches the contract verbatim.
- [x] 3.2 Create `db.ts`: a module-level store seeded deterministically relative to the current date — org tree (departments/divisions, managers, Auto-forking flags), ~15 users including the 5 demo accounts (one per role), roles + permissions + grants per the matrix, projects (incl. General Operations), 40+ tasks covering every state, every task type, and all four `ACT` secondary badges, progress logs, state transitions, requests, filename-only attachments, current-month attendance, leave requests (approved, pending, `UAL`/`USL` penalty cases), overtime feeding TOIL, `AL`/`TOIL` balances, KPI events and monthly summaries (current + previous month), audit rows for all three levels, seeded system audit entries, app settings, and the webhook config. Verify: every seed-coverage requirement in the mock-data spec is present.
- [x] 3.3 Create `session.ts` (viewer context provider, sign-out, reload-clears-session) and a permission helper `can(viewer, permissionCode)` plus scope constants mirroring the seeded grants. Verify: a temporary debug render lists each demo account's effective permissions matching the matrix grant table.
- [x] 3.4 Implement `services/jobs.ts` plus shared plumbing: role-scoped paginated list/detail reads; mutations (accept, log progress, submit report, approve, return, cancel with mandatory reason, request extension, explain late submission, review request, create task with task-type deadlines and Auto-forking) enforcing the documented lifecycle and appending transitions, KPI events per the fixed rules, and audit entries; plus the shared mock export-result descriptor. Verify: driving each mutation from a temporary scratch page performs the documented transitions and rejects invalid ones (cancel without reason; accept on an `ACT` ticket).
- [x] 3.5 Implement `services/planning.ts`: role-scoped matrix calendar rows, attendance records, leave requests with register/review flows, `UAL`/`USL` penalty assignment (`HR_MANAGER`/`SUPER_ADMIN` only), and leave balances (Employee: own `AL`/`TOIL` only). Verify: scoped reads return the correct row sets per role on the scratch page.
- [x] 3.6 Implement `services/performance.ts` and `services/settings.ts`: personal dashboard, score events, point rules, the three audit levels with role scoping; user create/update/reset-password/deactivate, departments, role-permission updates, app settings, webhook update, and the append-only system audit log with filters. Verify: each service returns contract-shaped data and every write appends an audit entry.
- [x] 3.7 Remove the temporary scratch/debug pages and commit the mock layer (staging only `frontend/**`). Verify: `bun run build` passes with no scratch remnants and `git log` shows the commit.

## 4. App shell

- [x] 4.1 Build `/signin`: one card per demo account (name, email, role, department; no password); selecting an account establishes the viewer and opens the dashboard; app routes without a viewer redirect to `/signin`. Verify: all three sign-in scenarios from the `frontend/app-shell` spec pass in the browser.
- [x] 4.2 Build the shell chrome: top navigation listing the dashboard plus only the viewer-permitted apps, user menu (name, role, department, sign-out, switch account), and the inverse charcoal footer. Verify: signing in as each of the five roles lists exactly the permitted nav entries.
- [x] 4.3 Build the Home Page Dashboard launcher: role-gated entries — Jobs, Planning, Performance for every role; Settings for `SUPER_ADMIN`/`TECH_LEAD` (all menus) and `HR_MANAGER` (User Directory only); no Audit Log entry (that app ships with `add-audit-log-module`). Verify: the launcher scenarios pass for all five roles.
- [x] 4.4 Build shared UI: the registry-driven `StateBadge` (ticket states and leave codes with their documented colors) and the shared mock print/export result dialog. Verify: badges for all 7 states and a sample leave code render with the documented colors and labels.
- [x] 4.5 Commit the shell work (staging only `frontend/**`). Verify: `git log` shows the commit; unrelated changes remain unstaged.

## 5. Jobs app

- [x] 5.1 Ticket list `/jobs`: the `[ Yesterday ] [ Today ] [ Tomorrow ]` day-navigation bar, filters (state, priority, task type, overdue, urgent, project, department, search), role-scoped rows with state and secondary badges, priority/type/progress/assignee/deadline columns, and offset pagination. Verify: the ticket list scenarios pass (Employee own-only scope, `PEN` filter, day jump).
- [x] 5.2 Ticket detail `/jobs/tasks/[id]`: full info, progress log, transition history, requests, attachments; state- and role-valid actions (Accept, Log Progress, Complete/Submit Report, Approve, Return, Report Late Submission/Explanation, Cancel with mandatory reason); Complete locked on `OVERDUE`; Late Submission tag; multi-day milestone labels (25% Outline/Wireframe, 50% Draft/Rough, 75% Testing/Review, 100% Acceptance). Verify: a full `REQ → ACT → PEN → APP` walkthrough plus the `REJ`, `CAN`, and `OVERDUE` paths behave per the jobs spec.
- [x] 5.3 Create ticket `/jobs/new` with the `+ Create New Ticket` button rendered only for non-`EMPLOYEE` roles: task types with documented deadlines (hourly slots 10:30/14:00/16:30; daily 17:00/18:00 same-day; multi-day start/end), project default General Operations, priority default `MEDIUM`, Auto-forking replication to department members. Verify: the create-form scenarios pass (hourly 14:00 deadline; Auto-forking ×3; Employee sees no button).
- [x] 5.4 Daily Quick-add `/jobs/quick-add`: the day's unconfirmed `REQ` tickets with quick-accept actions. Verify: opening on a seeded day lists `REQ` tickets with a working Accept action.
- [ ] 5.5 Extension request + review flow on the ticket detail, and Jobs print/export buttons (assignment slip with time log and comments; filtered task list — mock results, Employee personal-only). Verify: the extension approve/reject scenarios pass and print/export open the mock result dialog.
- [x] 5.6 Commit the Jobs app (staging only `frontend/**`). Verify: `git log` shows the commit; unrelated changes remain unstaged.

## 6. Planning app

- [x] 6.1 Matrix calendar tab: role-scoped rows (personal / department / company-wide with department filter), days of the selected month as columns, Gantt-like ticket bars carrying state code + progress %, day-cell leave badges (`AL`, `SL`, …), `UAL`/`USL` tags, and late/early-leave marks. Verify: all matrix calendar scenarios pass per role.
- [ ] 6.2 Create Leave Request `/planning/leave/new`: leave-code select, date range, total days, reason, filename attachment, handover person; submission starts `PENDING`. Verify: the request appears in an approver's queue and the calendar shows the badge after approval.
- [ ] 6.3 Approval Board tab (hidden for `EMPLOYEE`; Department Work Approval + Department Leave Request Approval queues for `DEPT_HEAD`; System-wide Approval Board for `HR_MANAGER`/`SUPER_ADMIN`/`TECH_LEAD`): `PEN` work queue with Approve/Return (+KPI / −KPI events) and the extension/late-submission queue. Verify: approving/returning updates ticket state and emits matching KPI events.
- [ ] 6.4 Penalty-leave assignment (`UAL`/`USL`, offered to `HR_MANAGER`/`SUPER_ADMIN` only) and the Attendance & Balances tab (records with check-in/out, late/early flags, working hours, leave code; `AL Balance`/`TOIL Balance` per person in scope). Verify: the penalty scenarios pass, a `TECH_LEAD` sees no penalty action, and balances render per role.
- [ ] 6.5 Planning print/export buttons (leave request A4 with signature placeholder; department monthly attendance calendar A4 landscape; attendance `.xlsx` — all mock, scoped per role). Verify: each opens the mock result dialog with the correct format and scope.
- [x] 6.6 Commit the Planning app (staging only `frontend/**`). Verify: `git log` shows the commit; unrelated changes remain unstaged.

## 7. Performance app

- [ ] 7.1 Personal KPI tab: month selector, score card, donut chart (thin Chart.js wrapper), the viewer's own `AL Balance`/`TOIL Balance`, and recent KPI events. Verify: it renders for every role, and for `EMPLOYEE` it is the entire app.
- [ ] 7.2 Audit Table 1 and Table 2 tabs with their exact documented columns, Table 1 sorted by TOTAL PERFORMANCE SCORE descending, plus the company-wide ranking column chart — visible to `SUPER_ADMIN`/`TECH_LEAD`/`HR_MANAGER` only. Verify: the column headers match `SYSTEM_PROCESS_FLOW-en.md` verbatim and visibility is enforced.
- [ ] 7.3 Audit Table 3 tab with its exact documented columns, scoped to the own department for `DEPT_HEAD`, plus app-wide role gating (`DEPT_HEAD` never sees Tables 1/2; `EMPLOYEE` sees none). Verify: the level-visibility scenarios pass for all five roles.
- [ ] 7.4 Performance print/export (personal KPI report A4; audit-tables workbook `.xlsx` — mock results; `DEPT_HEAD` department-only, `EMPLOYEE` personal-only). Verify: scoped mock results are produced per role.
- [ ] 7.5 Commit the Performance app (staging only `frontend/**`). Verify: `git log` shows the commit; unrelated changes remain unstaged.

## 8. Settings app

- [ ] 8.1 Settings layout with role-gated menus: hidden for `EMPLOYEE`/`DEPT_HEAD`; `HR_MANAGER` sees only User Directory; `TECH_LEAD`/`SUPER_ADMIN` see User Directory, Org Structure, RBAC, Telegram Webhook, and System Audit Logs. Verify: the menu visibility scenarios pass for all five roles.
- [ ] 8.2 User Directory: searchable, filterable list (department, role, active status) with create, edit, reset password, and deactivate actions; every action appends an audit entry. Verify: the user-management scenarios pass and the actions appear in the audit trail.
- [ ] 8.3 Org Structure: department/division hierarchy (code, name, type `DEPARTMENT`/`DIVISION`, parent, manager, active state) with create/edit and the per-department Auto-forking toggle. Verify: toggling Auto-forking off for a department changes the Jobs create form behavior for that department.
- [ ] 8.4 RBAC view (the five roles with permissions grouped by module `jobs`/`planning`/`performance`/`settings`/`audit-log`, grant/revoke) and the Telegram Webhook form (bot token, alert group chat ID, webhook URL, enabled toggle; mock save). Verify: the RBAC and webhook scenarios pass with audit entries recorded.
- [ ] 8.5 System Audit Logs trail: newest-first read-only table (user, action, resource type, old/new values, timestamp, IP address) with user/action/resource-type/date-range filters and no edit or delete control anywhere. Verify: the trail scenarios pass (newest first; filter by user; no mutation controls).
- [ ] 8.6 Commit the Settings app (staging only `frontend/**`). Verify: `git log` shows the commit; unrelated changes remain unstaged.

## 9. Cross-cutting verification & wrap-up

- [ ] 9.1 Role-matrix walkthrough: sign in as each of the five demo accounts and check app visibility, tabs, and key hidden elements against the permission matrix. Verify: every visibility scenario in the `frontend/*` specs passes in one pass per role.
- [ ] 9.2 Theme conformance check across all apps: white canvas, IBM Blue `#0f62fe` CTAs, square corners, IBM Plex Sans, hairline borders, no drop shadows, inverse footer. Verify: visual inspection per the `frontend/app-shell` theme scenarios; fix every deviation found.
- [ ] 9.3 Zero-network verification: complete a full walkthrough (all apps, actions, print/export) with the browser network panel open. Verify: no backend/API requests occur and no files are generated.
- [ ] 9.4 Domain vocabulary check: UI text renders the codes verbatim (`REQ`…`OVERDUE`, `AL`…`VTO`) in English, with no renaming or translation. Verify: a search over the UI copy finds each code, and rendered badges show them exactly.
- [ ] 9.5 Quality gates in `frontend/`: `bun run lint` (Biome) and `bun run build` pass; run `bun run format` if the formatter reports diffs. Verify: both commands exit clean.
- [x] 9.6 Align the stale theme sentence in root `AGENTS.md` (Design section) with the current `DESIGN.md` — light IBM Carbon theme, IBM Blue accent, square corners, IBM Plex Sans — replacing the dark/cyan/monospaced wording; change nothing else in the file. Verify: the sentence matches `DESIGN.md` and `DESIGN.md`'s SHA256 is unchanged from the start of apply.
- [ ] 9.7 Final commit of any remaining fixes with the AI co-author trailer. Verify: `git log` shows the full commit series on `ai/opencode/build-frontend-mock-data` and `git status` shows only the pre-existing unrelated changes.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied (all tracked tasks complete, walkthrough clean).
- Verify the archived result: the six capabilities land under `openspec/specs/frontend/*`.
- Open a Pull Request from `ai/opencode/build-frontend-mock-data` to `main` for human review per `AGENTS_GIT.md` — never push to protected branches directly.

## Reference notes (untracked — do not re-litigate during apply)

- Resolved source ambiguities (UAL/USL roles, Employee cancel, Deactivate semantics, App 3 code, Table 1/3 column drift, prose-vs-matrix conflicts) are recorded in `design.md` Decisions §5 — follow them.
- Scope decisions: Audit Log **app** excluded (`add-audit-log-module` change); Settings' own System Audit Logs trail included; English UI; domain codes verbatim everywhere.
- Mock print/export always produces the shared mock result dialog — never a real file, never a network call.
