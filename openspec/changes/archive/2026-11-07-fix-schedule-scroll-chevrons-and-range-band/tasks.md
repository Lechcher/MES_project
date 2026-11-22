# Tasks

## 1. Schedule grid fits the viewport

- [x] 1.1 Constrain the schedule grid's container in `frontend/src/components/planning/schedule/schedule-grid.tsx` so the existing `overflow-x-auto` host sizes to the available width and the page no longer scrolls horizontally (the host keeps its role as the drag bounds element, and the sticky employee column and header keep their placement); verify `cd frontend && npx tsc --noEmit` exits 0 and `bunx biome check frontend/src/components/planning/schedule/` reports no new findings.
- [x] 1.2 Extend the schedule e2e (`frontend/tests/pages/planning/schedule.ts` and a spec under `frontend/tests/tests/planning/`): at the DAY scale in a narrow viewport, assert the document does not scroll horizontally (`documentElement.scrollWidth <= clientWidth`), the grid scroll host's `scrollWidth > clientWidth`, scrolling the host brings the last hour column into view, and the employee column stays pinned while the timeline scrolls; verify with `cd frontend && bun run test:e2e` on the schedule specs.

## 2. Ticket bar chevron spacing

- [x] 2.1 Reserve inline edge space for the continuation chevrons in `frontend/src/components/planning/schedule/ticket-bar.tsx` — conditional padding-left when `continuesBefore`, padding-right when `continuesAfter` — so the chevrons no longer overlap the bar's content; verify `cd frontend && npx tsc --noEmit` exits 0 and `bunx biome check frontend/src/components/planning/schedule/` reports no new findings.
- [x] 2.2 Extend the schedule e2e: for a bar carrying a chevron, assert the chevron's rendered box does not intersect the bar's content boxes (category icon, task code, trailing label) and that a visible gap separates them, and that a bar without chevrons gains no extra edge padding; verify with the e2e run.

## 3. Calendar range band visibility

- [x] 3.1 Paint the range band in `frontend/src/components/ui/calendar.tsx` with a translucent primary tint on the `range_middle` day buttons and the `range_start`/`range_end` cell fills, keeping the solid primary endpoint buttons; verify `cd frontend && npx tsc --noEmit` exits 0 and `bunx biome check frontend/src/components/ui/calendar.tsx` reports no new findings.
- [x] 3.2 Extend the planning e2e: open the schedule toolbar's date-range calendar with a multi-day range and assert — in both the dark and the light applied theme (drive the selector through the existing appearance page object, `frontend/tests/pages/theme/appearance.ts`) — that the in-between day cells' computed background differs from the popover background and the endpoints keep the primary fill; verify with the e2e run.

## 4. Gates and live verification

- [x] 4.1 Run `cd frontend && bun test src/` and `cd backend && bun test`; verify both suites pass (backend as an untouched-code regression check).
- [x] 4.2 With the dev servers up, verify on `/planning`: the page has no horizontal scroll at the DAY scale, the grid scrolls horizontally to the last hour column, the chevrons sit clear of the bar content, and the calendar band displays between two selected dates in both themes.

## Workflow follow-up

- Archive this change with `/opsx-archive` once implementation is verified.
