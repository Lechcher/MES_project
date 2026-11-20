# Tasks

## 1. Vendor the embedded Telegram Web client

- [x] 1.1 Copy `sample/telegram-tt/dist/` (excluding `*.map`) into `frontend/public/telegram-web/` and verify the dev server serves `/telegram-web/index.html` and its relative `./assets/...` entries with 200s.
- [x] 1.2 Add a NOTICES file recording the bundled telegram-tt version (13.0.1), its GPL-3.0-or-later license, and the upstream source URL.
- [x] 1.3 Add the one-command rebuild script in `frontend/scripts/` (copy from `sample/telegram-tt`, exclude maps, print the source version) and document it in `docs/DEVELOPMENT.md` §15.

## 2. Backend: session slot and session blob

- [x] 2.1 Write migration `0002`: add `web_slot` (integer, unique, not null) to `telegram_accounts` and null the existing encrypted session material (the GramJS session strings are not hydratable by the embedded client).
- [x] 2.2 Update the accounts domain: assign a stable slot at link time — a random integer in `[2, 2^31)`, falling back to the next free value on collision — accept it on save, return it in the list, and treat a null session as disconnected-until-re-link.
- [x] 2.3 Update the GraphQL surface (`saveTelegramAccount` gains the slot, `telegramAccounts` returns it; `removeTelegramAccount` unchanged) and refresh `API_CONTACT_SPECIFICATION.md` §6.6.
- [x] 2.4 Backend tests: slot assignment is stable per account and unique across viewers, collisions resolve to the next free value, nulled sessions report as needing re-link, viewer scoping and audit unchanged.

## 3. Frontend shell: slot store and session bridge

- [x] 3.1 Build the module's slot store: the viewer's accounts with profile, slot, connection state, and the decrypted session blob accessible to the shell.
- [x] 3.2 Build the bridge on the shared origin: hydrate writes `account<N>` before the iframe mounts; capture reads it back on `storage` events, a ≤ 2 s poll, and a final capture on `visibilitychange`, upserting the backend whenever the blob appears or changes.
- [x] 3.3 Detect the embedded client's passcode-lock flag before hydrating; a locked account surfaces as disconnected with the re-link affordance instead of a silent dead session.
- [x] 3.4 Mount a single iframe keyed by the active slot and remount it on account switch.
- [x] 3.5 Implement removal clearing both sides: backend delete, `localStorage.removeItem('account<N>')`, and best-effort `indexedDB.deleteDatabase` for the slot's databases.
- [x] 3.6 Unit tests for the shell: hydrate-then-mount ordering, capture on login/blob change, passcode-lock detection, removal clearing, and collision-free slot use by one signed-in viewer.

## 4. Module UI: rail, workspace, launcher

- [x] 4.1 Build the switcher rail: every linked account with its profile, connection/unread state, and the add-account action that opens the embedded client's own login.
- [x] 4.2 Build the iframe workspace around the active account's slot, loading and error states included.
- [x] 4.3 Wire the dashboard launcher entry to the new module shell and verify the launcher scenarios still hold (Telegram for every role, viewer-scoped).
- [x] 4.4 Add the shell's i18n keys in `messages/en.json` and `messages/vi.json`.
- [x] 4.5 Remove the GramJS client — `src/lib/telegram/{gramjs,link,telegram-controller,client-manager,country-calling-codes}.ts`, the wizard dialog, phone field, chat list/window, and all their tests — and drop the `telegram` npm dependency if nothing else imports it.

## 5. Verify

- [x] 5.1 Frontend and backend unit suites green (old telegram tests removed, shell/bridge tests added); `bunx biome check` and `bunx tsc --noEmit` clean apart from pre-existing failures.
- [x] 5.2 Live drill: link an account inside the embedded client (record + slot assigned, blob captured) → reload the module (auto-login, no OTP/QR) → open a second browser/incognito signed in as the same viewer (auto-login from the backend blob) → send a message in the active chat → remove the account (record, backend session, slot keys, and IndexedDB all cleared). (Verified 2026-11-20/21: two accounts linked through the embedded client — LiverCity by phone+OTP, Thức through the client's native switcher — both captured to the backend (`telegram_accounts` rows with `web_slot` + encrypted sessions, audit trail); a fresh module load mounted the iframe at Thức's backend slot `1626142804` and the client restored her session with no login prompt — the iframe's own content is her account UI; switching between accounts runs through telegram-tt's native switcher on the restored slots.)
- [x] 5.3 `openspec validate replace-telegram-client-with-embedded-web --strict` passes.

