# Tasks

## 1. Dark palette and its documentation

- [x] 1.1 Add the IBM Carbon Gray 100 dark palette table to `DESIGN.md`, mapping each light token to its dark counterpart per `design.md` — Decisions §7, and replace the line 551 sentence that leaves the dark theme as a follow-up with a pointer to the new table; verify the table covers every token group `frontend/src/app/globals.css` declares in `:root`.
- [x] 1.2 Add a `.dark { … }` block beside `:root` in `frontend/src/app/globals.css` overriding the same semantic variable names from the new `DESIGN.md` table, keeping `--radius` and every `--radius-*` at `0`; verify by reading that the block declares no variable name absent from `:root` and that `@theme inline` and the `@custom-variant dark` line are untouched.

## 2. Theme preference and rules

- [x] 2.1 Add `src/lib/mes/theme/config.ts` with the `ThemeMode` union (`"system"`, `"light"`, `"dark"`), `THEME_MODES`, `THEME_COOKIE`, a pure `readMesThemeCookie`, and a pure `resolveTheme(mode, systemPrefersDark)`; verify with `src/lib/mes/theme/config.test.ts` asserting a pinned mode wins either way, `system` tracks the reported preference, a missing or unrecognised cookie resolves to `system`, and an unreported system preference resolves to light.
- [x] 2.2 Add `src/lib/mes/theme/provider.tsx` holding the active mode (defaulting to `system`), subscribing to the `prefers-color-scheme` media query so a `system` viewer tracks a change made while the app is open, exposing `setTheme` through `useThemeChoice`, and writing the `mes_theme` cookie with the same attributes and `biome-ignore` guard as `src/lib/mes/i18n/provider.tsx`; verify `cd frontend && bunx tsc --noEmit -p tsconfig.json` reports no new error.

## 3. The theme reaches the document before first paint

- [x] 3.1 Add `ThemeProvider` to `frontend/src/app/layout.tsx`, wrapping `LocaleProvider` so a theme does not wait on the locale catalogue; verify by loading any app route with a `mes_theme=dark` cookie set that the document element carries `dark` and the surfaces use the new dark tokens, and that clearing the cookie returns to the light canvas.
- [x] 3.2 Add a small blocking inline script in `layout.tsx`'s `<head>`, ahead of the providers, that reads `mes_theme` and `prefers-color-scheme` and writes an explicit `light` or `dark` class on the document element before hydration, using `readMesThemeCookie` and `resolveTheme`'s rules rather than duplicating them in the script; verify `cd frontend && bunx tsc --noEmit -p tsconfig.json` reports no new error and that a pinned-light viewer on a dark-operating-system machine still paints light.

## 4. Theme selector and localized labels

- [x] 4.1 Add `src/components/shell/theme-switcher.tsx` — the selector composed from the shadcn `Select` primitive like `LanguageSwitcher`, with a `size="sm"` trigger carrying the active mode's lucide icon and an explicit `aria-label`; verify it renders in `AppNav`'s right-hand cluster and its three options are follow-the-system, light, and dark.
- [x] 4.2 Add the selector's `shell.theme` message namespace to `frontend/messages/en.json` and `frontend/messages/vi.json` — the label, the accessible name, and the three mode names — and add a parity test alongside `src/lib/mes/i18n/locale-parity.test.ts` asserting the two catalogues declare the same `shell.theme` keys, none empty, and the Vietnamese copy actually differs from the English; verify `cd frontend && bun test src/lib/mes/` passes.
- [x] 4.3 Render `ThemeSwitcher` beside `LanguageSwitcher` in `frontend/src/components/shell/app-nav.tsx`, reachable for every role; verify by opening the top navigation for one account per role from `hr.manager@mes.local`, `dept.head@mes.local`, and `employee@mes.local` that the selector is present and selecting a mode changes the canvas immediately.

## 5. Whole-surface verification

- [x] 5.1 Sweep every screen with the dark theme active — all five app modules, the sign-in screen, and each loading, empty, and error state — replacing any value hard-coded to the light palette (a literal `bg-white`, `text-black`, `bg-gray-*`, or inline hex) with the matching semantic token; verify by walking each route with dark active and confirming no light surface, light hairline, or unreadable text remains, including the footer's inverted surface and the ranking chart's negative series.
- [x] 5.2 Add `frontend/tests/tests/theme/theme.spec.ts` with a page object under `frontend/tests/pages/theme/`, covering the requirements in `specs/frontend/theme-selection`: the selector is reachable for every role, selecting dark and reloading restores dark, a pinned mode holds against a `colorScheme` the browser context is forced into, switching back to follow-the-system adopts the forced scheme, and the first painted frame is already dark; verify `cd frontend && bunx playwright test tests/tests/theme --project=chromium --reporter=line` passes with the dev servers running.
- [x] 5.3 Run the frontend verification sweep — `cd frontend && bunx tsc --noEmit -p tsconfig.json`, `cd frontend && bun run lint`, and `cd frontend && bun test src/` — and verify every command is clean.
- [x] 5.4 Run `cd backend && bun test` and verify the suite passes and `git status --short backend/src` reports no change, confirming the feature touched no backend file.

## Workflow follow-up

- Review the change, then archive it with `/opsx-archive` once the design is accepted.
- Decide afterwards whether the sign-in screen should gain the selector too; `design.md` — Open Questions records it as a reuse with no spec change.
