# Design

## Context

- `schedule-grid.tsx` builds one CSS grid per employee row
  (`gridTemplateColumns: 224px repeat(n, colWidth)`), gives the row a fixed
  `height: ROW_HEIGHT = 52`, places day cells at `gridRow: 1`, and places every
  `TicketBar` of that row at `gridRow: "1"` too — so the second and later ticket of
  an employee is drawn on top of the first.
- `TicketBar` fills itself with `TICKET_STATE_BY_CODE[task.state].hex`, and `REQ`
  is `#161616` (`colorLabel: "White"`) — a near-black bar with white text.
  Category is `border-l-4` + icon; the two signals share one surface.
- `placeBar()` (`schedule-range.ts`) derives `start`/`span` from the dates:
  an end at local midnight is treated as an *inclusive* end day (`+1 day`), which
  makes a `DAILY` ticket with a late or next-midnight `endDate` span two day
  columns; on the Day scale the span is `Math.ceil((end - start)/1h)` measured from
  the exact start, so a by-the-hour ticket is stretched onto columns it does not
  cover; and a midnight-stored `endDate` on an `HOURLY` ticket adds a whole day.
- `task-editor-dialog.tsx` is `Tabs` (Details / Time / Notes) with two
  `datetime-local` inputs for start and end and no category rule, so `DAILY` can
  own an end day and `HOURLY` an end day. `DialogContent` is `sm:max-w-xl`.
- Reference: `odoo rea/README.md` (Odoo 20 Planning observations — light pastel
  fills with black text, one bar per cell, `start – end` labels, `(2h)` partial
  marker, sticky row-header sidebar with the resource's hour total).
- `--muted` / `surface-1` is `#f4f4f4` (see `DESIGN.md`); hairline is `#e0e0e0`.
- Motivation and scope: `proposal.md`. Behavior contract: `specs/frontend/schedule/`.

## Goals / Non-Goals

**Goals:** a readable light bar whose state is carried by its border; a bar width that
equals its scheduled interval on every scale; rows that grow to hold every ticket of an
employee; one-page, category-correct time entry; an editor that scrolls instead of
clipping. No API, schema, or migration change.

**Non-Goals:** resizing bars by dragging their edges (the editor still owns the dates);
per-role color palettes (as in Odoo); partial-hours / `allocated_hours` fields; row
collapsing, the Odoo side panel, and the resource hour-total header; bar-level conflict
or overlap decorations; virtualizing long rows; changing drag, copy, permissions,
import, or export behavior.

## Decisions

### D1. Light surface, state-colored border

`TicketBar` keeps `border-l-4 <category stripe>` and gains `border` + an inline
`borderColor: state.hex`; the inline `backgroundColor` becomes `#f4f4f4`
(`surface-1`) and `color` becomes `text-foreground`. Tailwind's `border-l-4` sets
`border-left-width` explicitly, so the left 4 px stays the category stripe while the
other three sides take the 1 px state color.

Alternatives: (a) seven pre-tinted pastel variants of the state palette — rejected,
it cheats the "light fill" request and multiplies the palette; (b) white fill with a
neutral hairline plus a colored state chip — rejected, the state leaves the bar's
silhouette and needs a new label in every i18n file; (c) keep the state fill and only
lighten `REQ` — rejected, it fixes one state and keeps the block look.

### D2. No new color registry

Border colors stay `TICKET_STATE_BY_CODE[code].hex`, so the state palette remains the
single source of truth shared with the badges, the export reports, and the matrix
calendar's day marks. Contrast is `#f4f4f4` fill against dark text, plus the state
color as the bar's 1 px outline.

### D3. Category-aware placement

`placeBar(task, cols, scale)` becomes category-aware and keeps one contract: the
returned `start`/`span` describe the *visible* part of the ticket's interval, never
more.

| Scale | `DAILY` | `MULTI_DAY` | `HOURLY` |
| --- | --- | --- | --- |
| DAY (hour columns) | 24 columns of the start day, `continuesAfter` when the ticket runs past it | same, plus `continuesBefore` when it starts earlier | `floor(start - col0)` … `ceil(end - col0)` |
| WEEK / MONTH (day columns) | 1 day | inclusive `start day … end day` | 1 day (the hour slot shows in the label) |
| YEAR (month columns) | the start month | inclusive start month … end month | 1 month |

Rules: the legacy midnight-end convention (`isMidnight` → `+1 day`, an inclusive end
day) applies to `DAILY` and `MULTI_DAY` only; an `HOURLY` end never gains a day, so a
by-the-hour ticket cannot be stretched by a stored midnight end. Day-based tickets in
Day scale are clipped to the start day (their remaining days remain visible by
navigating or by the `continuesAfter` marker) — the same clipping `placeBar` already
applies at the range edges, so no new clipping path is needed.

`shiftByColumns`, `columnsFor`, `step` and the URL helpers are unchanged.

Alternative: normalize every stored `endDate` and keep `placeBar` date-driven —
rejected as the only fix, because existing rows carry legacy values and a data
migration is out of scope; the category-aware computation makes legacy rows correct
without touching data, and the editor stops writing non-canonical dates (D6).

### D4. Lane packing, measurement-free

A new pure `assignLanes(tasks, cols, scale)` in `schedule-range.ts` sorts a row's
tickets by start (then by end, then by `id` for stability) and greedily fills the
first lane whose last `end` is at or before the ticket's `start`. It returns
`{ task, lane }[]`. The existing `placeBar` call is kept per task.

- Row height: `Math.max(1, laneCount) * ROW_HEIGHT`, applied per row in
  `schedule-grid.tsx`.
- Bars render at `gridRow: lane + 1`; the employee cell renders at
  `gridRow: "1 / -1"`; day cells stay at `gridRow: 1`.
- Drag-to-reassign: the grid snap stays `[colWidth, ROW_HEIGHT]`, and `TicketBar`'s
  `onDragEnd` maps `rowDelta` (total lanes) through the grid's precomputed lane
  boundaries — each row contributes `laneCount` lanes in render order — instead of
  assuming equal row heights. `rows` keeps its order, so the boundary array is built
  in JS with no DOM measurement.

Alternatives: measuring each row's `getBoundingClientRect().top` (rejected: it fights
the sticky employee column, the horizontal scroll container and the live-update
rerenders); capping the lanes at 2–3 (rejected: the third ticket would still overlap);
Odoo's model of one bar per cell (rejected: MES tickets per employee routinely
exceed Odoo's, which is the reason for this change).

