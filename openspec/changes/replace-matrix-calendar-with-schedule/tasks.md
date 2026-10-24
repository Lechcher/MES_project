# Tasks

## 1. Dependencies

- [x] 1.1 In `frontend/`, remove `@neodrag/solid` and add `@neodrag/react@next` pinned to an exact version; update the Stack table in `AGENTS.md`; verify `bun install` and `bun run build` succeed

## 2. Backend: schedule read and task edits

- [x] 2.1 Add `ScheduleInput`, `UpdateTaskInput`, `DuplicateTaskInput` and the `scheduledTasks`, `updateTask`, `deleteTask`, `duplicateTask` operations to `backend/src/graphql/schema.ts`, `access.ts` (roles SA, TL, HR, DH for writes; all roles for read), and `change-areas.ts` (`tickets`); verify `schema.test.ts` and `authorization.test.ts` list them with the right roles
- [x] 2.2 Implement them in `backend/src/domain/tasks.ts` + `graphql/resolvers/jobs.ts`: overlap query excluding `deleted_at`, end ≥ start validation, soft delete, duplicate as new `REQ` at 0% with new `taskCode`, `DEPT_HEAD` check on both current task and target assignee, audit/transition record; verify new cases in `domain/tasks.test.ts` (overlap, deleted excluded, reversed dates rejected, DH cross-department `FORBIDDEN`, EMPLOYEE `FORBIDDEN`, duplicate fields)
- [x] 2.3 Document the operations in `API_CONTACT_SPECIFICATION.md` §6.1/§6.2; verify the doc signatures match `schema.ts`

## 3. Backend: import and export

- [x] 3.1 Add `parseTaskImport()` (CSV + XLSX via `exceljs`, `DD/MM/YYYY`, email→user, category→`TaskType`, per-row scope check, 2 MB cap) and `previewTaskImport` / `commitTaskImport` (transactional, re-validates); verify tests for valid file, unknown email, bad date, out-of-scope row, non-CSV/XLSX file, and that an invalid row commits nothing
- [x] 3.2 Add `exportSchedule` (PDF A4 landscape, CSV, XLSX) and `taskImportTemplate` to `reports/exports.ts` + schema/access; verify `reports/exports.test.ts` checks scoped rows, state filter, and that the template parses with zero errors
- [x] 3.3 Document both in `API_CONTACT_SPECIFICATION.md` §7.2; verify `cd backend && bun test` passes

## 4. Frontend: data layer and date math

- [x] 4.1 Add `ScheduleScale`, `ScheduleRange`, `ScheduledTask`, `UpdateTaskInput`, `TaskImportRow` to `lib/mes/queries/types.ts` and the operations to `lib/mes/queries/planning.ts`; add `canWriteSchedule` to `access.ts` with a case in `access.test.ts`; verify `bun test` passes
- [x] 4.2 Create `components/planning/schedule/schedule-range.ts` (`columnsFor`, `placeBar`, `shiftByColumns`, `parseDmy`, `step`) with `schedule-range.test.ts` covering each scale, clipping at range edges, multi-day span, duration-preserving shift, `31/02/2026` rejected, and month/year stepping; verify `bun test` passes

## 5. Frontend: Schedule UI

- [ ] 5.1 Build `schedule-view.tsx` (URL-param range, default Week, queries, pending-move map) and `schedule-toolbar.tsx` (‹ Today ›, scale toggle, `DD/MM/YYYY` range with inline error, department filter by role, New/Import/Export, Print attendance calendar); verify in the browser that Week is default and next/prev/range work
- [ ] 5.2 Build `schedule-grid.tsx` (sticky employee column grouped by department, leave/penalty/late marks from `matrixCalendar`) and `ticket-bar.tsx` (category stripe + icon, state fill, progress for `MULTI_DAY`, hour slot + urgent marker for `HOURLY`); verify as `EMPLOYEE` (own row), `DEPT_HEAD` (own department), `HR_MANAGER` (filter)
- [ ] 5.3 Build `task-editor-dialog.tsx` (Details/Time/Notes tabs, priority stars, state tag with allowed transitions, read-only for non-writers, delete with confirmation, duplicate); verify create-from-empty-cell prefills assignee and start
- [ ] 5.4 Wire neodrag in `ticket-bar.tsx`: grid snap, move/reassign via `updateTask`, Alt-drop copy via `duplicateTask`, rollback + error on failure, disabled for non-writers, context-menu Move/Duplicate for keyboard users; verify move, reassign, copy, and forced-failure revert in the browser
- [ ] 5.5 Build `import-dialog.tsx` (template download, file pick, preview table with per-row errors, commit disabled on errors) and the export menu (PDF/CSV/XLSX with state filter); verify a template round-trip imports and exported files match the visible filter
- [ ] 5.6 Swap `MatrixCalendarView` for `ScheduleView` in `planning-view.tsx`, rename the tab to Schedule, delete `matrix-calendar.tsx`; add `planning.schedule.*` keys to `messages/en.json` and `messages/vi.json` and drop unused `planning.calendar.*`; verify `labels.test.ts` locale parity passes and Vietnamese UI shows the three category names

## 6. Integration

- [ ] 6.1 Run `bun run lint` and `bun test` in `frontend/` and `backend/`, and `bun run build` in `frontend/`; verify all pass
- [ ] 6.2 Run `openspec validate replace-matrix-calendar-with-schedule --strict`; verify it passes
