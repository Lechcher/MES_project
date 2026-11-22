# Design

## Context

See proposal.md - Why. The workspace renders four states (`loading`,
`loadFailed`, `linking`, `accounts`) and picks the account to open with a
`find((entry) => !entry.needsRelink)` that returns `null` when nothing
restores. The controller already implements the right mount for a dead
account — `selectAccount` allocates a fresh linking slot for a `needsRelink`
entry — but nothing ever calls it in that case, so the module shows neither
the re-link hint (it hangs off the active entry) nor a frame (`iframeSlot`
stays `null`). The previous linking change pinned this gap in its
Non-Goals; this change closes it.

## Goals / Non-Goals

**Goals:**

- A viewer whose only account no longer restores gets the same re-link
  surface a mixed-list viewer gets: the embedded client mounted at a linking
  slot (its own login on show) with the re-link hint above the frame.
- No behavior change for the other states: zero accounts still mounts the
  linking view on open, mixed lists still open a live account first, a failed
  load still offers its retry.
- The default-selection rule is pinned by a unit test without mounting a DOM.

**Non-Goals:**

- The embedded client's own account switcher (unchanged; MES implements no
  switcher of its own).
- A bulk "re-link everything" surface: the first dead account opens; the
  client's switcher reaches the rest, exactly as with live accounts.
- Remove-then-link flows: removing the last account already lands in the
  zero-account linking view.
- Backend or contract changes: the re-link upserts the existing record
  (verified — `linkTelegramAccount` conflicts on viewer + Telegram identity
  and carries the slot into the refresh), so no resolver, schema, or message
  change is needed.
- The controller's contracts (`startLinking`, the reserved linking-slot
  range, `stop`'s transient-slot cleanup) stay untouched.

## Decisions

**Fix the workspace's default selection, not the controller's load.**
`start()` is the load/restore path: it patches the account list and selects a
restorable account when one exists. The workspace's effect is the
"open by default" policy — it also re-runs after a removal empties the active
selection — so the fallback belongs there, where the zero-account linking
effect already lives. Alternative considered: make `start()` fall back to
`accounts[0]`; rejected because the load path should not decide what the
module mounts, and the workspace effect would have to guard against a second
selection anyway.

**Open the dead account at a linking slot, not its stable slot.** The stable
slot holds no session material for a dead account, so mounting there would
hand the client an empty slot. `selectAccount` already allocates a fresh
linking slot for a `needsRelink` entry — the same surface the zero-account
path uses — and the capture path (`captureSession` → `linkTelegramAccount`)
refreshes that identity's row in place and keeps its slot, so the entry flips
to connected without a second record. The alternative (a module-owned
"re-link" panel) was rejected with the previous change: the client's own
login is the linking surface, and MES mounts it.

**Extract `defaultAccountId` as a pure exported helper.** The workspace's
selection rule is the change's whole substance, and the repo's unit tests
mount no DOM (see `provider.test.ts` and the sibling pure helpers), so the
rule is pinned directly, next to the existing `workspaceView` export. The
render test keeps pinning the visible outcome — hint plus frame — performing
the selection the way the effect would, as the zero-account test already
does with `startLinking()`.

**Selection order: first restorable, else first account.** A mixed list keeps
opening a live account (no regression, no re-link hint for it), and only the
all-dead case changes — the first account opens with the hint.

## Risks / Trade-offs

- A viewer with several dead accounts now sees the first one opened instead
  of an empty box: strictly better, and the client's switcher reaches the
  others.
- An abandoned login at the linking slot records nothing (same guard as the
  zero-account path), and `stop()` clears the transient slot on leave, so a
  half-finished re-link leaves no residue.
- The hint's wording is unchanged; a viewer who had learned to ignore a dead
  account in a mixed list now sees it can re-link it directly.