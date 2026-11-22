# Tasks

## 1. Dependencies and shared UI primitives

- [x] 1.1 Add `react-day-picker` and `date-fns` to `frontend/package.json` at their latest compatible versions (check with the `npm-check-updates` skill first), install, and update the Stack table in the root `AGENTS.md`; verify `cd frontend && bun install` succeeds and both packages resolve
- [x] 1.2 Add `frontend/src/components/ui/calendar.tsx` following `docs/shadcn-calendar.md` (Base UI conventions, IBM-styled class names via `cn`, no arbitrary Tailwind values) and verify `cd frontend && bunx tsc --noEmit` exits 0
- [x] 1.3 Add `frontend/src/components/ui/popover.tsx` wrapping `@base-ui/react` popover primitives (trigger, content, no arrow by default) and verify it compiles and renders in the dev server (a throwaway story is not needed — tsc plus one real consumer in group 6)
- [x] 1.4 Add `frontend/src/components/ui/combobox.tsx` per `docs/shadcn-combobox.md` (the base-nova recipe: Base UI Combobox with `multiple` chips — no cmdk/Command needed since `@base-ui/react` is installed) and verify it compiles with `bunx tsc --noEmit`

## 2. Backend — multi-assignee creation and Auto-forking removal

- [x] 2.1 Replace `CreateTaskInput.assignedToId: ID` with `assignedToIds: [ID!]!` in `backend/src/graphql/schema.ts` and drop the Auto-forking field from `Department`, `CreateDepartmentInput`, and `UpdateDepartmentInput`; verify the schema still assembles and `cd backend && bun test src/graphql/schema.test.ts` passes with the documented operations updated
- [x] 2.2 Rewrite `createTask` in `backend/src/domain/tasks.ts`: validate each id (active, department member — reuse the existing check for every id, not just the first), insert one task per id in the submitted order with its transition and audit event, and return the first created task; delete the auto-forking block entirely; verify with new `bun:test` cases in `backend/src/domain/tasks.test.ts`: N selected employees create N `REQ` tasks with N transitions and N audit events, an unknown/inactive/foreign id is refused, and an empty list is refused
- [x] 2.3 Remove Auto-forking from the settings domain (`backend/src/domain/settings.ts` create/update/audit payloads), the department shape mapper in `backend/src/graphql/shapes.ts`, and the seed (`backend/src/db/seed.ts`); verify `cd backend && bun test src/domain/settings.test.ts src/db/seed.test.ts src/graphql` passes
- [x] 2.4 Add `backend/drizzle/0003_drop-auto-forking.sql` dropping `departments.auto_forking_enabled` plus its `meta/_journal.json` entry, extend `backend/src/db/migrate.test.ts` to assert the column no longer exists after migration, and run `cd backend && bun run db:migrate` against the dev database; verify `cd backend && bun test src/db/migrate.test.ts` passes and the dev `departments` table has no `auto_forking_enabled` column
- [x] 2.5 Run the full backend suite and confirm it is green with no remaining references to auto-forking outside the migration; verify `cd backend && bun test` passes and `grep -ri "autoforking" backend/src --include="*.ts" | grep -v migrate` is empty

## 3. API contract document

- [x] 3.1 Update `API_CONTACT_SPECIFICATION.md`: `CreateTaskInput` gains `assignedToIds: [ID!]!` (replacing `assignedToId`), and `CreateDepartmentInput`/`UpdateDepartmentInput`/`Department` lose `autoForkingEnabled`; verify the documented SDL matches the assembled schema (`cd backend && bun test src/graphql/schema.test.ts`) and every edited example is well-formed GraphQL

## 4. Frontend — Create Ticket form

- [x] 4.1 Build the assignee combobox in `create-ticket-view.tsx` on the new Command + Popover primitives: department-scoped active members, the creator preselected, selected employees shown as removable chips, and a filter input; verify `cd frontend && bunx tsc --noEmit` exits 0
- [x] 4.2 Submit `assignedToIds` (selected ids, at least one) instead of `assignedToId` in the Create Ticket mutation call, refuse submission with the existing validation feedback when the selection is empty, and remove the Auto-forking card from the deadline section; verify `cd frontend && bunx tsc --noEmit` exits 0 and `cd frontend && bun test src/` still passes
- [x] 4.3 Update `frontend/messages/en.json` and `vi.json`: assignee combobox labels/placeholders/chip strings for both locales, and remove the Auto-forking strings; verify both files parse and the new keys exist in both locales

## 5. Frontend — Org Structure

