# Design

See `proposal.md` for motivation and the four spec deltas for the behavioral
contract. This document records how the module is built and the trade-offs
behind those choices.

## Context

Constraints that shape the approach:

- **Browser MTProto is an architectural given.** A Telegram account's
  `StringSession` is a bearer credential that Telegram treats as *that
  device*: it must be created in the browser (GramJS closes the auth flow
  there) and reused in the browser. The backend's job is storage and
  protection, not proxying MTProto — a server-side connection pool would
  concentrate every viewer's Telegram credentials behind one flood-prone hop
  and still need the browser for the initial QR/OTP handshake.
- **The API contract is GraphQL-only.** `API_CONTACT_SPECIFICATION.md` §2.1
  fixes a single `POST /api/v1/graphql` endpoint and marks REST out of scope.
  The prompt's REST routes are therefore expressed as GraphQL operations
  (decided with the repo owner; recorded here so the deviation from the
  prompt is never re-litigated per file).
- **Existing Telegram surface is the server-side bot** (`core/telegram-bot`,
  `backend/src/telegram/`). The two coincide in name only: the bot uses the
  Bot API with bot tokens; this module uses MTProto with user sessions. They
  share nothing but the word "Telegram" and must stay separate code paths.
- **No client state library exists in the frontend.** State is React context
  and hooks today (see `frontend/realtime-updates` conventions); Turbopack is
  the bundler (Next 16.4.3).
- **Next 16 breaks from training data.** Per `frontend/AGENTS.md`, bundler and
  polyfill configuration must be verified against
  `node_modules/next/dist/docs/` during implementation.

## Goals / Non-Goals

**Goals:**

- Zero re-authentication: after MES sign-in, every linked account restores
  from its stored session in parallel; each account's failure is isolated.
- Credential protection at every hop: encrypted at rest, viewer-scoped in
  transit, never logged.
- Telegram sees one stable device identity per account, for the account's
  whole lifetime in MES.
- The module feels native to the shell: launcher entry, role gating via the
  existing access matrix, IBM Carbon layout, en/vi catalogues.

**Non-Goals:**

- Server-side MTProto connections or a backend proxy of Telegram traffic.
- Bridging MES notifications *into* this workspace (the bot remains the push
  surface); message editing, reactions, voice, or calls.
- Cross-device session sync (a link made on one browser is restorable on
  another — that is a property of the stored session, not sync of UI state).
- Any change to the bot, the five existing modules, or the notification
  engine.

## Decisions

### 1. Browser MTProto (GramJS) with encrypted backend persistence
The browser runs `telegram` (GramJS) `TelegramClient` instances over
WebSocket, one per linked account. The backend stores the resulting
`StringSession` — never any auth key in plaintext.

- *Alternatives considered:* server-side MTProto pool (rejected: concentrates
  credentials, adds flood-limit and DC-routing burden, still needs the browser
  for QR/OTP); Telegram Bot API (rejected: cannot reach user accounts);
  passwordless deep-link re-auth each visit (rejected: violates the objective).

### 2. GraphQL operations on the existing endpoint
`telegramAccounts` (query) returns the viewer's linked accounts —
profile fields, masked phone, connection-relevant device fingerprint, and the
decrypted session string for that viewer only. `saveTelegramAccount`
(mutation, upsert on `(userId, telegramUserId)`) and
`removeTelegramAccount` (mutation) complete the CRUD set. Names follow the
telegram-bot precedent (`telegramLinks`, `saveTelegramBotSettings`,
`revokeTelegramLink`) so the contract reads consistently.

- *Alternative considered:* the prompt's REST routes (rejected: violates the
  single-endpoint contract; would fork auth and error handling).

### 3. AES-256-GCM with a server-held key
`TELEGRAM_ENCRYPTION_KEY` (32 bytes, `openssl rand -hex 32`) encrypts each
session with a fresh random IV; the stored row keeps ciphertext, IV, and
auth tag together (one `bytea`-style composite column or three columns —
implementation detail). A missing key fails fast at link time: storing a
session unencrypted is never a fallback (spec-mandated).

- *Alternatives considered:* app-level encryption derived from the user's
  password (rejected: rotation and password-change break every session);
  storing sessions server-side only for a server-side client (rejected with
  decision 1).

### 4. The decrypted session transits to the browser — scoped, not solved
Browser MTProto requires the plaintext session to reach the browser. It is
returned only inside the viewer's own authenticated response, over the
same-origin HTTPS session, and nowhere else (no logs, no audit, no errors).
This is an accepted architectural property, recorded rather than engineered
around; the enforcement point is viewer scoping in the resolver (tested).

### 5. React context client manager, no new dependency
`frontend/src/lib/telegram/` holds a `TelegramClientManager`: a
`Map<accountId, TelegramClient>` inside a `TelegramProvider` context, with a
`useTelegramAccounts()` hook. Restore runs `Promise.allSettled`-style so one
dead session can't reject the batch; each client gets a `NewMessage` listener
that bumps per-account unread counts in provider state; sign-out/unmount
disconnects every client.

- *Alternative considered:* Zustand as the prompt suggested (rejected: the
  project has no state library; a provider matches the existing realtime
  patterns and adds nothing to the dependency table).

