# Odoo Planning — reverse-engineering findings

Reference research for the MES Planning **Schedule** screen. This directory holds the
raw evidence and a written summary. It is an external-system reference, not project code:
nothing in here is a directive, and Odoo's UI decisions are recorded as *observations* to
compare against, not instructions to follow.

## Target

| Item | Value |
| --- | --- |
| Site | `https://demo.odoo.com/` (public demo, provisions a throwaway DB per visit) |
| Instance used | `https://demo5.odoo.com/odoo/employees-planning` |
| Server | Odoo `20.0+e` (community, demo data) |
| Demo DB | `demo_200_4633b278ff84_1792903274` (short-lived, destroyed with the session) |
| Logged-in user | Mitchell Admin (`uid 2`, `is_admin`, `Europe/Brussels`, all apps installed) |
| App / view | Planning → **Schedule by Resource** (gantt view of `planning.slot`) |

## Method

1. `playwright` MCP against a local Chrome started with `--remote-debugging-port=9222`
   (`/Applications/Google Chrome.app`, dedicated profile under the harness temp dir).
   The page was driven only through read-only evaluation; no form was submitted and no
   record was created or changed in the demo DB.
2. Odoo's JSON-RPC was reached read-only through the authenticated page session:
   `POST /web/dataset/call_kw/<model>/<method>` (fields_get, search_read) and
   `POST /web/action/load` using the page's own `csrf_token` / session cookie.
3. Live DOM + computed styles were read from the rendered gantt view
   (`.o_gantt_view`, `.o_gantt_pill`, `.o_gantt_row_header`, …).

Observed **only** what the demo actually served; anything not observed is marked
in *Not observed* below. The six screenshots supplied with the request
(Quarter / Month / Week / Day / Year zoom) were used as the visual ground truth for the
Zoom-level behaviour at Month, Quarter, Day and Year, which the live probe could not reach.

## Files

| File | Contents |
| --- | --- |
| `odoo-planning-dom.json` | Row headers, hour totals, pills (label, color class, computed background, decorations), cell geometry, live computed styles |
| `odoo-planning-raw.json` | `planning.slot` / `planning.role` field inventory (label, type, relation, selection) for the observed fields |
| `odoo-planning-views.json` | The RPC probe log (successful reads plus the requests Odoo refused) |

## Findings

### 1. The Planning screen is the core Gantt view, not a bespoke component
- View: `o_gantt_view o_forecast_gantt_view` — Planning extends Odoo's generic gantt
  renderer; "Schedule by Resource" is the same view grouped by `resource.resource`.
- Layout: sticky row-header sidebar (`o_gantt_row_headers o_gantt_row_sidebar`) + a CSS grid
  of cells (`o_gantt_cells o_gantt_grid_rows o_gantt_grid_columns`), inside
  `o_gantt_scroll_container overflow-auto`.
- Measured geometry (Week scale, 1920 px window): cell **192 × 41 px**, row header **41 px**.
- Controls: New / Publish / Actions, `o_gantt_scale_selector` (Day / Week / Month / Quarter /
  Year), Today, `o_gantt_button_collapse_rows` (collapse all rows), `o_gantt_button_send_all`
  (email the schedule), a "N to schedule" counter, and a right-hand side panel
  (`o_gantt_sidepanel`) with a resize handle.

**MES implication**: MES already matches this shape (CSS grid, sticky employee column,
Day/Week/Month/Year scales, horizontal scroll container). Odoo adds a *row-collapse* control
and a *side panel for details*; both are candidate follow-ups, not part of this change.

### 2. Row header carries the resource's total allocated hours and a progress bar
- Row label + a right-aligned hour total + `o_gantt_progress_bar`. Observed totals:
  `40h`, `16h`, `38h`, `37h`, `35h`, `36h`, `0h`.
