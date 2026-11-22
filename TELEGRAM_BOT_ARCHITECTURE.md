# TELEGRAM_BOT_ARCHITECTURE.md

> Architecture reference for the MES Telegram bot — the **inbound** channel that lets a linked user reach the system from Telegram. This document describes the **structure** of the bot module: its lifecycle, layers, command surface, engines, authorization model, data entities, integrations, and extension points. It is derived from the bot's OpenSpec artifacts — [`openspec/specs/core/telegram-bot/spec.md`](./openspec/specs/core/telegram-bot/spec.md) for the requirements and the change designs (archived [`archive/2026-11-01-add-telegram-bot`](./openspec/changes/archive/2026-11-01-add-telegram-bot/design.md) and [`fix-telegram-bot-commands`](./openspec/changes/fix-telegram-bot-commands/design.md)) for the decisions behind them — and should be read alongside [`SYSTEM_ARCHITECTURE.md`](./SYSTEM_ARCHITECTURE.md), which describes the system the bot plugs into.

---

## 1. Purpose & Scope

This document is the architecture reference for the bot module. It serves contributors, reviewers, and coding agents who need to understand how the bot is put together — how an update travels from Telegram to a domain function and back — without reading every source file.

- **Source of truth.** Every behavioral statement here traces to the bot's spec requirements (see Traceability). Where this document and the spec differ in framing, the spec governs behavior and this document governs structure.
- **View.** `SYSTEM_ARCHITECTURE.md` is organized by system module; this document is organized by the bot's own structure — lifecycle, layers, commands, engines.
- **Technology.** Unlike the system document, which is deliberately technology-neutral, this one names concrete technologies (grammY, Bun, Drizzle), because it is a component architecture for one implemented module.

**In scope:** the bot's lifecycle and settings resolution, the middleware/command layering, the login and identity surfaces, the feature surface, the read-only AI agent, push delivery, the bot's data entities, authorization on this channel, external integrations, and how a new command is added.

**Out of scope:** the outbound Telegram **webhook** notification engine (an existing core engine — `SYSTEM_ARCHITECTURE.md` §9.2, sharing only its configuration row), screen-by-screen web flows, deployment/infrastructure, and the GraphQL API surface itself.

---

## 2. System Overview & Context

