# Tasks

## 1. Edit the root layout

- [x] 1.1 Move the `<script id="mes-theme-pre-paint">` element from a child of `<html>` into a `<head>` in `frontend/src/app/layout.tsx`, keeping its comment, `biome-ignore`, and `dangerouslySetInnerHTML` binding unchanged, and verify the emitted HTML places the script inside the head: run `cd frontend && bun run dev`, `curl -s http://localhost:3000`, and confirm `<script id="mes-theme-pre-paint">` appears within the head region, not as a child of `<html>`
- [x] 1.2 Add `suppressHydrationWarning` to the `<html>` element in the same file (lang, className, and all other markup unchanged), and verify `cd frontend && bunx tsc --noEmit` passes with no new errors

## 2. Confirm the diagnostics are gone

- [x] 2.1 Verify a dark-theme viewer hydrates cleanly: with the dev server running and the `mes_theme` cookie set to `dark` in the browser, load `/` and confirm the console shows no hydration-mismatch error naming the `<html>` className and no `[browser]` script-placement warning, while the first painted frame is still dark
- [x] 2.2 Verify the same console stays clean with the `mes_theme` cookie set to `light` and again cleared (follow-the-system), confirming the theme still applies on first paint in each case

## 3. Integration checks

- [x] 3.1 Run `cd frontend && bun test src/lib/mes/theme` and confirm the theme config and pre-paint script equivalence tests still pass unchanged
- [x] 3.2 Run `cd frontend && bunx biome check` and confirm no new lint errors introduced by the change
- [x] 3.3 Confirm the change touched nothing else: verify `git status --short` lists changes only under `frontend/src/` and `openspec/changes/fix-theme-pre-paint-hydration-error/`, with no file under `backend/` modified

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result.
