# Tasks

## 1. Selection helpers

- [x] 1.1 Create `frontend/src/components/jobs/assignee-selection.ts` with an id-based item comparison and a first-occurrence list de-duplication over `UserRef`-shaped options; verify the new module type-checks with the frontend's `tsc --noEmit` run.
- [x] 1.2 Add `frontend/src/components/jobs/assignee-selection.test.ts` (colocated `bun:test`, no DOM) covering the spec's scenarios: the same employee as two distinct objects compares equal, a re-selection removes rather than appends, and de-duplication keeps the first occurrence in selection order; verify `cd frontend && bun test src/components/jobs/assignee-selection.test.ts` passes.

## 2. Wire the create form

- [x] 2.1 Pass the id comparison as the combobox root's item-equality hook in `frontend/src/components/jobs/create-ticket-view.tsx` so selecting an already-selected employee toggles the chip off; verify `bunx biome check` (frontend scope) reports no new findings.
- [x] 2.2 De-duplicate by id on the `onValueChange` write to `assignees` so no code path can hold one employee twice; verify `tsc --noEmit` stays clean and the submit path still sends `assignedToIds` mapped from `assignees` in the existing id order — no shape change.
- [x] 2.3 With dev servers up, open `/jobs/new`: confirm the creator is preselected as one chip, select their own entry from the dropdown, and verify that employee is removed from the selection rather than duplicated (and the chip's remove control removes that employee); verify the console no longer reports `Encountered two children with the same key`.

## 3. Gates

- [x] 3.1 Run `cd frontend && bun test src/` and `cd backend && bun test`; verify both suites pass (backend as an untouched-code regression check).
- [x] 3.2 Run frontend `tsc --noEmit` to completion and `bunx biome check frontend backend` from the repo root; verify tsc exits 0 and Biome reports no errors beyond the known pre-existing warnings.

## Workflow follow-up

- Archive the change after review via `/opsx-archive fix-assignee-combobox-duplicate-chips` once the apply phase is complete.
