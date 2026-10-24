# Design

## Context

See `proposal.md` — Why. Current state that shapes the approach:

- `frontend/` is a self-contained Next.js 16 app: its own `package.json`,
  `bun.lock`, `node_modules`, `tsconfig.json`, and `next.config.ts`. Nothing
  under `src/` imports a module from above that directory. The repository root
  holds a second, tracked `bun.lock` that backs root-level Biome tooling, which
  is what makes the layout look like an ambiguous workspace.
- Next.js infers the project root by walking up from the app directory looking
  for lockfiles and workspace markers, keeps the outermost candidate, and warns
  when it finds more than one (`next/dist/lib/find-root.js`). The key it tells
  you to set depends on the subsystem: the Turbopack dev server names
  `turbopack.root`, the build/start path names `outputFileTracingRoot`.
- Next.js transpiles `next.config.ts` to CommonJS and executes it with
  `requireFromString` (`next/dist/build/next-config-ts/transpile-config.js`), so
  module-scope `__dirname` is available inside the config. The native-ESM path
  is only taken when `--experimental-next-config-strip-types` is passed.
- Cache Components is enabled, so the dev server validates every Page and
  Default segment for navigation instantness and for a non-empty static shell.
  Every page under `src/app/(app)/` is a Client Component, and the shell resolves
  the viewer in the browser from `/api/mes/session`; the home page returns `null`
  until a viewer exists, so its segment renders nothing and the dev server
  reports that the segment was dropped from rendering.
- `instant` is a route-segment export that cannot be used in Client Components
  (`instant` docs), so a declaration for the authenticated tree can only live on
  the sole Server Component in it: `src/app/(app)/layout.tsx`.
- The account menu nests `Button` inside the menu trigger primitive, so the DOM
  contains a `<button>` inside a `<button>`. This codebase composes such triggers
  with the Base UI `render` prop instead — see `components/ui/dialog.tsx`,
  `select.tsx`, `pagination.tsx`, and the app pages that render `Link` through it.

## Goals / Non-Goals

**Goals:**

- Remove the two development-server diagnostics — and the equivalent
  build/start warning — by declaring the application's intent, not by muting
  output.
- Render valid shell markup so browser hydration is clean.
- Keep each declaration as narrow as the problem it solves: the root covers the
  application directory, and the blocking declaration covers only the
  authenticated tree.

**Non-Goals:**

- Making authenticated navigation instant. That needs the viewer resolved before
  the response is sent (server-side session reads), which is a separate
  architectural change and not what these diagnostics are asking for.
- Removing either lockfile. The root one backs root-level tooling; the app one
  pins the app's dependency graph.
- Reorganizing specs, or folding these requirements into `frontend/app-shell`.
  That is deferred until the in-flight `implement-mes-prototype` change is
  archived (see `proposal.md` — Modified Capabilities).

## Decisions

### 1. Declare the project root as the application directory, in both keys

Set the project root to the `frontend/` directory, and set both
`turbopack.root` and `outputFileTracingRoot` to it.

- **Why both keys:** Next.js reads `rootDir = outputFileTracingRoot ||
  turbopack.root` and skips inference and the warning entirely once either is set
  (`next/dist/server/config.js`). It warns if both are set to different values,
  and the two cover different subsystems — Turbopack's module resolution and
  watching versus output tracing — so pinning both to the same directory keeps
  every subsystem on the same answer and works whether `TURBOPACK` is set.
- **Why the application directory rather than the repository root:** nothing in
  the app resolves above it, and the docs warn that widening the root increases
  filesystem watching and resolution work. Pointing at the repository root would
  silence the warning while making Turbopack watch `backend/` for no benefit.
- **Alternatives rejected:** deleting `frontend/bun.lock` (discards the app's
  pinned dependency graph); deleting the root `bun.lock` (breaks root-level Biome
  tooling); passing a relative path (the option expects an absolute one).
- **Path expression:** `__dirname` is safe because the config is executed as
  CommonJS.

### 2. Declare the authenticated tree as allowed to block, on the `(app)` layout

Add the blocking-navigation declaration to `src/app/(app)/layout.tsx`.

- **Why here:** it is the highest Server Component in that route tree, and the
  declaration throws in Client Components, so it is also the only place it can
  go. Scoping it to `(app)` leaves the public screens validated.
- **Why declare rather than render:** the error offers "render the dropped
  segment" or "opt out". The viewer is resolved in the browser by design (the BFF
  keeps the session token in an httpOnly cookie and `/api/mes/session` returns
  the viewer), so authenticated content genuinely cannot exist in a prerendered
  shell. Declaring that these navigations may block states the app's real
  behavior instead of pretending it is instant.
- **Alternatives rejected:** giving the home page a non-empty viewer-independent
  shell (the shell is viewer-dependent and shared by every page, so this would
  restructure the whole authenticated surface to satisfy a diagnostic); switching
  the framework's validation level to only validate opted-in segments (broader
  than needed, and it would also drop validation for the public screens); putting
  the declaration on the root layout (the docs say to place it as low as
  possible).

### 3. Compose the account-menu trigger with the primitive's `render` prop

Pass the `Button` element to the trigger's `render` prop and keep the trigger's
children inside it.

- **Why:** the trigger replaces its own element with the given element instead of
  wrapping it, so exactly one `<button>` reaches the DOM, while the trigger keeps
  ownership of the open/close behavior, ARIA attributes, and event handlers. It
  also matches how this codebase already composes primitives with `Button` and
  `Link`.
- **Alternatives rejected:** styling a bare trigger element with the button's
  class variants (duplicates the button's styling contract and drifts from it);
  marking the trigger as a non-native button (does not remove the nesting).

## Risks / Trade-offs

- [The blocking declaration suppresses future navigation-instantness findings
  for authenticated screens] → Accepted and stated in the proposal as a
  deliberate trade-off. The public screens stay validated, and making
  authenticated navigation instant belongs to a separate change.
- [Declaring the root as the application directory would break resolution if the
  app later imports a shared package from above it] → The declaration is a
  one-line change to revisit; the assumption is recorded here and in the spec, so
  a future shared package must widen it.
- [A nested-interactive-element defect is invisible to the automated suite,
  because it only appears during browser hydration] → Verify by loading an
  authenticated screen against the dev server and confirming the console reports
  no nesting error. The composition used is already proven elsewhere in the
  codebase, and type checking covers the prop shape.
- [A future edit could quietly drop the root declaration and bring the warning
  back] → The verification steps assert the dev-server output directly rather
  than relying on the absence of a build failure.

## Migration Plan

- No data, API, or dependency migration. The three edits ship together and each
  is independently revertible.
- Rollback: reverting the root declaration restores the workspace-root warning;
  reverting the trigger composition restores the hydration error; reverting the
  segment declaration restores the dropped-segment error. None of the three
  changes persisted state, so rollback needs no cleanup.

## Open Questions

- Should these shell requirements be folded back into `frontend/app-shell` once
  `implement-mes-prototype` is archived, and if so, does the repository want a
  single root lockfile so the ambiguity cannot recur? Deferrable: neither answer
  changes these specs, the approach, or the task breakdown.