The bot is an **inbound channel of the existing MES backend**, not a separate service. It runs inside the same process as the API, receives updates by **long polling** (no public URL, no tunnel — it works on a developer's laptop), and answers by calling the **same domain functions under the same authorization** the web surface calls. A linked Telegram chat is therefore a second front end onto one system: it can read what that viewer may read, create what that role may create, and nothing else.

The bot is **inert unless enabled**: with no enable flag and no resolvable token it logs one line and never polls, leaving the API service untouched.

Its surface divides into four command groups:

| Group | Commands | Reached when |
| --- | --- | --- |
| **Pre-login** | `/start`, `/help`, `/link`, `/login`, `/logout` | Always — declared before the auth guard so an unlinked chat can reach exactly these. |
| **Identity** | `/dashboard`, `/profile` | Linked. The dashboard is also the reply to a successful login. |
| **Feature** | `/notifications`, `/lookup` (+ `/tickets`, `/projects`), `/newticket`, `/audit`, `/status` | Linked, then per-command role gates. |
| **AI** | `/ask`, `/model` | Linked; `/ask` additionally requires a reachable AI endpoint and remaining budget. |

It serves the same five roles as the system — Employee, Department Head, HR Manager, Manager/Tech Lead, Super Admin — resolving each to the identical viewer record the GraphQL context builds, so role and department scope mean the same thing on this channel as on the web.

---

## 3. Architectural Principles

1. **One identity, two channels.** The bot has no account model of its own. A Telegram identity maps to an existing MES user through a link row, and the guard rebuilds the same `ViewerContext` the API uses — so authorization, department scope, and audit attribution are the API's, not a re-implementation.
2. **Authentication before everything.** A single guard middleware resolves the linked viewer. Commands declared behind it may treat `ctx.viewerContext` as present; an unlinked chat is refused with the login instructions and executes nothing.
3. **Reuse over re-implementation.** Commands call the existing domain functions (`listTasks`, `listNotifications`, `createTask`, `listAuditLogs`, …) through the same `authorize()` table the GraphQL resolvers use. There is no parallel data path and no bot-only authorization surface.
4. **The agent is read-only.** The AI assistant answers only through a fixed set of tool wrappers around those same domain functions — never text-to-SQL, never a write — and states a limitation rather than returning data the viewer may not see.
5. **Inert unless enabled.** No enable flag, no token, no polling. A disabled bot cannot affect the API.
6. **Lifecycle resilience.** Telegram permits exactly one polling instance. A start rejected by that rule is retried on a bounded backoff with a fresh instance; a bot that answers nothing must never be a silently accepted state.
7. **Secrets never surface.** Tokens and API keys are resolved in one module, masked everywhere but the settings editor, and never written to logs, messages, or audit records.
8. **A failed update never kills the bot.** Every handler failure is caught by the bot's error boundary, reported to the user, and the polling loop continues.

---

## 4. Logical Architecture

The bot is a ring inside the backend process: transport at the edge, a guard in the middle, command surfaces behind it, and the shared domain layer at the core.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                             MES BACKEND PROCESS                              │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                  TELEGRAM BOT — grammY, long polling                   │  │
│  │                                                                        │  │
│  │┌──────────────────────────────────────────────────────────────────────┐│  │
│  ││              PRE-LOGIN SURFACE — reachable by any chat               ││  │
│  ││              /start   /help   /link   /login   /logout               ││  │
│  │└──────────────────────────────────────────────────────────────────────┘│  │
│  │                                   │                                    │  │
│  │                                   ▼                                    │  │
│  │┌──────────────────────────────────────────────────────────────────────┐│  │
│  ││                        AUTH GUARD  (guard.ts)                        ││  │
│  ││                                                                      ││  │
│  ││                  Telegram id  →  linked MES viewer                   ││  │
│  ││                An unlinked chat gets the login prompt                ││  │
│  ││                        and executes nothing.                         ││  │
│  │└──────────────────────────────────────────────────────────────────────┘│  │
│  │                                   │                                    │  │
│  │                                   ▼                                    │  │
│  │┌──────────────────────────────────────────────────────────────────────┐│  │
│  ││           GUARDED SURFACES — ctx.viewerContext is present            ││  │
│  ││                                                                      ││  │
│  ││identity    /dashboard   /profile                                     ││  │
│  ││feature     /notifications   /lookup                                  ││  │
│  ││/tickets   /projects                                                  ││  │
│  ││/newticket   /audit   /status                                         ││  │
│  ││AI          /ask   /model                                             ││  │
│  │└──────────────────────────────────────────────────────────────────────┘│  │
│  │                                   │                                    │  │
│  │┌──────────────────────────────────────────────────────────────────────┐│  │
│  ││                          bot-private state                           ││  │
│  ││telegram_links  ·  telegram_link_codes                                ││  │
│  ││telegram_bot_settings  ·  telegram_user_prefs                         ││  │
│  │└──────────────────────────────────────────────────────────────────────┘│  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│         │    ViewerContext — the same viewer the GraphQL API builds          │
│                                      │                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                       DOMAIN LAYER + authorize()                       │  │
│  │                      shared with the GraphQL API                       │  │
│  │                                                                        │  │
│  │                     tasks · settings · audit-log ·                     │  │
│  │                 authorization table · code registries                  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │           GraphQL API  ·  web front end  ·  other consumers            │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

Two things the diagram is meant to make obvious: nothing in the guarded surfaces talks to a bot-private store for **system** data (only link/session/config state is bot-private), and the domain layer is the single place where behavior lives.

---

## 5. Layered View

The same module viewed as stacked layers, from the network edge down to storage:

| Layer | Responsibility |
| --- | --- |
| **Transport (Telegram Bot API)** | `getUpdates` long polling for inbound updates, `sendMessage` for replies. The only network dependency. |
| **Lifecycle** | Owns the `Bot` instance: start supervision (retry/backoff on conflicts), the notification-sender registration, and graceful stop. |
| **Middleware** | The auth guard: resolves the Telegram identity to a linked viewer or refuses the chat; builds the `ViewerContext`. |
| **Command surface** | One handler per command; input parsing, role pre-checks, reply rendering. Holds the only bot-private run state (the `/newticket` draft). |
| **AI surface** | The read-only tool-calling agent: fixed tool set, per-user budget, model resolution, model catalog. |
| **Rendering** | Pure text/HTML assembly for Telegram's message subset; no I/O, no state — fully unit-testable. |
| **Domain layer (shared)** | The same functions and the same `authorize()` table the GraphQL resolvers call. |
| **Data layer** | SQLite via Drizzle: the `telegram_*` tables plus every domain table. |

Dependencies point inward: the command surface depends on middleware, rendering, the AI surface, and the domain layer; the domain layer depends on nothing above it.

---

## 6. Module Catalog

### 6.1 Lifecycle & Settings — `bot.ts`, `settings.ts`

- **Purpose.** Decide whether the bot runs, with what configuration, and keep it running.
- **Responsibilities.** Resolve settings at start time; own the start supervisor and retry policy; register the push sender; expose `startTelegramBot` / `BotHandle` to the service bootstrap.
- **Key capabilities.** Settings precedence ladder (§9.2); conflict-aware startup with a fresh `Bot` per attempt (§9.1); token inheritance from the outbound webhook row so a deployment that configured Telegram earlier needs no re-entry; the link/session API (`resolveLinkedViewer`, `upsertLink`, `revokeLink`, `consumeLinkCode`).
- **Who can reach it.** Nobody directly — it is infrastructure. Its configuration is edited in the web app's Settings → Telegram (technical roles only).

### 6.2 Authentication Surface — `commands/login.ts`, `guard.ts`

- **Purpose.** Turn an anonymous Telegram chat into a resolved MES session, and end it again.
- **Responsibilities.** `/start` and `/help` (context-aware); `/link` with a one-time code; `/login` credentials fallback; `/logout` revoke-and-confirm; the guard middleware every later surface sits behind.
- **Key capabilities.** Link codes are hashed (SHA-256), single-use, and expiry-enforced at lookup — unknown, expired, and consumed codes fail identically so a code cannot be probed. The credentials fallback verifies the same password the web login verifies and deletes the credential message where Telegram allows.
- **Who can reach it.** Every chat. This is the only surface an unlinked identity can touch.

### 6.3 Identity Surface — `commands/dashboard.ts`, `commands/profile.ts`

- **Purpose.** Answer "who am I on this channel, what can I do, and what is waiting on me".
- **Responsibilities.** `/dashboard` (on demand and as the post-login reply) and `/profile`.
- **Key capabilities.** The dashboard composes an identity block, the role-appropriate command menu, and the viewer's own counts — assigned open tickets and notifications — each read through the same `authorize()` gate as the web surface; a refused read renders as a placeholder row instead of failing. `/profile` reports the linked account (name, user code, email, department, roles) plus the link facts, so a chat can always confirm which account it is.
- **Who can reach it.** Any linked viewer; counts follow the viewer's own permissions.

### 6.4 Feature Surface — `commands/features.ts`, `commands/newticket.ts`

- **Purpose.** The day-to-day operational reads and the one write.
- **Responsibilities.** `/notifications`, `/lookup` with `/tickets` and `/projects` views, `/newticket`, `/audit`, `/status`, plus the in-flow draft continuation for `/newticket`.
- **Key capabilities.** Guided ticket creation through the existing `createTask` domain path — same initial state, same audit record, refused for every role outside the creators list, with `/cancel` and `/skip` inside the flow; `/status` reports health and recent failed deliveries without ever including credential material.
- **Who can reach it.** Linked viewers, then per-command gates (§8).

### 6.5 AI Surface — `commands/ask.ts`, `ai/agent.ts`, `ai/tools.ts`, `ai/budget.ts`, `ai/catalog.ts`

- **Purpose.** Let a linked user ask questions of the system in natural language, safely.
- **Responsibilities.** `/ask` (including the bare-invocation welcome), `/model` (list / refresh / switch), the agent loop, the tool set, budget enforcement, and the endpoint's model catalog.
- **Key capabilities.** A `ToolLoopAgent` over an OpenAI-compatible endpoint whose tool set wraps the same domain query functions the GraphQL surface calls — the tool result is data, never instructions, and the agent refuses rather than over-reading. A bare `/ask` welcomes without spending budget. Per-user quota (30-day window) is enforced before the call; the catalog is cached with a staleness marker and a failed refresh keeps the last known list.
- **Who can reach it.** Any linked viewer with a configured endpoint and remaining budget; model choice is per user.

### 6.6 Push Delivery — `sender.ts`

- **Purpose.** Let the existing notification engine deliver to Telegram.
- **Responsibilities.** Hold the live sender registered by the lifecycle; `deliverTelegramPush` sends to a linked chat through the same best-effort, failure-isolated path as the existing webhook delivery — a failure never rolls back the domain change that triggered it.
- **Who can reach it.** The notification engine, not a user.

---

## 7. Data Model & Shared Registries

### 7.1 Bot-owned entities

| Entity | Holds | Notes |
| --- | --- | --- |
| `telegram_bot_settings` | The singleton website-level bot configuration (enable flag, token, AI endpoint/key, default model, push-alerts flag). | Created on first read, as the webhook row is. Secrets masked everywhere but the settings editor. |
| `telegram_links` | The bot session: Telegram user id ↔ MES user, chat id, username, active flag, `lastSeenAt`. | Revocation sets `isActive = false`; a revoked link behaves exactly like no link. |
| `telegram_link_codes` | One-time login codes: hash, user, expiry, `consumedAt`. | The plaintext code is never stored. |
| `telegram_user_prefs` | Per-user model preference. | Overrides the global default without changing it for anyone else. |
| `telegram_ai_models` | The cached model catalog fetched from the endpoint. | Staleness is shown, never hidden. |
| `telegram_ai_usage` | Per-user query counters with the window start persisted. | Enforces the 30-day budget. |

(`telegram_webhook_config` is *not* bot-owned — it is the pre-existing outbound row, whose token the bot may inherit for deployments that configured Telegram earlier.)

### 7.2 Shared registries the bot reuses verbatim

The bot never re-defines system vocabulary. Ticket state codes (`REQ`, `ACT`, `PEN`, `APP`, `REJ`, `CAN`, `OVERDUE`), leave codes (`AL`, `UAL`, `SL`, `USL`, `PL`, `ML`, `CL`, `EL`, `LWP`, `TOIL`, `VTO`), role codes, and priority/type values are the same registries the web surface uses (see `SYSTEM_ARCHITECTURE.md` §7, §13) — so a ticket shown in a chat is the same object the matrix shows.

---

## 8. Authorization Architecture

Authorization on this channel is enforced in **two independent layers**, mirroring the system's model (§8 of the system document) with the bot's own first layer:

- **Layer 1 — Identity Gate.** The auth guard resolves the Telegram identity (`ctx.from.id` — the identity Telegram itself authenticates) to a linked, *active* MES user. No link, a revoked link, or a deactivated account all behave identically: the chat is refused with the login instructions and nothing executes.
- **Layer 2 — Role & Scope Authorization.** Once resolved, every command evaluates the **same** `authorize()` table, with the same viewer, that the GraphQL resolvers evaluate — so grants, department scope, and refusals are the API's answers, not the bot's opinion.

| Surface | Gate | Effect when refused |
| --- | --- | --- |
| `/ask`, `/model`, `/dashboard`, `/profile` | Linked viewer | The guard's login prompt (counts inside the dashboard additionally omit unreadable rows). |
| `/notifications` | `notifications` (management roles) | "⛔ You do not have access to the notification log." |
| `/lookup` → `/tickets` | `tasks` | "⛔ You do not have access to tickets." |
| `/lookup` → `/projects` | `projects` | "⛔ You do not have access to projects." |
| `/newticket` | role pre-check (Department Head, HR Manager, Super Admin, Tech Lead), then `createTask` | Refused before any detail is requested. |
| `/audit` | `auditLogs` | "⛔ You do not have access to the audit log." |
| `/status` | `appSettings` (technical roles) | "⛔ Server status is limited to technical roles." |

**Notable asymmetries** the architecture preserves: a viewer without the notifications gate sees an em-dash where the count would be rather than an error; `/ask` is the only surface that can answer cross-module questions, and it is strictly read-only; and no bot command widens scope beyond what the same viewer sees on the web.

---

## 9. Core Engines & Services

These services live in the bot module and are consumed by the command surfaces.

### 9.1 Start Supervisor (`bot.ts`)

Owns the bot's life. Telegram permits a single polling instance, and a watch-mode restart overlaps one `getUpdates` window: the new instance's start is rejected with a `409: Conflict`. Treating that as fatal leaves the running service with **no bot at all** — every command silently unanswered. The supervisor therefore:

- retries a conflicting start on a **bounded backoff** (~1s doubling to 30s, ≤ 7 attempts, ~60s ceiling);
- constructs a **fresh `Bot` per attempt** — a failed grammY instance cannot be restarted (`pollingRunning` stays set and `this.use` is already closed);
- treats **any other start failure as terminal** (a bad token is not repaired by waiting), logging it and leaving the API untouched;
- returns the handle **immediately** rather than awaiting `bot.start()`, which only resolves when polling *ends* — which is also what finally makes the service's `beforeExit` stop wiring reachable;
- re-points the push sender at each attempt's instance before it starts, so deliveries continue through the retry window (a not-yet-polling instance can still send).

### 9.2 Settings Resolution Ladder (`settings.ts`)

Every bot setting answers through one module with one documented precedence:

**per-user preference → website setting → environment variable → built-in default**

The environment bootstraps a fresh deployment (`TELEGRAM_*` variables, documented in `.env.example`), the website row overrides it, and a per-user choice (the AI model) overrides the global value for that user alone. The enable flag is the OR of the two switches — either side can turn the bot on, and only the side that enabled it can turn it off again.

### 9.3 Link Authentication (`guard.ts`, `settings.ts`)

Consumes a single-use, time-limited code (preferred) or verifies the same password as the web login (fallback). Every failure — unknown, expired, consumed, wrong password — produces the same generic reply, so neither codes nor accounts can be probed. Revocation from the website and account deactivation behave exactly like no link at all.

### 9.4 Read-Only Agent (`ai/agent.ts`, `ai/tools.ts`, `ai/budget.ts`)

A `ToolLoopAgent` over the configured OpenAI-compatible endpoint. Its construction is deliberately narrow: a **fixed tool set** built from the same domain query functions, each executing as the linked viewer so authorization is re-checked per call; a system prompt that treats tool output as data rather than instructions; **per-user quota** (30-day window, `TELEGRAM_AI_MONTHLY_QUOTA`, default 100) enforced *before* the network call; and graceful degradation — an unconfigured or unreachable endpoint yields a plain "unavailable" message, never a crash and never a fabricated answer.

### 9.5 Model Catalog (`ai/catalog.ts`)

Fetches the endpoint's model list, caches it (`telegram_ai_models`), and reports staleness past its max age. A failed refresh keeps the last known catalog — a user is never left without options because the endpoint blinked — and a model switch must come from the catalog, except when no catalog could be fetched at all, where refusing would lock the bot out while the endpoint is down.

### 9.6 Push Delivery (`sender.ts`)

Registers the live bot as one more delivery channel for the existing notification engine, beside the webhook path, through the same failure-isolated contract: a delivery failure marks the record failed and never rolls back the triggering change.

### 9.7 Rendering (`render.ts`)

Pure assembly of Telegram's small HTML subset: escaped values, monospace tables, the role-aware command menu, the dashboard/profile/welcome/logout blocks, and clipping to Telegram's per-message limit. No I/O and no state, which is what makes message content unit-testable without a bot.

---

## 10. Cross-Cutting Concerns & Non-Functional Notes

- **Auditability.** Every action taken through the bot lands in the same append-only audit store as the web surface, attributed with the `telegram-bot` user-agent tag, so the Audit Log's per-module views show bot-originated rows identically.
- **Secret handling.** Tokens and API keys are resolved in one module, masked everywhere but the settings editor, and never written to messages, logs, or audit records.
- **Failure isolation.** A throwing handler is caught by the bot's error boundary: the user gets a plain "something went wrong" reply and the polling loop continues. An unreachable chat fails silently — nothing more can be done.
- **Budget.** AI spend is bounded per user over a rolling 30-day window and checked before the call, so neither abuse nor a runaway loop can spend unbounded money.
- **Message limits.** Replies are clipped to Telegram's 4096-character limit with a visible truncation marker.
- **Run state.** The only in-memory bot state is the `/newticket` draft map (keyed by chat). It is deliberately ephemeral — a restart abandons drafts, and nothing partial is ever written; the flow's `/cancel` leaves no trace.
- **Restart behavior.** A backend restart re-resolves settings from scratch, so a website configuration change takes effect on the next boot without code changes.

---

## 11. Integration Points

The bot has two external integration points, and both are configured, never hard-coded:

- **Telegram Bot API.** Long polling (`getUpdates`) for inbound updates and `sendMessage` for replies. No public URL, no tunnel, no webhook registration — the integration works from localhost.
- **OpenAI-compatible AI endpoint.** The base URL and key resolve through the precedence ladder (§9.2); the endpoint supplies both the chat completions the agent uses and the model catalog fetched by `/model refresh`.

No other external integration is part of the bot's architecture. Mail, Sentry, and storage remain system-level concerns shared with the API.

---

## 12. Extensibility — Adding a Command

Because the surface is registered as middleware rings, a new command is additive rather than invasive:

1. **One file per feature** under `backend/src/telegram/commands/`, exporting a `register*Commands(composer, deps)` function — the established layout every existing surface follows.
2. **Register it behind the guard** in `configureBot`, so the linked viewer is guaranteed present.
3. **Reuse, never re-implement.** Read through an existing domain function and gate it with the same `authorize()` call the GraphQL resolver uses; a new authorization rule belongs in that shared table, not in the bot.
4. **Render through `render.ts`** so message content stays pure and unit-testable; keep secrets out of every string.
5. **Test with the captured registrar** — the established test pattern stands a fake composer in for grammY and binds real domain functions against a temporary database, covering both the gate and the read path.

Two changes are deliberately *not* cheap, and should be treated as their own proposals: **widening the agent's tool set** (every tool is an authorization-gated read the agent can be steered toward) and **adding a write command** (the `/newticket` flow is the only write today, and its domain-path + audit-record contract is what any second write must replicate).

---

## 13. Glossary

**Commands.** `/start` · `/help` · `/link` · `/login` · `/logout` · `/dashboard` · `/profile` · `/notifications` · `/lookup` (+ `/tickets`, `/projects`) · `/newticket` · `/audit` · `/status` · `/ask` · `/model`.

**Flow tokens.** `/cancel` and `/skip` inside the `/newticket` draft; `LINK-XXXX` link-code format (Crockford-style alphabet — no I/L/O/0/1 ambiguity).

**Roles.** `SUPER_ADMIN`, `TECH_LEAD`, `HR_MANAGER`, `DEPT_HEAD`, `EMPLOYEE`.

**Ticket states** (reused verbatim): `REQ`, `ACT`, `PEN`, `APP`, `REJ`, `CAN`, `OVERDUE`. **Leave codes** (reused verbatim): `AL`, `UAL`, `SL`, `USL`, `PL`, `ML`, `CL`, `EL`, `LWP`, `TOIL`, `VTO`.

**Bot terms.** *Linked viewer* — the MES user a Telegram identity is linked to. *Guard* — the middleware performing the identity resolution. *Link code* — single-use, hashed, expiry-enforced login credential. *Push alert* — a notification delivered to a linked chat by the notification engine. *`telegram-bot`* — the audit user-agent tag for bot-originated rows.

Definitions of the shared codes are in `SYSTEM_ARCHITECTURE.md` §7 and §13; the bot's own requirements are in [`openspec/specs/core/telegram-bot/spec.md`](./openspec/specs/core/telegram-bot/spec.md).

---

## Traceability

Each section derives from the bot's OpenSpec artifacts:

| This document | Source |
| --- | --- |
| 1. Purpose & Scope | This document's scope relative to `SYSTEM_ARCHITECTURE.md` §9.2 (webhook engine) |
| 2. System Overview & Context | Spec: *Authenticate Telegram users before any bot use*, *Configure the bot from environment and website*; design: bot bootstrap |
| 3. Architectural Principles | Spec preamble across all requirements; design: Decisions 1–3 |
| 4. Logical Architecture | `backend/src/telegram/bot.ts` middleware order; design: the four mounted surfaces |
| 5. Layered View | `bot.ts`, `guard.ts`, `commands/*`, `domain/*` dependency direction |
| 6. Module Catalog | One file per feature under `commands/`; design: Decisions 4–6 |
| 7. Data Model | `telegram_*` tables in `backend/src/db/schema.ts`; spec: secret masking, per-user preference |
| 8. Authorization | Spec: authentication requirement + per-surface gates; design: same `authorize()` table |
| 9. Core Engines & Services | Spec: configuration, catalog, agent, notifications, status requirements; design: Decisions 1–3 |
| 10. Cross-Cutting Concerns | Spec: masking/audit/budget/failure-isolation scenarios; `sender.ts` delivery contract |
| 11. Integration Points | Spec: OpenAI-compatible endpoint; `bot.ts` long polling |
| 12. Extensibility | Design: one file per feature; the tool set and write-command boundaries |
| 13. Glossary | `AGENTS.md` domain vocabulary; command registry in `commands/` |
