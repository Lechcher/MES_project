# Tasks

## 1. Declare the frontend project root

- [x] 1.1 Set the project root in `frontend/next.config.ts` to the application
      directory by giving both `turbopack.root` and `outputFileTracingRoot` the
      same absolute path, and verify `cd frontend && bunx tsc --noEmit` passes
      with the config type-checked (both are valid `NextConfig` fields, and
      Next.js warns if they disagree)
- [x] 1.2 Verify the development server starts clean: run
      `cd frontend && bun run dev` and confirm the output reports the server is
      ready and contains no "inferred your workspace root" or "multiple
      lockfiles" line, then confirm
      `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/signin`
      returns `200`
- [x] 1.3 Verify the build and start paths are clean too: run
      `cd frontend && bun run build` and then `bun run start`, and confirm neither
      reports an inferred-workspace-root warning while the build lists the
      expected routes
- [x] 1.4 Document in `docs/DEVELOPMENT.md` (§6, where the applications are run)
      why the frontend declares its own project root and that the repository's
      second lockfile is what makes the inference ambiguous; verify the note names
      the application directory as the root and states that the warning returns if
      the declaration is removed

## 2. Declare blocking navigation for the authenticated tree

- [ ] 2.1 Add the blocking-navigation declaration to
      `frontend/src/app/(app)/layout.tsx`, and verify the file stays a Server
      Component with no `"use client"` directive (the declaration is invalid in a
      Client Component) and that `cd frontend && bunx tsc --noEmit` passes
- [ ] 2.2 Verify the development server reports no dropped-segment or
      navigation-instantness failure for the authenticated tree: run
      `cd frontend && bun run dev`, sign in, open `/`, and confirm the dashboard
      renders and the error naming `frontend/src/app/(app)/page.tsx` no longer
      appears in the server output
- [ ] 2.3 Verify the public screens are not covered by the declaration: with the
      dev server running, open `/signin` and `/reset-password` and confirm each
      renders its own content immediately with no session-loading state
- [ ] 2.4 Verify navigation between authenticated screens still renders: signed
      in, move between the dashboard and at least two app screens and confirm each
      destination shows the viewer's content

## 3. Compose the account menu trigger as a single interactive element

- [ ] 3.1 Give `DropdownMenuTrigger` in
      `frontend/src/components/shell/app-nav.tsx` its `Button` element through the
      trigger's `render` prop, keeping the name and role spans as the trigger's
      children, and verify `cd frontend && bunx tsc --noEmit` passes
- [ ] 3.2 Verify in the browser that the shell hydrates cleanly: with the dev
      server running and signed in, confirm the console reports no "cannot be a
      descendant of" / nested-interactive-element error, and that activating the
      account menu opens it showing the viewer's details and sign-out

## 4. Integration checks

- [ ] 4.1 Run the full frontend suite —
      `cd frontend && bun test && bunx tsc --noEmit && bunx biome check && bun run build`
      — and confirm every command succeeds and the build lists `/`, `/signin`, and
      `/reset-password` among its routes
- [ ] 4.2 Confirm one dev-server session is clean across the shell: start the dev
      server, sign in, visit the dashboard and every app screen, and confirm none
      of the three reported diagnostics (inferred workspace root, dropped
      segment / navigation instantness, nested interactive element) appears in the
      output or the browser console
- [ ] 4.3 Confirm the change touched nothing else: verify `git status --short`
      lists changes only under `frontend/` and `docs/`, with no file under
      `backend/` modified

## Workflow follow-up

- Archive the change once the project's review requirements are satisfied.
- Reconcile these shell requirements into `frontend/app-shell` after
  `implement-mes-prototype` is archived, per `design.md` — Open Questions.
