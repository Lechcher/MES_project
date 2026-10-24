# Tasks

## 1. Dependency Update

- [x] 1.1 Bump `next` in `frontend/package.json` from `16.4.0` to `16.4.3` — verify `package.json` shows `16.4.3`
- [x] 1.2 Run `cd frontend && bun install` to regenerate `bun.lockb` — verify install completes without errors and lockfile reflects `next@16.4.3`

## 2. Verification

- [x] 2.1 Run `cd frontend && bun run build` — verify production build succeeds with no Next.js-related errors
- [x] 2.2 Run `cd frontend && bun run dev` briefly and confirm dev server starts — verify `next dev` launches without crashes

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result.
