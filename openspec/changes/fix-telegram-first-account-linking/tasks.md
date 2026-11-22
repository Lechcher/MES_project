# Tasks

## 1. Mount the embedded client for a viewer with no linked accounts

- [x] 1.1 In `frontend/src/components/telegram/telegram-workspace.tsx`, stop the empty branch from returning before the frame: render the hint plus `<ClientFrame>` at `state.iframeSlot` when the account list is empty, and start linking from an effect when `state.accounts.length === 0 && state.iframeSlot === null` (calling `controller.startLinking()`); remove the "Link your first account" button (`startLinking` stays on the controller untouched). Verify: `cd frontend && bunx tsc --noEmit` reports no new errors and `./node_modules/.bin/biome check src/components/telegram/` is clean.

- [x] 1.2 In `frontend/messages/en.json` and `frontend/messages/vi.json`, remove `telegram.workspace.emptyTitle`, `emptyDescription`, and `addFirst`, and add a flat `telegram.workspace.linkHint` key in both locales (a short line telling the viewer to sign in to Telegram in the client below). Verify: both files parse as JSON, `grep -rn "emptyTitle\|emptyDescription\|addFirst" frontend/src frontend/messages` finds no references, and `cd frontend && bun test src/lib/mes/i18n/locale-parity.test.ts` passes.

- [x] 1.3 Add `frontend/src/components/telegram/telegram-workspace.test.tsx`: with zero accounts and an `iframeSlot` set, the client frame renders (iframe `src` carries `?account=<slot>`); with one restorable account, the frame renders at the account's stable slot. Note: the third case found that a LONE `needsRelink` account shows neither the re-link hint nor a frame today (adjacent gap, out of this change's scope per design.md) — the test pins that actual behavior. Verify: `cd frontend && bun test src/components/telegram/` passes.

## 2. Scope the capture bridge to the current module session

- [x] 2.1 In `frontend/src/lib/telegram/session-bridge.ts`, seed the watcher's seen-state from storage at start (`lastSeen` initialized from `readAllSessionBlobs()` before the first scan) so only blobs written or rotated during the module session are reported. Verify: `cd frontend && bun test src/lib/telegram/session-bridge.test.ts` passes unchanged (its scenarios all write after start).

- [x] 2.2 Extend `frontend/src/lib/telegram/session-bridge.test.ts` with the session boundary: a blob already present before the watcher starts is not reported; a change to such a blob during the session is reported (rotation); a login written after start is reported. Verify: `cd frontend && bun test src/lib/telegram/session-bridge.test.ts` passes including the new cases.

## 3. Verify the whole change

- [x] 3.1 Run `cd frontend && bun test src/` and `bunx tsc --noEmit` — all unit tests pass (previous count plus the new ones) and tsc reports no new errors (the pre-existing `task-detail-view.tsx` TS2589 aside). Verify both commands' output.

- [x] 3.2 Run `./node_modules/.bin/biome check` on the touched files (`src/components/telegram/`, `src/lib/telegram/session-bridge.ts`, `src/lib/telegram/session-bridge.test.ts`, `messages/`) — no format or lint diffs. Verify the command output.

- [x] 3.3 Manual smoke on the dev servers (`cd frontend && bun run dev`, backend on :3001): sign in as a fresh viewer with no linked accounts (`employee@mes.local`), open the Telegram module — the embedded client's own login screen appears with no click; complete a login and confirm the account appears in the list, survives a reload, and that no other viewer's accounts were absorbed. Record the observed states as the verification.

  Recorded (Playwright, one browser context, 2026-11-22):
  - super.admin@mes.local opens the module → iframe at the stable slot `915401048`, no hint; both of the admin's `account<N>` blobs hydrated into the origin's storage.
  - Cookies cleared (same browser), then employee@mes.local opens the module → iframe at a linking slot (`1543928542`, inside the reserved 1.5B–1.8B range), the `linkHint` shown, no button; the iframe's own content is telegram-tt's login screen ("Log in to Telegram by QR Code…").
  - After 8s of watcher polling: still only the admin's two blobs in storage, employee still at a linking slot, and the DB still shows zero `telegram_accounts` rows for the employee — no absorption of the previous viewer's sessions.
  - A completed Telegram login (phone/OTP or QR) could not be exercised by the agent: it requires a real Telegram credential in the browser. Everything up to and including the client's own login screen is verified above; the capture path from a completed login is covered by the unit tests (controller `captureSession`, bridge watcher, and the change's render tests).

## Workflow follow-up

- After review: `openspec archive change-own-email-and-password -y` is the pending archive from the previous change (unrelated), then archive this change the same way once applied and verified.
- Follow-up (separate change): on sign-out, clear `account<N>` blobs the viewer does not own from the browser (storage hygiene for shared machines) — see design.md Open Questions.
- Commit `frontend/AGENTS.md` with the work when `next dev` has rewritten its managed block, per that file's own instruction.