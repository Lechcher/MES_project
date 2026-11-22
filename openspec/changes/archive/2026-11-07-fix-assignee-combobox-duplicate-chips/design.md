# Design

## Context

The assignee combobox is a controlled Base UI `Combobox` in `multiple` mode
(`frontend/src/components/jobs/create-ticket-view.tsx:445-473`):
`value={assignees}` plus `onValueChange` writing back to `assignees` state, and
chips rendered by `values.map((user: UserRef) => <ComboboxChip key={user.id}>`).

Base UI 1.9.0 compares a candidate item against the selection through the
comparer on the root (`isItemEqualToValue`), defaulting to object identity
(`@base-ui/react/internals/itemEquality.js`: `defaultItemEquality = Object.is`).
The multiple-selection toggle is `combobox/root/AriaCombobox.js:687-688`:
`isCurrentlySelected = selectedValueIncludes(current, item, comparer)` decides
between removing the item and appending it.

Two facts collide:

1. The component never passes `isItemEqualToValue`, so comparison is identity.
2. The default selection is a locally constructed object (`viewerOption`, built
   from the session viewer at `create-ticket-view.tsx:110-121`), while the same
   employee in the dropdown is a `UserRef` from `USERS_QUERY` — same `id`,
   different identity. The item-equality call therefore reports "not selected"
   and Base UI takes the append path, producing two entries with the same
   `user.id` — the duplicate-key condition at `create-ticket-view.tsx:450`.

The backend already normalizes this: `createTask` trims `assignedToIds`, drops
empties, and de-duplicates with a `Set` (`backend/src/domain/tasks.ts:783-785`),
so no duplicate ticket can be created; the defect is confined to the form.

## Goals / Non-Goals

**Goals:**

- One chip per selected employee, always, from any selection source.
- Selecting an already-selected employee toggles their chip off.
- The de-duplication invariant is testable without mounting React (the repo has
  no DOM test runner — no `testing-library`/`jsdom` in `frontend`).
- No API, schema, or backend change.

**Non-Goals:**

- Rewriting the controlled value model (e.g., holding ids instead of objects)
  or changing how `viewerOption` is built.
- Auditing or fixing other combobox usages repo-wide; the create form is the
  only chips-based multi-select usage.
- Altering the backend `assignedToIds` normalization (kept as defense in
  depth).

## Decisions

**1. Pass an id-based `isItemEqualToValue` to the combobox root.**

Rationale: this is the library's own hook for item arrays whose value objects
are distinct instances of one entity; it restores correct toggle, selection
state on the list items, and chip-removal semantics at the source, and it
aligns with `itemToStringValue={(user) => user.id}` already treating `user.id`
as an item's identity. Alternatives considered:

- Make `viewerOption` reuse the exact object from the users query — rejected:
  correct only by data-timing luck, and any reset path (`department change`,
  `create-ticket-view.tsx:407`) rebuilds the object anyway.
- Hold ids as the combobox value — rejected: rewrites the controlled usage and
  the chip rendering for a condition two small changes handle.

**2. De-duplicate by id on every assignee state write (keep first occurrence).**

Rationale: the spec requires each employee at most once in the visible
selection and the submitted ids; enforcing it at the state boundary guarantees
that invariant no matter which code path produced the next array (Base UI, the
department reset, future edits). Alternative (comparator only) was rejected
because it leaves the invariant implicit. Keeping the first occurrence
preserves the existing selection order that the ticket creation order depends
on ("one ticket per selected employee, in the chosen order").

**3. Extract the two helpers into a colocated, DOM-free module with a sibling
`bun:test` file.**

Rationale: the established test pattern for component logic in this repo is a
pure helper module next to its component with a colocated test — for example
`frontend/src/components/performance/audit-filter.ts` +
`audit-filter.test.ts`. With no DOM runner, render-level tests are not
available; introducing one is out of scope. The helpers (an id comparison and a
list de-duplication) are pure and fully cover the spec's scenarios.

## Risks / Trade-offs

- **Other multi-select comboboxes could repeat this bug later** → mitigations
  are limited to this usage now; a follow-up audit is noted as a task-level
  follow-up, not a requirement of this change. Only one chips usage exists
  today (`grep` for `multiple`/`ComboboxValue` finds just the create form).
- **The comparer assumes `id` uniquely identifies an employee** → true for the
  users list; if a future option set mixes entity shapes under one collider,
  the helper must be generalized. Accepted as a documented trade-off.
- **Fix is frontend-only** → the backend normalization remains the data
  safety net; no migration, no rollback beyond reverting a two-file diff plus
  the new helper module.
