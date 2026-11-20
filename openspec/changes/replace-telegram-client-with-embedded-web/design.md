# Design

See proposal.md for motivation. This document records HOW the pivot is built.

## Context

Verified against the vendored `sample/telegram-tt` (v13.0.1, untracked in git,
GPL-3.0-or-later, has a production `dist/`):

- **Local multi-account already exists upstream.** `src/util/accountSlot.ts`
  reads `?account=N` (`ACCOUNT_QUERY = 'account'`, slot must be integer > 1);
  `src/util/multiaccount.ts` derives `ACCOUNT_SLOT` from the URL and
  per-slot keys. `src/util/cacheApi.ts:44` appends `_${ACCOUNT_SLOT}` to every
  IndexedDB database name; `multiaccount.ts:32-33` suffix the broadcast
  channels and global-state cache key per slot. No MES work needed here.
- **One blob is the whole session.** `src/util/sessions.ts:68` writes the JSON
  of `SharedSessionData` (`src/types/index.ts:74` — `dcId`, `dc1..dc5_auth_key`,
  `dc1..dc5_server_salt`, `tempAuthKey`, `authKeyCreatedAt`, `isTest`, plus the
  profile) to a single localStorage key `account<N>`
  (`SESSION_ACCOUNT_PREFIX = 'account'` + slot, defaulting to 1).
- **Passcode lock can move the store off localStorage.**
  `src/util/passcode/sessionStore.ts` keeps `readSessionValue`/
  `writeSessionValue` on `localStorage` until `enableEncryptedSessionStore`
  runs (`isEncrypted = true`), which holds values in memory and persists them
  encrypted under the passcode. `isSessionStoreLocked()` reports this state.
  Default (no in-app passcode) = plaintext localStorage = hydratable.
- **`dist/index.html` uses relative `./assets/...` paths**, so serving the
  built folder under any base path works unchanged; the iframe entry is
  `index.html?account=N`.

Current MES state: the GramJS module (backend storage + GraphQL + frontend
`src/lib/telegram/{gramjs,link,telegram-controller,client-manager}.ts` and the
wizard/chat components) exists in the user's uncommitted WIP; the backend
`telegram_accounts` table (migration `0001`) holds an AES-256-GCM encrypted
GramJS session string.

## Goals / Non-Goals

**Goals:**

- Telegram-tt becomes the only Telegram protocol implementation in MES.
- Sessions survive browser restarts, other browsers, and other devices by
  round-tripping through the encrypted backend store, no OTP/QR on restore.
- Stable, collision-free slot per linked account across viewers sharing a
  browser.
- The vendored bundle is a build artifact with a documented rebuild path, not
  hand-patched source.

**Non-Goals:**

- No modification of the vendored telegram-tt source (no patches to maintain;
  upgrades mean rebuilding the dist).
- No per-account IndexedDB cache hydration (the cache rebuilds from the
  network; only the session blob is synced).
- No new backend auth surface — the existing viewer-scoped Telegram
  operations are reused.
- Not touching the telegram bot backend (`core/telegram-bot`).

## Decisions

### 1. Vendor the dist into `frontend/public/telegram-web/`

`sample/telegram-tt/dist/` is copied (minus `.map` files) into
`frontend/public/telegram-web/` and served by Next's static handler under
`/telegram-web/`; the workspace mounts
`<iframe src="/telegram-web/index.html?account=N">`.
Alternatives considered: (a) git submodule + build in CI — rejected: adds a
2 GB checkout and an npm-ci to every frontend build for a static artifact;
(b) copy `src/` into the repo — rejected: 1M+ lines of upstream code in the
MES diff, and rebuilding it inside the Next toolchain is unnecessary since
the output is static. A script in `frontend/scripts/` and a §15 docs entry
record the one-command refresh from `sample/telegram-tt`. A NOTICES file
records the GPL-3.0-or-later provenance.

### 2. Bridge the session over the shared origin — no iframe protocol

The iframe is same-origin with MES, so the module shell reads and writes the
`account<N>` localStorage key directly.

- **Hydrate (restore):** the shell writes the decrypted blob of the selected
  account into `account<N>` and only then mounts/remounts the iframe; the app
  boots and finds the stored session, connecting with no login.
- **Capture (backup):** the shell poll-reads `account<N>` (interval, with a
  `storage` event listener as the fast path) and upserts the backend whenever
  the blob appears or changes — the login-completed and profile fields arrive
  in the same blob (`SessionUserInfo`), so profile, slot and session stay
  consistent from one read.
- **Alternatives considered:** (a) `postMessage` bridge — rejected: works but
  still needs the blob written into the iframe's storage, so it adds a
  protocol where a direct key write suffices; (b) patching telegram-tt to
  call an API — rejected: forbidden by decision 1 and unnecessary.

### 3. Stable slot per account, assigned by the backend

