# Proposal

## Why

A viewer whose only linked Telegram account no longer restores — a revoked
session, a passcode lock, or a pre-slot row that never completed its first
link — opens the module and gets an empty box: no re-link hint and no mounted
client. Both `TelegramController.start()` and the workspace's auto-select skip
accounts that need a re-link, so nothing is ever selected: `activeAccountId`
stays `null`, the re-link hint (which hangs off the active entry) never
renders, and `iframeSlot` stays `null`, so the client frame mounts nothing.
The previous linking fix pinned this as an "adjacent gap" in its
`design.md` Non-Goals and its render test; the spec it left behind ("One dead
account does not block the others") already promises the dead account a
re-link affordance — it just never holds when no live account exists beside
it. Mixed lists are unaffected and must stay that way.

## What Changes

- When no linked account restores, the workspace now opens the first account
  anyway: the controller's `selectAccount` already handles it by mounting the
  embedded client at a fresh linking slot, and the entry's re-link hint shows
  above the frame. The viewer gets the same re-link surface a mixed-list
  viewer gets — the client's own login.
- The default-selection rule moves into a pure exported helper
  (`defaultAccountId`, beside `workspaceView`): first restorable account,
  else the first account. The rule becomes unit-testable without a DOM.
- The render test that pinned the gap now pins the fixed behavior: a lone
  dead account shows the hint and the client at a linking slot; new unit
  tests pin the selection rule, including that a mixed list still opens a
  live account.
- Keep unchanged: the zero-account path (client mounted at a linking slot on
  open), the load-failure state, the encrypted-at-rest backup, the stable-slot
  restore, the session-boundary capture, and all controller contracts
  (`startLinking`, the reserved linking-slot range, `stop`).
- No backend, GraphQL, schema, or message-key change: the re-link upserts the
  same record (`linkTelegramAccount` conflicts on viewer + Telegram identity
  and carries the slot), and `telegram.workspace.relinkHint` already exists
  in both locales.

## Capabilities

### New Capabilities

(None.)

### Modified Capabilities

- `core/telegram-web-client`: the "Restore linked accounts automatically on
  module open" requirement gains the explicit behavior that an account which
  no longer restores is offered its re-link — the client mounted at a linking
  slot with the re-link hint — whether or not other accounts still connect,
  and that completing that login refreshes the same record in place.

## Impact

- `frontend/src/components/telegram/telegram-workspace.tsx` — the auto-select
  gains the fallback through the extracted `defaultAccountId`; the re-link
  hint and client frame now render for a viewer whose only account is dead.
- `frontend/src/components/telegram/telegram-workspace.test.tsx` — the
  adjacent-gap test becomes a fixed-behavior test; adds `defaultAccountId`
  unit tests (empty list, lone dead, mixed, all-live).
- `frontend/tests/global-setup.ts` — repair the pre-existing TS7006 (the
  `config` parameter of `globalSetup` lacks its type annotation, carried in
  from an earlier uncommitted port); one-line fix so `tsc --noEmit` is clean.
- No other file changes: no messages, no backend, no schema.