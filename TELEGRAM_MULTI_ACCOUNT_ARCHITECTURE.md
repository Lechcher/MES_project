# TELEGRAM_MULTI_ACCOUNT_ARCHITECTURE.md
> Architecture reference for the MES multi-account Telegram web client — the
> **viewer-owned** channel that lets a signed-in user use several of their own
> Telegram accounts inside the web app. This document describes the structure
> of the module: its layers, data flow, and security posture. The behavioral
> contract is [`openspec/specs/core/telegram-web-client/spec.md`](./openspec/specs/core/telegram-web-client/spec.md);
> the decisions behind the structure are recorded in
> [`openspec/changes/replace-telegram-client-with-embedded-web/design.md`](./openspec/changes/replace-telegram-client-with-embedded-web/design.md).
> It is distinct from the inbound bot of [`TELEGRAM_BOT_ARCHITECTURE.md`](./TELEGRAM_BOT_ARCHITECTURE.md):
> the bot speaks the Bot API with a bot token from the server; this module
> speaks MTProto with viewer sessions in the browser. The two share nothing
> but the name.

---

## 1. Shape of the module

The chat surface is **not** written by MES: it is the Telegram Web A client
(telegram-tt, GPL-3.0-or-later, vendored at `frontend/public/telegram-web/`,
see [`NOTICES.md`](./NOTICES.md)), embedded same-origin in an iframe at
`/telegram-web/index.html?account=<slot>&theme=<light|dark>`. MES adds only
the parts Telegram Web cannot have: the account list belongs to a MES viewer,
the sessions are backed up to the MES backend so they restore on any device,
and the client follows the MES shell's light/dark theme.

| Layer | Where | Responsibility |
| --- | --- | --- |
| Storage | `backend/src/db/schema.ts` → `telegram_accounts` | One row per (viewer, Telegram identity): profile fields, masked phone, the stable embedded-client slot (`web_slot`), AES-256-GCM session ciphertext + IV + auth tag |
| Encryption | `backend/src/telegram-accounts/crypto.ts` | Encrypts and decrypts a session blob under `TELEGRAM_ENCRYPTION_KEY`; a missing/malformed key is an actionable configuration error, never a silent fallback |
| Domain | `backend/src/telegram-accounts/accounts.ts` | Viewer-scoped list / upsert / remove; assigns the stable slot (random, unique across viewers); audit entries for link and remove carry the Telegram identity, never the session |
| API | GraphQL on the usual endpoint (`POST /api/v1/graphql`) | `telegramAccounts`, `saveTelegramAccount`, `removeTelegramAccount`, resolved against the authenticated viewer only |
| Session bridge | `frontend/src/lib/telegram/session-bridge.ts` | The only code that touches the embedded client's storage: hydrate `account<N>` before mount, watch it for captures, clear a slot on removal, detect the client's passcode lock |
| Theme bridge | `frontend/src/lib/telegram/theme-sync.ts` | Hands the resolved MES theme to the client: the boot URL parameter for the first paint, a same-origin `postMessage` (re-sent on every theme change and frame load) for the live ones |
| Slot store | `frontend/src/lib/telegram/session-store.ts` | Reads a captured blob's identity (profile for the save); allocates the temporary slot a first link runs in; the device identity MES persists |
| Controller | `frontend/src/lib/telegram/telegram-controller.ts` | React-free state: the viewer's accounts with restore status, the mounted slot, the capture/backup and the removal (both sides) |
| Provider | `frontend/src/lib/telegram/provider.tsx` | React bridge for the controller; wires the capture watcher to the mounted slot |
| UI | `frontend/src/components/telegram/` | The embedded client's workspace in `client-frame.tsx` — MES renders no switcher rail or account-management UI; the client manages accounts natively |

## 2. Data flow

**First link.** With no linked account the module mounts the embedded client
in a temporary slot (from a reserved range the backend's slot pool never
uses). The viewer logs in inside Telegram's own UI (phone + OTP, 2FA, or QR
— all native). The client writes its session blob to `account<N>`; the bridge
notices, the slot store reads the account identity out of the blob, and the
controller saves it through `saveTelegramAccount`. The backend assigns the
account's stable slot; when it differs from the temporary one the controller
moves the blob there and the mount follows it — the viewer never sees a slot
change.

**Every later visit.** Opening the module runs `telegramAccounts`: the
resolver decrypts each stored session (never for any other viewer) and returns
it with the account's stable slot. `selectAccount` writes the blob into that
slot *before* the iframe mounts, so the client boots straight into the chat
list — on the same browser and on a fresh device alike, with no phone number,
OTP, or QR. A revoked or unregistered session surfaces as a disconnected
account whose mount shows the client's own login (the re-link affordance).

**Capture.** The bridge watches the mounted slot: the client rewrites its
blob when a login completes or the session rotates, and each version is saved
through the same upsert (a re-link keeps its stable slot).

**Removal.** `removeTelegramAccount` deletes the row and its session; the
controller clears the slot's keys and its IndexedDB databases best effort; the
account never comes back. The client itself also logs accounts out through
its own switcher; MES keeps no account-management UI of its own.

## 3. Security posture

- The embedded client's session blob is a bearer credential for a Telegram
  account (per-data-center auth keys): ciphertext at rest, decryptable only
  by the server-side key, and delivered only inside the owning viewer's own
  response over the authenticated same-origin session
  (`/api/mes/graphql` forwards server-side; cookies carry the viewer).
- The client's storage is origin-scoped, so several MES viewers on one
  browser share it. Two rules keep that safe: the backend's slots are
  globally unique (random, unique-indexed), and the shell only ever writes
  the signed-in viewer's own slots — a temporary linking slot is cleared when
  the viewer leaves the module.
- A viewer who sets the client's own screen-lock passcode moves its session
  store off plaintext storage; the bridge detects that state and shows such
  an account as disconnected rather than writing into a store the client will
  not read.
- Nothing here changes the existing bot, the notification engine, or the MES
  attachment storage: chat attachments go straight to Telegram.

Setup, the vendored-build refresh, and the manual smoke test are documented
in [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) §15.