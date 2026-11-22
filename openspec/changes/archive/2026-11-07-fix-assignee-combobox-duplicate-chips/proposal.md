# Proposal

## Why

The create-ticket page mounts with a React console error — `Encountered two
children with the same key` at `frontend/src/components/jobs/create-ticket-view.tsx:450`
— whenever the assignee combobox holds the same employee twice. The preselected
creator and the identical employee in the dropdown are different objects, and
Base UI compares selected values by object identity (`Object.is`, item
equality in `@base-ui/react`), so picking the already-selected creator appends
a second chip instead of toggling it off. React then reconciles two children
under one `user.id` key — chips duplicate or drop and the selection is wrong on
screen. The backend is unaffected (`createTask` already trims, de-duplicates
with a `Set`, and drops empty ids in `backend/src/domain/tasks.ts`), so the
impact is confined to the create form's combobox behavior.

## What Changes

- Select an already-selected assignee toggles their chip off instead of
  appending a second one: the combobox compares employees by `id`, not by
  object identity.
- The assignee state keeps each employee id at most once, so a duplicate can
  never reach the chip list or the submit payload from any source.
- Add unit tests for the equality and de-duplication helpers, following the
  colocated `bun:test` pattern used for audited filter logic.
- No API/GraphQL contract change, no backend change, no new user-facing text.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `frontend/jobs`: the create form's assignee selection SHALL hold each employee
  at most once — selecting an already-selected employee removes that selection,
  and the submitted assignee list SHALL contain distinct ids.

## Impact

- Code: `frontend/src/components/jobs/create-ticket-view.tsx` (comparator plus
  a de-duplicated state write), a small colocated helper module and its
  `bun:test` tests.
- Backend, GraphQL schema, database: none. The domain already de-duplicates
  `assignedToIds`, so no mutation or spec row there changes.
- Behavior: visible only on the create form — one chip per employee, and a
  second click on a selected employee deselects them.
