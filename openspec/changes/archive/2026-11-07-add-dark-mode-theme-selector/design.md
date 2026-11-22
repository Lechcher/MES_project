# Design

## Context

See `proposal.md` — Why. The design constraints that shape the approach:

- `globals.css` already declares `@custom-variant dark (&:is(.dark *))` at line
  5 and every colour is a `var(--…)` indirection, so a dark theme is a token
  override rather than a component rewrite. No `.dark` block exists yet.
- The theme must be known **before first paint**, which is the one thing the
  existing locale pattern deliberately does not do: `LocaleProvider`'s docblock
  records that the server tree never reads the cookie, "so the
  static/partial-prerender classifications are untouched". That choice is right
  for the locale — a briefly-wrong language re-renders the same content — and
  wrong for the theme, where a wrong canvas is the visible flash the spec
  forbids.
- `root` `layout.tsx` already nests `TooltipProvider → LocaleProvider →
  MesSessionProvider`, and `AppNav` already renders `LiveStatusIndicator` and
  `LanguageSwitcher` in one right-hand cluster.
- `LanguageSwitcher` (`src/components/shell/language-switcher.tsx`) is the
  established shape for a viewer preference: a shadcn `Select`, `size="sm"`,
  icon + `SelectValue`, an explicit `aria-label`, and a cookie write guarded by
  a `biome-ignore` for `noDocumentCookie`.
- Theme is per-browser, not per-account (it is not in `API_CONTACT_SPECIFICATION.md`
  and must not be), which rules out any server round-trip.

## Goals

- One source of truth for the active theme, applied to the document element
  before paint.
- Zero changes to components or utilities: themes are token-only, so no
  `bg-*`/`text-*`/`border-*` call site is edited.
- A selector indistinguishable in feel from the language switcher next to it.

## Non-Goals

- A server-side, per-account theme column or any query/mutation. Out of scope
  by design — the API contract does not change.
- A switcher on the sign-in screen or in Settings (the user chose the app-nav
  placement; recorded in `proposal.md` — Assumptions).
- Per-app or per-component theming. One theme for the document.
- Any new dependency. `next-themes` and similar are deliberately not added.

## Decisions

### 1. A `ThemeProvider` that mirrors the locale provider

New `src/lib/mes/theme/` with `config.ts` (mode contract, cookie name, pure
parsers) and `provider.tsx` (context + `useThemeChoice()`), wrapping the tree in
`layout.tsx` outermost — outside `LocaleProvider` — because a theme must not
wait on the locale catalogue to render.

**Why not `next-themes`:** one more dependency to keep in step with a Next 16
upgrade path, for behaviour this app already models itself. **Why not shell-local
state:** the selector lives in `AppNav` but the class must land on `<html>`,
so the state has to live above the document element's owner anyway.

### 2. A class on `<html>`, not a data attribute

The resolved theme lands as `class="dark"` or `class="light"` on the document
element, matching the `dark` variant already written in `globals.css`. Changing
that selector to `[data-theme="dark"]` would rewrite shipped CSS for no gain.

**Both classes are written, always.** Leaving the class off under an OS dark
setting is what makes a pinned-light viewer go dark by accident: the browser
would resolve the unprefixed `:root` light tokens *and* any rule that matched
system dark. An explicit `light` class is the only thing that pins the light
tokens unconditionally.

### 3. A blocking inline script prevents the flash

A tiny inline `<script>` in `layout.tsx`'s `<head>`, before the theme provider,
reads the `mes_theme` cookie and `matchMedia("(prefers-color-scheme: dark)")`
and writes the class directly on `<html>` before React hydrates.

- This is the standard escape hatch for exactly this problem, and it is the
  *only* point that reads the cookie before hydration — everywhere else the
  provider behaves like the locale provider, so no server component or
  `prerender` classification changes.
- The script is inline rather than a separate file so it runs before any
  stylesheet-blocking request; it is a few lines, string-templated, and marked
  `dangerouslySetInnerHTML` with a comment explaining why it is not a security
  surface (no user input reaches it).

### 4. `system` is reactive; pinned modes are inert

The provider subscribes to the `prefers-color-scheme` media query's `change`
event and recomputes only while the mode is `system`. A pinned mode ignores the
event entirely. This is one `useEffect` with the query as its dependency, not a
poll loop.

### 5. Cookie persistence identical to `mes_locale`

