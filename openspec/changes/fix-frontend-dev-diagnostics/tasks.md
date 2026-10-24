# Tasks

## 1. Confirm the carried-forward work

- [x] 1.1 Verify the project-root declaration is still in `frontend/next.config.ts`
      with both `outputFileTracingRoot` and `turbopack.root` set to the same
      absolute application-directory path, and that the note exists in
      `docs/DEVELOPMENT.md` §6; verify by running `cd frontend && bunx tsc --noEmit`
      and reading both files
- [x] 1.2 Verify the layout-level `instant = false` in
      `frontend/src/app/(app)/layout.tsx` is still present, and correct its comment
      so it states that it covers the static-shell check for the authenticated
      tree rather than the dropped-segment check; verify with
      `cd frontend && bunx tsc --noEmit` and by reading the file

## 2. Allow the development server's own network origin

- [x] 2.1 Determine the hostname the development server advertises: run
      `cd frontend && bun run dev`, read the `Network:` line from its output, and
      record the hostname with no scheme and no port
- [x] 2.2 Add `allowedDevOrigins` to `frontend/next.config.ts` containing that
      hostname, and verify `cd frontend && bunx tsc --noEmit` passes (the field is
      type-checked against `NextConfig`) and `bunx biome check next.config.ts`
      reports no findings
- [x] 2.3 Verify the diagnostic is gone: with the dev server running, request a
      dev-only resource with an `Origin` header set to the advertised network
      hostname and confirm it is served, and confirm the server output contains no
      `Blocked cross-origin request` line
- [x] 2.4 Document the allowed development origin in `docs/DEVELOPMENT.md` §6 —
      what the entry is for, that it carries no scheme or port, and that the
      advertised `Network:` hostname must match it; verify by re-reading the
      section and confirming the documented hostname matches the entry

## 3. Declare blocking navigation on each authenticated screen

- [x] 3.1 Split `frontend/src/app/(app)/page.tsx` — move its body verbatim into a
      new client component and leave a Server Component page that exports
      `instant = false` and renders it; verify `cd frontend && bunx tsc --noEmit`
      passes, `bunx biome check src` is clean, and the dev server reports no
      dropped-segment error for `/`
- [x] 3.2 Split the four Jobs screens — `jobs/page.tsx`, `jobs/new/page.tsx`,
      `jobs/quick-add/page.tsx`, `jobs/tasks/[id]/page.tsx` — following the same
      pattern, with the views under `src/components/jobs/`; verify tsc and Biome
      pass, and the dev server reports no dropped-segment error for `/jobs`,
      `/jobs/new`, `/jobs/quick-add`, or `/jobs/tasks/<id>`
- [x] 3.3 Split the two Planning screens — `planning/page.tsx` and
      `planning/leave/new/page.tsx` — with the views under
      `src/components/planning/`; verify tsc and Biome pass, and the dev server
      reports no dropped-segment error for `/planning` and `/planning/leave/new`
- [x] 3.4 Split `performance/page.tsx`, `settings/page.tsx`, and
      `audit-log/page.tsx` into views under `src/components/performance/`,
      `src/components/settings/`, and `src/components/audit-log/`; verify tsc and
      Biome pass, and the dev server reports no dropped-segment error for
      `/performance`, `/settings`, and `/audit-log`
- [x] 3.5 Verify the split preserved every screen: signed in, open all nine
      authenticated routes plus the dashboard and confirm each renders its content
      with no missing or duplicated region, and that the viewer's name, role, and
      department still appear in the shell

## 4. Compose the account menu trigger as a single interactive element

- [x] 4.1 Give `DropdownMenuTrigger` in `frontend/src/components/shell/app-nav.tsx`
      its `Button` element through the trigger's `render` prop, keeping the name
      and role spans as the trigger's children; verify
      `cd frontend && bunx tsc --noEmit` passes and `bunx biome check src` is clean
- [x] 4.2 Verify in a browser, signed in, that the console reports no
      "cannot be a descendant of" / nested-interactive-element error, and that
      activating the account menu opens it showing the viewer's details and
      sign-out, and that sign-out from the menu ends the session

## 5. Integration checks

- [x] 5.1 Run the full frontend suite —
      `cd frontend && bun test && bunx tsc --noEmit && bunx biome check && bun run build`
      — and confirm every command succeeds and the build lists `/`, `/signin`,
      `/reset-password`, and every authenticated route
- [x] 5.2 Confirm one dev-server session is clean across the shell: start the dev
      server, sign in, visit the dashboard and every authenticated screen, and
      confirm none of the three reported diagnostics (blocked cross-origin request,
      dropped segment, nested interactive element) appears in the output or the
      browser console
- [x] 5.3 Confirm the change touched nothing else: verify `git status --short`
      lists changes only under `frontend/` and `docs/`, with no file under
      `backend/` modified

## Workflow follow-up

- Archive the change once the project's review requirements are satisfied.
- Do not archive `fix-frontend-dev-errors`: it is superseded, and archiving it
  after this change would add the same capability paths twice.
- Reconcile these shell requirements into `frontend/app-shell` once
  `implement-mes-prototype` is archived, per `design.md` — Open Questions.
