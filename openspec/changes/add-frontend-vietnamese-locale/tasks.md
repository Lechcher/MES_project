# Tasks

## 1. Foundation: dependency, provider, switcher, formatting

- [x] 1.1 Add `next-intl` (latest `4.14.x`, confirmed with the npm-check-updates skill) to `frontend/package.json` and add its row to the Stack table in `AGENTS.md`; verify `bun install` in `frontend/` succeeds and `bunx tsc --noEmit` passes.
- [x] 1.2 Wrap `frontend/next.config.ts` with `createNextIntlPlugin` and add `frontend/src/i18n/request.ts` pinning the server locale to `en` and loading `messages/en.json`; verify `bun run build` succeeds and every route keeps the same `○`/`◐`/`ƒ` classification as before the change.
- [x] 1.3 Create `frontend/messages/en.json` and `frontend/messages/vi.json` with the `common`, `shell`, `auth`, and `errors` namespaces and identical keys, and augment next-intl's `IntlMessages` from `typeof en` in a `frontend/global.d.ts`; verify an invented key fails `bunx tsc --noEmit` while a real one passes.
- [x] 1.4 Implement the client `LocaleProvider` in `frontend/src/lib/mes/i18n/provider.tsx` — default `en`, adopt the `mes_locale` cookie on mount, write it on change, keep `document.documentElement.lang` in step, render `NextIntlClientProvider` — and wrap `children` with it in `frontend/src/app/layout.tsx`; verify with a unit test that cookie parsing falls back to `en` for a missing or unknown value, and in the browser that a stored `vi` cookie renders Vietnamese text.
- [x] 1.5 Add a `LanguageSwitcher` client component built from the existing shadcn `Select` primitive, labelled "English"/"Tiếng Việt", and mount it in `frontend/src/components/shell/app-nav.tsx` and on the sign-in card; verify it appears on the sign-in screen and for a signed-in `EMPLOYEE`, and that choosing Tiếng Việt switches the visible text without a reload and without changing the URL.
- [x] 1.6 Add the `vietnamese` subset to the IBM Plex Sans load in `frontend/src/app/layout.tsx`; verify a Vietnamese screen renders diacritics without missing glyphs.
- [x] 1.7 Add locale-aware formatting wrappers over next-intl's `useFormatter` and migrate the consumers of `frontend/src/components/shared/format.ts` plus the two `toLocaleDateString("en-GB")` month labels in `matrix-calendar.tsx` and `attendance-summary.tsx`; verify dates and decimals differ between the English and Vietnamese screens and that no `en-GB` literal remains in the components.

## 2. Domain label bridge and catalogue guard

- [x] 2.1 Add the `enums` namespace to both catalogues covering every registry code — ticket states, leave codes, priority, task type, approval status, task-request type, department type, roles, modules, and state/secondary badges — with Vietnamese translations; verify the coverage test from 2.3 passes.
- [x] 2.2 Implement `frontend/src/lib/mes/i18n/labels.ts` exposing `useDomainLabels()` with the helpers the components use today, preserving `labelFor`'s pass-through for unknown values; verify with a unit test that an unknown code is returned unchanged.
- [x] 2.3 Extend the registry test to assert that every code in every registry has an `enums.*` message in every locale and that the locales expose identical key sets; verify it fails when a label or a locale message is deleted, then restore it.
- [x] 2.4 Migrate `frontend/src/components/shared/state-badge.tsx` and `secondary-badge.tsx` to the bridge; verify no bare state code renders and compact badges still truncate with the full name on hover in both locales.
- [x] 2.5 Document the localization workflow in `docs/DEVELOPMENT.md` — how to add a message, how to add a locale, and how the coverage test guards completeness — and note the Vietnamese font subset in the `DESIGN.md` typography section; verify the documented commands run as written.

## 3. Shell and sign-in copy

- [x] 3.1 Move the shell strings (top navigation, dashboard launcher names and descriptions, footer, live status) into the `shell` namespace and consume them with `useTranslations`; verify each changes with the language and app names and role names read Vietnamese.
- [x] 3.2 Move the sign-in, reset-request, and reset-password copy into the `auth` namespace, moving the reset page's server-rendered `CardTitle` into a client component; verify both screens read Vietnamese in the active locale.
- [x] 3.3 Add a `useErrorText()` hook that renders a `MesApiError` in the active locale while leaving a message the API supplied untouched, and migrate the screens' error rendering; verify an API-supplied message passes through untranslated and a frontend fallback renders in Vietnamese.