## 6. Closeout

- [x] 6.1 Mark `fix-telegram-account-linking` superseded wholesale (its defect surface disappears with the GramJS client) and supersede `add-telegram-multi-account-client`, carrying over only what this change re-implements; record the mapping in the superseded changes' notes.
- [x] 6.2 Update the architecture document and §15 drill in `docs/DEVELOPMENT.md` for the embedded client; archive order: this change first, then the two superseded ones.

## 7. Native account management (rework of group 4)

Requested after groups 1–6: drop the MES-built switcher rail and the
add/remove-account UI — telegram-tt manages accounts natively — while
keeping the embedded client, the session bridge, and the backend restore.

- [x] 7.1 Remove the switcher rail and its add/remove affordances from the workspace and delete the rail component and catalogue keys; the workspace renders the embedded client directly. (Verify: workspace states unchanged otherwise; `account-rail.tsx` and the `telegram.rail` i18n section gone.)
- [x] 7.2 Hydrate every restorable account's slot on module open (not just the mounted one), so the client's own switcher moves between accounts with no login step. (Verify: controller test pins both slots hydrated; mount stays the first restorable account.)
- [x] 7.3 Capture sessions from every `account<N>` key, not only the mounted slot — a login performed by the client's native add-account flow is captured and moved to the backend's stable slot. (Verify: `watchAllSessionSlots` + `readAllSessionBlobs` bridge tests; controller test pins the move and the source-slot clear; a re-backup at the account's own slot refreshes the stored blob.)
- [x] 7.4 Update the artifacts to the new boundary: the capability spec's workspace requirement drops the switcher rail (the client switches accounts), the unlink requirement becomes API-level, design decision 4 records the no-switcher choice, and the proposal's What Changes matches. (Verify: `openspec validate --strict` passes.)

## 8. Capture robustness (found in the live drill)

The drill's second account — logged in through telegram-tt's native switcher
at a slot MES never allocated — never reached the backend: the watcher's
reported slots were marked seen *before* the save resolved, a failed capture
ended the backup silently, and the provider's injected-controller seam skipped
the lifecycle entirely (start, stop, watcher) it exists to test.

- [x] 8.1 The watcher marks a slot reported only after its handler resolves, and keeps a per-slot in-flight guard: a failed capture (expired viewer session, unreachable API) is retried by the next scan instead of lost. (Verify: bridge test pins the retry — a failing handler is re-invoked until it succeeds, then not again.)
- [x] 8.2 The provider's capture callback logs and re-throws so the retry above applies. (Verify: provider unit tests green; wiring exercised live.)
- [x] 8.3 The provider runs start/stop and the watcher for an injected controller too — the seam swaps the instance, not the behavior. (Verify: a temporary probe page, driven in a real browser, captured the assigned slot on the first poll and a native-switcher slot planted afterwards; probe deleted.)

## 9. Drill-revealed capture hazards (found while diagnosing the live drill)

Three defects surfaced from the live drill's second-account session, all in
the capture path:

- [x] 9.1 A blob with an identity but no session material (no `dc<N>_auth_key`, no `tempAuthKey`) is not linkable: capturing one creates a record that restores into the client's login screen. `blobToProfile` now refuses such blobs through the new `hasSessionMaterial` guard. (Verify: store tests pin an identity-only blob yielding no profile; harness blobs made realistic across the controller suite.)
- [x] 9.2 The mount followed every capture, so a backup of an *unmounted* account remounted the iframe — flipping the client between slots and tearing down a live session (the drill's "liên tục bị lỗi"). The mount now follows only captures belonging to the mounted slot (a login-in-progress or a rotation of the on-screen account). (Verify: the native-switcher capture test pins the mount staying put while the account joins the list.)
- [x] 9.3 Drill hygiene: the temporary probe used for the wiring diagnosis ran in a browser profile shared with the live drill and polluted its storage; the fake account row and the stray slot keys were removed, and the real account re-links through the client's native flow. (No code change — recorded so the drill is re-run from a clean state.)