The shell never invents slot numbers — the backend assigns one at link time
and returns it with every account. Slot = a random integer in `[2, 2^31)`
(telegram-tt ignores slots ≤ 1), with a per-account unique constraint; on a
collision the next free value is used. Because slots are per-origin (all MES
viewers on one browser share `/telegram-web`'s localStorage), per-viewer
sequential slots would collide; random 31-bit values make that a
non-concern, and the shell only ever hydrates keys for the *signed-in*
viewer's accounts.

### 4. No switcher of MES's own — the client switches accounts

MES ships no account switcher, add-account, or remove-account UI: the
embedded telegram-tt client manages accounts natively (its own switcher and
login screens), and that surface is strictly better than anything MES would
re-implement — which is the defect history this change exists to escape.
What MES owes the native switcher is only that **every** restorable
account's slot is hydrated on module open (so the client can move between
them with no login step), and that the watcher follows **all** `account<N>`
keys — a login the client performs at a slot MES never allocated (its native
add-account flow) is captured like any other: the identity is read from the
blob, the account is saved, and the session moves to the backend's stable
slot. Removal remains available through the module's API surface; a removed
account's slot data is cleared in the browser alongside its record.

### 5. Passcode-locked accounts are detected, not silently dead

Before hydrating, the shell checks the passcode flag key
(`IS_SCREEN_LOCKED_CACHE_KEY` = `true`). A passcode-locked account cannot be
hydrated (its store is encrypted); the module lists it as disconnected with a
re-link affordance (linking/re-linking always runs inside the embedded
client). This also covers `isSessionStoreLocked()` returning true during
enable/disable transitions.

### 6. Backend: one new column, one reused column, same operations

Migration `0002` adds `web_slot` (integer, unique, not null) to
`telegram_accounts`. The existing encrypted-session column is reused for the
telegram-tt blob — the GramJS `StringSession` shape is not hydratable by
telegram-tt, so migration `0002` nulls existing session material (drill
records from the previous module) and those accounts surface as disconnected
until re-linked inside the embedded client. The GraphQL surface keeps the
three viewer-scoped operations with the slot added to the save input and the
list output. Everything else (crypto, audit, 10-account cap, viewer scoping)
is untouched.

### 7. Removal clears both sides

Removing an account deletes the record and also `removeItem`s the slot's
`account<N>` key and deletes the slot's IndexedDB databases best-effort
(`indexedDB.deleteDatabase` by the `_<slot>` suffix naming) so the next login
on that browser starts from a clean slot.

### 8. The GramJS module goes away

`gramjs.ts`, `link.ts`, `telegram-controller.ts`, `client-manager.ts`,
`country-calling-codes.ts`, the wizard dialog, phone field, chat list/window
and their tests are removed; what survives from `types.ts`/`api.ts` is folded
into the new shell's slot store. The `telegram` npm dependency is dropped if
nothing else imports it (verify before removing — the bundled dist carries
its own copy of the library).

## Risks / Trade-offs

- [~240 MB of build output in `frontend/public/`] → source maps excluded,
  rebuild script documented, NOTICES carries provenance; the artifact is
  reviewed once, not per-diff (script-owned copies are excluded from review
  noise where the tooling allows).
- [A vendored GPL-3.0-or-later bundle in a private repo] → accepted by the
  project owner as private/internal use; NOTICES states the license and the
  source URL, and the rebuild script pins the vendored version (13.0.1).
- [telegram-tt upgrades silently in `sample/`] → the vendored copy records its
  version and the rebuild script prints the source version for the changelog.
- [Iframe localStorage shared by all MES viewers on one browser] → slots are
  backend-assigned and unique; the shell writes only the signed-in viewer's
  slot keys and clears its own keys on sign-out.
- [Polling latency for backup capture] → `storage` events fire same-origin as
  the fast path; polling (≤ 2 s) is the fallback, and a final capture runs on
  tab close (`visibilitychange`) so a login is never lost mid-flow.
- [telegram-tt's passcode-lock state blocks hydration] → detected up front
  (decision 5) with a disconnected + re-link affordance.
- [Vendored build's hashed asset filenames churn on every rebuild] → accepted;
  the script copies the whole dist so index.html and assets stay consistent.
- [Web build only — mobile wrapping (tauri dir in sample) ignored] →
  Non-Goal; the module is web-only like the rest of MES.

## Migration Plan

1. Vendor the dist + NOTICES + rebuild script; route serves 404-free at
   `/telegram-web/index.html`.
2. Backend migration `0002`: `web_slot` column + null the incompatible
   session material; update domain + GraphQL; backend tests.
3. New shell: slot store, bridge (hydrate/capture), rail, iframe workspace,
   launcher wiring; delete the GramJS client + components; update i18n.
4. Unit suites updated (old telegram tests removed, shell/bridge tests
   added); frontend + backend suites green; biome + tsc clean.
5. Docs: §15 setup + the drill (login in the embedded client → reload →
   auto-login; second browser → auto-login; remove).
6. Rollback: revert the change set — the previous module lives in git history
   and its backend columns are additive.

## Open Questions

- None blocking. The passcode-locked account UX (decision 5) can start as
  "disconnected + re-link" without deciding whether an unlock prompt is worth
  building later.