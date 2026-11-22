# Proposal

## Why

The Planning Schedule renders every ticket bar as a solid block of its ticket-state
color, and `REQ` (`#161616`, `colorLabel: "White"`) is a near-black bar with white
text — on the schedule it reads as an unreadable black stripe. Two rendering defects
compound it: a `DAILY` bar can spill across more than one day column whenever its
`endDate` lands past local midnight, and an `HOURLY` bar can cover more hour columns
than its `startDate → endDate` interval, so the schedule promises time it does not
have. Meanwhile every bar in an employee row is placed in the same single grid row, so
a second ticket is drawn on top of the first — the screen only works while each
employee has at most one visible ticket. The task editor splits the few fields that
matter across three tabs, lets a `DAILY` pick an end day (and an `HOURLY` an end day)
it should never own, and can overflow the viewport with no way to scroll it. All four
are on the screen planners open first, and the Odoo 20 Planning screen (see
`odoo rea/README.md`, this repository) shows the target: a light, high-contrast bar per
time interval, one bar per visible slot, and a single-page editor whose bar width is
exactly its start → end range.

## What Changes

- **Ticket bar styling**: the bar fill becomes a light white/neutral gray, its 1 px
  border carries the ticket-state color (`REQ` `#161616`, `ACT` `#f1c21b`, `PEN`
  `#0f62fe`, `APP` `#24a148`, `REJ`/`CAN`/`OVERDUE` `#da1e28`), and the bar text is
  dark. The category keeps its colored left stripe and icon, so category and state
  keep reading independently. Terminal states get a muted treatment (dashed border /
  reduced opacity) so cancelled work stops competing for attention.
- **Bar span matches its dates**: `placeBar` is corrected so a `DAILY` ticket spans
  exactly one day column, an `HOURLY` ticket spans exactly its `startDate → endDate`
  hour range, and an `MULTI_DAY` ticket spans exactly its inclusive days — with the
  first visible column clipped instead of extended.
- **Row height grows to fit the tickets**: employee rows pack tickets into lanes
  (non-overlapping tickets share a lane, overlapping ones take the next), and the
  row's height becomes `max(lane count, 1) × base row height`. No ticket is drawn on
  top of another; a lane is also the unit the drag snap uses per row.
- **Task editor, one full page**: the Details / Time / Notes tabs are replaced by a
  single scrollable form in a wider modal. Time entry becomes category-aware: `DAILY`
  offers a single day, `MULTI_DAY` offers a start day and an end day, `HOURLY` offers
  a start hour and an end hour on the same day. `DAILY` and `HOURLY` have no separate
  end-day — their end is the end of the chosen day (`DAILY`) or the chosen end hour
  on that day (`HOURLY`), and the dialog says so.
- **Editor scrolls inside a wide dialog**: when the editor's content is wider than
  the screen, its body scrolls horizontally (and vertically) inside the dialog rather
  than clipping or pushing the footer out of reach.
- **No API, schema, or data change**: the dialog still saves through the existing
  `createTask` / `updateTask` mutations; the end-day normalization happens on the
  client. No migration, no new fields, no new domain codes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend/schedule`: the Planning Schedule screen — ticket-bar styling, the exact
  bar span per category, lane-packed rows whose height fits the tickets, the
  single-page task editor, and the editor's category-aware time entry and scrolling.
  (Same capability path declared by the in-flight
  `replace-matrix-calendar-with-schedule` change; that change has not been archived
  into `openspec/specs/` yet, so this change contributes its requirements as `ADDED`
  entries on that path.)

## Impact

- Frontend: `frontend/src/components/planning/schedule/ticket-bar.tsx`,
  `schedule-grid.tsx`, `task-editor-dialog.tsx`, `schedule-view.tsx`,
  `schedule-range.ts` (`placeBar`) and `schedule-range.test.ts`;
  `frontend/messages/en.json` / `vi.json` (`planning.schedule.*`).
- No backend, GraphQL, schema, or migration work. Drag/copy, permissions, import and
  export behavior are unchanged.
- Reference material only: `odoo rea/` (Odoo 20 Planning reverse-engineering
  findings) is added to the repository as the design's external reference.