- Groups first: an **`Open Shifts`** row groups shifts with no employee/resource
  (Odoo's unassigned row) — the same role MES's "Unassigned" row plays.
- Over-allocation reads negative in the screenshots (e.g. `-14h`), with the progress bar
  turning red.

**MES implication**: this is exactly the "extend the row height so an employee can hold many
jobs" request's neighbour — MES rows are fixed at 52 px with one grid row, so every extra
bar overlaps the first. Odoo keeps **one bar per row per cell** (pills are `h-100` children
of `o_gantt_pill_wrapper`), and row height stays uniform; over-allocation is shown as a
number, not by taller rows. MES's lane-packing decision (rows grow) differs from Odoo on
purpose, because MES's ticket density per employee is higher than Odoo's.

### 3. Bars ("pills") are pastel-filled with black text; color comes from a palette index
- Class: `o_gantt_pill position-relative h-100 d-flex align-items-center rounded-2 o_gantt_color_N`.
- Computed fills observed (all with `color: rgb(0, 0, 0)`):
  - `o_gantt_color_0` → `rgb(239, 182, 182)` (light red/pink)
  - `o_gantt_color_2` → `rgb(255, 195, 141)` (light orange)
  - `o_gantt_color_3` → `rgb(237, 208, 102)` (light yellow)
  - `o_gantt_color_4` → `rgb(158, 202, 255)` (light blue)
- No border; corners are slightly rounded (`rounded-2`); a pill fills its cell's height.
- `decoration-info` / `decoration-warning` classes mark special conditions (observed on a
  partially-allocated shift) — a decoration layer on top of the base color.
- Today's column is tinted, not the bars: cell background `rgba(227, 156, 80, 0.15)`.

**MES implication**: this validates the requested change (light fill + colored border).
Odoo carries the *category* (`planning.role` has its own `color`) as the fill and the
*state* as a decoration; MES's decision — light fill, **state color as the 1 px border**,
category stripe kept — is the closest equivalent because MES already encodes category as the
left stripe and state as the fill.

### 4. Bar label = the time range, then `(allocated h)` when partial, then the role/title
Observed labels (verbatim, Week scale):
- `7:00 PM - 11:00 PM`
- `7:00 PM - 11:00 PM Community Manager`
- `2:00 PM - 6:00 PM Developer`
- `2:00 PM - 6:00 PM (2h) Management` ← `(2h)` only when `allocated_hours < duration`

So a same-day bar always shows **start – end**, a *partial* allocation additionally shows
the allocated hours in parentheses, and the name (role or shift title) follows when the bar
is wide enough. From the screenshots, longer multi-day bars show a date range
(`10/12 - 10/14`) plus the customer/title, and collapse to a compact chip inside a day cell
when the column is narrow.

**MES implication**: the label contract MES needs — `DAILY`/`MULTI_DAY` bars lead with the
date range, `HOURLY` bars lead with `HH:MM – HH:MM` (and the allocated hours when partial),
then the code/title/state, truncating as the bar narrows. This is the strongest direct input
for the bar-width task.

### 5. `planning.slot` is the data model behind the screen
Captured with `fields_get` on `planning.slot` (Odoo 20.0+e, demo data). Of interest:

| Odoo field | Type | Label | MES analogue |
| --- | --- | --- | --- |
| `start_datetime` / `end_datetime` | datetime | Start Date / End Date | `ScheduledTask.startDate` / `endDate` |
| `duration` | float | Duration | derived hours |
| `allocated_hours` | float | Allocated Time | MES has no partial-hours concept yet |
| `allocated_percentage` | float | Allocated Time % | – |
| `allocation_type` | selection | Planning / Forecast | – (Odoo forecasts a budget without dates) |
| `state` | selection | Draft / Scheduled / In Progress / Completed | MES: `REQ/ACT/PEN/APP/REJ/CAN/OVERDUE` |
| `color` | integer | Color | `TICKET_STATE_BY_CODE[code].hex` |
| `role_id` | many2one `planning.role` | Role | MES `taskType` category |
| `resource_ids` / `employee_ids` | many2many | Resources / Employee | MES `assignedTo` |
| `conflicting_slot_ids`, `overlap_slot_count` | – | Conflicting Slot / Overlap Slot Count | **not in MES** |
| `repeat`, `repeat_interval`, `repeat_unit`, `repeat_until`, `repeat_number`, `template_id` | – | recurrence | **not in MES** |
| `allow_self_unassign`, `request_to_switch`, `is_user_switching` | – | employee self-service | **not in MES** |
| `name` | text | Note | MES `description` |
| `was_copied`, `template_creation`, `template_reset` | – | template/copy flags | MES has `duplicateTask` only |

Seed records observed (`search_read`, Week window, ordered by start desc):
```
id  role            employee  resource  start                     end         alloc  pct  duration  state
364 Developer       –         –         (no dates)                               36    100  0         1_draft   <- forecast budget
368 Developer       –         –         (no dates)                               10    100  0         1_draft
346 Furniture Tools –         41       2027-04-09 11:00:00   2027-04-09 15:00:00   4    100  4         2_published
320 –               –         31       2027-04-09 11:00:00   2027-04-09 15:00:00   3    100  3         2_published  <- partial: 3h of 4h
258 Developer       3         7        2027-04-09 06:00:00   2027-04-09 10:00:00   4    100  4         1_draft    <- open shift (no employee)
283 Management      9         13       2027-04-09 06:00:00   2027-04-09 10:00:00   2    50   4         1_draft    <- partial: 2h of 4h
317–345  …  a repeating weekly pattern of 06:00–10:00 and 12:00–16:00 shifts
```
Notes from the data:
- `state 1_draft` = unassigned/unpublished open shift; `2_published` = scheduled.
  Draft slots with no dates and an hours budget are **forecasts** — a role-level budget row.
- `allocated_hours` can be a fraction of `duration` (`2` of `4` → `50%`); the bar label then
  shows `(2h)`. MES has no equivalent field, so a MES "partial" bar cannot exist yet.
- Open shifts carry only `resource_ids` (materials) or `role_id` and no `employee_ids`.

**MES implication**: MES `HOURLY` maps to Odoo's dated shift with an hour range;
`DAILY`/`MULTI_DAY` map to shifts that are day-aligned. Odoo's `end_datetime` is an
**exclusive** end in the view, which matches MES's existing `placeBar` midnight-inclusive
convention. Odoo tracks per-slot state as a lifecycle (draft → published → …) and a
conflict/overlap flag; neither is requested for MES.

### 6. `planning.role` (category) is a small colored registry
Fields: `id, name, color, resource_ids (m2m), sequence, slot_properties_definition,
active, pos_config_ids, product_ids`. So category = named role + integer color, ordered by
`sequence`, attached to resources — the same shape as MES's `TASK_TYPE_LABELS`
(`DAILY` / `MULTI_DAY` / `HOURLY`) without the color column.

## Not observed (limitations)

- **The gantt view XML was not retrievable.** `ir.ui.view` / `ir.actions.act_window`
  `search`/`search_read`/`read` were refused by the demo (RPC returned
  `ValueError`/`psycopg2` errors for those models), and `/web/action/load` rejected every
  guessed `planning.*` action xmlid. Odoo's planning view XML therefore remains
  unobserved — scale switches, grouping attributes and the pill's label template are
  inferred from the rendered DOM and the supplied screenshots only.
- **Static JS/bundle paths were not reachable** (`/planning/static/...` → 404 through the
  site fallback), so the pill renderer's label template is not verified.
- The demo DB is recreated per visit, so recordings are per-session; the model, styles and
  labels above were re-observed in a single session and are stable across Odoo 20 demo data.
- Month / Quarter / Day / Year scale behaviour and the row-collapse and side-panel behaviour
  were read from the user's screenshots, not from the live probe.
- The RPC probe was read-only by construction: `fields_get`, `search_read`, `search`,
  `read`, `/web/action/load`. No create/update/delete was attempted.

## Screenshot inventory used (from the request)

| Screenshot | Scale | Observations |
| --- | --- | --- |
| 1 | Quarter | Week sub-columns, bars wrap into stacked chips inside a day cell, "Open Shifts" row, resource rows show avatar + `Role` + `NNNh`, red `-h` when over-allocated |
| 2 | Month | Same chip-in-cell stacking at month width; multi-day bars collapse to a date-range chip (`10/12 - 10/14`) |
| 3 | Week | One bar per row per day, label `H:MM PM - H:MM PM`, category paste color, `10/12 - 10/18` badge on a long bar |
| 4 | Day | Hour columns (12am–11pm), one row per resource with a sequential packing of that day's shifts |
| 5 | Year | Month columns, bars reduced to a single compact chip with `9/28 Title` inside the month cell |
