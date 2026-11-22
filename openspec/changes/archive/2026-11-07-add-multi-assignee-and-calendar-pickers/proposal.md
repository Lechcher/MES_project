# Proposal

## Why

Four Jobs/Planning pain points reported against the running app:

1. **Auto-forking is effectively HQ-only.** The per-department setting lives
   behind `updateDepartment`, restricted to `SUPER_ADMIN`/`TECH_LEAD` — both
   seeded in Headquarters — so only HQ users decide whether tickets replicate
   to a department's members. Ticket creators cannot choose their assignees
   beyond one person, so "assign this to my whole team" is impossible without
   HQ changing a setting.
2. **The schedule's custom `DD/MM/YYYY` range** is fiddly to use, and the app's
   date inputs are raw browser `<input type="date">` widgets that look and
   behave inconsistently with the design system.
3. **The ticket-completion dialog breaks when a file is attached**: the
   attachment row is a grid item with no shrink floor, so a long filename
   pushes the row ~180px past the dialog's edge (the Remove button paints
   outside the panel).

## What Changes

- **Assignee becomes a multi-select combobox** in the Create Ticket form,
  scoped to the selected department's active members. Selecting N employees
  creates N REQ tickets — one per employee, in the same department, with the
  same title/type/priority/deadlines. The underlying ticket model stays
  single-assignee (no per-ticket schema change).
- **Auto-forking is removed entirely**: the department setting, its column in
  Org Structure, the create-form display, and the backend forking block. The
  multi-assignee selection replaces it with explicit choice. **BREAKING**:
  `Department.autoForkingEnabled`, `CreateDepartmentInput.autoForkingEnabled`,
  and `UpdateDepartmentInput.autoForkingEnabled` disappear from the GraphQL
  contract, and `CreateTaskInput.assignedToId` is replaced by
  `assignedToIds: [ID!]`.
- **Calendar pickers everywhere**: add the shadcn `Calendar`
  (`react-day-picker`, new dependency) plus popover-driven single/range
  pickers, and replace every date input in the app with them — the schedule
  toolbar's custom range (`mode="range"`), the Create Ticket `MULTI_DAY`
  start/end, the task editor's four date fields, leave request start/end,
  penalty-leave date, and the audit-log and system-audit-log date filters.
- **Fix the completion dialog overflow** (shrink floor on the attachment row)
  so attached files stay inside the dialog.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend/jobs`: the create form's assignment behavior changes — multi-select
  assignees create one ticket per selected employee, and the Auto-forking
  option (requirement "Task type rules and Auto-forking") is removed.
- `frontend/settings`: the Org Structure requirement loses the per-department
  Auto-forking toggle; the hierarchy, create, and edit behavior is unchanged.

The calendar-picker swap and the dialog fix are implementation-level changes:
no existing requirement constrains which date-input control is rendered or the
dialog's internal layout, so they carry no spec delta and are covered by the
tasks.

## Impact

- **Backend**: `domain/tasks.ts` (forking block removed, multi-assignee
  creation added), `graphql/schema.ts` (`CreateTaskInput`, `Department`,
  `CreateDepartmentInput`, `UpdateDepartmentInput`), `domain/settings.ts`,
  `graphql/shapes.ts`, a drizzle migration dropping
  `departments.auto_forking_enabled`, seeds, and the affected test suites.
- **Frontend**: `create-ticket-view.tsx` (combobox, no auto-forking card),
  `org-structure.tsx` (toggle/column removed), `schedule-toolbar.tsx` and the
  twelve other date-input sites, `task-completion-dialog.tsx` /
  `attachment-field.tsx` (overflow fix), new `ui/calendar.tsx` + picker and
  combobox wrappers, en/vi message updates.
- **Dependencies**: `react-day-picker` and `date-fns` are added (per
  `docs/shadcn-calendar.md`); the Stack table in `AGENTS.md` is updated.
- **API**: `API_CONTACT_SPECIFICATION.md` §6 inputs updated (login-style
  before/after examples for `createTask` and the department inputs). No
  authentication or event-contract change.
