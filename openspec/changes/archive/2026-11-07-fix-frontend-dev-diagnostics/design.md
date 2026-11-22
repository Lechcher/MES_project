# Design

## Context

See `proposal.md` — Why. Current state that shapes the approach:

- The project-root declaration and its documentation are already in the tree and
  verified (no inferred-workspace-root warning appears in `next dev`,
  `next build`, or `next start`). That work is carried forward, not redone.
- Next.js walks upward from the app directory collecting lockfiles to infer the
  project root. It settles on the outermost accepted candidate and warns when it
  finds more than one (`next/dist/lib/find-root.js`). Setting
  `outputFileTracingRoot` or `turbopack.root` skips the inference and the warning
  entirely (`next/dist/server/config.js`: `rootDir = tracingRoot || turbopackRoot`,
  guarded by `if (!rootDir)`), which is why one declaration is enough.
- Separately, the dev server blocks cross-origin requests to its own dev-only
  resources. It allows `localhost`, its subdomains, and the hostname it was
  started with; the advertised network address (`127.0.2.2` in this repository's
  runs) is not in that set, so `/_next/hmr` is blocked. The docs
  (`01-app/03-api-reference/05-config/01-next-config-js/allowedDevOrigins.md`)
  prescribe `allowedDevOrigins`, matched against the `Origin` header's **hostname
  only** — entries carry no scheme and no port.
- Cache Components is enabled, so the dev server validates every Page and Default
  segment for navigation instantness and for a non-empty static shell. Reading
  `next/dist/esm/server/app-render/instant-validation/instant-validation.js`
  explains the layout-level failure precisely:

  ```js
  if (instantConfig === null && validationLevel !== 'manual-warning'
        && isImplicitValidationSegment(segment)) {
    instantConfig = true;
  }
  ```

  A page segment with no explicit `instant` is implicitly treated as
  `instant = true`, and the validation boundary is placed at the group layout,
  where only the **slot children's** config is consulted
  (`if (requiresInstantUI) boundaryState.requiredIds.set(path, …)`). A `false` on
  the layout itself is therefore never read there, which is why the
  layout-level declaration implemented earlier is inert for this error.
- The declaration is only honored on Server Component modules. Putting
  `instant = false` on `(app)/page.tsx` while it carried `"use client"` produced
  a hard build error: *"`instant` is a route segment config and can only be used
  when the segment is a Server Component module."* Replacing that page with a
  Server Component carrying the same export removed the error, which is the
  verified basis for this design.
- The segments render nothing because every `(app)` page is a Client Component
  gated by `RequireViewer`, which substitutes a skeleton until the viewer resolves
  in the browser. All ten pages already guard with `if (!viewer) return null`, so
  their bodies can move verbatim.
- The codebase's established convention is a page delegating to a
  `*-view.tsx` client component under `src/components/<module>/` (see
  `audit-log/page.tsx` → `components/audit-log/audit-log-view.tsx`). The dynamic
  route reads its id through `useParams()`, a client hook, so no prop plumbing is
  needed across the new boundary.
- The account menu nests `Button` inside `DropdownMenuTrigger`. Base UI's
  `render` prop (`BaseUIComponentProps.render`) replaces the primitive's own
  element with the supplied one rather than wrapping it; the codebase already
  uses that composition in `dialog.tsx`, `select.tsx`, `pagination.tsx`, and
  several pages.

## Goals / Non-Goals

**Goals:**

- Remove all three diagnostics from a development-server session.
- Keep the declarations as narrow as the problem: one origin entry, and one
  declaration per authenticated screen.
- Preserve every screen's rendered output and behavior exactly; the split is
  structural, not functional.
- Leave the authenticated tree's validation posture honest rather than silently
  disarmed.

**Non-Goals:**

- Making authenticated navigation instant. That needs the viewer resolved before
  the response is sent (server-side session reads), a separate architectural
  change.
- Disarming validation globally with `validationLevel: 'manual-warning'` — it
  would also drop validation from the public screens.
- Sharing the dev server on a public interface, or allowlisting anything beyond
  this machine's own advertised network address.

## Decisions

### 1. Declare the blocking navigation on each page, not the layout

Each `(app)/**/page.tsx` becomes a Server Component that exports
`instant = false` and renders the view that holds its previous body.

