# Design

## Context

Motivation and observable requirements are in `proposal.md` and the spec delta
(`specs/frontend/planning/spec.md`). The implementation facts that shape the
approach:

- **Grid layout** (`frontend/src/components/planning/schedule/schedule-grid.tsx`):
  the bordered container is a CSS Grid item of `<div className="grid gap-4">`
  in `schedule-view.tsx`. Inside it, an `overflow-x-auto` host wraps a
  `minWidth` inner box (`EMPLOYEE_COL_PX + cols.length * colWidth` — 2336px at
  the DAY scale). Measured live at a 1200px viewport: the document scrolls to
  2362px while the scroll host's client width equals its content width (2336px)
  — the host never clips. Grid items default to `min-width: auto`, so the
  bordered box's min-content contribution sizes the track instead of letting
  the host scroll. The sticky employee column (`sticky left-0`), the sticky
  header (`sticky top-0`), and the drag bounds (`boundsElement` = the scroll
  host via `bodyRef`) all live inside this host and must keep working.
- **Ticket bars** (`frontend/src/components/planning/schedule/ticket-bar.tsx`):
  the bar is a flex row (`gap-1 px-1.5 border-l-4`, `overflow-hidden`). Its
  continues-before/after chevrons are absolutely positioned `left-0.5` /
  `right-0.5` (2px from the edges), overlapping the category icon (first flex
  child), the task code, and the trailing state label.
- **Calendar** (`frontend/src/components/ui/calendar.tsx`): the range band is
  `bg-muted` on the `range_start`/`range_end` cells plus
  `data-[range-middle=true]:bg-muted` on the day buttons. Measured live:
  `--muted` equals `--popover` (`#262626`) in dark mode — the band is the exact
  color of the popover background — while light mode has `#f4f4f4` on
  `#ffffff`, which reads fine. The day button fills its 28px cell
  (`gapLeft`/`gapRight` = 0), so the `::after` 16px slivers on the start/end
  cells are no-ops under the buttons. Endpoints render `bg-primary` (IBM Blue)
  and are legible in both themes. Theme tokens are shared app-wide; the range
  mode's only consumer today is the schedule toolbar's `DateRangePicker`.

## Goals / Non-Goals

**Goals:**

- The schedule grid fits the available width and scrolls its timeline
  horizontally inside the grid, with the page never scrolling horizontally
  (grid requirement, spec scenario 1).
- Chevrons stay edge-anchored continuation hints with clear spacing from bar
  content at every bar width (chevron requirement).
- A range band that is visibly distinct from the calendar background in both
  themes, endpoints unchanged (band requirement).

**Non-Goals:**

- Changing the scale column widths (88/128/96/132px) or row height / lane
  packing — the tall multi-lane rows are the seed data's shape, not a
  rendering defect.
- Changing theme token values (`--muted`, `--popover`, …) — the blast radius
  is every muted surface in the app.
- The calendar's `today` highlight, which collides with the same
  muted-equals-popover quirk in dark mode but is not part of this report.
- The single-date `DatePicker` mode and any other Calendar consumer modes.
- Backend, GraphQL API, schema, i18n, or data changes.

## Decisions

### D1 — Constrain the grid item so the existing scroll host scrolls

Add a min-width-0 constraint to the schedule grid's bordered container (one
class in `schedule-grid.tsx`), letting the grid track size to the available
width; the existing `overflow-x-auto` host then clips and scrolls as designed.

- **Alternative: an extra scroll wrapper** — re-adds the same defect one level
  up unless the wrapper also opts out of grid sizing; no benefit over the
  one-class fix.
- **Alternative: narrower columns** — only delays the overflow (the YEAR
  scale's 12×132px + employee column still exceeds common viewports) and does
  not stop the page from scrolling.
- **Alternative: fixed table width with transform scrolling** — reinvents
  what `overflow-x-auto` already provides, breaks native scrollbar/keyboard
  affordances.

The scroll host remains the drag `boundsElement`, and the sticky column and
header keep their current placement inside the host.

### D2 — Reserve inline edge space for the chevrons instead of overlaying them

Keep the chevrons absolutely anchored at the bar's edges (their continuation
semantics are edge-anchored), but reserve the space they occupy with
conditional inline padding on the bar: padding-left when `continuesBefore`,
padding-right when `continuesAfter`, sized to the 12px chevron plus a gap.

- **Alternative: render the chevrons as inline flex items** — shifts the
  bar's truncation balance (the code deliberately lets HOURLY hours shrink and
  dates truncate) and moves the trailing state label off the right edge;
  rejected as a wider behavior change.
- **Alternative: offset the chevrons further inward** — still overlaps at
  narrow bar widths and steals content space; rejected.

Because the padding is conditional, bars without continuations render exactly
as before.

### D3 — Give the range band a translucent brand tint instead of `bg-muted`

Paint the band with a translucent primary tint (`bg-primary/15`) on the
`range_middle` day button and the `range_start`/`range_end` cell fill, keeping
the solid `bg-primary` endpoint buttons.

- **Why not change `--muted`/`--accent` dark values**: those tokens are shared
  across every surface; a dark-value change would restyle the whole app to
  fix one calendar.
- **Why not `bg-foreground/10`**: works in both themes but reads as a neutral
  hover shade rather than a selected range.
- **Why not per-theme classes**: reintroduces theme-dependent rendering; a
  translucent brand tint composites correctly over both `#ffffff` and
  `#262626` with a single rule, and the e2e check asserts distinctness from
  the popover background in both themes.

The `::after` 16px slivers on the start/end cells remain inert (the button
fills the cell) and are left untouched.

## Risks / Trade-offs

- [The `min-w-0` constraint lets the container shrink to the layout width even
  when the timeline is short] → the grid keeps its `minWidth` inner box, so a
  short timeline still renders at its natural width; verified by the
  "narrower than the viewport" scenario at every scale in e2e.
- [DAY/YEAR scales still require scrolling] → intended; e2e asserts every
  column is reachable (scrollWidth > clientWidth on the host) rather than
  asserting a fixed pixel width.
- [Reserved chevron padding shifts text on continuing bars] → padding applies
  only when a chevron renders; the e2e box-intersection check guards overlap,
  and bars without continuations are byte-identical in layout.
- [A 15% brand tint could read too subtly on one theme] → the e2e asserts the
  computed band color differs from the popover background in both themes; if
  a theme needs more contrast, the alpha is a one-token adjustment.
- [Dev-server verification depends on the backend being up] → unrelated
  in-flight work is currently crash-looping the backend (GraphQL SDL error);
  unit tests and `tsc`/Biome gates run offline, and live verification runs in
  whichever window the backend is alive.

## Migration Plan

Frontend-only, no data, API, or schema changes. Rollback is reverting the
frontend commit; no migration or backfill applies.

## Open Questions

None. (The invisible `today` highlight is a known related quirk, deliberately
left out of scope — it would change the calendar's appearance beyond this
report.)
