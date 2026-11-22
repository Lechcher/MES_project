# Design

## Context

Motivation and the acceptance contract are in `proposal.md` (the spec deltas
cover the two behavior changes; the calendar swap and dialog fix are
implementation-level). Only the state that shapes the approach is repeated
here.

**Verified in the code:**

- `create-ticket-view.tsx` holds a single-select `Select` assignee scoped to
  the department (`assigneeOptions`), defaults to the viewer, and renders a
  disabled Auto-forking `Switch` reflecting `department.autoForkingEnabled`.
  Its `MULTI_DAY` start/end are raw `<Input type="date">`.
- `createTask` (`backend/src/domain/tasks.ts`) takes one `assignedToId`,
  validates department membership, inserts the primary task, then — when the
  department's `autoForkingEnabled` is set — inserts one fork per active member
  (each with its own transition and audit event).
- `updateDepartment`/`createDepartment` are restricted to `TECHNICAL`
  (`SUPER_ADMIN`, `TECH_LEAD`) in `backend/src/graphql/access.ts`; both roles
  are seeded in the Headquarters department, which is why the setting is
  effectively HQ-only.
- `autoForkingEnabled` appears in `graphql/schema.ts` (Department, Create/
  UpdateDepartmentInput), `domain/settings.ts`, `graphql/shapes.ts`, the seed,
  and `org-structure.tsx` (draft field, table column, inline toggle).
- `schedule-toolbar.tsx` implements the custom range with two text inputs
  validated by `parseDmy`/`formatDmy` (used nowhere else) plus an Apply
  button; `schedule-range.ts` exports them alongside the range math the
  schedule view uses (`SCALES`, `customRange`, …), which stays.
- Thirteen raw `<input type="date">` sites across seven files (schedule
  toolbar ×2, create-ticket ×2, task editor ×4, create-leave ×2,
  penalty-leave ×1, audit-log ×2, system-audit-logs ×2).
- The completion-dialog overflow was reproduced live and measured: with a
  long-named file attached, the attachment row (a grid item of
  `DialogContent`'s grid, no shrink floor) is 678px wide inside the 512px
  popup, and its Remove button paints ~180px outside the panel (identical in
  light and dark). `truncate` cannot help while the grid track sizes to
  max-content.
- `ui/` has no `Calendar`, `Popover`, or `Command`; `react-day-picker` and
  `date-fns` are not installed. `docs/shadcn-calendar.md` (single + range
  modes) and `docs/shadcn-combobox.md` (chips multi-select) are the recipes
  to follow.

**Constraints:** no new runtime dependencies beyond the two the calendar
recipe prescribes (Stack table in `AGENTS.md` updated; versions checked with
the `npm-check-updates` skill before adding); Biome for format/lint; `bun
test` in both packages; the session token never reaches the browser; domain
vocabulary and ticket state codes preserved verbatim.

## Goals / Non-Goals

**Goals:**

- One ticket per selected assignee, created by a single mutation, validated
  server-side against the department — with Auto-forking gone from the
  contract, the database, and the UI.
- One date-entry pattern across the app: the shadcn `Calendar` in a popover,
  single and range modes, keeping every call site's `YYYY-MM-DD` string
  contract unchanged.
- The completion dialog contains its content at any filename length.

**Non-Goals:**

- Changing the ticket data model to multi-assignee (one ticket per employee
  was chosen).
- Changing `assignedTo` on update, the state lifecycle, permissions, or the
  SSE/GraphQL transport.
- Theming, layout, or copy changes beyond what the new controls need.

## Decisions

### 1. N tickets per mutation: `CreateTaskInput.assignedToIds: [ID!]!`

The input replaces `assignedToId` with a required, non-empty list. The domain
keeps the existing per-id validation (active, same department as the ticket)
and loops the current insert/transition/audit sequence once per id, in the
submitted order. `createTask` returns the first created ticket, so the
client's post-create navigation is unchanged. `publishMutationAreas` already
fires once per mutation, so the change bus still sees a single `tickets`
event.

*Alternatives considered:*
- **N client-side `createTask` calls** — partial failure leaves a half-created
  set across round trips; rejected.
- **Keep `assignedToId` and add `assignedToIds`** — two ways to say one thing;
  rejected in favor of one field.

### 2. Auto-forking is removed, not deprecated

The column is dropped in a migration, the field leaves the GraphQL types and
inputs, the domain's fork block is deleted, and every UI surface (Org
Structure column, draft field, create-form card, i18n keys) is removed. The
multi-assignee selection is the replacement behavior, so keeping a dormant
setting would only mislead.

