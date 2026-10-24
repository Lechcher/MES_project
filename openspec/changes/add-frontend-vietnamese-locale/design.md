# Design

## Context

See `proposal.md` for motivation. The constraints that shape the approach:

- **Rendering model.** `frontend/next.config.ts` enables `cacheComponents: true`
  (Cache Components / PPR) with `partialPrefetching`. The whole authenticated
  tree resolves its viewer in the browser from `/api/mes/session`, and the
  `(app)` layout declares `instant = false`. `frontend/realtime-updates` requires
  that the static shell stays instant and "SHALL NOT make the shell dynamic".
  Under Cache Components, any `cookies()` read must sit behind a `<Suspense>`
  boundary, so reading the locale cookie on the server would push the tree behind
  a boundary and turn the shell dynamic.
- **Client-rendered UI.** All 19 files that consume the label registry are client
  components. `src/app/signin/page.tsx` is a client component; the only
  server-rendered user-facing text today is the `CardTitle` in
  `src/app/reset-password/page.tsx` ("Choose a new password") plus the document
  metadata.
- **Label registry.** `src/lib/mes/queries/registries.ts` holds code → canonical
  English name plus colors/flags for ticket states, leave codes, priority, task
  type, approval status, task-request type, department type, roles, and modules,
  with `labelFor` leaving unknown values untouched. ~109 call sites in 19 files
  use its helpers; `registries.test.ts` already guards enum coverage.
- **Formatting.** `src/components/shared/format.ts` hardcodes `en-GB`, and two
  planning components format month labels with `toLocaleDateString("en-GB")`.
- **Testing.** `bun test` runs five pure-logic files; there is no DOM testing
  library, so component rendering is not unit-tested today.
- **Typography.** `src/app/layout.tsx` loads IBM Plex Sans with
  `subsets: ["latin"]`.

## Goals / Non-Goals

**Goals:**

- A Vietnamese version of every string the frontend authors, switchable at
  runtime, defaulting to English, remembered per browser, with no URL change.
- Keep the code/data contract and the "no unlabeled enum" guarantee intact.
- Keep the rendering contract: no new server-side request data, unchanged
  static/dynamic route classification.

**Non-Goals:**

- Locale-prefixed routing, localized URLs, or SEO alternates.
- Server-rendering Vietnamese on the first paint (explicitly deferred, see D3).
- Backend-generated text: XLSX/PDF exports, email messages, and API-supplied
  error strings.
- Translating brand names ("ERP-MES System") and domain code tokens.
- RTL support or locale-aware plural rules beyond what English and Vietnamese
  need.

## Decisions

### D1 — Translation library: `next-intl`

Use `next-intl` (latest `4.14.x`; peers accept `next ^16` and `react ^19`).

*Alternatives:* `react-i18next` brings a larger runtime and a plugin-oriented
model that fits the App Router less directly; a hand-rolled catalogue avoids the
dependency but reimplements message interpolation and `Intl` formatting. The user
selected `next-intl`. `AGENTS.md`'s Stack table gains a row for it.

### D2 — Locale kept in a cookie, not in the URL

A `mes_locale` cookie (`path=/`, `SameSite=Lax`, one-year max-age, script-
readable so the client can set it) carries the preference; `en` is assumed when
it is absent or unrecognized.

*Alternatives:* a `/vi/...` prefix changes every route and `href`, the specs that
name paths, deep links, and the `instant`/PPR declarations, and needs middleware;
an account-level preference needs a backend field, a migration, and a contract
change. Both were rejected as far larger than the requirement.

### D3 — The locale is applied in the client; the server renders the English baseline

The root layout wraps `children` in a client `LocaleProvider` that:

- holds the active locale, starting at the default `en`;
- reads the cookie once on mount and adopts a stored locale;
- exposes the viewer's choice to a switcher, writing the cookie;
- keeps `document.documentElement.lang` in step;
- renders `NextIntlClientProvider` with the active locale's messages.

`src/i18n/request.ts` (required by the `next-intl` plugin) pins the server locale
to `en`, so server components that call `getTranslations` render the English
baseline. The one server-rendered string moves into a client component so it can
be localized; the document metadata stays the English brand title.

*Alternative (rejected):* read the cookie in `getRequestConfig` (next-intl's
documented cookie flow) and let the provider inherit it. Under
`cacheComponents: true`, that `cookies()` read must be wrapped in `<Suspense>`;
because the provider must wrap all children, that boundary would place the whole
tree behind a runtime fallback, making the shell dynamic and contradicting
`frontend/realtime-updates`.

*Consequence:* a viewer whose stored preference is `vi` sees the English baseline
for the first paint and Vietnamese once the provider mounts. Accepted for a
prototype; the risk section records the trigger and the path to change it.

### D4 — Catalogues are JSON, namespaced by surface, with typed keys

