# Tasks

## 1. Patch the telegram-tt source clone

- [x] 1.1 In `sample/telegram-tt`, add `src/util/parentTheme.ts`: module-level theme override, a `message` listener accepting only `{ source: 'mes', type: 'theme', theme }` with `theme` in `light`/`dark` (all other messages ignored), a getter, and a re-assert helper — verify with `npm run check:ts` in the clone
- [x] 1.2 In `sample/telegram-tt`, read the `theme` URL parameter at boot in `src/global/actions/ui/initial.ts` (override wins over the account/system resolution when present) and apply the theme — verify with `npm run check:ts` in the clone; the logged-in-slot boot in both modes is drilled in task 4.2 once the rebuilt bundle is vendored
- [x] 1.3 In `sample/telegram-tt`, re-assert the override after every `switchTheme` in the shared-settings action path (`src/global/actions/ui/settings.ts`) so a late account-settings sync cannot revert it — verify with `npm run check:ts` in the clone; the settings-sync-triggered re-theme is drilled in task 4.2
- [x] 1.4 Confirm the client's own account switcher preserves the parameter: its URLs clone `location.href` and set or delete only `account`/`test` (`getAccountSlotUrl` in `src/util/multiaccount.ts`) — verified by reading that code (every other parameter, `theme` included, survives the clone); the logged-in switcher stays in the manual smoke test

## 2. Keep the patch tracked and wire it into the vendor flow

- [x] 2.1 Export the clone's diff into a tracked patch file under `frontend/scripts/telegram-tt-patches/` — verify `git apply --check` succeeds against a clean clone checkout
- [x] 2.2 Make `vendor-telegram-web.sh` apply the tracked patch files to the clone before building and abort loudly when a patch fails — verify by running the script and observing the patch step plus the abort path on an unapplied conflict
- [x] 2.3 Rebuild and re-vendor (`bun run vendor:telegram-web`), then verify the committed bundle carries the change (the listener and the parameter read are present in `frontend/public/telegram-web/`) and that the refresh path still excludes the same artifacts
- [x] 2.4 Record the deviation in NOTICES.md (version, the patch directory, and the behavior it adds) — verify the entry matches the vendored bundle's `version.txt`

## 3. Bridge the MES theme to the frame

- [x] 3.1 Add `frontend/src/lib/telegram/theme-sync.ts`: post the resolved theme to frames matching the module's stable selector with `postMessage(..., location.origin)`, exposed as a function reusable from the frame's mount — verify unit tests for payload shape, same-origin target, and no cross-frame targeting
- [x] 3.2 Re-post the theme on the frame's `load` event so a boot-race message is not lost — verify a unit test that a mount after a post re-sends the current theme
- [x] 3.3 Update `client-frame.tsx`: accept the resolved theme, build the URL with `?account=<slot>&theme=<light|dark>` once per mount (a theme change alone never touches `src`), tag the frame with the selector, and notify mount — verify a unit test that changing only the theme does not rebuild the src, while a slot change does
- [x] 3.4 Update `telegram-workspace.tsx` to read `useThemeChoice()` and pass the resolved theme down — verify the full frontend unit suite (`cd frontend && bun test src/`) passes

## 4. Document and drill the behavior

- [x] 4.1 Document the theme sync in `TELEGRAM_MULTI_ACCOUNT_ARCHITECTURE.md` (theme-bridge layer + URL) and the rebuild caveat in DEVELOPMENT.md §15 (the vendor flow now carries a patch; the build needs the Telegram API credentials) — `bun run vendor:telegram-web` and the documented `curl` were run as written during the drill (`docs/telegram_multiacc.md` holds the obsolete GramJS design the previous change replaced, so it was left untouched)
- [x] 4.2 Drill end to end in the running stack: an isolated Chromium context (never the user's profile) drove a same-origin harness mounting the vendored client exactly as the module does — boot `?theme=dark` paints dark on first render (`#212121`/`#0F0F0F`), a live `postMessage` re-themes in place with the frame unloaded-state kept, dark reapplies, and a URL without the parameter keeps the client's own default; the logged-in module drill (reconnect + switcher, 1.4) remains the manual smoke test in DEVELOPMENT.md §15, and the account-untouched scenario is covered by the patch writing only local state (no settings API call)

## Workflow follow-up

- Archive the change with `openspec archive sync-telegram-web-theme -y` after review, and verify the archived result lands on `core/telegram-web-client`.