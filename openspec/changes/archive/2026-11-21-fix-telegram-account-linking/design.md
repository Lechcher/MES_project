# Design

See `proposal.md` for the symptom and root cause. This document records the
single construction rule that fixes it, and why the obvious alternative was
rejected.

## Context

Facts established against the installed package (`frontend/node_modules/telegram`
2.26.22) and reproduced live on the running stack (frontend 3002 → backend
3003 → local Postgres) before proposing:

- `TelegramBaseClient`'s constructor (client/telegramBaseClient.js) wraps a
  *session argument* only when `session && typeof session == "string"` — an
  empty string is falsy, stays a raw string, and fails the
  `session instanceof Session` check that follows, throwing
  `Only StringSession and StoreSessions are supported currently :(`. That is
  the error the QR tab showed, and it is why the phone flow died before
  sending any code: both flows build their client the same way.
- A *non-empty* string is wrapped into `StoreSession(sessionName)`, which
  treats the string as a **localStorage area name** (`store2.area(name,
  localStorage)`), not as an encoded auth key. So even had linking worked,
  the restore path (`new TelegramClient(sessionString, …)`) would have
  reconnected with an empty session — an account that looks connected but is
  unauthenticated.
- `StringSession` (`telegram/sessions`) is the type that actually decodes a
  stored string on construction and re-encodes it on `save()`; the auth
  callbacks (`_authKeyCallback`, and the post-connect `setAuthKey` +
  `session.save()` in `client/TelegramClient.js`) write through it. So
  `session.save()` after a phone or QR login is the source of the string the
  module persists.

## Goals / Non-Goals

**Goals:**

- One construction rule for every GramJS client the module builds, expressed
  once in `frontend/src/lib/telegram/gramjs.ts`: restore from a
  `StringSession(storedString)`, link from `new StringSession("")`.
- A QR + 2FA refusal the viewer can act on, in their language.

**Non-Goals:**

- Changing what is stored (still the AES-256-GCM ciphertext of the
  `StringSession.save()` output), the backend, or the fake-client seams the
  existing unit suites use.
- Supporting 2FA *inside* the QR flow (collecting a password mid-scan has no
  UI step in the scanner modal — the phone flow asks for it explicitly).

## Decisions

### 1. Explicit `StringSession` at every construction site
Both sites build the client through `gramjs.ts`: the restore factory wraps the
account's stored string; the linking flow gets a fresh empty session from the
same module (`linkingSession()`), so the dialog no longer constructs a client
itself. `StringSession` is imported from `telegram/sessions` — the deep path
already in the browser bundle graph.

- *Alternative considered:* passing the raw string and letting GramJS wrap it
  — rejected: it silently produces a `StoreSession` keyed to a bogus
  localStorage area (the restore bug), and rejects the empty string outright
  (the linking bug). *Alternative considered:* `new StoreSession("mes")` —
  rejected: it persists sessions to localStorage under a shared name, which
  both loses per-account isolation and leaks session material outside the
  module's encrypted storage.

### 2. QR + 2FA refusal maps to the existing localized message
`AccountLinkFlow.startQrCodeLogin`'s password callback keeps throwing a
sentinel; the dialog maps that sentinel to the `telegram.link.twoFaDuringQr`
message already present in both catalogues instead of showing the raw string.
The sentinel stays internal to the flow (its unit test keeps asserting it),
so the user-visible surface is localized.

### 3. The QR token is base64url-encoded manually, and drawn after mount
Implementation-revealed during the live drill, both QR-specific:

- The browser's `buffer` polyfill (v6) has no `base64url` encoding — calling
  `token.toString("base64url")` (the form GramJS's own docs show, which works
  on Node) throws `Unknown encoding: base64url`. The flow therefore encodes
  base64 and translates the alphabet (`+`→`-`, `/`→`_`, padding stripped),
  which is what the `tg://login?token=` deep link expects.
- The token callback fires before the `<canvas>` mounts (the canvas renders
  only after the token state is set), so drawing inside the callback finds no
  canvas. The draw moves to an effect keyed on the token, which runs after
  mount.

### 4. The 2FA check is driven step by step, not through `signInWithPassword`
Implementation-revealed during the live drill — the cloud-password step failed
with `AUTH_USER_CANCEL` even for a correct password. GramJS's
`signInWithPassword` wraps the check in a retry loop whose `onError` decision
offers only "stop" (raises `AUTH_USER_CANCEL`) or "continue" (retries the same
callback value forever) — so *any* failure inside, including a mistyped
password, surfaces as an abandoned flow. The flow therefore drives the three
MTProto steps itself (`Api.account.GetPassword`, `computeCheck` from
`telegram/password`, `Api.auth.CheckPassword`), which raises the real error:
`PASSWORD_HASH_INVALID` for a wrong password, mapped by `isWrongCloudPassword`
to a localized retry message with the wizard staying on the password step.
The step function is injected through the flow's options so tests drive all
three steps without a live account.

## Risks / Trade-offs

- **Session format is now load-bearing** — a session string produced by any
  other construction path (a server-side GramJS run, a future export) must be
  the `StringSession.save()` encoding. → The restore round-trip unit test
  pins it: `restoreSession(account).save()` returns the stored string.
- **QR + 2FA is a refusal, not a flow** — a viewer whose account has 2FA
  cannot complete QR; the phone flow (which asks for the password) is the
  documented route. → Surfaced as a localized message + a smoke-test step.
- **The fix is invisible to the unit suites' fakes** — the fakes satisfied
  the structural interface all along. → The new unit test targets the real
  construction, and the manual drill (reload-restore in particular) is the
  behavioral gate.

## Migration Plan

None. No stored data changes: no account was ever successfully linked (both
flows failed at construction), and the restore format matches what the
unchanged backend stores.

## Open Questions

None. The one behavioral question — what QR + 2FA should do — is answered by
the new requirement (refuse with an actionable message), and the sending/
restore halves are pinned by the drill.