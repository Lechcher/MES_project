# Proposal

## Why

Every command behind the authentication guard — `/ask`, `/notifications`,
`/newticket`, `/lookup`, `/audit`, `/status` — is silent: the bot itself dies
and never answers at all. The user is linked and the unit suites pass, but a
`--watch` restart of the backend overlaps one `getUpdates` window, the bot's
initial start throws a Telegram `409: Conflict`, and `startTelegramBot` treats
that failure as terminal — it logs and returns null, leaving the running
process with no bot and no retry. On a developer machine where every file save
restarts the backend, the bot is dead almost permanently.

While the guard was written for exactly five features, the surface also lacks
the basics a daily driver expects: no post-login overview, no way to check
which account the chat is signed in as, and a `/logout` that confirms itself
without telling the user what actually happened.

## What Changes

- Fix the root cause of the silent commands: the bot's start survives a
  restart-overlap conflict instead of giving up — retry with backoff (bounded),
  and only report failure when the restart loop itself cannot make progress.
- Add a **dashboard**: shown after a successful login and on `/dashboard`.
  It carries the viewer's identity summary (name, user code, department,
  roles), the commands the viewer's roles actually unlock, and a few personal
  counts (their open tickets, their newest notifications).
- Make `/ask` greet the user: invoked with no question, it answers with a
  welcome message (what the agent can do, that it is read-only, an example
  question) instead of a bare usage line.
- Add `/profile`: the viewer's own account summary — name, user code, email,
  department, roles, link info — so the chat can confirm which MES account it
  is signed in as.
- Make `/logout` self-explanatory: it revokes the link and confirms with a
  message that states the outcome (signed out, which account, what to do to
  come back).
- Put the existing `renderHelp` to work: `/help` for a signed-in user shows
  the signed-in surface instead of the login prompt (today the renderer exists
  but no live command calls it).

## Capabilities

### New Capabilities

None. Everything lands inside the existing bot capability.

### Modified Capabilities

- `core/telegram-bot`: the bot SHALL stay alive across restart conflicts
  (start resilience); the bot SHALL present a dashboard after login and on
  demand; `/ask` SHALL welcome the user when invoked bare; `/profile` SHALL
  report the linked account; `/logout` SHALL confirm the sign-out.

## Impact

- `backend/src/telegram/` — `bot.ts` (start retry/backoff), `commands/`
  (new `dashboard.ts`, `profile.ts`; `ask.ts` welcome; `login.ts` dashboard +
  logout message), `render.ts` (dashboard/welcome/profile renderers; the dead
  `renderHelp` becomes the signed-in `/help` and the dashboard's command menu).
- Tests: `backend/src/telegram/**` — start-retry behaviour, dashboard/profile
  rendering and counts, `/ask` welcome, logout confirmation, signed-in `/help`.
- No GraphQL/SDL change, no migration, no frontend change, no new dependency.
  Every command reuses the same domain functions and `authorize()` table the
  web surface uses — no new authorization surface is introduced.
