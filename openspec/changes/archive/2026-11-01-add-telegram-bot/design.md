# Design

> This document is the Telegram bot architecture. A short pointer lives at
> `TELEGRAM_BOT_ARCHITECTURE.md` in the repository root.

## Context

See proposal.md — Why. The system as it exists today:

- **Backend**: Bun + Elysia on `:3001`, all configuration read once through
  `loadConfig` (`backend/src/config.ts`), all authorization through one
  `authorize()` table (`backend/src/graphql/access.ts`), all reads and writes
  through domain modules under `backend/src/domain/` that receive a
  `ViewerContext` (`backend/src/graphql/context.ts`).
- **Telegram, today**: outbound only. `telegram_webhook_config` (bot token,
  alert group chat, webhook URL, enabled flag) is edited in Settings
  (`domain/settings.ts:946`), gated to technical roles
  (`graphql/access.ts:150`), and `domain/notifications.ts` POSTs event payloads
  to the configured URL, recording SENT/FAILED on the `notifications` table
  without ever failing the domain change that triggered it.
- **Auth**: Better Auth sessions (bearer for the API, httpOnly cookie through
  the frontend proxy). Passwords are verified by the existing sign-in path.

Constraints that shape this design:

- Single-branch `main`, Conventional Commits, `Co-authored-by: AI Agent` trailer
  (AGENTS.md / AGENTS_GIT.md).
- New dependencies require a Stack-table update, a `npm-check-updates` version
  check, and verification against the package's own source/docs.
- Secrets live in env or the settings table only; examples in `.env.example`;
  `.env` is never read, written, or committed.
- The bot is a **new front door to the same domain**, never a second
  implementation: every read, write, permission check, and audit record goes
  through the existing domain functions.

## Goals / Non-Goals

**Goals:**

- Long-polling bot inside the existing backend process — no public URL, no
  tunnel, works behind any network including localhost dev.
- Login before use: preferred single-use link code generated on the website;
  in-bot credentials fallback reusing the existing password verification.
- Five feature surfaces: AI-agent search `/ask`, `/notifications`, `/newticket`
  (role-gated), `/lookup`, `/audit` + `/status`.
- OpenAI-compatible AI endpoint whose model catalog is auto-fetched and cached;
  per-user model switching; default model configurable via env *and* website.
- Every permission decision identical to the web surface; the bot cannot see or
  do anything the linked user could not do in the browser.

**Non-Goals:**

- Webhook mode (`setWebhook`, public HTTPS, `X-Telegram-Bot-Api-Secret-Token`).
  Long polling removes the infrastructure requirement; the architecture keeps
  the option open (grammY supports swapping the transport) but does not build
  it.
- Persistent multi-turn AI conversation memory across `/ask` invocations.
- Any agent write capability — the tool set is read-only by construction.
- Changes to the web app's GraphQL contract beyond the new settings operations.

## Architecture Overview

```
Telegram user
   │  long polling (getUpdates / sendMessage, bot token)
   ▼
┌────────────────────────────────────────────────────────────┐
│ backend process (Elysia on :3001)                           │
│                                                             │
│  src/telegram/                                              │
│    bot.ts            Bot construction, composer tree,       │
│                      long-poll start/stop behind guard      │
│    auth.ts           session resolution + link-code and     │
│                      password login flows                   │
│    guard.ts          middleware: refuses unauthenticated    │
│                      chats for everything but public cmds   │
│    commands/         one file per feature (see Command       │
│                      Surface) — thin: parse → domain →      │
│                      render                                 │
│    ai/                                                        │
│      agent.ts        AI SDK agent + tools, budget, prompt   │
│      tools.ts        read-only tool definitions (zod)       │
│      catalog.ts      OpenAI-compatible /models fetch+cache  │
│    render.ts         message/table formatting, inline       │
│                      keyboards, pagination                  │
│    settings.ts       env/DB/per-user settings resolution    │
│                                                             │
│  existing domain modules (reused, unmodified in behavior)   │
│    domain/notifications.ts  domain/tasks.ts                 │
│    domain/audit-log.ts      graphql/access.ts (authorize)   │
└────────────────────────────────────────────────────────────┘
```

