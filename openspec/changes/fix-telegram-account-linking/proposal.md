# Proposal

> **SUPERSEDED** wholesale by
> [`replace-telegram-client-with-embedded-web`](../replace-telegram-client-with-embedded-web/proposal.md):
> every defect this change fixed lived in the hand-built GramJS browser
> client, which the new change removes in favour of the embedded Telegram
> Web client (telegram-tt). The new change inherits none of the defects —
> session construction, base64url token encoding, canvas timing, the QR/2FA
> refusal and the `AUTH_USER_CANCEL` masking all disappear with the code
> they were in — and its live smoke drill replaces this change's.

## Why

The multi-account Telegram module's browser client is constructed with a raw
session string, but GramJS v2 does not accept one: its constructor wraps only
a **non-empty** string into a `StoreSession` — which treats the string as a
localStorage *area name*, not as an auth key — and an empty string (the
linking flow's fresh client) is falsy and never wrapped, so the constructor
throws `Only StringSession and StoreSessions are supported currently :(`.
Both symptoms the live smoke test hit — the phone+OTP flow failing immediately
and the QR flow failing with that exact error — have this one root cause. The
same construction error also breaks session *restore*: a stored session string
reconnects as an empty session, so a relinked account would come back
unauthenticated even if linking had succeeded.

## What Changes

- Construct every GramJS client from an explicit `new StringSession(...)`
  (`telegram/sessions`): the restore path wraps the viewer's stored session
  string, the linking path starts from an empty one. After a successful login
  (phone or QR), `session.save()` then carries the new auth key back as the
  string the module persists — this is the only session format the module
  stores, and it is now the only one it constructs.
- Surface the QR + 2FA refusal in the viewer's language. A QR login that
  reaches the cloud-password step currently throws a raw English error string
  (`2FA_PASSWORD_REQUIRED`); the module already carries a localized message
  for exactly this case and will show it, so a 2FA account scans the phone
  flow instead of an untranslated failure.
- Pin the construction rule in unit tests: the session handed to a restore
  client is a `StringSession` that round-trips the stored string, and a fresh
  linking client starts from an empty `StringSession`.

Explicitly out of scope: the session *storage* format (already AES-256-GCM
ciphertext per the parent change), the backend operations (verified live this
session: list/link/remove all reach the `telegram_accounts` table), and the
server-side bot (untouched).

## Capabilities

### New Capabilities

None — this is a defect fix in the browser client construction and a
localization fix, on the capability the in-flight
`add-telegram-multi-account-client` change defines.

### Modified Capabilities

- `core/telegram-multi-account`: the capability exists today only as a spec
  **delta** inside the unarchived `add-telegram-multi-account-client` change.
  This change adds one requirement — a QR login that needs a cloud password is
  refused with an actionable message, not a raw error — and adds no other
  requirement; the parent's linking and restore requirements are unchanged and
  are what this fix makes true. **Archive order:** `add-telegram-multi-account-client`
  first, then this change, so the delta lands on a capability that exists.

## Impact

- **Code**: `frontend/src/lib/telegram/gramjs.ts` (restore factory builds from
  a `StringSession`; a fresh linking session is exported from the same module
  so both paths share one construction rule) and
  `frontend/src/components/telegram/add-account-dialog.tsx` (uses the shared
  session; maps the QR-2FA refusal to the existing localized message).
- **Tests**: new unit tests for the session construction (restore round-trip,
  fresh linking session, missing-session refusal); the existing linking-flow
  and controller suites keep their injected fake clients, which already
  satisfied the structural interface.
- **Verification**: the documented manual drill (`docs/DEVELOPMENT.md` §15)
  is the acceptance gate — link by phone, link by QR, reload restores without
  prompts, send a message, remove — run against the deployment's own
  credentials; this time the reload step is the one that catches the restore
  half of the bug.
- **Unaffected**: backend, schema, migrations, GraphQL operations, i18n
  catalogues, docs other than the smoke-test record.