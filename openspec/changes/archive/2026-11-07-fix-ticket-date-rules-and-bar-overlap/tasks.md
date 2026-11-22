# Tasks

## 1. Lock the no-overlap guarantee in the packer

- [x] 1.1 Confirm the working tree still carries the lane-packing implementation from `improve-schedule-bars-editor-and-rows` (`assignLanes`, `rowForLaneOffset`, and the lane rows in `schedule-grid.tsx`) and that `git status --short frontend/src/components/planning/schedule` shows them present; verify by reading the three symbols and reporting which are already in place.
- [x] 1.2 Change the employee-cell count in `schedule-grid.tsx` to report the number of **lanes** the row occupies rather than the number of bars (`lanes.length`), so a 6-bar/5-lane row reads as 5 lanes; verify by opening an employee row holding several overlapping tickets and confirming the reported count equals the row's lane count.
- [x] 1.3 Add unit tests to `schedule-range.test.ts` that name the invariant: for a row holding several overlapping tickets, no two bars returned by `assignLanes` share a lane while overlapping columns, and no bar is wider than its interval; verify with `cd frontend && bun test src/components/planning/schedule/schedule-range.test.ts`.
- [x] 1.4 Add a unit test that the packer and the renderer agree: every placement `assignLanes` returns equals a fresh `placeBar` call for the same task, columns, and scale; verify with the same test command.
- [x] 1.5 Add a unit test that a `DAILY` ticket stored with a multi-day span and a ticket with no `startDate` are both placed rather than dropped, per design D3; verify with the same test command.

## 2. Bar placement never drops a live ticket

- [x] 2.1 Change `placeBar` in `schedule-range.ts` so a `DAILY`/`HOURLY` ticket whose stored interval spans more than one day is placed on the single day it is due (its effective last day, clamped into the visible window) instead of returning `null`; verify with the unit tests from 1.5 and `cd frontend && bun test src/`.
- [x] 2.2 Change `placeBar` so a ticket with no `startDate` is placed on its end day when that day falls inside the window; verify with the unit tests from 1.5.
- [x] 2.3 Confirm the "continues before/after" indicators still read correctly for a clamped bar, so a bar pinned to one column is not marked as spanning the window; verify by viewing the week containing a clamped `DAILY` ticket with the dev servers up.
- [x] 2.4 Run `cd frontend && bun run lint` and `bunx biome check --write src/components/planning/schedule` and verify both exit clean.

## 3. Lane-aware drag snapping

- [x] 3.1 Change the neodrag configuration in `ticket-bar.tsx` so the horizontal axis snaps to whole columns of the active scale and the vertical drop is resolved from lane counts rather than a fixed 52px grid, per design D6; verify by reading that `grid` no longer pins both axes to one row height.
- [x] 3.2 Confirm `rowForLaneOffset` receives the lane offset the drop implies (the bar's own lane plus the lanes dragged) and that dropping N lanes down lands on the row that owns that lane; verify by dragging a bar down one lane in a row that holds three lanes with the dev servers up, and confirming the ticket moves to the employee of the row under the pointer.
- [x] 3.3 Add a unit test for `rowForLaneOffset` covering rows of unequal lane counts and a drop that crosses a row boundary; verify with `cd frontend && bun test src/components/planning/schedule/schedule-range.test.ts`.

## 4. One shared category rule module

- [x] 4.1 Confirm the pure helpers in `task-dates.ts` (`normalizeTaskDates`, `deriveTimesForCategory`, `isTaskIntervalValid`, and the seeding helper) express the three category rules — `DAILY` one day, `HOURLY` start and end hours inside one day, `MULTI_DAY` may span days; verify with `cd frontend && bun test src/components/planning/schedule/task-dates.test.ts`.
- [x] 4.2 Add a shared helper to `task-dates.ts` that builds the saved payload for a category from the local-date controls (the local-midnight convention from design D5), and unit-test it for all three categories including an end that is not after its start; verify with `cd frontend && bun test src/components/planning/schedule/task-dates.test.ts`.
- [x] 4.3 Point the schedule editor (`task-editor-dialog.tsx`) at that shared helper for its save payload, so both surfaces produce the same shape; verify with `cd frontend && bunx tsc --noEmit` and by creating one ticket per category and reopening it.

## 5. Jobs create form writes category-correct dates

- [x] 5.1 Replace the private `todayAt`/`isoDay` helpers in `create-ticket-view.tsx` with calls into the shared rules module from 4.2, per design D4/D5, and remove the UTC-midnight convention; verify with `cd frontend && bunx tsc --noEmit` and by creating one `MULTI_DAY` ticket from 20/10 to 31/10 and confirming it covers every day inclusive on the schedule.
- [x] 5.2 Send an explicit `startDate` for every category: `DAILY` at the beginning of its day and `HOURLY` at its chosen slot hour with the end hour one hour later on the same day; verify by creating one ticket of each category and confirming both dates are stored.
- [x] 5.3 Refuse to save when an end is not after its start, or when the interval does not fit the chosen category, showing the shared validation message; verify by attempting to save an `HOURLY` ticket whose end hour precedes its start hour and confirming the form refuses and reports the error.
- [x] 5.4 Add the `jobs.create` keys for the category rules and the shared validation message to `frontend/messages/en.json` and `frontend/messages/vi.json`; verify that both files parse and that every `t()` key used by the form resolves.
- [x] 5.5 Run `cd frontend && bun run lint` and verify it exits clean.

## 6. Regression coverage across the surfaces

- [x] 6.1 Add a Playwright e2e spec that, on each of the Day, Week, Month, and Year scales and on a custom range, asserts no two bars in an employee row overlap and every ticket whose interval touches the window draws a bar; verify with `cd frontend && bunx playwright test tests/tests/planning/schedule.spec.ts --project=chromium`.
- [x] 6.2 Add an e2e check that a `DAILY` ticket stored with a multi-day span draws exactly one bar on its due day; verify with the same command.
- [x] 6.3 Add an e2e check that dragging a bar down one lane lands on the employee of the row under the pointer and leaves no overlapping bars; verify with the same command.
- [x] 6.4 Add an e2e check that the Jobs create form saves a `DAILY` ticket with both a start and an end on one day, and an `HOURLY` ticket with a start hour and an end hour on the same day; verify with `cd frontend && bunx playwright test tests/tests/jobs --project=chromium`.
- [x] 6.5 Run the frontend unit suite and the formatter (`cd frontend && bun test src/` then `bun run format`) and verify the suite passes with no failures and the formatter reports no changes.

## Workflow follow-up

- Commit the working tree change on `main` with a Conventional Commits message and the `Co-authored-by: AI Agent <agent@local>` trailer, per `AGENTS_GIT.md`.
- Archive this change only once the predecessor change `improve-schedule-bars-editor-and-rows` is committed and archived, so the two do not overlap in the change log.
