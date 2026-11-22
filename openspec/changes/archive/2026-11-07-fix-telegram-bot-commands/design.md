# Design

## Context

The bot's start path is a single terminal attempt: `startTelegramBot` awaits
`bot.start()`, and a rejected start — including the `409: Conflict` Telegram
returns when another `getUpdates` still holds the update window during a
`--watch` restart overlap — is caught, logged, and converted to `null` with no
retry. The running process then has no bot at all, so every command behind the
guard is silent. Verified live: the backend held zero TCP connections across a
5s sample, while a polling bot holds one continuously.

Two further constraints shape the fix (both verified against the installed
`grammy@^1.46.0`):

- On a setup-phase throw, `Bot.start()` resets `pollingRunning`; on a
  `getUpdates` loop failure it does **not** — the flag stays `true`, so a
  second `start()` on the same instance returns at the
  `if (this.pollingRunning)` guard without polling. Restarting polling on the
  same instance is therefore not reliably possible.
- `super()` in `start()` also sets `this.use = noUseFunction` once polling
  really starts, so middleware mounted afterwards would be refused.

`GrammyError` carries a stable `error_code` (constructor:
`new GrammyError(message, { error_code, description }, method, payload)`),
which makes conflict detection exact and unit-testable.

On the feature side, the command surface is mounted in `bot.ts` as four
layers — pre-login commands, the auth guard, feature commands, then the AI
commands — with one draft-continuation text handler. `render.ts` holds pure
renderers and currently owns two dead ones (`renderHelp`, `pageFooter`).

## Goals / Non-Goals

**Goals:**

- The bot keeps polling through restart-overlap conflicts; a genuinely
  unrecoverable start is still reported once and never disrupts the API.
- A dashboard that answers "who am I and what can I do" after login and on
  demand, built only from domain functions the viewer is already authorized
  for.
- A first-contact experience for `/ask` (welcome when bare) and self-service
  identity commands (`/profile`, `/logout` confirmation, signed-in `/help`).

**Non-Goals:**

- No inline keyboards or pagination UX change (`pageFooter` stays unused — the
  dashboard shows counts, not rows).
- No new authorization surface: every read goes through the existing
  `authorize()` table, and a refused read is omitted from the dashboard, not
  shown as an error.
- No GraphQL/SDL, migration, frontend, or dependency changes.
- No changes to the AI agent, budget, or catalog internals.

## Decisions

### 1. Retry with a fresh `Bot` instance per attempt

A rejected start is retried by constructing a **new** `Bot`, configuring it via
the existing `configureBot`, and starting that. Rationale: the same instance
cannot be reliably restarted (stuck `pollingRunning` plus `noUseFunction`), and
hand-building a reset would depend on grammY internals.

- Retry schedule: short bounded backoff (first attempt immediate, then
  ~1s, 2s, 4s, 8s, capped at 30s, at most 8 attempts, ~60s ceiling).
- Only `409` conflicts are retried. Any other rejection is terminal and keeps
  today's behavior (log + return `null`) — a bad token or a malformed reply is
  not something a retry repairs.
- Alternatives considered: (a) call `bot.stop()` then re-`start()` — rejected,
  unreliable for the loop-phase failure; (b) ignore the failure and re-`start`
  on a timer from `index.ts` — rejected, it moves lifecycle knowledge into the
  service bootstrap and leaves `startTelegramBot` lying about its return.

### 2. `startTelegramBot` returns immediately; polling is supervised

`bot.start()` only resolves when polling ends, so the current
`await bot.start()` never returns while the bot is healthy — the handle, and
the `process.once("beforeExit", bot.stop)` wiring in `index.ts`, are
effectively unreachable today.

The new shape: construct and configure the first candidate, start polling
without awaiting the polling promise, and return the handle right away. The
supervisor owns the retry sequence, and the handle's `stop()` ends the live
attempt (and prevents a further retry from being spawned).

- Per attempt: set the notification sender to that attempt's API **before**
  starting — a non-polling `Bot` instance can still send messages, so push
  delivery keeps working during the retry window.
- On final failure: clear the sender, log, return `null` — same terminal
  contract as today.
- Rejected alternative: awaiting a supervisor that resolves only when the bot
  dies — it would keep today's unreachable handle.

### 3. Conflict detection is exact, not string matching

`isTelegramConflict(error)` → `error instanceof GrammyError && error.error_code === 409`.
The 409 code is also what marks a restart overlap rather than a permanent
misconfiguration, so this keeps the terminal failure path honest.

### 4. The bot's own renderer gains four pure functions; the dashboard reuses the help menu

`render.ts` stays pure and unit-testable: `renderDashboard` (identity block +
command menu + counts), `renderProfile`, `renderAskWelcome`,
`renderLogoutConfirmation`. The existing dead `renderHelp` becomes the signed-in
menu behind a `renderCommandMenu(roleCodes)` helper — the dashboard composes
the same menu, so the list of commands each role unlocks has one definition.

The `/dashboard` and `/profile` commands live behind the guard in
`commands/`; a small `showDashboard(ctx)` helper renders the summary from the
guard-provided `ctx.viewerContext`, so the post-login path (`/link`, `/login`
success in `login.ts`) and `/dashboard` share one code path.

### 5. The dashboard reads only what the viewer is already authorized to see

Counts come from the same domain functions with the same scope:

- open tickets assigned to the viewer: `authorize(ctx, "tasks")` then
  `listTasks(ctx, scope, { filter: { assignedToId, state: { $ne: ... } } })`
  — or the domain's equivalent non-terminal-state filter, whichever the
  function already supports; no new filter is added to the domain.
- notification total: `authorize(ctx, "notifications")` then
  `listNotifications`'s `totalCount`.
- An `authorize` refusal omits that row from the dashboard (never an error).

Every count is wrapped so a thrown domain error degrades that row to "—"
instead of failing the whole command.

### 6. One new command file per feature, matching the existing layout

`commands/dashboard.ts` and `commands/profile.ts` follow the existing
`features.ts` structure (registrar function + handler), registered in
`bot.ts` behind the guard alongside the feature surface. `/ask`'s welcome is a
branch inside the existing empty-question path in `ask.ts`; `/logout`'s
confirmation is a renderer swap in `login.ts`; `/help` swaps
`renderLoginPrompt` for the signed-in menu when a viewer resolves.

## Risks / Trade-offs

- [Retry masks a genuinely dead token for up to ~60s] → non-409 failures stay
  terminal; the schedule is bounded; each retry is logged distinctly.
- [`this.use = noUseFunction` on a successful attempt] → never reuse an
  instance that has polled; the retry path only constructs, never reuses.
- [Two supervisors if `startTelegramBot` is called twice] → unchanged service
  contract (called once at boot); no new invocation sites are introduced.
- [Dashboard reads cost queries on every render] → counts use `limit: 1` and
  the domain's existing `totalCount`; no per-row materialization.
- [The dev DB's admin password no longer matches the seed] → end-to-end
  verification rides on the link already present for the user's Telegram
  identity (verified live), not on password login.

## Migration Plan

No schema or API change; nothing to migrate. Deploy is a restart; the
`--watch` flow restarts automatically. Rollback is reverting the change — the
previous behavior (bot silent after a 409 restart) is what returns, and no
data is written elsewhere.

## Open Questions

None — the live diagnostic (no reply at all), the root cause, and every
counting/rendering decision are settled by the investigation above.
