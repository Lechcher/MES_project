# Proposal

## Why

The MES frontend is English-only, so Vietnamese-speaking staff cannot read the
interface they work in every day. The screens have just been consolidated onto a
single display-label registry, which makes this the right moment to layer a
second language on top instead of scattering translations across components.

## What Changes

- Add `next-intl` (App Router, no locale-prefixed routing) and a cookie-backed
  language preference. **English stays the default**; a language switcher in the
  shell switches the running app to Vietnamese without a reload, and the choice
  persists across visits.
- Add translation catalogues `messages/en.json` and `messages/vi.json` covering
  the shell (navigation, dashboard launcher, footer, sign-in), all five apps
  (Jobs, Planning, Performance, Settings, Audit Log), dialogs, filters, empty
  states, and instructional copy.
- Keep the domain label registry (`frontend/src/lib/mes/queries/registries.ts`)
  as the code-to-name contract and resolve display labels through the active
  locale, so a Vietnamese viewer reads "Đang chờ" where an English viewer reads
  "Pending". A unit test asserts every enum code has a message in every locale,
  so a new code cannot ship untranslated.
- Format dates, times, and decimals with the active locale instead of the
  hardcoded `en-GB` formatters, and set `<html lang>` from the active locale.
- Load the Vietnamese subset of IBM Plex Sans so diacritics render correctly.
- Keep every code token verbatim in data, queries, mutations, filters, and
  authorization. Showcased codes remain the content only where they already are
  (technical surfaces), exactly as `frontend/display-labels` already requires.
- Backend-generated content stays English and out of scope: XLSX/PDF exports,
  email messages, and error text the API supplies. Error text the *frontend*
  authors (its inline fallback messages) is translated.
- No URLs, routes, API fields, or GraphQL contracts change.

## Capabilities

### New Capabilities

- `frontend/localization`: the locale contract — supported locales and the
  English default, how the viewer picks and keeps a language, how messages are
  looked up and kept complete per locale, locale-aware date/number formatting,
  and the rule that all frontend-authored user-facing text renders in the active
  locale.

### Modified Capabilities

- `frontend/display-labels`: label requirements currently read "English name" /
  "English label"; they become the active locale's natural-language name, with
  the registry requirements and the code-preservation rules unchanged.
- `frontend/app-shell`: the shell gains the language switcher and a locale-aware
  `<html lang>`; navigation and dashboard text render in the active locale.
- `frontend/jobs`: the "state badges SHALL show the English state name" rule
  becomes the active locale's state name.
- `frontend/planning`: the calendar's "state's English name" and the attendance
  summary's "English leave name" become the active locale's names.
- `frontend/performance`: the audit-table header rule "SHALL read in English"
  becomes the active locale's wording, still without parenthetical code keys.
- `frontend/settings`: Org Structure's literal "type shown as 'Department' or
  'Division'" defers to the active locale.

## Impact

- **Frontend only.** No backend, GraphQL, database, environment, or contract
  changes; no route or URL changes.
- **New dependency**: `next-intl` (latest `4.14.x`; peer range accepts Next 16
  and React 19). The Stack table in `AGENTS.md` is updated with it.
- **New files**: `frontend/messages/{en,vi}.json`, `frontend/src/i18n/request.ts`,
  and the locale provider/switcher/label-bridge modules.
- **Touched files**: `frontend/next.config.ts` (plugin), `frontend/src/app/layout.tsx`
  (provider, font subset, `lang`), `frontend/src/components/shell/app-nav.tsx`
  (switcher), `frontend/src/components/shared/format.ts` (locale-aware
  formatting), and the component surfaces that render text or enum labels —
  including the ~19 files that call the label registry.
- **Rendering contract**: unchanged. The locale is resolved in the client (English
  is the server-rendered baseline), so no `cookies()` read is added to the
  server tree and the static/partial-prerender shells stay as they are.
