# Proposal

## Why

`bun run dev` renders `GET /` and then reports a hydration error on the root document element: the server ships `<html class="ibm_plex_sans_... h-full antialiased">` while the client hydrates it as `... dark`, because the `mes-theme-pre-paint` script in `frontend/src/app/layout.tsx` writes the `dark` class on `document.documentElement` before React hydrates and `<html>` does not declare `suppressHydrationWarning`. Next.js logs this as a mismatch React "won't patch up", and a hydration mismatch makes React recover by client-rendering from the nearest boundary, discarding the server HTML there — the same reason the `preventing-flash-before-hydration` guide requires `suppressHydrationWarning` alongside an inline theme script. The same script is also rendered as a direct child of `<html>` (outside `<head>`/`<body>`), which is what produces the `[browser]` warnings "In HTML, `<script>` cannot be a child of `<html>`" and "Cannot render a sync or defer `<script>` outside the main document without knowing its order".

## What Changes

- Render the pre-paint theme script inside `<head>` in the root layout, as the Next.js inline-script theme pattern prescribes, so the script is ordered within the document instead of dangling as a child of `<html>`.
- Add `suppressHydrationWarning` to the `<html>` element so React adopts the script-written `dark`/`light` class instead of reporting a hydration mismatch and recovering around it.
- Add a requirement to the `frontend/theme-selection` capability spec stating that the pre-paint theme application must not produce a hydration mismatch: React accepts the class the script wrote, and the browser console stays free of hydration errors for the document element.
- No breaking changes. The script's behavior, the `mes_theme` cookie, and the three modes are unchanged; only where React tolerates the pre-hydration DOM change moves.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend/theme-selection`: Add a requirement that the pre-paint theme application completes without a React hydration error — the document element's theme class written before first paint is one React is told to accept, so hydration succeeds with the script-written theme intact.

## Impact

- `frontend/src/app/layout.tsx` — script placement in `<head>`, `suppressHydrationWarning` on `<html>`.
- `frontend/src/lib/mes/theme/pre-paint.ts` and `frontend/src/lib/mes/theme/provider.tsx` — unchanged; the fix is layout-level rendering, not theme logic. Existing tests covering the script's cookie/mode equivalence remain valid.
- `openspec/changes/fix-theme-pre-paint-hydration-error/specs/frontend/theme-selection/spec.md` — delta spec for the `frontend/theme-selection` capability.
- No API, database, dependency, or schema change. No backend impact.
