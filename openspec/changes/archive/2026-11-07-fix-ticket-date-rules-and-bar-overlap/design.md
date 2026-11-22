# Design

## Context

See `proposal.md` for motivation. The technical starting points that shape this
design:

- **Bars are CSS grid items, not measured.** `schedule-grid.tsx` renders one grid
  per employee row with `gridTemplateColumns` (`224px repeat(cols, Npx)`) and a
  fixed `height: ROW_HEIGHT` (52px). Each bar sets `gridColumn` and `gridRow`
  inline, so placement needs no layout measurement — that is why the lane
  approach is a layout change, not a measuring one.
- **The overlap is a grid-row collision.** On `main` every bar sets `gridRow: 1`
  in a 52px row, so two bars in the same lane paint over each other.
- **A lane packer already exists but is uncommitted.** `assignLanes` in
  `schedule-range.ts` sorts a row's bars by start column, reuses the first lane
  whose last bar ends at or before the new bar's start, and grows the row to
  `laneCount × ROW_HEIGHT`. Fuzzing it over 3,000 random ticket sets across all
  four scales found **zero** same-lane overlaps and zero disagreements between
  what the packer computes and what the renderer draws — the algorithm is sound.
  What is missing is commitment, coverage, and the gaps listed below.
- **The drop-resolution math is already lane-aware.** `rowForLaneOffset` maps an
  absolute lane offset onto a row index, so a drop lands correctly even when rows
  differ in height — but `ticket-bar.tsx` feeds neodrag a fixed 52px grid, so the
  pixel-to-lane conversion is what is wrong, not the mapping.
- **Two creation surfaces write different date shapes.** The schedule editor uses
  the pure helpers in `task-dates.ts`; `create-ticket-view.tsx` has its own
  `todayAt`/`isoDay` pair that sends no `startDate` for `DAILY`/`HOURLY` and
  writes UTC midnights.

## Goals / Non-Goals

**Goals:**

- Guarantee, on every scale and custom range, that no two bars in a row overlap
  and every ticket touching the window draws a bar.
- Make the category/date rule set a single pure module that both surfaces call.
- Fix the Jobs payload so `DAILY`/`HOURLY` tickets carry a start and `MULTI_DAY`
  spans are timezone-stable.
- Keep the fix verifiable without a browser: packer and rules are pure and unit
  tested; e2e covers the geometry.

**Non-Goals:**

- Backend enforcement of the same rules (`backend/src/domain/tasks.ts` still
  validates only `endDate >= startDate`, and `defaultEndDate` still leaves
  `DAILY`/`HOURLY` tickets without a start).
- Migrating the existing out-of-shape rows.
- The server-side import preview's per-row validation.
- Any change to the visual language (light fill, state-colored border, category
  stripe) agreed in `improve-schedule-bars-editor-and-rows`.

## Decisions

### D1 — Keep grid-based lane placement; do not measure

Bars stay CSS grid items with inline `gridColumn`/`gridRow`. The alternative —
computing `top`/`left`/`width` in pixels from measured geometry — would buy
nothing here and reintroduce measurement bugs on scale change. Lane assignment
stays in `schedule-range.ts` as a pure function of `(tasks, cols, scale)`.

### D2 — Reuse `assignLanes`; commit and harden it rather than rewrite

The existing packer is fuzz-proven correct for placement. The work is to (a)
commit it, (b) make the row label report **lanes** rather than bars (today
`t("laneCount", { count: lanes.length })` counts bars, so a 6-bar/5-lane row
reads "6 bars"), and (c) cover it with unit tests that name the invariant: no two
bars in a lane overlap, and no bar is wider than its interval.

### D3 — Clamp out-of-shape tickets instead of dropping them

`placeBar` currently returns `null` for a `DAILY` ticket whose stored start is
before the window, because its span is pinned to 1 column from the start.
Instead, a `DAILY`/`HOURLY` ticket whose stored interval spans days is placed on
the **single day it is due** (its effective last day, clamped into the window),
and a ticket with no `startDate` is placed on its end day. This keeps the
invariant "no ticket due inside the window is left off the grid" without needing
a data migration. Mutating stored data was rejected: it would silently edit
history.

### D4 — One pure rule module shared by both surfaces

`task-dates.ts` already owns the category rules (`DAILY` next-day 00:00 end,
`MULTI_DAY` end day + 1, `HOURLY` exact end hour, plus derivation on category
change). The Jobs form's private `todayAt`/`isoDay` are replaced by calls into
that module, so the two surfaces cannot drift again. The form keeps its slot
pickers (the domain's 10:30/14:00/16:30 and 17:00/18:00 choices); only the shape
of the payload changes.

### D5 — Local midnights in the payload

`isoDay` writes `T00:00:00.000Z` / `T23:59:59.999Z`. In UTC+7 that reads as 07:00
and 06:59-next-day, which both shifts the bar by a day and defeats the
midnight-inclusive end-day rule, producing bars one day short of their label. The
rules module will emit local-midnight values on the same convention the schedule
reader already expects, so an end at local midnight means "through that day".

### D6 — Lane-based drag snapping

`ticket-bar.tsx` passes `grid: [colWidth, rowHeight]` to neodrag. With variable
row heights the vertical snap must be counted in lanes and resolved through
`rowForLaneOffset`, which already does exactly that. The neodrag grid is set to
`[colWidth, ROW_HEIGHT]` for the horizontal axis only, and the vertical axis is
resolved from the lane counts, so a drop of N lanes lands on the row that owns
lane `firstLane + lane + N`.

## Risks / Trade-offs

- **[Tall rows on heavily-loaded employees]** → A row with many overlapping
  tickets grows to `laneCount × 52px`. Mitigation: the grid already scrolls, and
  the row header carries the count so tall rows are legible; the design does not
  cap lanes, because capping reintroduces overlap.
- **[Legacy out-of-shape rows render "wrong" after the fix]** → A `DAILY` ticket
  stored spanning months now draws one bar on its due day, which may surprise a
  user who remembers seeing nothing. Mitigation: this is strictly more visible
  than today, and the data gap is recorded as out of scope for the backend.
- **[Two surfaces, one module]** → Any future third surface must import the same
  module rather than re-deriving dates. Mitigation: the module is pure, named for
  the domain (`task-dates`), and unit-tested.
- **[Uncommitted predecessor change]** → `improve-schedule-bars-editor-and-rows`
  is complete but uncommitted and unarchived; this change builds directly on its
  working tree. Mitigation: tasks begin by confirming the current tree state, and
  the change is not archived until both are committed.

## Migration Plan

No data migration. Rollback is reverting the commit: the layout degrades to
overlapping bars and the Jobs form to start-less `DAILY`/`HOURLY` payloads, both
pre-existing behaviors rather than new failure modes.

## Open Questions

None.
