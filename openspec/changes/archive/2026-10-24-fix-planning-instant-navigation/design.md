# Design

## Context

See `proposal.md` — Why. Current state that shapes the approach:

- `frontend/src/app/(app)/layout.tsx` already declares `export const instant = false;` (fixed in the completed `fix-frontend-dev-errors` change), covering the authenticated shell tree.
- `frontend/src/app/(app)/page.tsx` (dashboard) already declares `export const instant = false;` (fixed in the same change).
- `frontend/src/app/(app)/planning/page.tsx` has no such declaration — Next.js drops the planning segment from rendering and reports an instant-navigation validation error on every navigation to `/planning`.
- `instant` is a route-segment export, not inherited by child segments from the layout: each page/default segment needs its own declaration.
- `instant` cannot be used in Client Components; `planning/page.tsx` is a Server Component (no `"use client"` directive), so the declaration is valid there.

## Goals / Non-Goals

**Goals:**

- Remove the instant-navigation validation diagnostic for `/planning` by declaring the segment's intent, not by muting output.
- Keep the declaration narrow: only the planning page segment is opted out of instant-navigation validation.

**Non-Goals:**

- Making planning navigation instant. That needs the viewer resolved before the response is sent (server-side session reads), which is a separate architectural change.
- Changing any planning domain behavior (calendar, leave requests, approval board, etc.).

## Decisions

### 1. Add `instant = false` to `planning/page.tsx`

**Why here:** `planning/page.tsx` is the Server Component for the planning segment, and `instant` throws in Client Components — it is the only place the declaration can go. Scoping it to `planning/page.tsx` leaves other app screens validated.

**Why declare rather than render:** the viewer is resolved in the browser by design (the BFF keeps the session token in an httpOnly cookie and `/api/mes/session` returns the viewer), so planning content genuinely cannot exist in a prerendered shell. Declaring that navigation may block states the app's real behavior instead of pretending it is instant.

**Alternatives rejected:** giving the planning page a non-empty viewer-independent shell (the shell is viewer-dependent and shared by every page, so this would restructure the whole authenticated surface to satisfy a diagnostic); switching the framework's validation level to only validate opted-in segments (broader than needed).

## Risks / Trade-offs

- [`instant = false` suppresses future navigation-instantness findings for the planning segment] → Accepted and stated in the proposal as a deliberate trade-off. Other app screens stay validated, and making planning navigation instant belongs to a separate change.
- [`instant` is per-segment, not inherited from `layout.tsx`] → Documented here and in the spec; each page segment that opts out needs its own declaration.
- [A future edit could quietly drop the declaration and bring the warning back] → The verification steps assert the dev-server output directly rather than relying on the absence of a build failure.

## Migration Plan

- No data, API, or dependency migration. The edit is independently revertible.
- Rollback: reverting the declaration restores the dropped-segment / instant-navigation error for `/planning`. No persisted state, so rollback needs no cleanup.

## Open Questions

None.
