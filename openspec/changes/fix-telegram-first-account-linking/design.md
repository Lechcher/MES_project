# Design

## Context

See proposal.md - Why. The defect has two links in one chain:

1. `frontend/src/components/telegram/telegram-workspace.tsx` — the
   `state.accounts.length === 0` branch returns before `<ClientFrame>` is
   rendered. `startLinking()` correctly sets `iframeSlot` (unit-tested in
   `telegram-controller.test.ts`), but with the account list still empty the
   render path never reaches the frame, so the button is inert.
2. `frontend/src/lib/telegram/session-bridge.ts` — `watchAllSessionSlots`
   seeds `lastSeen` as an empty map, so its first scan reports every
   `account<N>` key already in the origin's storage — including a previous
   MES viewer's linked-account blobs in a shared browser (nothing clears them
   on sign-out; `stop()` clears only the linking slot). Once the watcher is
   active (which the dead button does achieve), those blobs are upserted
   against the signed-in viewer, so even the first click under the current
   code absorbs another viewer's sessions instead of offering a login.

Constraints: telegram-tt is a vendored build — its `account<N>` blob scheme
and `?account=<slot>` mount param are fixed. The controller is deliberately
React-free. Messages are flat-keyed JSON in two locales with a parity test.

## Goals / Non-Goals

**Goals:**

- A viewer with no linked accounts reaches telegram-tt's own login on module
  open, with no module-owned affordance in the way.
- The capture bridge reports only session material written or rotated while
  the module is open (linking-slot login, client-switcher additions,
  rotation of restored slots) — never material that predates the session.
- Both behaviors pinned by tests at the layer where they were untested
  (workspace render, watcher session boundary).

**Non-Goals:**

- Any change to the vendored client, the backend, GraphQL, or configuration.
- Clearing foreign `account<N>` blobs on sign-out (storage hygiene — see
  Open Questions).
- Changes to the re-link path for accounts whose stored session no longer
  restores, or to the controller's public API.

## Decisions

**Fix the workspace's render path, not the controller.** `startLinking()`
already does the right thing; only the render is wrong. Making `start()`
allocate a linking slot when the list is empty was considered and rejected:
the controller is render-agnostic, and moving mount policy into it would
blur the restore/link split and churn its existing test expectations.

**Start linking from an effect, not during render.** When
`state.accounts.length === 0 && state.iframeSlot === null`, an effect calls
`controller.startLinking()`. Side-effect-free render stays render; the effect
re-fires after every mount (the linking slot is cleared on unmount by
`stop()`), so leaving and re-entering the module re-allocates. The empty
branch renders the hint plus `<ClientFrame>` at `state.iframeSlot` — the
frame already no-ops on a null slot, so no extra null handling is needed.

**Seed the watcher's seen-state from storage at start.** `lastSeen` is
initialized from `readAllSessionBlobs()` before the first scan. Writes and
rotations during the session still change a slot's blob and are reported; a
blob that merely predates the session is not. The alternative — clearing
non-owned `account<N>` keys on module open — was rejected as destructive
without benefit: hydration already re-writes the viewer's own slots on every
open, and the seeded watcher achieves the isolation without touching stored
state. One accepted cost: after the first capture the same blob is written
at the account's stable slot and reported once more — an idempotent re-link
(one extra audit row). Deduplicating that is a follow-up, not this change.

**Messages: remove three keys, add one.** `telegram.workspace.emptyTitle`,
`emptyDescription`, and `addFirst` go away in both locales, replaced by a
flat `linkHint` key. The locale-parity test enforces the pairing; edits are
made surgically so JSON formatting is preserved.

## Risks / Trade-offs

- [A fresh viewer now always mounts the client, even without intent to link]
  → the client's login screen is the module's entry for a viewer with no
  accounts, and nothing is recorded until a login completes (blobs without
  session material are not linkable).
- [Foreign session blobs still linger in origin storage after sign-out]
  → out of scope; sealing requires a sign-out cleanup hook — noted as a
  follow-up in Open Questions.
- [First link produces one idempotent re-link (extra audit row)] → accepted;
  the upsert keeps exactly one record per viewer and Telegram identity.
- [Seeding could miss a rotation between snapshot and first poll] → the
  snapshot is taken when the watcher mounts, before the frame mounts and
  before any in-session write, so a rotation during the session always
  changes the blob after the snapshot.

## Migration Plan

Frontend-only; no data migration and no persisted state to convert — the
stable slots, encrypted sessions, and linked records are untouched. Rollback
is reverting the three touched source files plus the two message files, which
restores the previous (broken but inert) state. Existing viewers' accounts
restore exactly as before; the watcher change affects only future captures.

## Open Questions

- Should signing out of MES clear `account<N>` blobs the viewer does not own
  from the browser (storage hygiene for shared machines)? Deferrable: it
  changes no spec-level behavior and can land as its own change.