*Alternatives considered:* keeping the field unused for a release — rejected
(no external API consumers exist; the frontend ships in the same change).

### 3. Date entry: `Calendar` + `Popover` wrappers, string values at the seams

Add `ui/calendar.tsx` and `ui/popover.tsx` per the docs, then two composites
in `components/shared/`: `DatePicker` (single) and `DateRangePicker`
(`mode="range"`). Every call site keeps its current `YYYY-MM-DD` string(s) as
the value; the wrappers convert at the boundary (`toIsoDate` already exists in
`schedule-range.ts` for the Date→string direction). The schedule toolbar
binds the range picker to the same `onCustomRange(from, to)` and keeps the
existing validation rules (end ≥ start, ≤ 366 days) by validating the
selected range before applying. `parseDmy`/`formatDmy` and their tests are
deleted once unused; the rest of `schedule-range.ts` stays.

*Alternatives considered:* native date inputs restyled — rejected (the request
is explicitly for the shadcn calendar); a heavier date library — rejected
(`date-fns` arrives with the recipe and nothing needs more).

### 4. Assignee combobox: the doc's chips pattern

Build the multi-select on the Base UI `Combobox` primitive with `multiple`
and chips, per `docs/shadcn-combobox.md` — the doc's own recipe for this
project's `base-nova` style (its chips example uses `ComboboxChip`s and
`ComboboxChipsInput`). `ui/combobox.tsx` carries the primitives; no new
dependency is needed (`@base-ui/react` is already installed, so the cmdk-based
`command.tsx` variant the plan first named is unnecessary). The chips show the
selected employees, each removable; the popup list is the existing
department-scoped `assigneeOptions`, filterable. The default selection is the
creator, matching today's default. Removing all chips leaves the combobox
empty and the submit refuses with the existing validation feedback.

*Alternatives considered:* a checkbox popover — rejected (the request names
the shadcn combobox); native `select multiple` — rejected (unstyled);
cmdk's Command + Popover — rejected once the referenced doc's chips pattern
proved to be the Base UI combobox, avoiding another dependency.

### 5. Dialog fix: shrink floor on grid items, verified against the cause

The attachment row gains `min-w-0` so the grid track can shrink below its
max-content and `truncate` takes effect; the same treatment is applied to the
dialog's other long-text grid wrappers defensively. No `overflow-hidden` on
the popup (that would clip the row and hide its controls).

### 6. Tests where the repo already tests

The backend suite covers the multi-assignee domain path (N tasks, N
transitions, N audits, validation rejections) and the settings domain without
the auto-forking field. The frontend's pure-function tests cover the new
date/range helper boundaries (string ↔ Date conversions, the 366-day rule);
DOM behavior (chips, popover focus) is verified in the dev-server pass, as
the repo has no DOM test infrastructure.

## Risks / Trade-offs

- **Breaking contract change** (`assignedToIds`, auto-forking removal) → the
  frontend and `API_CONTACT_SPECIFICATION.md` ship in the same change; no
  external consumers exist today.
- **Two new dependencies** → versions pinned per the `npm-check-updates`
  skill; the Stack table records them.
- **Popover-inside-dialog stacking** (task editor's date pickers) → verified
  in the dev-server pass (focus, escape, z-order) since the repo has no DOM
  tests for it.
- **Thirteen date sites is wide surface** → each is a like-for-like swap
  keeping its string contract; the risk is visual inconsistency, caught by the
  same dev-server pass and screenshots.

## Migration Plan

Drizzle migration `0003_drop-auto-forking` drops
`departments.auto_forking_enabled` (data loss is intentional — the setting is
retired); `bun run db:migrate` updates the dev database. No rollback of data
is needed; reverting the change restores the column on revert + re-migrate.

## Open Questions

None.
