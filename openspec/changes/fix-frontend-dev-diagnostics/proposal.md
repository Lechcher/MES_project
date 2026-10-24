# Proposal

## Why

Running `bun run dev` in `frontend/` still reports three defects even after the
project-root fix landed: the dev server blocks cross-origin requests to its own
hot-reload resource from the advertised network address, every authenticated
screen fails the framework's instant-navigation validation with a "dropped
segment" error, and the account menu renders a `<button>` nested inside a
`<button>`, which raises a React hydration error. All three are development-time
defects, but they mask real regressions in the app's Cache Components and
Partial Prefetching setup, and the nested button is invalid HTML regardless of
environment.

This change supersedes `fix-frontend-dev-errors` (4 of 13 tasks complete,
blocked on the instant-navigation approach). That change's completed work — the
declared project root and its documentation — is already in the tree and is
carried forward here.

## What Changes

- Allow the development server's own network address to request its dev-only
  resources, removing the "Blocked cross-origin request to `/_next/hmr`"
  diagnostic and letting hot reload work when the app is opened through the
  advertised network URL.
- Declare each authenticated screen's route segment as allowed to block
  navigation, at the **page** level rather than the layout. The viewer is
  resolved in the browser from `/api/mes/session`, so no prerendered shell can
  hold the screen's content and the framework's validation has nothing to
  render. Every page becomes a thin Server Component carrying the declaration
  and delegating its body to a client view component — the views hold the
  existing code verbatim.
- Compose the account-menu trigger with Base UI's `render` prop instead of
  nesting a `Button` inside the trigger, so the shell renders a single
  interactive element and hydrates cleanly.
- Keep the existing project-root declaration and its documentation, and keep the
  layout-level declaration, which covers a different validation check than the
  page-level ones.
- No breaking changes. No user-visible behavior change beyond valid markup;
  the three defects are development-time.

## Capabilities

### New Capabilities

- `frontend/project-configuration`: how the frontend declares where its project
  root is and which origins may request its development server.
- `frontend/authenticated-shell`: how the authenticated shell declares that a
  navigation into it may block, and how it composes interactive elements.

Both are new because neither is deployed yet: `openspec/specs/` holds only six
`frontend/*` capabilities. The paused change introduced the same two capability
names as deltas; this change carries the same names because it supersedes that
one and must leave the repository in a fully specified state.

### Modified Capabilities

None. `frontend/app-shell` would be the natural long-term home for the shell
requirements, but the unarchived `implement-mes-prototype` change rewrites that
capability (modifying the top-navigation and dashboard requirements, removing
demo sign-in). A `MODIFIED` delta written against today's deployed text would
misapply once that change is archived, in either order. Reconciling is
deliberate follow-up work.

## Impact

- `frontend/next.config.ts` — development origin allowlist.
- `frontend/src/app/(app)/layout.tsx` — the layout-level blocking declaration
  stays; its comment is corrected to describe what it actually covers.
- Ten `frontend/src/app/(app)/**/page.tsx` files become thin Server Components;
  their bodies move verbatim into ten new client view components under
  `frontend/src/components/`.
- `frontend/src/components/shell/app-nav.tsx` — account-menu trigger
  composition.
- `docs/DEVELOPMENT.md` — the development-origin note.
- No API, database, dependency, or backend change. Dev diagnostics and shell
  markup only.
