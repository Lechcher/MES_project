# Tasks

## 1. Resolve the competing root configurations

- [x] 1.1 Convert `frontend/biome.json` into a nested extension of the root:
      add `"root": false` and `"extends": ["../biome.json"]`, and verify from the
      repository root that `bunx biome check` no longer reports a nested root
      configuration error and instead checks files
- [x] 1.2 Move `frontend/biome.json` onto the installed CLI's schema and syntax —
      set `$schema` to the 2.5.15 schema and replace the deprecated
      `linter.rules.recommended` with `preset: "recommended"` — and verify
      `bunx biome check frontend/biome.json` reports only formatting findings, no
      schema or deprecation findings
- [x] 1.3 Reduce `frontend/biome.json` to its genuine differences from the root
      (space indentation, `css.parser.tailwindDirectives`, the `next` and `react`
      lint domains, the `files.includes` exclusions for build output and
      dependencies), and verify the inherited settings now apply by confirming the
      frontend's sources still lint with double quotes, `organizeImports`, and
      git-ignore awareness — prove each with a probe whose content only that
      setting can explain, and leave no probe behind
- [x] 1.4 Confirm the frontend is not left carrying the root's rules where they do
      not apply: verify the frontend's own report is free of errors inherited from
      the root's `nursery` set, and record which were inherited and why each was
      kept or turned off
- [x] 1.5 Restore the repository-root lint command as the documented workflow:
      run `bunx biome check` from the repository root and verify it completes
      without a configuration error, then verify `docs/DEVELOPMENT.md` and
      `AGENTS.md` still state the same command so the docs and behaviour agree

## 2. Give the backend a lint entry point

- [x] 2.1 Add `lint` and `format` scripts to `backend/package.json` using the same
      names the frontend already exposes, and verify `cd backend && bun run lint`
      runs the linter over the backend's sources and exits zero
- [x] 2.2 Confirm the backend needs no configuration of its own: verify no
      `backend/biome.json` is added, and that `cd backend && bunx biome check src`
      still exits zero while checking the backend's tab-indented sources against
      the root configuration
- [x] 2.3 Document in `docs/DEVELOPMENT.md` that the backend has no Biome config of
      its own and inherits the repository root's, with the rule for when one
      should be added; verify by re-reading the note and confirming the command it
      describes runs as written

## 3. Make both packages lint clean

- [x] 3.1 Add the trailing newline to `./biome.json` so the root configuration
      satisfies its own formatting rules, and verify `bunx biome check biome.json`
      exits zero
- [x] 3.2 Add a `files` section to `./biome.json` excluding the repository's
      vendor and generated files — `.agents/`, `skills-lock.json`, and
      `backend/drizzle/` — as negated globs in `files.includes`, and first
      establish each is genuinely non-authored by confirming `.agents/skills/*/`
      names GitHub sources recorded in `skills-lock.json` and
      `backend/drizzle/meta/` holds Drizzle's generated files
- [x] 3.3 Confirm the exclusions are the minimum that works: re-run the
      repository-wide lint and verify no authored file's findings disappeared, and
      that every exclusion added corresponds to vendor or generated output — if an
      exclusion is hiding an authored file, it is wrong and must be removed
- [x] 3.4 Reformat `backend/tsconfig.json` and the root `package.json` to the
      root's tab indentation, and verify both are whitespace-only by confirming no
      key, value, or directive differs
- [x] 3.5 Reformat `frontend/src/app/(app)/layout.tsx` to the frontend's space
      indentation, and verify the file's only content change is whitespace —
      that its `export const instant = false` declaration and the layout's JSX
      are byte-for-byte otherwise
- [x] 3.6 Verify each package's lint exits zero in turn: `cd backend && bun run lint`
      and `cd frontend && bun run lint`, and confirm neither reports an error
      (warnings are acceptable, and the backend's `noExplicitAny` warnings must
      still be visible)
- [x] 3.7 Verify a repository-wide lint is unaffected by generated artifacts:
      run `bunx biome check` from the repository root and confirm it reports no
      findings from build output, installed dependencies, vendor skill data, the
      SQLite database, or generated export files

## 4. Integration checks

- [x] 4.1 Run the full suite for both packages —
      `cd backend && bun test && bunx tsc --noEmit && bunx biome check` and
      `cd frontend && bun test && bunx tsc --noEmit && bunx biome check && bun run build`
      — and confirm every command succeeds
- [x] 4.2 Confirm the root command is the documented one and is green: run
      `bunx biome check` from the repository root, confirm it exits zero or
      reports only expected warnings, and confirm `AGENTS.md` line 74's command
      now works as written
- [x] 4.3 Confirm the change touched nothing else: verify `git status --short`
      lists changes only under `./biome.json`, `frontend/biome.json`,
      `frontend/package.json`, `backend/package.json`,
      `frontend/src/app/(app)/layout.tsx`, `docs/`, and `AGENTS.md`, with no
      source file modified beyond the layout formatting fix

## Workflow follow-up

- Archive the change once the project's review requirements are satisfied.
- Consider revisiting `frontend/project-configuration` — it and this change's
  `tooling/lint-configuration` both describe the frontend's shared project
  configuration, and may belong together once both are archived.
- If the backend later needs its own excludes or rules, add
  `backend/biome.json` as a nested extension of the root rather than a competing
  root.
