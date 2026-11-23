# Proposal

## Why

The embedded Telegram Web client (telegram-tt) always paints in its own theme, chosen
from the Telegram account's own settings or the operating system preference. A viewer
who set MES to dark mode still gets a blinding white chat surface, and flipping the MES
theme does nothing to the open module — the one piece of the system that ignores the
viewer's choice. Every other module in the shell follows the MES theme; the Telegram
module is the exception.

## What Changes

- The embedded client SHALL follow the MES theme: when a viewer's resolved MES theme is
  light or dark (an explicit choice or the OS preference through `system`), the embedded
  client renders in the same theme.
- Boot-time: the iframe URL carries the resolved theme (`?account=<slot>&theme=<light|dark>`),
  so the very first paint of the client matches MES — no light flash on open.
- Live: when the viewer changes the MES theme while the module is open, the client
  re-themes in place using its own animated `switchTheme` — no iframe remount, no
  reconnect, no lost scroll position.
- The vendored telegram-tt build SHALL deviate from upstream in exactly one way: a
  `theme` URL parameter read at boot and a parent `postMessage` listener that applies
  the theme. The deviation SHALL be recorded in NOTICES.md and SHALL never change the
  client's own account settings (it is a presentation override, not persisted to the
  viewer's Telegram accounts).

## Capabilities

### New Capabilities
<!-- None: the theme behavior belongs to the existing Telegram module capability. -->

### Modified Capabilities
- `core/telegram-web-client`: add a requirement "Follow the MES light/dark theme" —
  the embedded client mirrors the MES resolved theme at first paint and follows it
  live, without persisting anything to the Telegram account.

## Impact

- `sample/telegram-tt` (upstream source clone): boot reads the `theme` URL parameter;
  a `message` listener applies the parent-posted theme through the client's existing
  `switchTheme`. Tracked as a documented local patch (upstream records local changes
  in `NOTICE.md`; MES records it in NOTICES.md).
- `frontend/scripts/vendor-telegram-web.sh`: unchanged build flow — the rebuilt bundle
  carries the deviation; the committed `frontend/public/telegram-web/` (16 MB build
  artifact) is regenerated, so its file hashes change.
- `frontend/src/lib/telegram/` (new `theme-sync.ts` + tests): the MES-side bridge —
  post the resolved theme to the mounted frame and re-post on every mount, so a
  remount or a slow client boot stays in sync.
- `frontend/src/components/telegram/client-frame.tsx` / `telegram-workspace.tsx`:
  the frame URL gains `&theme=`, and the workspace reads the theme from the existing
  `useThemeChoice()` (no new UI, no new i18n keys).
- Rebuild requirement: refreshing the vendored client now depends on the patch living
  in the clone; NOTICES.md documents it. No backend, GraphQL, or database change.