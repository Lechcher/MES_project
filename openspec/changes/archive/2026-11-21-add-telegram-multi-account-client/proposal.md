# Proposal

> **SUPERSEDED** by
> [`replace-telegram-client-with-embedded-web`](../replace-telegram-client-with-embedded-web/proposal.md),
> which replaces the hand-built GramJS browser client with the embedded
> Telegram Web client (telegram-tt) and carries forward the durable
> requirements: backend storage/crypto/viewer-scoped operations, the
> encrypted-at-rest session contract, automatic restore, transient failure
> isolation, removal, and the deployment configuration. The GramJS-shaped
> parts (linking flow, device fingerprint, three-column custom workspace,
> live unread counters) are dropped — telegram-tt provides all of them
> natively. Its backend implementation (table, crypto, GraphQL) stays in the
> codebase and is extended by the new change.

## Why

MES already reaches Telegram in one direction: the server-side bot
(`core/telegram-bot`) pushes notifications and answers questions, one Telegram
identity per linked chat. What the system lacks is the other direction — a
viewer's *own* Telegram accounts inside the web app. Users who run several
Telegram accounts (personal, work, customer-facing) must today leave MES, open
Telegram separately per account, and re-authenticate on every device. After
signing in to MES, every Telegram account the viewer previously linked should
just be there — connected, with chats loaded — without re-entering a phone
number, an OTP, or a 2FA cloud password.

This is enabled by a browser-based MTProto architecture (GramJS
`StringSession`): the Telegram auth key never leaves the browser in plaintext —
it is persisted server-side, encrypted at rest with AES-256-GCM, and handed
back only to the owning authenticated viewer to restore their sessions.

## What Changes

- Add the capability **`core/telegram-multi-account`**: a new sixth MES module,
  "Telegram", reachable from the dashboard launcher, that lets a viewer link,
  auto-restore, and use several of their own Telegram accounts in parallel.
- Add a `telegram_accounts` table (one row per MES user × Telegram identity)
  storing the encrypted `StringSession`, the masked phone number, Telegram
  profile fields, and the device fingerprint that keeps Telegram from flagging
  session changes. Sessions are encrypted with AES-256-GCM
  (`TELEGRAM_ENCRYPTION_KEY`) and decrypted only in the owning viewer's own
  request path.
- Add GraphQL operations on the existing single endpoint
  (`POST /api/v1/graphql`) — queries/mutations to list, link (upsert), and
  delete the viewer's Telegram accounts, plus the device-fingerprint payload.
  Every operation resolves against the authenticated viewer only; no shared or
  cross-user access, consistent with the two-layer authorization model. The
  REST endpoints named in the source prompt are deliberately **not** used: the
  API contract declares GraphQL the only surface.
- Add the browser client layer: a `TelegramClientManager` (instance pool of
  GramJS clients keyed by account id) that restores every session on app load
  in parallel, isolates dead sessions (`AUTH_KEY_UNREGISTERED`,
  `SESSION_REVOKED`) as per-account "disconnected" states, attaches real-time
  `NewMessage` handlers for per-account unread counts, and disconnects cleanly
  on logout/unmount.
- Add the account-linking flow inside the module: phone + OTP + 2FA cloud
  password **and** QR-code login, generating and persisting one consistent
  device fingerprint per account, then saving the resulting `StringSession` to
  the backend.
- Add the multi-account workspace UI: a ~68px account-switcher rail (avatars,
  unread badges, connection dots, `+ Add Account`), a ~320px chat-list sidebar
  (search, All/Unread/Groups/Channels filters), and the main chat window
  (header, paginated history, composer with text, replies, and basic
  file/image attachments).
- Configure the module from environment variables only
  (`NEXT_PUBLIC_TELEGRAM_API_ID`, `NEXT_PUBLIC_TELEGRAM_API_HASH` for the
  browser client; `TELEGRAM_ENCRYPTION_KEY` for the backend), documented in
  `.env.example` files only, never in `.env` (per AGENTS.md).
