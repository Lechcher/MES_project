# Telegram Bot Architecture

> The full architecture document lives in the OpenSpec change:
> **[`openspec/changes/add-telegram-bot/design.md`](openspec/changes/add-telegram-bot/design.md)**
> (with [`proposal.md`](openspec/changes/add-telegram-bot/proposal.md) for why/what,
> [`specs/core/telegram-bot/spec.md`](openspec/changes/add-telegram-bot/specs/core/telegram-bot/spec.md)
> for the requirements, and [`tasks.md`](openspec/changes/add-telegram-bot/tasks.md)
> for the implementation order). This file is the pointer; the design is the
> source of truth so the two can never drift.

## Decisions (as of 2026-10-31)

| Question | Decision |
| --- | --- |
| How does the bot receive updates? | **Long polling** inside the existing backend process — no public URL, no tunnel, works on localhost. (Webhook mode was considered and deferred.) |
| Where does the code live? | **Inside the existing backend** (`backend/src/telegram/`), reusing the domain layer, `authorize()`, config, and Sentry. |
| How do users log in? | **One-time link code** generated on the website (preferred) **plus in-bot credentials fallback** (`/login`). Nothing works unauthenticated. |
| Which AI? | **OpenAI-compatible endpoint** via the Vercel AI SDK (`@ai-sdk/openai`), model catalog **auto-fetched** from the endpoint and **switchable per user** in the bot; default model from env *and* website settings. |
| Agent safety | **Read-only tool-call set only** — tools wrap the existing domain query functions with the linked viewer's `ViewerContext`; never plain-text SQL, never writes. |

## The five features

1. `/ask` — AI-agent information search across the system.
2. `/notifications` — newest notifications (job openings, status changes), optional push alerts.
3. `/newticket` — guided job-ticket creation, gated to Department Head, HR Manager, Super Admin, Tech Lead.
4. `/lookup` — Jobs & Projects, Planning & Attendance, Performance & Audit reads.
5. `/audit` + `/status` — audit log (existing authorization) and server health/recent errors.

## Config precedence

**per-user preference → website setting → environment variable → built-in default**
(env bootstraps, the website overrides, `.env.example` documents every variable).
