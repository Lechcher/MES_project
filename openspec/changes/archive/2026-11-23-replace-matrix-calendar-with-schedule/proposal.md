# Proposal

## Why

The Planning app's Matrix Calendar is read-only and fixed to one month of day cells.
Planners (HR, Tech Lead, Super Admin, Department Heads) cannot schedule, move,
copy, or bulk-load work from it, so planning lives in spreadsheets outside MES.
An Odoo-Planning-style resource schedule turns the Planning tab into the place
where work is scheduled, not just viewed.

## What Changes

- **BREAKING (UI)**: replace the `Calendar` tab's Matrix Calendar with a
  **Schedule**: employees on the Y-axis, a time grid on the X-axis, and task
  bars placed by `startDate`/`endDate`. Leave badges and late/early marks stay
  on the same rows.
- Time scales **Day / Week (default) / Month / Year**, prev/today/next
  navigation, and a custom **DD/MM/YYYY → DD/MM/YYYY** range.
- Department filter for company-scope roles; department scope for `DEPT_HEAD`;
  own row only for `EMPLOYEE`.
- Three visually distinct ticket categories from the existing `TaskType`:
  `DAILY` (Daily task), `MULTI_DAY` (Multi-day task, with progress bar),
  `HOURLY` (Urgent in-hour task, with hour slot and urgent marker).
- Task editor dialog (tabs: Details / Time / Notes): title, category, priority
  stars (`LOW`–`URGENT`), assignee, start/end, allocated hours, internal notes
  (`description`), and the state tag with the existing transitions.
- Add / Edit / Delete / Duplicate tickets and drag-to-move or drag-to-reassign
  bars with grid snapping (`@neodrag/react`).
- Bulk import from CSV/XLSX with template download and a validation preview
  dialog before commit.
- Schedule report export (PDF, CSV, XLSX) filtered by department, date range,
  and state.
- Backend: new `updateTask`, `deleteTask`, `duplicateTask`,
  `previewTaskImport`, `commitTaskImport`, `exportSchedule` operations, and a
  `scheduledTasks` query. `HR_MANAGER`, `TECH_LEAD`, `SUPER_ADMIN` write all
  departments; `DEPT_HEAD` writes own department; `EMPLOYEE` is read-only on own
  tickets (existing accept/progress/report actions unchanged).
- Ticket states stay the domain codes `REQ ACT PEN APP REJ CAN OVERDUE`; no
  Draft/Scheduled/In Progress/Completed states are introduced.

## Capabilities

### New Capabilities

- `frontend/schedule`: the Planning Schedule screen — time scales, range
  selection, rows, ticket categories, editor, drag/copy, import and export UI.

### Modified Capabilities

- `frontend/planning`: Matrix Calendar requirements are replaced by the
  Schedule; scope and leave-badge behavior move onto the schedule rows.
- `backend/graphql-api`: adds the schedule read, task edit/delete/duplicate,
  import, and schedule-export operations.
- `core/authorization`: defines who may create/edit/delete/move scheduled
  tickets and in which scope.
- `core/report-exports`: adds the schedule report (PDF/CSV/XLSX) and the import
  template.

## Impact

- Frontend: `frontend/src/components/planning/matrix-calendar.tsx` replaced by
  `frontend/src/components/planning/schedule/*`; `planning-view.tsx` tab;
  `lib/mes/queries/planning.ts`, `types.ts`, `access.ts`; `messages/en.json`,
  `messages/vi.json`.
- Dependencies: replace unused `@neodrag/solid` with `@neodrag/react@next`
  (update the Stack table in `AGENTS.md`). No new spreadsheet library: parsing
  and generation stay on the backend's `exceljs`/`pdf-lib`.
- Backend: `graphql/schema.ts`, `graphql/access.ts`, `graphql/change-areas.ts`,
  `graphql/resolvers/jobs.ts`, `domain/tasks.ts`, `reports/exports.ts`.
  No DB migration (uses existing `tasks` columns incl. `deleted_at`).
- `API_CONTACT_SPECIFICATION.md` §6.1/§6.2/§7.2 gain the new operations.
- `matrixCalendar` / `printAttendanceCalendar` stay in the API (still used for
  leave days and the A4 attendance print).