**Runtime flow of one message:** grammY receives an update → `guard.ts`
resolves the Telegram identity to a linked MES user (or refuses) → the command
handler builds a `ViewerContext` for that user via the existing
`createContext()` + session resolution → it calls the same domain function the
GraphQL resolver calls → `render.ts` formats the result → the handler replies.
Authorization is never re-implemented: handlers call `authorize()` with the
linked viewer's roles exactly as resolvers do.

## Decisions

**Decision: Long polling, inside the existing backend process.**
grammY's `bot.start()` runs in the Elysia process; `bot.stop()` on shutdown;
both behind the enabled flag so tests and unconfigured deploys are inert.
- Alternative A: webhook server (the "telegraf webhook server" discussed
  earlier). Rejected for this change: Telegram requires a public HTTPS endpoint
  on 443/80/88/8443, so every developer would need a tunnel just to run the
  bot locally, and every deployment would need a domain. Long polling trades a
  little latency (and Telegram's push guarantees) for zero infrastructure.
- Alternative B: separate process/package. Rejected: the bot's value is reuse
  of the domain layer; a second process would duplicate config bootstrap, DB
  handle, auth instance, and Sentry wiring for no isolation benefit at this
  scale (single-operator deployment).

**Decision: Link code (preferred) + password fallback for login.**
- **Link code**: the signed-in user generates a short code on the website
  (Settings → Telegram); sends `/link CODE-1234`; the bot consumes it
  single-use within TTL and creates the link. The password never enters the
  chat.
- **Password fallback**: `/login <identifier> <password>` verified through the
  same Better Auth server-side verification the login mutation uses; the bot
  deletes the credential message where Telegram permits, never logs it, and
  returns the same generic failure for unknown identifier and wrong password.
- Alternative A: password-only. Rejected: passwords persist in chat history by
  default; the link-code flow is the safer default and the user asked for both.
- Alternative B: Telegram Login Widget (OAuth-style). Rejected: it
  authenticates *Telegram* identity, which then still needs mapping to a MES
  account — the link-code flow already provides that mapping without a
  browser round-trip.

**Decision: The Telegram link *is* the session.**
A row in `telegram_links` (Telegram identity ↔ MES user) is the authenticated
session. There is no bot token to expire; revocation happens by flipping the
row inactive (from the website, `/logout`, or account deactivation). This
mirrors how the web app treats its own session: one row, revocable, no
credentials at rest.

**Decision: Settings resolution order per-user → website → env → default.**
`backend/src/telegram/settings.ts` is the only module that answers "what is
the value of X?"; `config.ts` keeps owning pure-env config, and the resolver
layers DB settings over it. Env bootstraps a deployment; the website overrides;
per-user AI model choice overrides the global default.
- Alternative A: DB-only settings. Rejected: a fresh deployment could not
  start the bot without seeding the database first, and `.env` is the
  documented deployment surface (AGENTS.md).
- Alternative B: env-only. Rejected: the user explicitly asked to configure
  from the website, and the existing Telegram settings page already works that
  way.

**Decision: OpenAI-compatible endpoint, catalog-driven models.**
The AI layer uses the Vercel AI SDK (`ai` + `@ai-sdk/openai`) with
`createOpenAICompatible({ baseURL, apiKey })` — one code path works for
OpenAI, Azure-ish gateways, Ollama, vLLM, OpenRouter, and similar. The model
catalog is fetched from the endpoint's `/models` route, cached in
`telegram_ai_models`, refreshed on demand and on a schedule; `/model` lists it
and switches the caller's preference.
- Alternative A: hardcode one provider/model. Rejected: the user wants the
  catalog fetched and switching from inside the bot; hardcoding also forces a
  redeploy to change models.
- Alternative B: non-compatible per-provider SDKs (`@ai-sdk/anthropic`, …).
  Deferred: the OpenAI-compatible surface covers the requested behavior with
  one dependency; per-provider packages can be added later behind the same
  resolver if a provider lacks a compatible endpoint.

**Decision: Read-only tool set over domain functions.**
Tools (`tools.ts`) are zod-schema'd functions that each call an existing
domain query with a `ViewerContext` for the linked user and return compact
JSON. No tool receives a raw SQL string; there is no generic "query" tool.
- Alternative A: text-to-SQL tool. Rejected explicitly by the user, and it
  would bypass `authorize()` and department scoping — the exact controls the
  rest of the system enforces.
- Alternative B: expose GraphQL to the agent. Rejected: GraphQL would let a
  confused agent compose arbitrary selections (and, with the mutation surface,
  writes); a fixed tool set is the safer boundary and is easier to test.

**Decision: Reuse `notifications` as the single history.**
`/notifications` reads the existing `notifications` table filtered to the
linked viewer (recipient = the viewer or the alert group they belong to); push
alerts re-use `dispatchNotification`'s record-then-deliver-then-mark flow by
adding a Telegram delivery step beside the existing webhook POST. No parallel
notification store.

**Decision: Ticket creation via the existing domain function.**
`/newticket` runs a guided grammY conversation collecting the same fields
`createTask(input)` accepts, then calls the same domain `createTask` the
mutation calls, with `authorize()` checked *before* the conversation starts.
The audit action is recorded with the originating channel marked as the bot so
audit readers can distinguish it from a web creation.

## Data Model (new tables, one drizzle migration)

| Table | Purpose | Key columns |
| --- | --- | --- |
| `telegram_bot_settings` | Singleton row: website-level bot config overriding env | `botToken`, `isEnabled`, `aiBaseUrl`, `aiApiKey`, `aiDefaultModel`, `pushAlertsEnabled`, `updatedAt` |
| `telegram_links` | The bot session: Telegram identity ↔ MES user | `telegramUserId` (unique), `userId` (FK), `chatId`, `telegramUsername`, `linkedAt`, `lastSeenAt`, `isActive` |
| `telegram_link_codes` | Single-use login codes | `codeHash` (PK), `userId` (FK), `expiresAt`, `consumedAt` |
| `telegram_ai_models` | Cached model catalog from the compatible endpoint | `modelId` (PK), `displayName`, `fetchedAt` |
| `telegram_ai_usage` | Per-user rolling 30-day `/ask` budget | `userId` (PK), `windowStart`, `queryCount` |
| `telegram_user_prefs` | Per-user overrides | `userId` (PK), `selectedModel`, `updatedAt` |

(`telegram_ai_usage` was added while implementing the budget: an in-memory
counter would reset on every deploy and let one user spend unbounded, so the
window is persisted. This is the only table beyond the design's original five.)

Notes: link codes are stored hashed (same discipline as credentials); the old
`telegram_webhook_config.botToken` keeps serving the outbound webhook and is
read as a fallback source for the bot token so existing deployments need no
re-entry. New tables follow the existing schema conventions (text PKs,
`createdAt`/`updatedAt` helpers).

## Command Surface (feature mapping)

| Command | Feature | Authorization |
| --- | --- | --- |
| `/start` `/help` | Orientation; explains login | none |
| `/link <code>` `/login <id> <pw>` `/logout` | Login flows | none to attempt |
| `/ask <question>` | AI-agent search | linked user |
| `/model` `/model <id>` | Catalog + per-user switch | linked user |
| `/notifications` | Newest notifications | linked user (own records) |
| `/newticket` (guided) | Create job ticket | DEPT_HEAD, HR_MANAGER, SUPER_ADMIN, TECH_LEAD |
| `/lookup` → `jobs`, `projects`, `attendance`, `kpi`, `leaves` | Module lookup | linked user + existing per-module rules |
| `/audit` | Recent audit entries | existing `auditLogs` authorization |
| `/status` | Health + recent failures | technical roles |

Unlinked users can only reach the first four rows; `guard.ts` refuses the rest.

## Configuration Surface

Env (`backend/.env.example` only): `TELEGRAM_BOT_ENABLED`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_AI_BASE_URL`, `TELEGRAM_AI_API_KEY`,
`TELEGRAM_AI_MODEL` (default model), `TELEGRAM_AI_MONTHLY_QUOTA` (per-user
budget), `TELEGRAM_LINK_CODE_TTL_MINUTES`.

Website (Settings → Telegram, technical roles): enable flag, bot token, AI base
URL / API key / default model, "refresh model catalog", link-code generator +
active codes, linked-accounts list with revoke, push-alert toggle. New GraphQL
operations: `telegramBotSettings`, `saveTelegramBotSettings`,
`telegramLinkCode`, `telegramLinks`, `revokeTelegramLink`, `telegramAiModels`
— additive to the SDL; existing operations untouched.

## Security

- **Tokens/secrets**: bot token and AI key stored in the settings table or env;
  masked everywhere else (reuse `redactMailUrl`-style masking discipline);
  never logged, never in audit payloads, never in GraphQL responses.
- **In-chat credentials**: password login auto-deletes the message where
  Telegram allows; credentials are never persisted; identical generic failure
  for unknown-identifier and wrong-password (the session route already follows
  this rule).
- **Agent boundary**: fixed read-only tool set; tool output is treated as data
  (system prompt states this) to blunt prompt injection from tool content;
  every tool enforces the linked viewer's scope; per-user AI budget caps abuse.
- **Telegram identity trust**: only `telegram_user_id` from the update (which
  Telegram authenticates) is used for identity — never display names or
  usernames supplied in text.
- **Link codes**: hashed at rest, single-use, TTL-bound, generated only for an
  authenticated web session.

## Risks / Trade-offs

- [Bot availability is now API availability — a bot crash takes down the API]
  → the bot runs behind the enabled flag with its failures isolated: polling
  errors are caught and logged, never thrown into Elysia; a misconfigured or
  unreachable AI endpoint degrades to a clear "search unavailable" message,
  not a crash. Unit tests boot the server with the bot disabled.
- [Long polling adds an outbound dependency on api.telegram.org] → already
  true of the outbound webhook today; delivery failure handling is copied from
  the notifications engine (record, mark, never roll back).
- [AI endpoint cost/latency per question] → per-user budget, compact tool
  results, and short system prompt; model choice lets an operator point at a
  cheaper compatible endpoint.
- [Agent answers drift from the data] → tools return the same records the web
  surface returns; answers are grounded in tool output only; tests pin a
  sample Q&A against seeded data.
- [New tables + migration on an existing dev database] → additive migration,
  drizzle-generated, tested by the existing `migrate.test.ts` table-list style.
- [Four new dependencies] → versions checked via `npm-check-updates`, Stack
  table updated, APIs verified from package source before integration.

## Migration Plan

Deploy order: (1) backend with tables + config + settings resolvers (bot
disabled); (2) frontend Settings section + GraphQL operations (additive);
(3) enable the bot with a token (env or website) — the bot starts answering
`/start` immediately and every other command only after a link code exists.
Rollback: disable the flag; the bot stops polling; no data is destroyed
(tables stay, links stay). No backfill is needed: links and preferences are
created on first use.

## Open Questions

- Default AI model identifier for the out-of-the-box `.env.example` value
  (decide at implementation against the endpoint the operators actually use).
- Whether `/ask` gets conversation memory within a single chat session later
  (explicitly a non-goal now; the agent is stateless per question).
- Exact shape of "recent errors" in `/status`: from the backend run-log sink
  when present, otherwise health + recent failed notification deliveries;
  Sentry remains the error-tracking source of record and is not queried live
  by the bot.