## 4. Jobs module

- [x] 4.1 Localize the Jobs screen chrome — day navigation bar, filters, table headers, pagination, empty states, and action buttons — into the `jobs` namespace; verify no English string remains on `/jobs` in Vietnamese.
- [x] 4.2 Migrate the Jobs label call sites in `jobs-view.tsx`, `quick-add-view.tsx`, `task-detail-view.tsx`, `create-ticket-view.tsx`, and `task-request-review.tsx` to `useDomainLabels()` and localize the create, extension, and late-submission form copy; verify no English copy and no code token renders on any Jobs screen in either locale.
- [x] 4.3 Verify the Jobs mutations and filters still carry codes in Vietnamese: creating a ticket with the task type reading "Hằng ngày" submits `DAILY`, the priority default stays `MEDIUM`, and filtering by the state reading "Đang chờ" sends `PEN`.

## 5. Planning module

- [x] 5.1 Localize the Planning view tabs, matrix calendar (month label, legend copy, late/early marks), attendance summary, leave queues, create-leave form, and penalty-leave view into the `planning` namespace; verify no English copy remains on any Planning screen in Vietnamese.
- [x] 5.2 Migrate Planning's label call sites in `matrix-calendar.tsx`, `attendance-summary.tsx`, `leave-requests.tsx`, `approval-board.tsx`, `penalty-leave.tsx`, and `planning-view.tsx` to the bridge; verify state and leave names read Vietnamese in bars, day cells, and the attendance summary.
- [x] 5.3 Verify the leave and penalty forms still submit codes in Vietnamese: an approved-leave day cell tagged from an `AL` request, the create-leave form submitting the selected leave code, and the penalty form submitting `UAL`/`USL`.

## 6. Performance module

- [x] 6.1 Localize the Personal KPI dashboard (score card, charts, recent events, month selector) and the audit tables' headers and copy into the `performance` namespace; verify all three tables' headers read Vietnamese with no parenthetical code keys.
- [x] 6.2 Migrate Performance's frontend-authored label call sites in `performance-view.tsx` to the bridge; verify no code token renders and that KPI rule text supplied by the API remains English by design.

## 7. Settings module

- [x] 7.1 Localize the Settings menus, User Directory (list, filters, create/edit dialog, actions), Org Structure, RBAC copy, Telegram webhook, and System Audit Logs into the `settings` namespace; verify no English copy remains for an `HR_MANAGER` (User Directory only) or a `TECH_LEAD` (all menus) in Vietnamese.
- [x] 7.2 Migrate Settings' label call sites in `settings-view.tsx`, `user-directory.tsx`, `org-structure.tsx`, `rbac.tsx`, `telegram-webhook.tsx`, and `system-audit-logs.tsx` to the bridge; verify role, module, and department-type names read Vietnamese while permission codes and audit codes stay codes.

## 8. Audit Log module

- [x] 8.1 Localize the Audit Log view copy and filters into the `auditLog` namespace and migrate its label call sites in `audit-log-view.tsx`; verify module names read Vietnamese while audit module, action, and resource codes remain codes.

## 9. Integration verification

- [x] 9.1 Run the full check set — `bunx biome check src`, `bun test`, and `bunx tsc --noEmit` in `frontend/`, and `bun test` in `backend/`; verify all pass with the label coverage and catalogue parity tests included.
- [x] 9.2 Run `bun run build` in `frontend/`; verify every route keeps its previous classification (no route becomes `ƒ`) and no Cache-Components or uncached-data insight appears.
- [x] 9.3 Browser pass in both locales over the shell, all five apps, their dialogs, and the create/leave/penalty forms; verify that in Vietnamese no English remains except brand names, code content on technical surfaces, and API-supplied text, and that no enum code or record identifier leaks in either locale.
- [x] 9.4 Verify the default and the remembered choice on a fresh visit: with no `mes_locale` cookie the app opens in English, and with a `vi` cookie it opens in Vietnamese after load.
- [ ] 9.5 Review the Vietnamese catalogue with the user and apply the corrected wording; verify the corrected messages render on the screens they belong to.

## Workflow follow-up

- Commit on `ai/<agent>/add-frontend-vietnamese-locale` with the AI co-author trailer and open a PR for human approval, per `AGENTS_GIT.md`.
- Archive the change once the review requirements are satisfied and the PR is approved.
