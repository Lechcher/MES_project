# Tasks

## 1. Add instant-navigation declaration to planning page

- [x] 1.1 Add `export const instant = false` to `frontend/src/app/(app)/planning/page.tsx`, and verify `cd frontend && bunx tsc --noEmit` passes with no new errors (the file stays a Server Component with no `"use client"` directive)
- [x] 1.2 Verify the development server reports no dropped-segment or navigation-instantness failure for `/planning`: run `cd frontend && bun run dev`, open `/planning`, and confirm the planning view renders and the error naming `src/app/(app)/planning/page.tsx` no longer appears in the server output

## 2. Verify public screens are not covered

- [x] 2.1 Verify `/signin` and `/reset-password` still render their own content immediately with no session-loading state (they are not opted out of instant-navigation validation)

## 3. Integration checks

- [x] 3.1 Run `cd frontend && bunx biome check` and confirm no new lint errors introduced by the change
- [x] 3.2 Run `cd frontend && bun run build` and confirm the build lists `/planning` among its routes with no instant-navigation warning
- [x] 3.3 Confirm the change touched nothing else: verify `git status --short` lists changes only under `frontend/src/` and `openspec/changes/fix-planning-instant-navigation/`, with no file under `backend/` modified

## Workflow follow-up

- Archive the change once the project's review requirements are satisfied.
