# Proposal

## Why

The interface is light-only. `globals.css` already declares a `dark` variant
(`@custom-variant dark (&:is(.dark *)`) and every semantic color is a
`var(--…)` reference, so the plumbing for a dark theme is present but dormant:
nothing ever applies a `dark` class and no dark values exist behind the
tokens. `DESIGN.md:551` records why — IBM Carbon's dark theme is documented in
Carbon as the Gray 100 theme but was never extracted here, and that extraction
was left as a follow-up.

That leaves viewers with no choice about the canvas they spend the working day
on, and it makes the scaffolded `dark` variant untested dead code. Extracting
the Gray 100 palette closes the documented gap, and a System / Light / Dark
selector — mirroring the language switcher's placement and persistence — gives
viewers the option without touching any screen's content.

## What Changes

- Extract IBM Carbon's Gray 100 dark palette into `DESIGN.md`, mapped onto the
  existing semantic token names (`--background`, `--foreground`, `--card`,
  `--border`, `--sidebar-*`, `--chart-*`, …), so no component or utility class
  changes. IBM Blue `#0f62fe` stays the accent; only surfaces, ink, and
  supporting colors invert.
- Add a theme preference with three modes — `system`, `light`, `dark` — held by
  a provider that mirrors the existing locale provider's shape (client state,
  one hydration-safe adopt step, cookie persistence).
- Apply the resolved theme to `<html>`, using a `dark` class for `dark` and a
  `light` class otherwise, so a `system` viewer inherits
  `prefers-color-scheme` and a viewer who has explicitly chosen `light` is not
  overridden by an OS-level dark setting.
- Prevent a flash of the wrong theme on first paint by resolving the stored
  preference and the OS preference before React mounts, in a blocking inline
  script.
- Offer the selector in the top navigation beside the language switcher,
  visible to every role, showing which mode is active. Mode names come from the
  localized catalogue, so they read correctly under `en` and `vi`.
- Cover all five app modules plus the sign-in and error screens against the
  dark palette, since dark surfaces reach every `bg-*`/`text-*`/`border-*`
  combination the light theme now covers.

## Capabilities

### New Capabilities
- `frontend/theme-selection`: the viewer's theme preference — the three modes,
  how it is stored and adopted across reloads, how it resolves to a concrete
  theme against the OS setting, and the selector that changes it, including its
  localized labels.

### Modified Capabilities
- `frontend/app-shell`: "Global layout applies the DESIGN.md theme" currently
  asserts every screen follows the **light** IBM Carbon direction
  unconditionally. It becomes the default theme with the Carbon Gray 100 dark
  theme applied per the viewer's preference, so the requirement no longer
  forbids a dark canvas.

## Impact

**Code**
- `frontend/src/app/globals.css` — add the `.dark` token block beside `:root`.
- `frontend/src/lib/mes/theme/` (new) — provider, cookie name and reader,
  mirroring `src/lib/mes/i18n/`.
- `frontend/src/components/shell/theme-switcher.tsx` (new) — the selector,
  composed from the shadcn `Select` primitive like `LanguageSwitcher`.
- `frontend/src/components/shell/app-nav.tsx` — render the selector beside the
  language switcher.
- `frontend/src/app/layout.tsx` — wrap the tree in the theme provider.

**Messages** — `frontend/messages/en.json` and `vi.json` gain the selector's
label, its accessible name, and the three mode names under the `shell`
namespace.

**Documentation** — `DESIGN.md` gains the Gray 100 token table and a note
replacing the line 551 follow-up. `API_CONTACT_SPECIFICATION.md` is unaffected:
the preference is browser-local, like the locale choice, and is not part of any
query, mutation, or data-scope decision.

**Dependencies** — none. The palette, the provider, the selector, and the
cookie are all expressible with Next.js, React, and `biome-ignore`-guarded
`document.cookie` writes already used for the locale.

**Out of scope** — a theme selector on the sign-in screen, a Settings
"Appearance" tab, per-viewer theme stored server-side, and any change to the
footer's charcoal inversion, which remains intentional in both themes.

## Assumptions

- The sign-in screen keeps the light canvas: the user asked for the selector in
  the app nav, and theming a static unauthenticated screen would need the
  pre-hydration script duplicated outside the authenticated shell.
- `system` is the default for a viewer with no stored preference, matching how
  the locale defaults to English rather than to a guessed choice.
- The theme applies to the whole document, including portals, popovers, and
  dialogs, with no per-app override.