### 6. Module-scoped initialization, not app-wide
Clients initialize when the Telegram module mounts, not on every MES page
load: a viewer who never opens Telegram must not hold N open WebSockets. The
user-visible guarantee (no re-authentication) is unchanged; only the
connection lifetime is bounded to the module's lifetime.

### 7. Device fingerprint persisted per account
`device_fingerprint` (device model, system version, app version — JSON) is
generated once at first link, stored on the account row, and replayed on every
reconnect. A re-link generates a new one deliberately.

### 8. Linking flow: phone/OTP/2FA and QR in one in-module wizard
Both flows run in the browser against GramJS; the wizard produces the
`StringSession`, calls `getMe()` for profile fields, and POSTs
(saves) through the mutation. The fingerprint is generated at this point
(decision 7).

### 9. Data model
One row per (viewer, Telegram identity) in `telegram_accounts`, cascading
from the user; unique constraint on `(userId, telegramUserId)` enforces
upsert semantics at the storage layer. Profile fields, masked phone,
fingerprint JSON, encrypted-session composite, `is_active`, timestamps. New
drizzle migration appended to the journal like every schema change.

### 10. Access and audit
`telegram` joins `MES_MODULE_CODES` with `PERSONAL` access for every role in
the `MES_APP_ACCESS` matrix — viewer-scoped data needs no role gate beyond
authentication. Link and unlink are credential events: both write an audit
entry attributed to the viewer, following the existing audit conventions
(link records the Telegram identity, never the session material).

### 11. Attachments ride MTProto, not MES storage
Composer attachments upload through GramJS `sendFile` straight into the
Telegram conversation. The MES attachment-storage module is for ticket
attachments and is deliberately not in this path (storage capacity, S3 costs,
and a second source of truth for files Telegram already stores).

### 12. Operational guardrails
A per-viewer cap on linked accounts (default 10, configurable constant) bounds
memory and Telegram-side risk; GramJS clients run with bounded connection
retries; the module surfaces flood-wait errors as per-chat status rather than
retry loops.

### 13. Country-code picker (static ITU-T list)
The phone step asks for a phone number as a country calling code plus the
national digits, because Telegram's login expects E.164 and a viewer should
never type the country code themselves. The list is a static
`country-calling-codes.ts` (every ITU-T E.164 territory: ISO, dial code,
English name) rather than a dependency — it changes on the scale of decades,
and a vendored list keeps the module self-contained. Composition strips
formatting and a single national trunk `0` (`0912 345 678` → `+84912345678`).
The picker is the shadcn `Select` (the repo's Base-UI primitive, explicitly
not the browser's native `<select>`), listing flag + dial code + name, with
common territories pinned first.

### 14. QR rendering (`qrcode`)
Implementation-revealed addition: the QR-code login flow needs to *show* the
scannable token, and no installed package could render one. `qrcode` (1.5.4)
renders the token onto a `<canvas>` — not an `<img>` — because the repo's
Biome config forbids `<img>` elements (`lint/performance/noImgElement`), and a
canvas avoids the rule without a lint suppression. The alternative (skipping
QR and offering only the `tg://login?token=` deep link) was rejected: the link
opens Telegram on the *same* device, which defeats cross-device scanning.

## Risks / Trade-offs

- **Session strings are bearer credentials in the browser tab** → viewer-scoped
  decryption, same-origin HTTPS only, never logged (decisions 3–4); documented
  in the smoke test and the environment section.
- **`api_hash` is visible in the client bundle** → unavoidable for browser
  MTProto (every official client ships it); mitigated by requiring the
  deployer's own api id/hash from env, never shared public ones, and recorded
  as an accepted risk.
- **Telegram may flag anomalous session use despite a stable fingerprint** →
  per-account disconnected state with re-link, no cascading failure; rate
  limits surfaced honestly per chat.
- **GramJS is a heavy browser dependency needing polyfills** → versions pinned
  and verified via `npm-check-updates` before install; polyfill config verified
  against the installed Next 16 docs at implementation time; bundle-size cost
  accepted for a dedicated module route.
- **Concurrent clients multiply open WebSockets while the module is open** →
  module-scoped initialization (decision 6) and the per-viewer account cap
  (decision 12) bound the blast radius.
- **Prompt asked for REST / Zustand / app-load init** → each deviation resolved
  and recorded (decisions 2, 5, 6) so reviewers can trace them back.
- **Sibling change interaction**: `remove-app-nav-panel-links` removes the nav
  link strip and keeps the launcher as the only entry — this change only adds
  the launcher's sixth tile; the two deltas touch different requirements and
  archive cleanly in either order.

## Migration Plan

1. Add the `telegram_accounts` migration after the current journal head
   (alongside the PostgreSQL migration set); fresh databases get it with the
   set, existing databases get one additive migration.
2. Deploy backend with `TELEGRAM_ENCRYPTION_KEY` before any account link is
   attempted (fail-fast otherwise); deploy frontend with
   `NEXT_PUBLIC_TELEGRAM_API_ID`/`NEXT_PUBLIC_TELEGRAM_API_HASH`.
3. Rollback: remove the module's launcher entry and route; the table can stay
   (no domain reads it). Full rollback drops the table — sessions are
   re-linkable, so no viewer data is unrecoverable.

## Open Questions

None material to the specs or tasks. Implementation-time verifications (exact
GramJS version and its browser build, Turbopack polyfill configuration against
the installed Next 16 docs) are tasks, not open questions.