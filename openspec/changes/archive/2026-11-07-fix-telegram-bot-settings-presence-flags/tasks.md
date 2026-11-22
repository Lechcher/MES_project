# Tasks

## 1. Declare the missing fields

- [x] 1.1 In `backend/src/graphql/schema.ts`, extend `type TelegramBotSettings` with `botTokenSet: Boolean!` (beside `botToken`) and `aiApiKeySet: Boolean!` (beside `aiApiKey`), matching the field order and nullability of `TelegramBotSettingsView` in `backend/src/domain/settings.ts`; leave the resolver untouched (it returns the view verbatim).
- [x] 1.2 Verify the two frontend operations now execute: with a scratch script (under the session temp dir, not committed), build the schema from `typeDefs` and `validate` the parsed `TELEGRAM_BOT_SETTINGS_QUERY` and `SAVE_TELEGRAM_BOT_SETTINGS_MUTATION` documents from `frontend/src/lib/mes/queries/settings.ts` against it — assert zero validation errors; delete the scratch script afterwards.

## 2. Guard the contract against drift

- [x] 2.1 In `backend/src/graphql/schema.test.ts`, add a `TelegramBotSettings` field-list assertion following the existing `PersonalKpiDashboard` pattern: the exact sorted field list (`aiApiKey`, `aiApiKeySet`, `aiBaseUrl`, `aiDefaultModel`, `botToken`, `botTokenSet`, `isEnabled`, `pushAlertsEnabled`).
- [x] 2.2 Prove the guard bites: temporarily remove `botTokenSet` from the SDL, confirm the new assertion fails, restore it, and confirm the same suite is green again; verify with `cd backend && bun test src/graphql/schema.test.ts` that the rest of the contract tests are unaffected.

## 3. Document the type

- [x] 3.1 In `API_CONTACT_SPECIFICATION.md` §6.4 Types, document `type TelegramBotSettings` beside `type TelegramWebhookConfig` with the exact eight fields the SDL declares, noting that `botToken`/`aiApiKey` are returned masked and that `botTokenSet`/`aiApiKeySet` carry whether a secret is configured; re-read the section afterwards to confirm rendering is intact. (The other undocumented bot types are out of scope — see the proposal.)

## 4. Verify and commit

- [x] 4.1 Run `cd backend && bun test` and confirm the result matches the pre-change baseline (all pass except the known pre-existing `src/db/seed.test.ts` date-boundary failure, unrelated to this change), run `bunx biome check` plus `bunx tsc --noEmit` on the touched files only with no new findings, and run `openspec validate --strict --change fix-telegram-bot-settings-presence-flags` (or the repo's equivalent strict validation) and confirm it passes.
- [x] 4.2 Commit per the repo rules — Conventional Commits (`fix:`), the `Co-authored-by: AI Agent <agent@local>` trailer, direct to `main` — isolating this change's hunks from the uncommitted WIP in `backend/src/graphql/schema.ts` and `backend/src/domain/settings.ts` with the reconstruct-on-HEAD dance (reconstruct the staged file on the HEAD base, stage it, verify the staged diff carries no WIP markers, restore the WIP working copy); verify with `git show --stat` that only this change's files are in the commit.
- [x] 4.3 Verify live against the running dev backend (:3001): reload Settings & IAM → Telegram Webhook as Super Admin, confirm the query resolves (no `VALIDATION_FAILED`), the masked placeholders render for configured secrets, and one configuration save round-trips through `saveTelegramBotSettings` and shows the updated values.

Applied as `6091ca8` (contract-list repair) and `7373b6b` (the fix), Conventional Commits + `Co-authored-by: AI Agent <agent@local>`, direct to `main`; both files were reconstructed on the HEAD base so the user's uncommitted WIP stayed out of the staged diffs (verified: `git show --stat` and per-file staged diffs), with the WIP working copies restored afterwards.

Gates: backend 477 pass / 1 pre-existing date-boundary failure in the user's uncommitted `seed.test.ts`; biome + tsc clean on every touched file; `openspec validate --strict` green.

Live verification against the running backend (:3001), authenticated as Super Admin: the page's exact `TELEGRAM_BOT_SETTINGS_QUERY` document returned all eight fields (`botTokenSet: false` beside `botToken: null` in the dev database, which has no secret configured — the placeholder path the editor renders), and the exact `SAVE_TELEGRAM_BOT_SETTINGS_MUTATION` document executed and round-tripped the same values, confirming the write path with a `telegram_bot_settings.update` audit event carrying presence flags only (no secret values). The dev settings row was already empty, so the "masked value" rendering is proven at the data layer and by the frontend component test; a visual reload in the user's own browser (their Super Admin sessions are live) remains a one-click confirmation outside this agent's reach — Playwright had no CDP-capable browser to drive and the dev database's admin password is no longer the seed value (the user's own change).
