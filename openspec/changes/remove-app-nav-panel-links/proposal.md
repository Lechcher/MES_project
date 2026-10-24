# Proposal

## Why

The top navigation's desktop link strip duplicates the Home Page Dashboard
launcher: it repeats Home plus the same role-gated app links (Jobs, Planning,
Performance, Settings, Audit Log) that the dashboard already renders. On narrow
desktop widths the brand, the link strip, live status, the language switcher,
and the user menu compete for one row, so the header is crowded without offering
a path the dashboard does not already provide.

## What Changes

- **BREAKING (UI)**: remove the desktop link group from the top navigation in
  `frontend/src/components/shell/app-nav.tsx` — the `Home` link and every
  role-gated app link it maps from `visibleApps`. The header keeps the brand
  link, `LiveStatusIndicator`, `LanguageSwitcher`, and the user menu (name,
  role, department, sign-out).
- Remove the now-unused `nav.home` and `apps.<code>.short` message keys from
  both `frontend/messages/en.json` and `frontend/messages/vi.json`, keeping the
  two catalogues key-identical.
- Drop the now-unused `visibleApps` import from `app-nav.tsx`; the dashboard
  launcher keeps it unchanged as the way to reach the apps.
- `visibleApps`, `MES_APPS`, and the access matrix in
  `frontend/src/lib/mes/navigation.ts` remain untouched — the change removes a
  consumer, not the navigation model.

## Capabilities

### Modified Capabilities
- `frontend/app-shell`: the top navigation no longer lists the dashboard link
  or the permitted apps; navigation to the apps moves solely onto the dashboard
  launcher.

## Impact

- **Frontend**: `frontend/src/components/shell/app-nav.tsx`,
  `frontend/messages/en.json`, `frontend/messages/vi.json`.
- **Specs**: `openspec/specs/frontend/app-shell/spec.md` — the
  "Top navigation with app switcher and user menu" requirement loses its
  listing scenarios.
- **Unaffected**: the dashboard launcher and its role gating, sign-in,
  sign-out, live updates, the language switcher, routes and access control
  (Layer-1 authorization stays server-authoritative in the API), and the
  backend.
