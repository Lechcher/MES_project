# Proposal

## Why

`bun run dev` in `frontend/` currently reports three problems at once: Next.js
cannot decide the workspace root because the repository holds two `bun.lock`
files, the authenticated Home Page Dashboard fails instant-navigation
validation, and the account menu renders a `<button>` inside a `<button>`, which
raises a React hydration error. Each has a fix the framework documents, and
leaving them makes the dev console noisy exactly while the app is being migrated
onto Cache Components, Turbopack, and Partial Prefetching — the noise hides real
regressions in that migration.

## What Changes

- Declare the Next.js project root as the `frontend/` app directory for both
  module resolution (`turbopack.root`) and output tracing
  (`outputFileTracingRoot`), removing the "Next.js inferred your workspace root"
  warning from `next dev`, `next build`, and `next start`.
- Declare the authenticated route segment tree as allowed to block navigation
  (`export const instant = false`), because the viewer is resolved in the browser
  from `/api/mes/session`; this removes the instant-navigation validation error
  and states the app shell's real navigation behavior.
- Compose the account-menu trigger with Base UI's `render` prop instead of
  nesting a `Button` inside the trigger, so the shell renders a single
  interactive element and the hydration error disappears.
- No breaking changes. No user-visible behavior change other than valid markup;
  the two diagnostics are development-time only.

## Capabilities

### New Capabilities

- `frontend/project-configuration`: where the Next.js app declares its project
  root, and what the dev server and build may infer from the repository layout.
- `frontend/authenticated-shell`: how the authenticated shell declares that a
  navigation into it may block, and how it composes interactive elements.

### Modified Capabilities

None. `frontend/app-shell` is the natural long-term home for the shell
requirements, but the unarchived `implement-mes-prototype` change already
rewrites that capability (it modifies the top-navigation and dashboard
requirements and removes the demo sign-in requirement). A `MODIFIED` delta
written against today's deployed text would fail or misapply once that change is
archived, in either archive order, so the requirements are introduced as a new
capability instead. Reconciling them into `frontend/app-shell` after
`implement-mes-prototype` is archived is deliberate follow-up work, not an
oversight.

## Impact

- `frontend/next.config.ts` — project root declaration.
- `frontend/src/app/(app)/layout.tsx` — route-segment declaration.
- `frontend/src/components/shell/app-nav.tsx` — account-menu trigger composition.
- No API, database, dependency, or schema change. No backend impact.
- Affects the developer experience of `bun run dev` / `bun run build` and the
  validity of the rendered shell markup.
