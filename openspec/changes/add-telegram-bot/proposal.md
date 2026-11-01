# Proposal

## Why

The system today has no interface a manager can reach without opening the web
app. Notifications about job state changes are written to the `notifications`
table and pushed to a configured webhook URL (Settings → Telegram Webhook), but
nobody can *ask* the system anything from where they already are: Telegram.
Approvals, new job openings, overdue tickets, and audit questions all require
finding the browser, signing in, and navigating to the right module.

Meanwhile the project already carries the bones of this feature: a
`telegram_webhook_config` table (bot token, group chat, webhook URL, enable
flag), a `notifications` engine that records and delivers every documented
workflow event, and a Settings page gated to technical roles. What is missing
is the other direction: an inbound bot that authenticates a MES user over
Telegram and answers on their behalf.

## What Changes

- Add a Telegram bot inside the existing backend process (`backend/src/telegram/`),
  built on grammY, receiving updates by **long polling** (no public URL, no
  tunnel — works on localhost and behind any network).
- Add Vercel AI SDK-based **search agent** (`/ask`): an OpenAI-*compatible*
  endpoint (base URL + API key configurable), whose model catalog is
  auto-fetched from the endpoint's `/models` route, cached, and switchable
  per user from inside the bot (`/model`). The agent has a fixed, read-only
  tool set; every tool runs through the existing domain query functions with a
  `ViewerContext` built for the linked user. It never issues plain-text SQL.
- Add **bot login** with two flows: a preferred one-time **link code** generated
  in the web app (Settings → Telegram), and an in-bot credentials fallback
  (`/login`). No bot command works for an unauthenticated Telegram user.
- Ship the five requested features as bot commands:
  1. `/ask` — AI-agent information search across the system.
  2. `/notifications` — the viewer's newest notifications (job openings,
     status changes, …), plus optional opt-in push alerts to linked accounts.
  3. `/newticket` — guided job-ticket creation, gated to Department Head, HR
     Manager, Super Admin, and Tech Lead via the existing role authorization.
  4. `/lookup` — read-only lookup of Jobs & Projects, Planning & Attendance,
     and Performance & Audit, scoped by the same permissions as GraphQL.
  5. `/audit` + `/status` — recent audit-log entries (existing authorization
     rules) and server health/errors.
- Extend configuration so every bot setting can come from **both** the `.env`
  file and the website: environment values bootstrap a fresh deployment, and
  values saved in Settings override them; per-user AI model choice overrides
  the global default. Resolution order: per-user preference → website setting →
  environment variable → built-in default.
- Extend the frontend Settings → Telegram page with bot enable/token, AI
  endpoint configuration, link-code generation, linked-account management, and
  the push-alert toggle. All role-gated exactly like today's
  `telegramWebhookConfig` (technical roles).
- Reuse — never fork — the existing engines: `domain/notifications.ts` for
  notification records/delivery, `domain/tasks.ts` for ticket creation,
  `domain/audit-log.ts` for audit reads, and the `authorize()` role table for
  every permission decision. The bot is a new front door to the same domain,
  not a second implementation of it.

Explicitly out of scope: webhook mode (public HTTPS endpoint, secret-token
header handling, tunnel setup) — long polling removes that infrastructure
requirement; multi-step AI conversation memory across sessions (each `/ask` is
stateless); writing to the database through the agent (tools are read-only);
and any change to the GraphQL API contract used by the web app.

## Capabilities

### New Capabilities

- `core/telegram-bot`: How a MES user reaches the system from Telegram — how
  they authenticate the bot, what commands exist, how the read-only AI agent
  answers questions, how the bot is configured from environment and website,
  and how permissions, audit, and notifications behave on this surface.

### Modified Capabilities

- `core/audit-notifications`: bot alerts become an additional, opt-in delivery
  target for the existing notification engine. Existing requirements (record,
  best-effort delivery, failure isolation) are unchanged; this change adds the
  Telegram channel alongside the configured webhook.
- `backend/graphql-api`: new settings queries/mutations for bot configuration,
  link codes, linked accounts, and the AI model catalog. Existing operations
  and the SDL contract otherwise stay intact.

## Impact

- **Code**: new `backend/src/telegram/` module (bot bootstrap, session/link
  resolution, command handlers, AI agent + tools, message rendering);
  `backend/src/index.ts` starts/stops the bot behind a config guard;
  `backend/src/config.ts` gains the bot/AI settings; `backend/src/db/schema.ts`
  gains four tables (`telegram_bot_settings`, `telegram_links`,
  `telegram_link_codes`, `telegram_ai_models` + per-user model preference) with
  a drizzle migration; frontend Settings → Telegram section.
- **Configuration**: new backend env vars in `backend/.env.example` only
  (`TELEGRAM_BOT_*`, `TELEGRAM_AI_*`) — never `.env` itself, per AGENTS.md.
- **Dependencies**: `grammy`, `ai` (Vercel AI SDK), `@ai-sdk/openai`, and `zod`
  (tool schemas). Versions checked with the `npm-check-updates` skill before
  adding; the AGENTS.md Stack table is updated.
- **Tests**: unit tests for link-code lifecycle, session resolution, settings
  precedence, model-catalog fetch/caching, AI tool authorization scoping, and
  command role gating; plus a documented manual smoke test with a real bot
  token (env-gated, never automated in CI).
- **Storage**: all new tables live in the existing SQLite database; no new
  filesystem artifacts.
- **Docs**: root `TELEGRAM_BOT_ARCHITECTURE.md` (pointer to this change's
  design), `docs/DEVELOPMENT.md` gains a bot setup section.
