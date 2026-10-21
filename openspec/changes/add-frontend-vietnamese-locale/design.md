# Design

## Context

Motivation and scope live in `proposal.md`; the behavior contract lives in the
three spec deltas. This document records only the technical decisions that
implementation must follow, and why each was chosen over the alternatives.

Relevant current state, read from the codebase:

- Next.js 16.4.0, React 19, App Router under `frontend/src/app`, route groups
  `(app)`, plus `signin` and `reset-password`, and API routes under
  `src/app/api/mes/*`.
- `next.config.ts` sets `cacheComponents: true`, `partialPrefetching: true`,
  `reactCompiler: true`. Pages declare `export const instant = false` and the
  docs note a static-shell check that reads each segment's own declaration —
  every module page currently prerenders (`◐` in `next build`), `/signin` and
  `/reset-password` statically (`○`).
- The viewer is resolved client-side from `/api/mes/session`; no page reads a
  server-side viewer, which is why page components are thin wrappers over client
  views.
- `src/lib/mes/queries/registries.ts` (354 lines) owns every code→label mapping
  as inline English strings, with `registries.test.ts` asserting full enum
  coverage; `src/lib/mes/errors.ts` renders English `displayMessage` copies;
  `src/lib/mes/navigation.ts` holds app names/short labels/descriptions as
  inline English strings.
- All 25 selects were just fixed by passing Base UI's `items` prop, which maps a
  value to its rendered label — any label change must keep that mapping.

## Goals / Non-Goals

Goals:

- One locale source of truth (`src/i18n/routing.ts`) so routing, negotiation,
  and navigation cannot disagree.
- UI copy lives only in catalogs; the enum registry keeps code metadata
  (colors, terminal flags) and takes its labels from the catalogs.
- The build's prerender classification is unchanged when the change lands.

Non-Goals:

- No change to the GraphQL contract, stored data, or the demo session.
- No server-side locale negotiation tied to the viewer (the viewer is
  client-resolved by design), and no locale column/stored preference on the
  user record.
- No backend-authored message translation, no RTL support, no languages beyond
  `en` and `vi`.

## Decisions

### 1. `next-intl` 4.x with an App Router `[locale]` segment

Add `next-intl` (latest 4.x) to `frontend/package.json` and the AGENTS.md Stack
table, and wrap `next.config.ts` with `createNextIntlPlugin()`. All layouts,
pages, and route groups move under `src/app/[locale]/…`.

Alternatives considered: a hand-rolled dictionary provider (rejected —
reimplements plural/date/number formatting, no typed keys, no locale-aware
routing, and it would duplicate what next-intl already does well);
`react-i18next` (rejected — App Router server/client message plumbing needs more
bespoke setup for no gain); cookie-only locale with no path prefix (rejected —
the chosen behavior requires a shareable, bookmarkable address per language).

### 2. `localePrefix: "always"`, negotiated by prefix → cookie → accept-language

next-intl's default prefix-based negotiation is kept: the prefix wins, then the
`NEXT_LOCALE` cookie, then `accept-language`, then `defaultLocale: "en"`.
Because the prefix is always emitted and unprefixed URLs are redirected, an old
address like `/jobs` resolves to `/en/jobs` or `/vi/jobs` according to the
viewer's stored choice — which is exactly the "old addresses keep working"
scenario. The middleware also writes the cookie when a prefixed route is
visited, so switching language needs no server action.

Rejected: `localePrefix: "as-needed"` — it would make unprefixed `/jobs` fixed
to English forever, contradicting the chosen behavior.

### 3. Locale switching is a link, not an action

`LocaleSwitcher` renders, for each locale, a `Link locale={…} href={pathname}`
from `createNavigation(routing)`, so the current screen is re-resolved in the
target locale and the proxy persists the cookie. It sits in the top-nav user
menu (signed-in) and on the sign-in page (unauthenticated). No server action,
no `document.cookie` handling, no route-string manipulation.

Rejected: a `cookies().set()` server action followed by a router refresh —
extra moving parts, and it would reload the page; a manual cookie write —
duplicates what the proxy already does.

### 4. Proxy, not middleware, and API routes stay outside the locale tree

`src/proxy.ts` (the Next.js 16 name for `middleware.ts`) exports
`createMiddleware(routing)` with next-intl's standard matcher, which already
excludes `/api`, `/_next`, `/_vercel`, and dotted paths. The SSE route
(`/api/mes/events`), session, and GraphQL proxy therefore never take a locale
prefix, and the browser's relative fetches to `/api/mes/*` keep working from
any locale path. The matcher must be checked against the two non-API public
routes (`/signin`, `/reset-password`) so they still match.

### 5. Locale reaches client components through `NextIntlClientProvider`

