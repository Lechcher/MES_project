# Tasks

## 1. Workspace fix

- [x] 1.1 In `frontend/src/components/telegram/telegram-workspace.tsx`, extract the default-selection rule into an exported pure `defaultAccountId(accounts: TelegramAccountEntry[]): string | null` (beside `workspaceView`): the first account that does not need a re-link, else the first account, else `null`; the auto-select effect uses it, so a viewer whose only account is dead gets that account selected. Update the file's doc comments where they describe the selection. Verify: `cd frontend && bunx tsc --noEmit` reports no new errors and `./node_modules/.bin/biome check src/components/telegram/telegram-workspace.tsx` is clean.

- [x] 1.2 In `frontend/src/components/telegram/telegram-workspace.test.tsx`, change the third test (currently pinning the adjacent gap) to pin the fixed behavior: a lone `needsRelink` account, selected as the effect would (`controller.selectAccount(...)`), renders the re-link hint and mounts the client frame at a linking slot (the slot the controller allocated, inside the reserved linking range); and add a `defaultAccountId` describe block: empty list → `null`; lone dead → that account; mixed [dead, live] → the live one; all-live → the first. Verify: `cd frontend && bun test src/components/telegram/` passes, including both files' existing tests.

## 2. Test-harness repair

- [x] 2.1 In `frontend/tests/global-setup.ts`, annotate the `globalSetup` parameter (`config: FullConfig`, importing the type from `@playwright/test`) to clear the pre-existing TS7006 at line 13. Verify: `cd frontend && bunx tsc --noEmit` no longer reports `tests/global-setup.ts(13,43): error TS7006`.

## 3. Verification

- [x] 3.1 Run `cd frontend && bun test src/` (all unit tests pass — the previous count plus the new ones) and `bunx tsc --noEmit` (only the pre-existing `task-detail-view.tsx` TS2589 remains). Verify both commands' output.

- [x] 3.2 Run `./node_modules/.bin/biome check` on the touched files (`src/components/telegram/`, `tests/global-setup.ts`) — no format or lint diffs. Verify the command output.

- [x] 3.3 Manual smoke on the dev servers (backend on :3001 with `MES_DATABASE_URL` for the pod's postgres): insert a temporary dead row for `employee@mes.local` into `telegram_accounts` (no session columns, `web_slot` NULL — a viewer whose only account cannot restore), sign in as the employee, open the Telegram module, and record: the re-link hint is shown, the iframe mounts at a linking slot whose content is telegram-tt's own login screen, and no capture lands against the admin's blobs; then delete the temporary row. Verify the recorded observations (a completed Telegram login itself still needs a real credential and is covered by the unit tests, as in the previous change).

  Recorded (Playwright against the running dev servers, 2026-11-22):
  - A temporary dead row (`smoke-dead-relink-1`, no session columns, `web_slot` NULL) was inserted for `employee@mes.local`, giving the viewer exactly one account that cannot restore.
  - Signed in as the employee and opened `/telegram`: the re-link hint is shown ("session needs a sign-in again…"), the iframe mounts at `/telegram-web/index.html?account=1618683422` — inside the reserved linking range (1.5B–1.8B) — and the iframe's own content is telegram-tt's login screen ("Log in to Telegram by QR Code…"). Before this change the module rendered an empty box here.
  - After 6s of watcher polling: no `account<N>` blobs in the browser's storage, and the row still carries no session material — nothing is captured until a real login completes (which needs a Telegram credential and is covered by the unit tests, as in the previous change).
  - The temporary row was deleted afterwards; the database is back to its prior state (super admin's two accounts, employee with none).