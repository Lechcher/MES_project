# Proposal

## Why

The MES frontend speaks one language: English only. Vietnamese users — the
workers, supervisors, and HR staff who actually open the daily screens — have to
read a system in a second language, and the recently added natural-language
display labels made that surface larger by replacing every enum with English
prose. The interface is the wrong place to ask people to translate "Overdue" or
"Annual Leave" in their head.

## What Changes

- Add a Vietnamese locale to the frontend alongside English, using `next-intl`
  (new dependency, version pinned in the Stack table) for message catalogs,
  locale-aware navigation, and date/number formatting.
- Set up locale-based routing with path prefixes `/en/…` and `/vi/…`, a
  `src/proxy.ts` redirect matching next-intl's recommended matcher, and a cookie
  so the chosen language is remembered and works without a prefix.
- Move every page, layout, and route group under a top-level `[locale]` segment
  (route groups `(app)`, plus `/signin` and `/reset-password`), with
  `generateStaticParams` so the existing prerendered shells keep prerendering.
- Add a language switcher to the top navigation user menu (and on the sign-in
  page), switching locale while keeping the viewer's current route, so
  `/vi/jobs` opens the Vietnamese Jobs view rather than the dashboard.
- Extract all user-facing English copy into message catalogs
  (`frontend/messages/en.json`, `frontend/messages/vi.json`) — navigation labels,
  app launcher names/descriptions, page headers, tabs, buttons, form labels,
  table columns, filters, empty states, and error copy — replacing hardcoded
  strings with `t()` calls.
- Rebuild the display-label registry so each enum's name comes from the message
  catalog instead of an inline English string: badges, compact badges, legend
  copy, and every select's option/trigger label become localized while still
  submitting the documented code.
- Serve the Vietnamese locale correctly: `<html lang>` reflects the active
  locale, IBM Plex Sans loads the `vietnamese` subset so Vietnamese diacritics
  render in the documented typeface, and the static-route check keeps every
  module page's current prerender classification.
- Extend the display-label coverage test to assert every enum value has a
  message entry in **both** catalogs, so a new code or a missing translation
  fails the suite instead of falling back to English silently.
- Keep all codes, API fields, filter inputs, and authorization inputs verbatim
  and unchanged; no backend, GraphQL contract, dependency-behavior, or data
  change.

Explicitly out of scope: backend error text authored server-side (GraphQL
`extensions.message`), email templates, generated report content, and the
backend's own responses — those stay English; only the frontend's own copy is
localized. No new language beyond Vietnamese, and no translation of user-entered
data (titles, reasons, comments).

## Capabilities

### New Capabilities

- `frontend/localization`: The frontend renders every screen in the language the
  viewer chose — which locales exist, how the choice is detected and remembered,
  how a switch preserves route and session, and how user-facing copy and label
  values are translated without changing any code the data contract depends on.

### Modified Capabilities

- `frontend/display-labels`: Labels are no longer fixed English strings — they
  render in the active language, while the codes stay the data contract and the
  registry test guards coverage across every catalog.
- `frontend/app-shell`: The sign-in page, top navigation, app launcher labels,
  and global layout's `<html lang>` become locale-aware, so the shell is shown
  in the selected language.

## Impact

- **Code**: `frontend/src/app/**` (all pages/layouts relocate under `[locale]`),
  new `frontend/src/i18n/` (routing, request, navigation) and `frontend/src/proxy.ts`,
  new `frontend/messages/` catalogs, `frontend/next.config.ts` (next-intl plugin),
  `frontend/src/components/**` (switcher + `t()` extraction), and
  `frontend/src/lib/mes/queries/registries.ts` (labels sourced from messages).
- **Dependencies**: adds `next-intl` (pinned version) to
  `frontend/package.json` and the AGENTS.md Stack table; no backend dependency.
- **API/Data**: none. GraphQL queries, mutations, filters, stored codes, and
  authorization inputs are untouched; only presentation changes.
- **Docs**: `AGENTS.md` Stack table gains the i18n row; `docs/DEVELOPMENT.md`
  gains a locale-development section.
- **Tests**: display-label coverage test extended to both locales; existing
  tests must not change meaning, and the build's prerendered shells keep their
  static classification under both locales.