### D5. One-page editor

`task-editor-dialog.tsx` drops `Tabs`/`TabsList`/`TabsContent` and renders one
`grid gap-3` form: title, category, assignee, priority stars, the time block, notes.
`DialogContent` widens from `sm:max-w-xl` to `sm:max-w-4xl`, and the form is wrapped
in a `max-h-[70vh] overflow-x-auto overflow-y-auto` box so a narrow window scrolls
the *form* while `DialogHeader` and `DialogFooter` stay put. `TaskActions`, the state
tag, the delete confirmation, and the duplicate/save/cancel footer keep their current
order; only their container changes.

Alternative: keeping tabs and only widening the modal — rejected; the request is a
single page, and the tab strip was the reason the date fields were out of sight.

### D6. Category-aware time entry, one state shape

The editor keeps `startText`/`endText` as `YYYY-MM-DDTHH:MM` strings, so `save()`,
`handleCreate`, and `handleUpdate` are untouched. Per category:

- `DAILY` — one `type="date"` control. End is implied and displayed as
  "ends at the end of DD/MM/YYYY". On save, `endDate` becomes the next day at 00:00,
  which `placeBar` reads as the inclusive single day.
- `MULTI_DAY` — two `type="date"` controls (start day, end day). On save,
  `endDate` becomes the end day + 1 day at 00:00.
- `HOURLY` — one `type="date"` control plus `type="time"` controls for the start and
  the end hour, saved verbatim. No end-day control exists.

Category changes re-derive the fields: to `HOURLY` the start is kept and the end hour
defaults to the start hour + 1; to `MULTI_DAY` the end day defaults to the start day;
to `DAILY` the end collapses to the start day. Validation stays in `save()`:
`endBeforeStart` for any end that is not after the start, and the `HOURLY` end hour
must be after its start hour.

Alternatives: one shared `datetime-local` pair plus per-category clamping on save —
rejected, it leaves the impossible value visible in the form; separate state per
category — rejected, it multiplies the reset paths and the create/update payload
still has to be normalized exactly once.

### D7. Localization

New keys live beside the existing `planning.schedule.editor.*` block in
`messages/en.json` and `messages/vi.json`: `day`, `startDay`, `endDay`, `startHour`,
`endHour`, `endsAtEndOfDay`, `endDayOnlyForMultiDay`. Existing keys
(`start`, `end`, `hourSlot`, `endBeforeStart`, `titleRequired`) are reused; no
domain codes change.

### D8. Tests

- `schedule-range.test.ts` gains `placeBar` cases (DAILY one day across scales,
  HOURLY exact hours, HOURLY with a midnight end, MULTI_DAY inclusive, clipping with
  continuation, YEAR months) and `assignLanes` cases (no overlap → one lane, chained
  overlap → lane count, stability when starts are equal).
- Frontend `bun test src/` covers the editor's derived-time helpers as pure
  functions if the category branching is extracted into `schedule-range.ts` or a
  small sibling module.
- Playwright e2e (needs the dev servers on :3000/:3001) covers: a `REQ` bar's
  computed background/border, a `DAILY` bar occupying one column, three overlapping
  bars stacked in three lanes, and the editor showing only the day control for a
  `DAILY` ticket.

## Risks / Trade-offs

- [Row height is no longer uniform, so a global `ROW_HEIGHT` snap would drift] →
  lane boundaries are computed in JS from the render order (D4); the drag math is
  unit-testable and covered by the lane tests.
- [A `DAILY` ticket in Day scale now clips to 24 columns] → the bar keeps its
  `continuesAfter` marker; navigating one day or switching scale shows the rest. Same
  signal as the existing range clipping.
- [A light fill can look washed out on weekend-tinted cells] → the 1 px state border
  and dark text keep the state legible; contrast is checked in the e2e snapshot.
- [Widening the dialog may overflow the viewport on a small window] → the scroll box
  (D5) keeps header, footer and validation in reach; verified at 1280×720.
- [Legacy rows with non-canonical `endDate`s] → category-aware placement renders them
  correctly; only edited tickets get canonical dates (D3/D6). No migration is needed
  or performed.
- [Editing a ticket's category can surprise the user] → the re-derived interval is
  shown immediately and the result is stated, so nothing is silently lost.

## Migration Plan

Frontend-only, no data migration and no API change. Rollback = revert the frontend
files this change touches (`ticket-bar.tsx`, `schedule-grid.tsx`, `task-editor-dialog.tsx`,
`schedule-range.ts`, `schedule-view.tsx`, the two message files) — the previous
rendering and date handling are restored, including the overlap and width defects.
Unit tests and `bunx biome check` run before commit; Playwright e2e runs with the dev
servers up.

## Open Questions

None that would change the specs or this approach. Deferred follow-ups, each with its
own spec when requested: partial-hours/`allocated_hours` bars, a role color palette,
row collapsing and an Odoo-style detail side panel, terminal-state dimming, and a
conflict/overlap decoration layer.
