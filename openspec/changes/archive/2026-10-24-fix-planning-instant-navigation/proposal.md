# Proposal

## Why

`bun run dev` reports an instant-navigation validation error for the `/planning` route: `src/app/(app)/planning/page.tsx` is dropped from rendering because Next.js cannot validate that the segment supports instant navigation. The viewer is resolved in the browser from `/api/mes/session`, so the planning page has no prerendered content — the same situation as the dashboard page (`src/app/(app)/page.tsx`), which was already fixed with `export const instant = false` in the completed `fix-frontend-dev-errors` change. Without the declaration, Next.js drops the planning segment from rendering, producing console noise and hiding real regressions during navigation.

## What Changes

- Add `export const instant = false` to `frontend/src/app/(app)/planning/page.tsx`, declaring that navigation into the planning page segment may block the immediately rendered UI.
- Add a corresponding requirement to the `frontend/planning` capability spec covering instant-navigation declaration for planning page segments.
- No breaking changes. No user-visible behavior change other than valid rendering; the diagnostic is development-time only.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend/planning`: Add a requirement that planning page segments declare instant navigation may block, because the viewer is resolved in the browser after the response is sent.

## Impact

- `frontend/src/app/(app)/planning/page.tsx` — instant-navigation declaration.
- `openspec/changes/fix-planning-instant-navigation/specs/frontend/planning/spec.md` — delta spec for `frontend/planning` capability.
- No API, database, dependency, or schema change. No backend impact.
