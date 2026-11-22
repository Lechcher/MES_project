# Design

## Context

The embedded client (telegram-tt, vendored at `frontend/public/telegram-web/`, rebuilt
from the source clone `sample/telegram-tt` by `frontend/scripts/vendor-telegram-web.sh`)
chooses its theme at boot from the Telegram account's shared settings
(`shouldUseSystemTheme` + account `theme`, `src/global/actions/ui/initial.ts`) and
re-applies it through the `switchTheme` in `util/switchTheme.ts` whenever those settings
change. It reads no URL parameter and listens for no parent messages, so nothing in MES
can currently influence it: the module always paints in the account's own theme.

Constraints that shape the approach:

- The iframe is same-origin (`/telegram-web/`) and unsandboxed, so MES can post
  messages and read the frame's window directly — no bridging server is possible or
  needed.
- The frame is `key`ed by slot in `client-frame.tsx`; a `src` change reloads it, so a
  live theme change MUST NOT come through the iframe `src`.
- The client's account switcher builds its URLs by cloning `location.href`
  (`getAccountSlotUrl`), so any URL parameter MES adds is preserved inside the client's
  own navigation.
- The vendored bundle is a committed 16 MB build artifact; refreshing it requires the
  clone and the client's build toolchain. A change to the clone that is not recorded in
  this repository is lost on the next fresh clone.
- Upstream's own AGENTS.md records local changes in `NOTICE.md`; MES records third-party
  deviations in NOTICES.md.

## Goals / Non-Goals

**Goals:**

- The client's first paint matches the MES resolved theme, with no light flash.
- A MES theme change applies in place — no remount, no reconnect, no lost position.
- The override never persists to the viewer's Telegram account, so the account's theme
  elsewhere is untouched.
- The deviation from upstream telegram-tt is small, recorded in this repository, and
  re-applied automatically when the vendored build is refreshed.

**Non-Goals:**

- Two-way sync: a theme change made inside the client's own settings is a divergence
  the next MES theme event overwrites; the client's settings picker is out of scope.
- Per-chat wallpapers, bubble colors, and other account-level appearance settings —
  those belong to the Telegram account, not the MES shell theme.
- Theme changes while the client is in its half-finished login flow (the relink slot)
  — the same bridge applies; no special handling.
- Any backend, GraphQL, database, or i18n change.

## Decisions

### 1. Patch the source clone, keep the patch in this repository, then re-vendor

The clone carries a small patch (new module + two call sites, below). This repository
holds the same patch as a tracked file (`frontend/scripts/telegram-tt-patches/`), and
`vendor-telegram-web.sh` applies the tracked patch files to the clone before building.
The rebuilt bundle carries the deviation; NOTICES.md records it.

*Why not MES-only DOM poking from the parent*: the client applies its colors as inline
CSS custom properties from a JS table (`themes.json`), so MES would have to duplicate
that table and fight the client's boot `switchTheme` — it breaks on every version bump.

*Why not prefill the client's cached shared settings*: the cache is per-slot, its format
is an internal detail, and a change would not apply live.

*Why not hand-edit the built bundle*: `vendor` copies with `rsync --delete`; hand edits
die on the next refresh, and patching minified output is unverifiable.

### 2. Upstream patch: `theme` URL parameter at boot, `postMessage` for live changes

The boot path (`init` in `src/global/actions/ui/initial.ts`) resolves the theme from
the `theme` URL parameter when present and falls back to the existing account/system
resolution otherwise. A new module `src/util/parentTheme.ts` holds:

- the override (module state, not global state — nothing persists anywhere);
- a `message` listener that accepts only `{ source: 'mes', type: 'theme', theme }` with
  a valid `light`/`dark` theme and ignores every other message;
- the hook the shared-settings action uses to re-assert the override after every
  `switchTheme`, so a late websync of the account settings cannot revert it.

The listener applies the theme through the client's existing shared-settings update
action, not a direct style write: `switchTheme` then runs unchanged, with its
animation, message-color snapping, and browser theme-color meta all handled by existing
code.

*Why the URL parameter at all, if postMessage exists*: the frame's first navigation
carries the theme, so the first paint is already correct — a postMessage-only boot
races the client's own boot (`theme` applied before the listener registers is lost) and
can paint a light frame first.

*Why postMessage for changes*: changing `src` reloads the frame; the parameter alone
cannot deliver a live change.

### 3. MES side: the theme rides the existing `useThemeChoice`, re-posted on every mount

The workspace reads the resolved theme from `useThemeChoice()` (the provider already
resolves `system` against the OS). `ClientFrame` builds its URL once per mount —
`key={slot}` remount is the reload point, so a slot switch always boots with the
current theme, while a theme change alone never touches `src`.

A new `frontend/src/lib/telegram/theme-sync.ts` holds the MES side of the bridge:

- post the resolved theme to the mounted frame with `postMessage(..., location.origin)`;
- re-post on the frame's `load` event, covering the boot race where MES posts before
  the client's listener exists (and any client-initiated reload of its own);
- the frame opts in with a stable selector (`data-telegram-frame`) so the bridge never
  reaches into frames it does not own.

Unit tests follow the existing `session-bridge.test.ts`/`provider.test.ts` patterns:
payload shape, re-post on load, and no cross-frame leakage.

## Risks / Trade-offs

- **[telegram-tt version bump breaks the patch]** → the patch is small and surgical (one
  new file, two one-line call sites); the vendor script applies it with `git apply` and
  aborts loudly on conflict rather than shipping an unpatched build. NOTICES.md points
  maintainers at the patch directory.
- **[Account settings sync reverts the override]** → the override is re-asserted after
  every `switchTheme` call in the upstream patch, so the embedded presentation always
  wins while the frame is open. A fresh boot re-reads the URL parameter.
- **[Message lost before the client boots]** → double coverage: the URL parameter fixes
  the first paint, the load-event re-post fixes everything after.
- **[The 16 MB committed bundle is regenerated]** → expected; hashes change but the
  build flow is unchanged. Rollback is reverting the commit — no database, API, or
  migration is involved.
- **[Theme-sensitive account appearance (chat wallpaper) is outside the override]** →
  documented as a non-goal; the account's own appearance settings keep their meaning.

## Migration Plan

1. Land the tracked patch in `frontend/scripts/telegram-tt-patches/` and wire
   `vendor-telegram-web.sh` to apply it before the build.
2. Apply the patch to the clone, rebuild, re-vendor (`bun run vendor:telegram-web`),
   and record the deviation in NOTICES.md.
3. Land the MES bridge, tests, and docs (docs/telegram_multiacc.md, DEVELOPMENT.md §15).

No data migration; rollback is a plain revert of the landing commit.