`frontend/messages/en.json` and `frontend/messages/vi.json` are organized by
surface: `shell`, `auth`, `jobs`, `planning`, `performance`, `settings`,
`auditLog`, `common`, `enums`, and `errors`. `en` is the source of truth and `vi`
mirrors its keys exactly. A `global.d.ts` augments next-intl's `IntlMessages`
with `typeof en`, so an unknown key fails type-checking. Keys name the meaning
(`jobs.list.emptyTitle`), not the English wording, so copy edits don't churn
keys. Values with data use ICU placeholders (`{count}`, `{name}`, `{percent}`)
instead of string concatenation, replacing the components' template-literal
build-ups.

### D5 — The registry stays the code contract; locale names are keyed by the same codes

`registries.ts` keeps its role: the single inventory of codes with canonical
names, colors, and flags, and the basis of the coverage test. Locale names live
in `enums.*` in the catalogues, keyed by the identical codes. A bridge module
`src/lib/mes/i18n/labels.ts` exposes a `useDomainLabels()` hook returning the
label functions components use today (`ticketState`, `leaveCode`, `priority`,
`taskType`, `approvalStatus`, `taskRequestType`, `departmentType`, `role`,
`module`, `stateBadge`, `secondaryBadge`), preserving the current behavior of
passing unknown values through unchanged. Components swap the registry helper
import for the hook; every consumer is already a client component, so no call
site loses reactivity on a language switch.

A catalogue test asserts that (a) every code in every registry has an `enums.*`
message in every locale, and (b) the locales expose identical key sets.

*Alternatives:* giving the pure helpers a `locale` argument (no hook) requires
threading a locale through ~109 call sites and does not re-render on switch;
inlining translations in the registry mixes the data contract with presentation
and would put two languages into a module the backend-mirroring tests read.

### D6 — Dates and numbers use next-intl's formatter

Components format dates, times, and decimals through `useFormatter()` with the
active locale. `format.ts` keeps its locale-independent helpers (`formatJson`,
`toDateInputValue`, `dateInputToIso`, `dateInputToEndOfDayIso`) and the em-dash
fallbacks; the `en-GB` calls and the two inline `toLocaleDateString("en-GB")`
month labels move to the formatter.

*Alternative:* locale-parameterized pure functions, rejected for the same
threading and reactivity reasons as D5.

### D7 — The switcher uses existing UI primitives

A `LanguageSwitcher` client component places the choice in the top navigation
(`app-nav.tsx`) and on the sign-in card, built from the existing shadcn/Base UI
`Select` primitive and labelled with each language's own name ("English",
"Tiếng Việt"). It is not role-gated, so it satisfies
`frontend/app-shell`'s new requirement for every role. No new UI dependency is
introduced.

### D8 — Typography and document language

`src/app/layout.tsx` adds the `vietnamese` subset to the IBM Plex Sans load so
diacritics use the right glyphs, renders `lang="en"` as the baseline, and the
provider updates `document.documentElement.lang` on a switch.

### D9 — Rollout order keeps the diff reviewable

Bridge and catalogue infrastructure first (D4–D6), then the shell (nav,
dashboard, footer, sign-in), then one module at a time (Jobs, Planning,
Performance, Settings, Audit Log), so the type-check and coverage test enumerate
what is still un-migrated at each step.

## Risks / Trade-offs

- **[A stored `vi` preference shows English briefly on first paint]** → Accepted
  for the prototype. Trigger to revisit: a requirement for Vietnamese in the
  first paint or in shared links; the fix is D3's rejected alternative plus a
  `<Suspense>` boundary, which also requires re-checking the `realtime-updates`
  shell requirement.
- **[Mechanical sweep of ~109 label sites plus all copy]** → Mitigation: land the
  label bridge before the screens so type-check failures point at the remaining
  call sites, migrate module by module, and keep each step's diff mechanical.
- **[An untranslated string is left behind]** → Mitigation: the catalogue
  key-parity test catches missing translations but not un-migrated strings; each
  module task ends with a pass over that module's screens in both locales, and a
  browser check runs in Vietnamese before completion.
- **[`next-intl` interacts badly with Turbopack or Cache Components]** →
  Mitigation: the only config change is the `createNextIntlPlugin` wrapper; a task
  verifies `next build` keeps the same `○`/`◐`/`ƒ` classification for every route
  and that no Uncached-data insight appears.
- **[Vietnamese wording is wrong or unnatural]** → Mitigation: the `vi` catalogue
  is reviewed with the user before the change is called done.
- **[Additional font subset weight]** → Mitigation: one extra subset on an
  already self-hosted Google font; verify with a build.

## Migration Plan

The change is additive and reversible: the app defaults to English, and the
cookie is inert without the provider. No data migration, environment variable,
GraphQL contract, or backend coordination is involved — it ships with a normal
frontend build. Rollback is reverting the commit. Per `AGENTS_GIT.md`, the work
lands on an `ai/*` branch and merges only through a human-approved PR.

## Open Questions

- Exact Vietnamese wording for domain labels (for example "Đang chờ" vs "Chờ
  duyệt" for Pending) — answerable during catalogue review; it changes message
  values only, not the specs or tasks.
- Whether to move to server-applied locale later — deferrable; it would revisit
  D3 and the `realtime-updates` shell requirement rather than this change's specs.