- [x] 5.1 Remove the Auto-forking column, inline toggle, draft field, and handler from `frontend/src/components/settings/org-structure.tsx`, and remove its message keys from `en.json`/`vi.json`; verify `cd frontend && bunx tsc --noEmit` exits 0, the messages parse in both locales, and `cd frontend && bun test src/` passes

## 6. Frontend — calendar pickers everywhere

- [x] 6.1 Add `frontend/src/components/shared/date-picker.tsx` (single) and `frontend/src/components/shared/date-range-picker.tsx` (Calendar `mode="range"`), both keeping `YYYY-MM-DD` string values at their seams (reuse `toIsoDate` from `schedule-range.ts` for Date→string) and exposing the same label/error contract as the inputs they replace; verify with `bun:test` cases for the string↔Date boundaries (valid, empty, invalid input)
- [x] 6.2 Replace the schedule toolbar's two text inputs and Apply button in `schedule-toolbar.tsx` with the range picker bound to the existing `onCustomRange(from, to)`, keeping the validation rules (end not before start, span at most 366 days) and the disabled/invalid states; delete `parseDmy`/`formatDmy` from `schedule-range.ts` and their tests once unused; verify `cd frontend && bun test src/components/planning/schedule` passes
- [x] 6.3 Replace the remaining raw date inputs with `DatePicker` (or `DateRangePicker` where a range is picked): `create-ticket-view.tsx` (start/end), `task-editor-dialog.tsx` (four fields), `create-leave-view.tsx` (start/end), `penalty-leave.tsx`, `audit-log-view.tsx` (from/to), `system-audit-logs.tsx` (from/to); verify `cd frontend && bunx tsc --noEmit` exits 0 and `grep -rn 'type="date"' frontend/src --include="*.tsx"` returns only the file input inside the attachment field

## 7. Frontend — completion dialog fix

- [x] 7.1 Add a shrink floor (`min-w-0`) to the attachment row and the dialog's other long-text grid wrappers in `frontend/src/components/jobs/task-completion-dialog.tsx` and `frontend/src/components/shared/attachment-field.tsx`; verify in the dev server that a file with a long unbroken name keeps its Remove button inside the dialog's edge (reproduce the reported overflow first: measured 678px row inside a 512px popup)

## 8. Integration verification

- [x] 8.1 Run the full verification set — `cd backend && bun test`, `cd frontend && bun test src/`, `cd frontend && bunx tsc --noEmit`, `bunx biome check frontend backend` — and confirm every suite passes with no new warnings; verify all commands report green
- [x] 8.2 Verify end-to-end against the dev servers

  **Results** (headless browser against the dev servers; the ephemeral e2e
  tickets were removed afterward, restoring the dev database):
  - **Multi-assignee creation:** as HR Manager, the combobox opened with the
    creator (`Hana Suzuki`) preselected; picked `Alex Morgan` and
    `Priya Raman` through the filter list; submitted → **3 `REQ` tickets**
    (`T202610-0095/96/97`), one per employee, distinct task codes, same
    department/defaults, in selection order (verified with sqlite).
  - **Auto-forking removal:** the create form's deadline card no longer
    renders any forking control; the Org Structure table shows
    `Code/Name/Type/Parent/Manager/Active/Edit` only, no department row has a
    forking cell, and no "Auto-forking" text remains on Settings (the
    description copy was updated too).
  - **Calendar pickers:** the schedule toolbar renders a range trigger
    (`26/10/2026 → 01/11/2026`) that opens a calendar captioned October 2026;
    the task editor's day field is a picker button whose popup renders a
    calendar inside the dialog; the leave request's start/end are pickers that
    write picked days back to the trigger (`15/10/2026` after clicking 15).
  - **Completion dialog:** with a long-named file attached the attachment row
    stays 480px inside the 512px popup and the Remove button paints at
    x=1031 (dialog edge 1056); the dialog has no scroll overflow.
  - One bug found and fixed during verification: the frontend department
    queries still selected the dropped `autoForkingEnabled` field (the query
    failed against the new schema, leaving Org Structure blank); removed from
    `queries/settings.ts`, `queries/common.ts`, and `queries/types.ts`.: create a ticket with three selected employees and confirm three `REQ` tickets (one per employee, same department and deadlines); confirm the Org Structure view no longer shows Auto-forking; pick dates through the calendar in the schedule toolbar, the task editor, and a leave request; attach a long-named file in the completion dialog and confirm nothing overflows; verify the observed outcomes (ticket count, rendered controls, no overflow) by re-checking the database and the live UI

## Workflow follow-up

- Review the completed change, then archive it via `/opsx-archive`.
- Commit the change on `main` per the repository's git guidelines (conventional commit message, AI trailer), including the `AGENTS.md` Stack-table update.