`[locale]/layout.tsx` reads the locale from `next/root-params`, imports the two
message files statically (they are tiny), and wraps children in
`NextIntlClientProvider`. `src/i18n/request.ts` implements `getRequestConfig`
so server components and metadata can use `getTranslations`. Because every
view is a client component, provider-level messages cover all rendering; no
per-page provider plumbing is needed.

Rejected: per-feature `NextIntlClientProvider` instances — more code, and a
second source of "which messages are loaded".

### 6. The label registry keeps codes and colors, and takes names from catalogs

`registries.ts` keeps every code, hex color, and flag exactly as they are, and
its per-enum label helpers become lookups into the catalogs
(`labels.ticketState.<CODE>`, `labels.leave.<CODE>`, …) exposed as a
`useDomainLabels()` hook for client components plus `getDomainLabels(locale)`
for server components. Selects keep receiving `items` built from the same
lookup, so trigger labels and option labels can never diverge.

The demonstrated Vietnamese strings from the spec deltas (`Trung bình`,
`Nghỉ phép năm`, …) are the contract's examples, and `en.json` must hold exactly
today's English wording so no screen changes in the default locale.

Department and person names are record data, so they stay verbatim; a
`labels.departments.<CODE>` catalog section gives a Vietnamese display name
where one is authored, and anything absent falls back to the stored name (the
display-labels "stored name remains the fallback" scenario).

### 7. Error copy moves to the catalogs as a code-keyed map

`MesApiError` keeps `code` plus the raw server message, and `displayMessage`
becomes a hook (`useErrorDisplayMessage`) that resolves `errors.<CODE>` from the
catalog, falling back to the server message for codes with no catalog entry.
The `en` entries are today's strings verbatim.

### 8. Typography: IBM Plex Sans loads the `vietnamese` subset

IBM Plex Sans ships a `vietnamese` subset on Google Fonts (verified against
`fonts.googleapis.com/metadata`), so `subsets: ["latin", "vietnamese"]` keeps
the documented typeface for Vietnamese without a fallback font. `<html lang>`
is set per locale in the layout.

### 9. Prerender classification is preserved by construction

`generateStaticParams` returns both locales in `[locale]/layout.tsx`, so each
route has known params. Every page keeps its existing `export const instant =
false` declaration — the static-shell check reads each segment's own
declaration, and those declarations move with the files. Verification is a
diff of the route table in `next build` output against the pre-change table.

## Risks / Trade-offs

- **Route relocation breaks prerender or the static-segment checks.** → Task
  1.5 moves the tree and immediately runs `bun run build` comparing the route
  table (`○`/`◐`/`ƒ`) against the pre-move build, before any copy is extracted,
  so a regression is caught before ~200 strings are touched.
- **A `next/link` or `useRouter` left behind navigates to a locale-less URL.**
  → Task 1.6 replaces every navigation import with the `@/i18n/navigation`
  re-exports and gates on a grep for `next/link` and `next/navigation`, which is
  task 7.4's final re-run across the whole surface.
- **Copy extraction is large and easy to get wrong per screen.** → Extraction is
  grouped per surface (groups 3–5), each group verified in both locales in the
  browser before the next starts.
- **Vietnamese strings are longer and can overflow tables/badges.** → The
  existing compact-badge truncation and hover-title behavior is reused for
  Vietnamese; task 6.2 walks the dense surfaces (badges, calendar cells, nav) in
  Vietnamese and checks overflow.
- **`useTranslations` inside the registry would break its current
  non-Component call sites.** → Task 2.2 makes the registry helpers hooks plus a
  server-side variant, and the typecheck catches any leftover plain-function
  call site.
- **A missing Vietnamese entry silently renders English.** → The key-parity test
  (task 6.3) and the extended coverage test (task 2.3) both fail on a missing
  translation, per the specs.
- **The proxy matcher may swallow the API/SSE routes.** → Task 1.4 verifies
  `/api/mes/graphql`, `/api/mes/session`, and the SSE endpoint still respond
  un-prefixed and un-localized.

## Migration Plan

No data or API migration. The URL shape changes (every public URL gains a
prefix), so the one operational note is that previously bookmarked un-prefixed
links keep working via the proxy redirect; no redirect table is needed. Deploy
is the normal frontend build. Rollback is reverting the branch: no stored state
depends on the locale, and the only new cookie (`NEXT_LOCALE`) is inert once the
proxy is gone.

## Open Questions

None that change the specs or this breakdown. The Vietnamese wording is a
first-pass translation intended for a native-speaker review pass, and further
languages can be added later by adding entries to `routing.locales` plus
catalogs; both are follow-ups that do not alter the approach above.
