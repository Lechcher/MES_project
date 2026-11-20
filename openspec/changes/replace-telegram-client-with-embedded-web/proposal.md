# Proposal

## Why

The hand-built GramJS client in the browser (`src/lib/telegram/`) keeps
producing defects — five were fixed in one pass, a sixth (every 2FA failure
masked as `AUTH_USER_CANCEL`) surfaced in the live drill, and the surface it
re-implements (stickers, folders, calls, media cache, peers) will keep
outgrowing it. The vendored `sample/telegram-tt` (Ajaxy Telegram Web A,
v13.0.1) is the real Telegram Web client and **already ships local
multi-account support** — an `?account=N` slot scheme
(`src/util/accountSlot.ts`, `src/util/multiaccount.ts`) that prefixes every
storage key (`account<N>` session JSON in localStorage, `_<slot>` IndexedDB
databases, per-slot broadcast channels). The pivot: embed telegram-tt as the
chat client instead of maintaining our own, and sync its per-account session
material to the MES backend so accounts restore on any browser and device
without repeating phone/OTP/QR.

## What Changes

- **Vendor the telegram-tt production build** (`sample/telegram-tt/dist/`) into
  `frontend/public/telegram-web/` and serve it as static files under
  `/telegram-web/`; the module embeds it in an iframe at
  `/telegram-web/index.html?account=N`. The vendored copy is GPL-3.0-or-later
  — a NOTICES file documents provenance and license; the private,
  non-commercial use is accepted as-is.
- **Replace the GramJS browser client** — remove `gramjs.ts`, `link.ts`,
  `telegram-controller.ts`, `client-manager.ts`, the custom chat UI
  (`chat-list`, `chat-window`, `phone-number-field`, country picker) and the
  wizard dialog. telegram-tt handles phone/OTP/2FA/QR login itself and
  presents the full chat surface; MES no longer implements any Telegram
  protocol code. (Supersedes the whole `fix-telegram-account-linking` defect
  list.)
- **Session sync through the shared origin, no telegram-tt source patch**:
  the entire session material for a slot is one JSON blob at localStorage key
  `account<N>` (per-DC `auth_key`, `server_salt`, identity). The MES module —
  same origin as the iframe — reads that key to detect login and writes it
  back before creating the iframe, so the app boots straight into the chat
  list. The blob travels to the backend encrypted (AES-256-GCM) and is
  restored on any device where the viewer signs in.
- **Stable slot per account**: the backend assigns and records a stable
  telegram-tt slot (`web_slot`) per linked account so two viewers sharing one
  browser/origin never collide on `account<N>`, and each account keeps its
  slot across reloads and devices.
- **Auto-login on module open**: the module hydrates the active account's
  stored blob into its slot key, then mounts the iframe; the account connects
  with no OTP/QR. Accounts whose session Telegram revoked stay listed and are
  marked for re-link (re-linking runs inside telegram-tt itself).
- Keep the existing backend module (`telegram_accounts` table, AES-256-GCM
  storage, viewer-scoped GraphQL operations, audit trail, 10-account cap) and
  the dashboard launcher from the previous change. MES renders **no
  switcher rail, add-account, or remove-account UI**: the embedded client
  manages accounts natively, and removal remains available through the
  module's GraphQL surface.

## Capabilities

### New Capabilities
- `core/telegram-web-client`: embedding telegram-tt as the viewer-facing
  Telegram client — module structure (launcher, account rail, iframe
  workspace), stable slot allocation, session export/import over the shared
  origin, automatic restore on sign-in, revoked-session handling, and account
  removal that clears both backend record and browser-side slot data.

### Modified Capabilities
- `backend/graphql-api`: the Telegram-account operations change shape — the
  viewer's list carries the stable slot and the session material needed for
  restore, linking/upsert now also accepts the telegram-tt session blob and
  slot, and removal clears the slot data too.
- `backend/persistence`: the linked-Telegram-account record gains the stable
  telegram-tt slot and stores the telegram-tt session JSON (instead of the
  GramJS session string) encrypted alongside the existing fields.

## Impact

**Removed** (superseded by the embedded client): `frontend/src/lib/telegram/{gramjs,link,telegram-controller,client-manager,country-calling-codes}.ts`, `frontend/src/components/telegram/{add-account-dialog,phone-number-field,chat-list,chat-window,telegram-workspace}.tsx` and their tests, the GramJS
dependency usage (package stays only if the vendored bundle needs it — verify
before dropping).

**Added**: `frontend/public/telegram-web/` (vendored dist, ~240 MB), the
module shell (`frontend/src/components/telegram/module-*` + slot store +
session bridge), a NOTICES entry for the GPL-3.0-or-later bundle, and a
documented rebuild script for refreshing the vendored build from
`sample/telegram-tt`.

**Changed**: existing Telegram GraphQL operations and the
`telegram_accounts` record shape (migration for the slot column + session
column reuse), dashboard launcher module surface, i18n keys for the shell.

**Unchanged**: backend crypto, viewer scoping, audit, 10-account cap; the
`telegram` package setup in `frontend/src/lib/telegram/types`, `api.ts`,
`provider.ts` scaffolding survives where it still fits.

**Supersedes**: `add-telegram-multi-account-client` (its remaining smoke
tasks and the GramJS-shaped spec deltas) and `fix-telegram-account-linking`
(superseded wholesale — its defect surface disappears with the GramJS
client).