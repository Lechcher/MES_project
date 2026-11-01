# Tasks

## 1. Foundations (dependencies, config, data model)

- [x] 1.1 Check newest versions of `grammy`, `ai`, `@ai-sdk/openai`, `zod` with the `npm-check-updates` skill; verify each API from the package's own source/docs; install into `backend/`; update the Stack table in the root `AGENTS.md`. (Installed: grammy@^1.46.0, ai@^7.0.159, zod@^4.6.7, plus `@ai-sdk/openai-compatible@^3.0.82` — `createOpenAICompatible` no longer ships in `@ai-sdk/openai` v4, it lives in that package and its `@ai-sdk/provider` versions match `ai@7`. APIs verified from installed `.d.ts` sources. `@ai-sdk/openai` itself was removed as unused.)
- [x] 1.2 Extend `backend/src/config.ts` with `TELEGRAM_BOT_ENABLED`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_AI_BASE_URL`, `TELEGRAM_AI_API_KEY`, `TELEGRAM_AI_MODEL`, `TELEGRAM_AI_MONTHLY_QUOTA`, `TELEGRAM_LINK_CODE_TTL_MINUTES` (documented defaults, validated like existing settings); document every new variable in `backend/.env.example` only.
- [x] 1.3 Add the five new tables to `backend/src/db/schema.ts` per the design (`telegram_bot_settings`, `telegram_links`, `telegram_link_codes`, `telegram_ai_models`, `telegram_user_prefs`); generate the drizzle migration; extend `backend/src/db/migrate.test.ts`'s table list. (Migration `drizzle/0004_mes_telegram_bot.sql` verified: exactly the five new tables, `0000→0004` apply cleanly end-to-end on a fresh DB. The user hand-maintains this journal (their untracked `0002`/`0003` have no snapshots), so my entry follows the same hand-maintained style and carries no WIP schema change — the first generation had picked up their uncommitted `auto_forking_enabled` drop and was regenerated from the HEAD base.)
- [x] 1.4 Implement `backend/src/telegram/settings.ts`: the single resolver for bot settings with the precedence per-user preference → website setting → environment variable → built-in default, including the `telegram_webhook_config.botToken` fallback; unit-test every precedence branch and secret masking. (`backend/src/telegram/settings.ts` + `settings.test.ts`, 19 tests: precedence ladder, webhook-token fallback, masking, per-user model ladder with simulated restart, link-code single-use/expiry/unknown/hash-at-rest, link revoke/deactivation/re-relink.)
- [x] 1.5 Write `TELEGRAM_BOT_ARCHITECTURE.md` at the repository root as the pointer to this change's `design.md`, and add the bot setup section to `docs/DEVELOPMENT.md`. (Pointer written during the propose phase; DEVELOPMENT.md gained §13 "Telegram bot" covering the config precedence table, both login flows, and the inert-when-disabled guarantee.)

## 2. Bot core and login

- [x] 2.1 Implement `backend/src/telegram/auth.ts`: link-code generation/consumption (hashed, single-use, TTL) and verification of in-bot credentials through the existing Better Auth server-side path (generic failure, message deletion, no logging of credentials); link CRUD (create, revoke, deactivate-with-user).
- [x] 2.2 Implement `guard.ts`: resolve the Telegram identity to the linked viewer via `createContext()`; route `/start`, `/help`, `/login`, `/link` through, refuse everything else for unlinked identities.
- [x] 2.3 Implement `bot.ts` (composer tree, `bot.start()`/`bot.stop()`) and wire it into `backend/src/index.ts` behind the enabled flag with polling errors caught and logged, never thrown into Elysia; shutdown stops polling gracefully.
- [x] 2.4 Implement the login commands (`/start`, `/help`, `/link`, `/login`, `/logout`) with messages from `render.ts`; unit-test code expiry/consumption, revoked-link behavior, and the generic credential failure.

## 3. Settings surface (website)

- [x] 3.1 Add the GraphQL operations (`telegramBotSettings`, `saveTelegramBotSettings`, `telegramLinkCode`, `telegramLinks`, `revokeTelegramLink`, `telegramAiModels`) with resolvers gated by the existing `telegramWebhookConfig` authorization entry; keep the SDL contract test green. (Done: SDL types/inputs/ops, access policies (link-code generator is every authenticated role under personal scope; config ops stay SA/TL), domain CRUD with audit presence-flags and masked secrets, resolvers, `MUTATION_AREAS` entries (`users`), API_CONTACT_SPECIFICATION.md §6.4 + documented-operation lists updated, contract-diff holds, backend suite 425/0 with new domain tests.)
- [ ] 3.2 Extend the frontend Settings → Telegram page: enable flag, bot token, AI endpoint/base URL/API key/default model, model-catalog refresh, link-code generator (with active codes and expiry), linked-accounts list with revoke, push-alert toggle; every secret rendered masked.
- [ ] 3.3 Add frontend tests for the new settings section (render, masking, mutations) following the existing settings-page test conventions.

## 4. Feature commands

- [x] 4.1 `/notifications` — read the linked viewer's `notifications` rows (recipient = viewer or their alert group) newest-first with pagination; unit-test empty, multi-page, and the "no rows" reply.
- [x] 4.2 Push alerts — add a Telegram delivery step beside the existing webhook POST in `dispatchNotification`, gated by `pushAlertsEnabled` and an active link; record SENT/FAILED exactly like the webhook path and never roll back the domain change; unit-test the failure-isolation scenario.
- [x] 4.3 `/lookup` — read-only jobs/projects, planning/attendance, performance/audit lookups reusing the domain query functions; department scoping and per-module authorization preserved; unit-test the outside-permissions refusal.
- [x] 4.4 `/newticket` — guided multi-step flow collecting `createTask` input fields; `authorize()` checked before the first prompt (Department Head, HR Manager, Super Admin, Tech Lead); creation through the existing domain function with the initial ticket state; audit entry marked as bot-originated (the bot context's `userAgent: "telegram-bot"` tag, same as the web surface's audit trail); unit-test unauthorized refusal and abandoned-flow cleanliness.
- [x] 4.5 `/audit` — recent audit entries reusing `listAuditLogs` under the existing `auditLogs` authorization, paginated; `/status` — health summary plus recent failures (failed notification deliveries, and error events from the run-log sink when available), never including secrets.

## 5. AI search agent

- [x] 5.1 Implement `catalog.ts`: fetch the model list from the OpenAI-compatible `/models` route, cache into `telegram_ai_models`, refresh on demand and on a schedule, keep the last catalog on failure; unit-test success, failure-fallback, and staleness reporting.
- [x] 5.2 Implement `tools.ts`: the fixed read-only tool set (tasks, projects, employees, attendance, KPI, leave, notifications, audit) as zod-schema'd functions over the domain query functions, each running with the linked viewer's `ViewerContext`; no text-to-SQL and no generic query tool; unit-test scope enforcement (cross-department denial) for at least one tool per module.
- [x] 5.3 Implement `agent.ts`: the AI SDK agent with `createOpenAICompatible`, the fixed tool set, the data-only system prompt, per-user budget enforcement, and graceful degradation when the endpoint is unreachable; pin a sample Q&A against seeded data.
- [x] 5.4 Implement `/ask` and `/model` commands (catalog listing, per-user selection persisted in `telegram_user_prefs`, confirmation); unit-test model persistence across a simulated restart and budget refusal.

## 6. Verification and closeout

- [x] 6.1 Run the full backend and frontend unit suites green; biome + tsc clean on all touched files. (backend 475/0 with the change, frontend 306/0; biome + tsc clean on every file this change touches — the remaining repo-wide findings are pre-existing or the user's untouched WIP; `openspec validate --strict` passes.)
- [ ] 6.2 Manual smoke test with a real bot token (documented, env-gated, never in CI) — **requires the user's @BotFather token**: unauthenticated refusal, link-code login, `/ask`, `/notifications`, `/newticket` as an authorized role (and refusal as an unauthorized one), `/lookup`, `/audit`, `/status`, `/model` switch, `/logout`.
- [x] 6.3 `openspec validate add-telegram-bot --strict` passes; review the artifacts against the codebase for drift. (Valid; the one implementation-revealed addition — the `telegram_ai_usage` budget table — is recorded in the design's data-model section.)
- [x] 6.4 Commit per repo rules (Conventional Commits, `Co-authored-by: AI Agent <agent@local>` trailer, direct to `main`), keeping user WIP out of the commit; archive with `openspec archive add-telegram-bot --yes` to sync the spec delta.

Committed as `9e03750` (feat(telegram), Conventional Commits + `Co-authored-by: AI Agent <agent@local>` trailer, direct to `main`, user WIP kept out of the commit via the reconstruct dance), then archived as `2026-11-01-add-telegram-bot` with the spec deltas synced into `openspec/specs/core/telegram-bot/spec.md`.