- **Why:** verified experimentally — the page-level declaration removes the
  dropped-segment error; the layout-level one does not, because the boundary
  reads the slot children's config and not the layout's own. The export also
  throws unless the module is a Server Component, which forces the split.
- **Why a split rather than a client page:** the export is the only segment-level
  opt-out the framework honors here, and it is rejected in client modules.
- **Why the body moves instead of being duplicated:** the pages already delegate
  to view components; moving the body verbatim keeps the diff a rename plus a
  thin wrapper and removes any chance of behavioral drift.
- **Keep the layout declaration:** the docs state that for the separate
  static-shell check, *"a `false` higher in the tree takes precedence over any
  deeper `true`"*. The layout declaration covers that check for the whole
  authenticated tree and documents that it may block. The page-level
  declarations cover the dropped-segment check. Both are needed and both are
  documented.
- **Alternatives rejected:** `validationLevel: 'manual-warning'` (would also drop
  validation from the public screens, and `/signin` is a client component so it
  could not opt back in); `unstable_disableValidation` on the object form (absent
  from `next/dist/docs`, and per the source it kills validation for the entire
  tree); making `RequireViewer` render its children so the page modules mount
  (during SSR `loading` is `true`, so the skeleton would still swallow the
  segment, and it would drop the shell's loading state).

### 2. Allow only the advertised network address

Add `allowedDevOrigins: ["127.0.2.2"]` — the hostname the dev server advertised
in both failing runs.

- **Why an exact hostname rather than a wildcard:** entries match a single label
  at a time with no partial replacement, so covering loopback addresses
  generally is not expressible; an exact entry is the narrowest thing that works.
- **Why not just use `localhost`:** that is already allowed, and the developer in
  the reported failures was using the network address.
- **Verify, don't assume:** the task reads the dev server's own advertised
  Network URL and records the hostname it prints, so a different machine
  corrects the entry rather than trusting a stale constant.

### 3. Compose the trigger with the `render` prop

Pass the `Button` element to `DropdownMenuTrigger`'s `render` prop and keep the
name and role spans as the trigger's children.

- **Why:** the trigger replaces its own `<button>` with the supplied element, so
  exactly one interactive element reaches the DOM while the trigger keeps the
  open/close behavior, ARIA state, and event handlers. It matches the
  composition already used across the codebase's primitives.
- **Alternatives rejected:** styling a bare trigger with the button's variants
  (duplicates the styling contract); marking the trigger as a non-native button
  (does not remove the nesting).

## Risks / Trade-offs

- [Ten new files and ten rewritten pages is a large mechanical diff for a
  diagnostics fix] → Each view holds the previous page body verbatim, the page
  becomes a fixed three-line wrapper, and verification greps the dev-server output
  plus curls every route for a 200.
- [The view components could drift from the pages they replaced] → The bodies move
  unchanged; only the default-export name and file location change.
- [A future page added under `(app)` will hit the same dropped-segment error if it
  forgets the declaration] → Stated in the design and in the spec's requirement;
  the pattern is now uniform across all ten screens, so it is easy to copy.
- [`127.0.2.2` is machine-specific and could change] → The task derives the entry
  from the dev server's advertised Network address at implementation time and
  documents how to update it.
- [A nested-interactive-element defect is invisible to the automated suite,
  because it only appears during browser hydration] → Verified by loading a
  signed-in session in a browser and confirming the console reports no nesting
  error; the composition used is already proven elsewhere in the codebase and
  type checking covers the prop shape.

## Migration Plan

- No data, API, or dependency migration. Each of the three fixes is independently
  revertible.
- Rollback: reverting the origin allowlist restores the cross-origin warning;
  reverting the page splits restores the dropped-segment errors; reverting the
  trigger composition restores the hydration error. None changed persisted state,
  so rollback needs no cleanup.
- The superseded `fix-frontend-dev-errors` change must not be archived after this
  one, or the two would both add the same capability paths.

## Open Questions

- Should these shell requirements be folded into `frontend/app-shell` once
  `implement-mes-prototype` is archived? Deferrable: neither answer changes these
  specs, the approach, or the task breakdown.
- Should `frontend/project-configuration` also own the backend's configuration
  surface? Not now; this change is frontend-scoped.