- Register `telegram` in the app access matrix and the launcher, keeping the
  shell consistent with the sibling change `remove-app-nav-panel-links`
  (which removes the top-nav link strip and leaves the dashboard launcher the
  single way to open apps); that change's nav delta is not duplicated here.

Explicitly out of scope: the existing server-side bot and its commands
(touched only in that the two Telegram surfaces now coexist as distinct
capabilities); delivering MES notifications into this web client (the bot
remains the push surface); server-side MTProto connections; a REST surface;
message editing/reactions/voice; and any change to how the five existing
modules authorize.

## Capabilities

### New Capabilities

- `core/telegram-multi-account`: how a viewer links their own Telegram accounts
  to their MES account, how those sessions are restored automatically and kept
  alive in the browser, how the multi-account workspace behaves (switcher,
  chat list, chat window, unread tracking), and how the credentials
  (StringSession, api material, encryption key) are protected at every hop.

### Modified Capabilities

- `frontend/app-shell`: the dashboard launcher renders a sixth module
  ("Telegram") for every authenticated role alongside Jobs, Planning,
  Performance, Settings, and Audit Log, with its route protected by the shell's
  Layer-2 access rules. The top-nav requirement is left to
  `remove-app-nav-panel-links`.
- `backend/graphql-api`: new documented operations for the viewer's Telegram
  accounts; the transport, session, pagination, and error conventions are
  unchanged.
- `backend/persistence`: the durable record set gains the `telegram_accounts`
  table with its constraints (one row per user × Telegram identity), via the
  existing migration workflow.

## Impact

- **Code**: new `backend/src/telegram-accounts/` (AES-256-GCM crypto module,
  GraphQL operations + resolvers, domain functions); a new row in
  `backend/src/db/schema.ts` and one drizzle migration; new
  `frontend/src/app/(app)/telegram/` route, `frontend/src/components/telegram/`
  workspace components, and `frontend/src/lib/telegram/` (client manager,
  linking flow, types); `frontend/src/lib/mes/navigation.ts` gains the
  `telegram` module code and access entry; `frontend/messages/en.json` +
  `vi.json` gain the module's keys (catalogues stay key-identical).
- **Configuration**: `frontend/.env.example` gains
  `NEXT_PUBLIC_TELEGRAM_API_ID` / `NEXT_PUBLIC_TELEGRAM_API_HASH`;
  `backend/.env.example` gains `TELEGRAM_ENCRYPTION_KEY` (32-byte key,
  `openssl rand -hex 32`). `.env` files are never read, written, or committed.
- **Dependencies**: `telegram` (GramJS) in `frontend/` plus the
  `buffer`/`process`/`crypto` polyfills it needs in the bundler. Versions
  verified with the `npm-check-updates` skill before adding; the root
  `AGENTS.md` Stack table is updated.
- **Security**: a `StringSession` is a bearer credential for a Telegram
  account — encrypt at rest, decrypt only for the owning viewer over the
  authenticated same-origin session, never log it or return it unmasked in
  diagnostics. Browser MTProto inherently exposes `api_hash` in the client
  bundle (Telegram's `api_hash` is not a secret by design — every official
  client ships it); this is recorded as an accepted risk with the mitigation
  that ids/hashes come from the deployer's own Telegram app, never shared
  public ones.
- **Tests**: unit tests for the encryption round-trip and key handling, for
  viewer-scoped account CRUD (no cross-user reads/writes, duplicate-link
  prevention), and for the client manager (restore-all, per-account failure
  isolation, disconnect cleanup); a documented, env-gated manual smoke test
  with a real Telegram test account; the GraphQL contract test extended for
  the new operations.
- **Docs**: `TELEGRAM_MULTI_ACCOUNT_ARCHITECTURE.md` pointer to this change's
  design; a `docs/DEVELOPMENT.md` section covering env setup, browser
  polyfills, and the smoke test.