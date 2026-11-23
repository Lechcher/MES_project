# Proposal

## Why

A viewer with no linked Telegram account — a fresh account such as
`employee@mes.local` — can never link their first one. The module's empty
state offers a "Link your first account" button, but its handler
(`startLinking()`) only sets `iframeSlot` in the controller: the workspace's
empty branch (`state.accounts.length === 0`) returns before `<ClientFrame>`
is ever rendered, so the embedded telegram-tt client never mounts and its own
login screen is unreachable. Viewers that already have at least one linked
account are unaffected — their module renders the frame at the account's
stable slot — which is why the defect only surfaces when switching to an
account that has never linked. The button is a leftover affordance from the
pre-pivot design (that design's own commit message: "No switcher rail, no
MES login wizard"): with the embedded client, linking happens inside
telegram-tt and MES only mounts the client and captures what it writes.

## What Changes

- When a signed-in viewer has no linked Telegram accounts, the module mounts
  the embedded client at a linking slot on open — telegram-tt's native
  login/start screen is the linking surface, with no MES-side click required.
- Remove the empty-state "Link your first account" button affordance and the
  now-unused `telegram.workspace.emptyTitle`, `emptyDescription`, and
  `addFirst` message keys in both locales; the mounted frame carries a short
  hint instead.
- Scope the session capture bridge to the current module session: a blob that
  already sat in the browser's storage before the module opened (an earlier
  MES viewer's linked account in a shared browser, for example) is no longer
  absorbed into the signed-in viewer's account list. The bridge still
  captures every slot the client writes or rotates while the module is open —
  a fresh login at the linking slot, an account added through the client's
  own switcher, a rotated session.
- Keep unchanged: the encrypted-at-rest backup, the stable-slot restore on
  module open, the re-link path for accounts whose stored session no longer
  restores, the abandoned-login guard (blobs without session material are not
  linkable), and the per-viewer account list.
- Add tests pinning the two behaviors whose gaps let this ship: the
  workspace's render path (zero accounts still mounts the client frame — the
  controller's `startLinking` was unit-tested, the workspace's render was
  not) and the watcher's session boundary (pre-session blobs are not
  captured, in-session writes are).

## Capabilities

### New Capabilities

(None.)

### Modified Capabilities

- `core/telegram-web-client`: the "Link a Telegram account inside the embedded
  client" requirement gains the explicit behavior that a viewer with no linked
  accounts is offered the embedded client's own login on module open (mounted
  at a linking slot), instead of a module-owned linking affordance.

## Impact

- `frontend/src/components/telegram/telegram-workspace.tsx` — the empty-state
  branch stops returning early; the client frame renders at a linking slot
  with a hint, and linking starts when the module opens with zero accounts.
- `frontend/src/lib/telegram/session-bridge.ts` — the slot watcher seeds its
  seen-state from storage at start, so only writes and changes made during
  the module session are reported for backup.
- `frontend/messages/en.json`, `frontend/messages/vi.json` — remove
  `telegram.workspace.emptyTitle` / `emptyDescription` / `addFirst`; add the
  replacement hint key(s) in both locales.
- `frontend/src/components/telegram/telegram-workspace.test.tsx` (new) —
  render test: with zero accounts the client frame mounts; with accounts the
  existing behavior (stable slot, re-link hint) is unchanged.
- `frontend/src/lib/telegram/session-bridge.test.ts` — the watcher gains a
  session-boundary test; its existing scenarios keep their contracts.
- No backend, GraphQL, schema, or configuration change. The controller
  (`startLinking`, reserved linking-slot range) keeps its contract.