`mes_theme` (`path=/`, `SameSite=Lax`, one-year `max-age`, script-readable),
written under the same `biome-ignore`. **Why not `localStorage`:** it would
work, but the locale cookie is the established shape for a viewer preference
here, and a stale value must fall back the same way — an unrecognised cookie
parses to `system`, never to a guessed theme.

### 6. Pure resolution logic, unit-testable without a DOM

`resolveTheme(mode, systemPrefersDark) → "light" | "dark"` and
`readMesThemeCookie(cookieSource) → ThemeMode` are pure, so the interesting
cases — pinned light against a dark system, unknown cookie, no preference to be
found — are covered by unit tests rather than only by browser behaviour. The
inline script and the provider both call into these rules.

### 7. Carbon Gray 100 tokens override the same variable names

`.dark { … }` beside `:root` in `globals.css`, defining only the variables
`@theme inline` already references. Semantic mapping (the design decisions, in
`DESIGN.md` under the dark palette table):

| Token group | Light | Dark (Carbon Gray 100) |
| --- | --- | --- |
| Canvas / ink | `#ffffff` / `#161616` | `#161616` (gray-100) / `#f4f4f4` (gray-10) |
| Cards, popovers | `#ffffff` | `#262626` (gray-90, Carbon layer-01) |
| Muted / accent fills | `#f4f4f4` | `#262626` (gray-90) |
| Hairlines | `#e0e0e0` | `#393939` (gray-80) |
| Secondary ink | `#525252` | `#c6c6c6` (gray-30) |
| Accent | `#0f62fe` | `#0f62fe` — unchanged |
| Destructive | `#da1e28` | `#fa4d56` (Carbon red-50) |
| Charts | blue/green/yellow/red | the Carbon dark-mode variants of the same four hues |
| Sidebar | `#f4f4f4` | `#262626` (gray-90) |

Charts are the one place values must be chosen rather than inverted: Carbon's
dark chart palette is `$blue-40/green-40/yellow-30/red-50`, and
`RankingChart`'s `colorNegative` path must be checked against the dark red. The
footer keeps `bg-foreground text-background`, which inverts automatically — on a
dark canvas it becomes a light footer, which is the same inversion the spec
already requires, now against the new white canvas.

### 8. The selector is a `Select`, for consistency with its neighbour

`ThemeSwitcher` in `src/components/shell/`, composed from the shadcn `Select`
primitive like `LanguageSwitcher`, with a `Monitor`/`Sun`/`Moon` icon for the
active mode and the localized mode name in `SelectValue`.

**Considered:** a `ToggleGroup`-style segmented control (three icon buttons) is
the common pattern for theme pickers and is slightly quicker to use, but it
would be the only segmented control in the shell next to two `Select`s. If the
user prefers it later, it is a contained swap of one component with no spec
change.

## Risks / Trade-offs

- **Inline script and strict CSP** → the script is a literal with no user
  input, and this app sets no CSP. If a CSP is added later, the theme script
  needs a `nonce`/hash; noted here so it is not a surprise.
- **Dark red vs. dark destructive colliding** (`#fa4d56` for both) → charts
  and destructive badges are never in the same column; verified during the
  full-surface sweep in tasks.
- **A pre-existing screen that hard-codes a light value** (e.g. `text-white`,
  `bg-gray-100`, or the footer's `#c6c6c6`) → these are invisible today and
  will break under dark. The dark-surface sweep task exists to find them; any
  found are replaced with the matching token, which is the same edit the light
  theme would eventually need.
- **`@apply border-border` on `*` plus the `--radius: 0` block** → dark only
  overrides colors, so the flat-square shape and the `tw-animate-css`
  transitions carry over unchanged. No animation change.
- **A viewer who pins a theme on a machine that later reports a different OS
  preference** → pinned themes win by design; `system` is always reachable one
  click away.

## Migration Plan

Additive and reversible: a new provider, a new token block, one new component,
and two message namespaces. No data migration, no API change, no schema change.

**Rollback:** delete the `.dark` block in `globals.css`, drop the provider from
`layout.tsx`, remove `ThemeSwitcher` from `AppNav`, and delete the message keys.
Every screen returns to the current light-only state, because no component
changed — the tokens simply revert.

## Open Questions

None that change the specs, the approach, or the tasks. The one genuinely
deferrable choice is the sign-in screen's placement: if the user later wants the
switcher there too, it is a reuse of the same component plus the same
pre-hydration script (already required for `layout.tsx`'s `<html>`), and no spec
requirement changes.
