# Tasks

## 1. Session construction (the root-cause fix)

- [x] 1.1 In `frontend/src/lib/telegram/gramjs.ts`, export `linkingSession()` returning a fresh `new StringSession("")` (imported from `telegram/sessions`) and make `createTelegramClient` build its restore client from `new StringSession(account.sessionString)` instead of the raw string. (Verify: `bunx tsc --noEmit` in `frontend/` stays clean; both sites visibly go through the one module.)
- [x] 1.2 Update `frontend/src/components/telegram/add-account-dialog.tsx` to build its linking client through `linkingSession()` instead of `new TelegramClient("", …)`, keeping the dynamic `import("telegram")` for the client itself. (Verify: the dialog no longer constructs a session inline; typecheck clean.)
- [x] 1.3 Add unit tests pinning the construction rule: a restore client's session round-trips the stored string (`save()` returns it), `linkingSession()` is an empty `StringSession`, and a restore attempt for an account with no stored session fails with the existing actionable error. (Verify: `cd frontend && bun test src/lib/telegram/` passes, including the new file.)

## 2. QR + 2FA refusal in the viewer's language

- [x] 2.1 Map the QR flow's `2FA_PASSWORD_REQUIRED` sentinel to the existing `telegram.link.twoFaDuringQr` message in the add-account dialog, so the refusal names the phone flow instead of showing a raw error string. (Verify: a test or a manual dialog run shows the localized message; the sentinel itself stays asserted in `link.test.ts`.)

- [x] 2.2 Drive the 2FA check explicitly instead of through GramJS's `signInWithPassword` (added when the live drill hit `AUTH_USER_CANCEL` with a correct cloud password): `Api.account.GetPassword` → `computeCheck` (from `telegram/password`) → `Api.auth.CheckPassword`, with the step function injected for tests. A wrong cloud password now raises `PASSWORD_HASH_INVALID` — mapped by the new `isWrongCloudPassword` to the localized `wrongPassword` message — instead of the wrapper's retry loop turning every failure into `AUTH_USER_CANCEL`. (Verify: `link.test.ts` covers the wrong-password rejection (real error, no `AUTH_USER_CANCEL`), the correct-password completion, and the mapping helper's three cases; frontend suite 366/366, biome + tsc clean.)

## 3. Verification and closeout

- [x] 3.1 Re-run the full unit suites green — `cd backend && bun test` (unchanged, but confirms no regression) and `cd frontend && bun test src/` — plus `bunx biome check` on touched files. (Verify: both suites pass; remaining findings, if any, are pre-existing and listed.)
- [ ] 3.2 Manual smoke test, env-gated with the deployment's own credentials and a real test account (drill in `docs/DEVELOPMENT.md` §15): link an account by phone + OTP, **reload the module and confirm the account reconnects with its chat list loaded** (the restore half of the fix), link a second account by QR, send a text message and one file, revoke one session from Telegram and watch it go disconnected while the other keeps working, then remove one account. If the test account has 2FA, confirm the QR attempt shows the localized refusal and the phone flow still links it. (Verify: the drill passes end-to-end; record the Telegram identities used in the change's tasks as a completion note.)
- [x] 3.3 `openspec validate fix-telegram-account-linking --strict` passes. (Verify: validation is clean.)

## Workflow follow-up

- Archive `add-telegram-multi-account-client` first, then
  `openspec archive fix-telegram-account-linking --yes`, so this delta lands on
  a capability that exists in the main specs.
- Commit per repo rules (Conventional Commits, `Co-authored-by: AI Agent <agent@local>` trailer, direct to `main`), keeping user WIP out of the commit — the user commits unless they ask otherwise.