# Proposal

## Why

The frontend's Next.js dependency is pinned to `16.4.0` while the latest stable release is `16.4.3`. No Next.js 17.x exists. Upgrading to the latest 16.x patch release brings bug fixes, security patches, and performance improvements without breaking changes (same major version). This is the safest way to keep the frontend current.

## What Changes

- Bump `next` in `frontend/package.json` from `16.4.0` to `16.4.3`
- Run `bun install` in `frontend/` to regenerate `bun.lockb`
- Verify `bun run build` succeeds in `frontend/` after the upgrade

**BREAKING**: None (patch-level upgrade within Next.js 16.x)

## Capabilities

### New Capabilities

None — this is a tooling/dependency update with no user-visible behavior change.

### Modified Capabilities

None — no spec-level behavior changes.

## Impact

- `frontend/package.json` — `next` dependency version
- `frontend/bun.lockb` — lockfile regeneration
- Frontend build (`bun run build`) and dev server (`next dev`) — must remain functional after upgrade
