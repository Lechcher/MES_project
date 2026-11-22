# Design

## Context

See proposal.md — Why. The root layout (`frontend/src/app/layout.tsx`) renders the pre-paint theme script as a direct child of `<html>`, and `<html>` does not tolerate the DOM change the script makes before React hydrates. `frontend/src/lib/mes/theme/provider.tsx` already re-applies the resolved class in an effect after mount, and the script body itself (`pre-paint.ts`) is a compile-time constant whose cookie/mode equivalence is covered by `config.test.ts`. Next.js's bundled `preventing-flash-before-hydration` guide documents the exact pattern this change adopts, including the cookie-based variant, and `next.config.ts` sets `cacheComponents: true`.

## Goals / Non-Goals

**Goals:**

- Root layout places the pre-paint script inside `<head>` and declares `suppressHydrationWarning` on `<html>`, so hydration completes without the mismatch recovery and the browser console is clean.
- Zero change to theme logic: the script body, the cookie name, the three modes, the provider, and the selector all keep their current behavior and tests.
- Preserve the no-flash guarantee the script already provides (first painted frame already themed).

**Non-Goals:**

- Reading the theme cookie during server rendering (see Decision 3).
- Changing the cookie's name, write policy, or lifetime.
- The SSE `failed to pipe response` dev-server noise from `/api/mes/events` (explicitly out of scope per the proposal's scope decision).
- Any backend, schema, API, or dependency change.

## Decisions

### 1. Render the script inside `<head>`, keep it inline and render-blocking

Move the existing `<script>` element from a child of `<html>` into `<head>` in the root layout. The starter dev log's warning exists because the element is rendered outside the document's ordered structure; the guide's theme example places the same inline, `dangerouslySetInnerHTML`-based script inside `<head>` where the browser runs it synchronously during parsing — which is also what keeps the no-flash guarantee (React hydrates too late).

Alternatives considered:

- **Leave it under `<html>` and only suppress the hydration warning** — fixes the mismatch but leaves the `[browser]` script-placement warnings, which the change is asked to clean.
- **`next/script` with `strategy="beforeInteractive"`** — hoists into `<head>`, but introduces the Script component and its loading machinery into a file whose only script is a compile-time constant string, and it is a pattern this project does not use anywhere else. The raw element already achieves the required ordering.
- **Server-side theme read via `cookies()` in the layout** — rejected: `cacheComponents: true` means reading the cookie in the root layout forces blocking on every segment under it, trading a clean dev console for a static-prerender/perf regression, and it contradicts `pre-paint.ts`'s reason for existing (a plain script that "cannot import a module and cannot be deferred behind the JS bundle").

### 2. `suppressHydrationWarning` on `<html>` (not on nested elements)

The script's DOM mutation is on `document.documentElement` itself, so the suppression belongs on `<html>`. The attribute's blast radius is a single element whose only dynamic content is the theme class — the font class is a compile-time constant from the layout, so nothing else is silenced, and a future genuine mismatch on `<html>` would still be caught by surrounding components' boundaries.

Alternative considered: no suppression and accept React's recovery — rejected; recovery client-renders from the nearest boundary, discarding the server HTML there, which is exactly the failure the spec's hydration requirement now forbids.

### 3. Leave the script body and the provider untouched

`pre-paint.ts` is single-sourced from `./config` and asserted equivalent by `config.test.ts`; `provider.tsx` re-applies the resolved class after mount (the documented remedy for React's development-remount reset of `<html>` attributes). Neither participates in the mismatch, so neither changes, and their tests need no rewriting.

## Risks / Trade-offs

- [A future markup change on `<html>` that is a genuine bug is hidden by the suppression] → the suppression covers one element only; the `<head>` placement makes the script ordered, so the only dynamic attribute on `<html>` remains the theme class.
- [`<head>` usage inside an App Router root layout could conflict with metadata handling] → the project's only `<head>`-bearing file is this layout, which exports `metadata` but no other head content; the bundled docs for this Next version show exactly this `<head>` + inline script layout.
- [Regression in strict validation or lint for the edited layout] → `bunx biome check --write frontend` plus full frontend unit tests run in the apply phase; rollback is a single-file revert.

## Migration Plan

Single-file edit in `frontend/src/app/layout.tsx`. No data migration, no deployment ordering, no feature flag. Verification is behavioral: reload any screen in the dev server (with a stored dark mode and again with system/lit preference) and confirm the hydration error and script-placement warnings are gone from the console while the theme still paints first. Rollback: revert `layout.tsx` to its current form — the theme feature itself is unaffected.
