# Proposal

## Why

Three rendering defects on the Planning Schedule view (`/planning`), reported with
screenshots:

1. **The schedule table stretches the page instead of scrolling.** At a 1200px-wide
   window the document scrolls to 2362px and the timeline is cut at the viewport
   edge — hours past ~14:00, and the ticket bars on them, are unreachable. The
   grid's own `overflow-x-auto` host never constrains: its client width equals its
   2336px content, because the bordered container is a CSS Grid item that refuses
   to shrink below its content (`min-width: auto`), so the track — and the page —
   grow instead of the host scrolling.
2. **Ticket bar chevrons overlap the ticket content.** The continues-before /
   continues-after `ChevronLeft` / `ChevronRight` are absolutely pinned 2px from
   the bar's edges, on top of the category icon, task code, and trailing state
   label, so the continuation hints collide with the very text they annotate.
3. **The date-range calendar's band is invisible in dark mode.** The days between
   the selected from/to dates are painted with `bg-muted`, whose dark value
   (`#262626`) is exactly `--popover`, so the in-between days show no band at
   all; in light mode the same band is visible (`#f4f4f4` on `#ffffff`), so the
   calendar reads differently per theme.

## What Changes

- The schedule grid SHALL fit the available viewport width and scroll its
  timeline horizontally inside the grid: the page itself never scrolls
  horizontally, and every hour/day column and ticket bar is reachable by
  scrolling the grid body (the sticky employee column and sticky header keep
  their current behavior).
- Ticket bar continuation chevrons SHALL sit clear of the bar's content with
  visible spacing, staying edge-anchored as continuation hints instead of
  overlapping the category icon, code, or trailing label.
- The date-range calendar SHALL render the days between the selected from and
  to dates on a band surface that is visibly distinct from the popover
  background in every theme (light and dark), with the two endpoint days still
  reading as the selected bounds.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `frontend/planning`: adds requirements for the schedule grid's viewport/scroll
  behavior, ticket-bar continuation-chevron spacing, and the date-range
  calendar's range-band visibility.

## Impact

- `frontend/src/components/planning/schedule/schedule-grid.tsx` — width
  constraint on the grid container so the existing scroll host actually
  scrolls.
- `frontend/src/components/planning/schedule/ticket-bar.tsx` — chevron
  placement and reserved spacing.
- `frontend/src/components/ui/calendar.tsx` — range band classes on the shared
  Calendar primitive (its only range consumer today is
  `frontend/src/components/shared/date-range-picker.tsx`, used solely by the
  schedule toolbar).
- Frontend Playwright specs under `frontend/tests/` for verification: schedule
  viewport/scroll, chevron spacing, and the calendar band in both themes.
- No backend, GraphQL API, schema, i18n, or data changes. Theme token values do
  not change — the calendar gains a band surface distinguishable from the
  popover within the existing tokens.
