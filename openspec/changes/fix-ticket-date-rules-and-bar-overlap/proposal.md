# Proposal

## Why

The Planning Schedule paints every ticket bar into the same grid row of a
fixed-height row (`gridRow: 1`, `height: ROW_HEIGHT` in `schedule-grid.tsx`), so
two tickets that share a period are drawn on top of each other — the overlap in
the reported screenshots. A lane-stacking implementation already exists in the
uncommitted working tree (change `improve-schedule-bars-editor-and-rows`), but it
is neither committed nor covered by a regression test, so nothing stops the
overlap coming back.

The same screenshot exposes a second defect in the same code path: ticket
category/date rules are enforced nowhere. `DAILY` tickets that span months exist
in the data, and the Jobs create form never sends a `startDate` for `DAILY` and
`HOURLY` tickets — so those tickets draw no bar at all (a live example is Diego
Alvarez's `T202610-0036`, started 27/07 and due 24/10, which renders nothing on
his row this week).

## What Changes

- **Lock the no-overlap guarantee in.** A row packs its bars into lanes — the
  lane that finishes first is reused first — and the row grows to
  `laneCount × ROW_HEIGHT`, so no two bars ever share a grid row. The
  recommendation follows the existing `assignLanes` implementation; this change
  makes it committed, gap-free, and regression-tested rather than re-deriving a
  different layout.
- **One shared, pure rule set for ticket dates**, reused by every surface that
  writes a ticket: `DAILY` is exactly one day, `HOURLY` is a start hour and end
  hour inside a single day, and `MULTI_DAY` is the only category that may span
  days. The helpers already live in
  `frontend/src/components/planning/schedule/task-dates.ts`; they move to a
  single module both the schedule editor and the Jobs form call, so the two
  surfaces cannot drift apart again.
- **Jobs create form writes correct dates** (`create-ticket-view.tsx`): send an
  explicit `startDate` for `DAILY` and `HOURLY` (today it sends only `endDate`,
  which is why those tickets are invisible on the schedule); turn the bare
  `HOURLY` slot times (10:30 / 14:00 / 16:30) into a start hour plus an end hour
  on one day; replace `isoDay`, which writes UTC midnights and therefore shifts
  days by timezone and defeats the schedule's inclusive end-day rule, with local
  midnights; reject an end that is not after its start.
- **Bar placement never drops a live ticket.** A ticket whose interval touches
  the visible window always draws a bar; an out-of-shape legacy `DAILY`/`HOURLY`
  ticket is clamped to the single day it covers instead of vanishing, so the
  schedule cannot silently hide work.
- **Close the drag gap left by variable row heights.** `@neodrag/react` is
  configured with a fixed 52px grid, but rows now grow with their lane count, so
  a vertical drop can land on the wrong row. The drag snap counts lanes, not
  pixels.
- **i18n**: new `planning.schedule` / `jobs.create` keys for the category rules
  and the shared validation message, in English and Vietnamese.

## Capabilities

### New Capabilities

- `frontend/schedule`: schedule bar placement and lane stacking — no two bars in
  a row overlap, every ticket whose interval touches the visible window draws a
  bar, and a bar's width follows its category (`DAILY` one day, `HOURLY` its
  hours, `MULTI_DAY` its inclusive day span).

### Modified Capabilities

- `frontend/jobs`: `Requirement: Task type rules and Auto-forking` — the create
  form still sets a deadline per category, but now also sets a start, and the
  category rules become single-day (`DAILY`), single-day-with-hours (`HOURLY`),
  and day-spanning (`MULTI_DAY`) with validation that rejects an end before a
  start.

## Impact

- `frontend/src/components/planning/schedule/schedule-range.ts` — `placeBar`,
  `assignLanes`, and the new clamping rule for out-of-shape tickets.
- `frontend/src/components/planning/schedule/schedule-grid.tsx`,
  `ticket-bar.tsx` — lane rows, the lane-aware row label, and the lane-based
  drag snap.
- `frontend/src/components/planning/schedule/task-dates.ts` — the shared
  category rules, promoted so both surfaces import one module.
- `frontend/src/components/jobs/create-ticket-view.tsx` — category-correct date
  payload and `startDate` for every category.
- Tests: `schedule-range.test.ts`, `task-dates.test.ts`, and Playwright e2e in
  `frontend/tests/tests/planning/`.
- Out of scope (recorded, not done): the backend does not enforce these rules
  (`backend/src/domain/tasks.ts` `createTask` validates only
  `endDate >= startDate`, and `defaultEndDate` leaves `DAILY`/`HOURLY` tickets
  without a start); the import preview validates on the server; the existing
  out-of-shape rows are rendered safely but not migrated.
