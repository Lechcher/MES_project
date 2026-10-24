# Design

## Context

See `proposal.md` — Why. Current state, verified by inspection:

- The repository's `./biome.json` is the developer's own configured file:
  `$schema` 2.5.15, `indentStyle: tab`, `linter.rules.preset:
  "recommended"`, `linter.domains.tailwind: "all"`, a nursery rule
  `noTailwindArbitraryValue`, `javascript.formatter.quoteStyle: "double"`, and no
  `files` section. It is the only file that declares itself a root. It gains a
  `files` section under decision 2 below, because the repository holds tracked,
  non-gitignored vendor and generated files that a repository-wide scan reaches.
- `frontend/biome.json` **also** declares itself a root, and that is the direct
  cause of the failure: Biome 2.5 aborts with *"Found a nested root
  configuration, but there's already a root configuration."* before checking any
  file. `AGENTS.md` line 74 documents exactly this command.
- `frontend/biome.json` additionally targets the 2.4.2 schema (CLI is 2.5.15) and
  uses the deprecated `linter.rules.recommended: true` rather than `preset`.
- The frontend's config is genuinely different from the root: `indentStyle:
  "space"`, `indentWidth: 2`, `css.parser.tailwindDirectives: true`,
  `linter.domains.{next,react}: "recommended"`, and `files.includes` excluding
  `node_modules`, `.next`, `dist`, `build`.
- The source styles match those configs and **cannot be unified**: 91 of the
  frontend's 95 source files are space-indented, while the backend's 55 source
  files are tab-indented. Choosing one style for both would mean reformatting 91
  files.
- The backend has **no** Biome configuration and passes cleanly by inheriting the
  root one, because its tab indentation already matches the root's
  `indentStyle`. Verified: `biome check src` in `backend/` exits 0 with 34
  warnings, all of them `noExplicitAny` (20 of which are of that rule). Running
  from `backend/` works with no nested-config error.
- Biome's own semantics, read from the shipped
  `configuration_schema.json`: `"root"` — *"Indicates whether this configuration
  file is at the root of a Biome project. By default, this is `true`"*; and
  `"extends"` — *"A list of paths to other JSON files, used to extend the current
  configuration."*
- The frontend check currently exits 1 on one formatting defect:
  `src/app/(app)/layout.tsx` is tab-indented while the frontend config expects
  spaces. Its staged version is space-indented (11 space lines, 0 tabs), so the
  tabs were introduced while editing it on this branch.
- The root `./biome.json` itself fails Biome's format check, for a single
  missing trailing newline.

## Goals / Non-Goals

**Goals:**

- Restore the documented repository-root lint command.
- Give both packages a per-package lint and format entry point.
- Keep the developer's root configuration authoritative.
- Make both packages' lints exit zero for authored sources.

**Non-Goals:**

- Unifying indentation across the two packages (rejected: it would reformat 91
  frontend files).
- Removing the `noExplicitAny` warnings in the backend.
- Migrating `./biome.json`'s schema or rewriting the developer's rule choices.

## Decisions

### 1. One root config; the frontend extends it

`./biome.json` stays the root. `frontend/biome.json` declares `"root": false`
and `"extends": ["../biome.json"]`, then re-declares only the settings the
frontend actually changes.

- **Why:** it removes the conflict at its cause instead of suppressing it, keeps
  a single authoritative root so a rule added at the root reaches both packages,
  and means the frontend only states its differences. Validated in a scratch
  replica: the nested-root error disappears, the root scan checks both packages,
  the frontend's space override applies to its sources, and the backend's tabs
  still satisfy the root config.
- **Alternatives rejected:** deleting `frontend/biome.json` and putting
  everything in the root (reformats 91 frontend files, and gives the backend
  Next/React rules it should not inherit); keeping two competing roots and
  scoping commands per package (leaves the documented root command broken);
  `biome migrate --write` as the error's own fix suggests (it does not address the
  two-root problem and rewrites the frontend's config in place).

### 2. The frontend's nested config carries only its genuine differences

Space indentation; `css.parser.tailwindDirectives`; the `next` and `react` lint
domains; and `files.includes` excluding generated output and dependencies.
Everything else inherits from the root, which means the frontend picks up the
root's `preset: "recommended"`, `quoteStyle: "double"`, `organizeImports`, and
`vcs.useIgnoreFile: true` without restating them.

The frontend additionally turns **off** one rule it inherits:
`rules.nursery.noTailwindArbitraryValue`. The root raises it to `error`, and that
explicit level survives extension — lowering or disabling the `tailwind` domain in
the frontend does **not** neutralise it, which was verified both ways
(`domains: none` and `domains: all` each still produced 33 findings). Only an
explicit `rules.nursery` override clears it.

- **Why:** these 33 findings are all in the frontend's authored shadcn/Base-UI
  components and are intrinsic to that design system, not mistakes — e.g.
  `[&_svg:not([class*="size-"])]:size-4`, `rounded-[min(var(--radius-md),10px)]`,
  `bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]`,
  `has-data-[icon=inline-end]`, `not-aria-[haspopup]`. "Fixing" them would mean
  rewriting the component library's arbitrary selectors and CSS functions, which
  would change rendered styling and is far outside this change.
- **Why not remove the whole `tailwind` domain:** the frontend really is a
  Tailwind app, so the domain's other rules are worth keeping; measured, the two
  sibling rules (`noTailwindRawColors`, `useTailwindShorthandClasses`) produce no
  findings on this codebase either way, so leaving the domain inherited costs
  nothing and keeps the option open.

- **Why `files.includes` must stay in the frontend:** the root config's own
  exclusions cover the repository but not the frontend's build output or
  installed dependencies, and they are not gitignored at the depth the scanner
  reaches once the config conflict is gone. Keeping them here keeps the
  frontend's scanner behaviour identical to every frontend developer's existing
  expectation. Verified empirically: a scan of the frontend with its current
  `includes` checks 101 files and finds only the one known defect.
- **Why the root config gained a `files` section after all:** the first draft of
  this design concluded the opposite, reasoning from a scratch replica that
  unknown extensions such as `.db` and `.csv` are skipped during a directory
  scan, so `backend/data/`'s SQLite file and generated exports would not reach
  the linter. That conclusion was correct for those two extensions and wrong as a
  general claim: actually fixing the conflict and running the repository-wide scan
  falsified it. The repository carries 74 **tracked and non-gitignored** files
  under `.agents/skills/`, vendored from GitHub and declared in `skills-lock.json`
  (which has `source: "github"`, `sourceType: "github"`, `computedHash`), plus the
  generated `skills-lock.json` itself and Drizzle's `backend/drizzle/meta/`. All
  were invisible only because the root command never got past the config error.
  They are excluded with negated globs in `files.includes`, which is the only
  mechanism Biome 2.5 offers — the schema has no `files.excludes`, and its
  `experimentalScannerIgnores` is deprecated in favour of exactly this glob
  syntax. The mechanism therefore followed from the constraint, not from a
  preference, once the repo-wide scan was actually run.

### 3. The backend needs no config file, only scripts

The backend inherits the root config. Add `lint` and `format` scripts to
`backend/package.json` using the frontend's script names.

- **Why:** verified to pass unchanged, and adding a config that merely restates
  the root would be a second place to keep in sync. The gap was the missing
  entry point, not the config.
- **Alternatives rejected:** an explicit extending `backend/biome.json`
  (harmless, but a file with nothing to override — revisit if the backend later
  needs its own excludes or rules).

### 4. Repair four formatting defects before declaring the lint green

Reformat `frontend/src/app/(app)/layout.tsx` to spaces, add the trailing newline
to `./biome.json`, and bring `backend/tsconfig.json` and the root `package.json`
onto the root's tab indentation.

- **Why:** the spec requires both packages to lint clean, and the layout defect
  is the only frontend error. The root file's missing newline is what makes the
  root config fail its own check, which would keep the repository-wide lint red.
  The two config files were found by the same now-unblocked repository-wide scan
  and are authored, so they are repaired rather than excluded — the spec's
  exclusion clause is for files this repository does not author.
- **Scope note:** `frontend/src/app/(app)/layout.tsx` belongs to
  `fix-frontend-dev-diagnostics`, not to this change's structural work. It is
  included here because leaving it red would defeat this change's purpose, and it
  is a one-file formatting fix rather than a behavioral edit.
- **Blast radius:** `backend/tsconfig.json` also collapses an array
  (`"lib": ["ESNext"]`) and the root `package.json` shrinks its nested objects.
  All four are whitespace-only; no key, value, or directive changes.

## Risks / Trade-offs

- [The frontend's config now depends on the root's file layout] → The `extends`
  path is relative and one level up; both files are in the same repository, so the
  relative reference is stable. Noted in the design so a future move of either
  directory re-checks the path.
- [A rule set at the root now reaches the frontend, changing its lint result] →
  This **materialised**, and it is the one place the artifacts were wrong:
  inheritance was assumed to be a no-op because the root's `preset` matched the
  frontend's, but the root also raises `rules.nursery.noTailwindArbitraryValue` to
  `error`, which added 33 findings to the frontend's authored components. Measured
  and resolved by an explicit `"off"` in the frontend (see decision 2). The
  general lesson recorded there: with `extends`, an *explicit rule level* in the
  root is not a default that a domain override can soften — it must be overridden
  explicitly.
- [`noExplicitAny` warnings in the backend stay red in CI if warnings are ever
  promoted] → Out of scope; the spec requires only a zero-error exit and leaves
  warnings visible.
- [A developer's local Biome version could differ from the installed one] → Both
  configs target the installed CLI's schema, so a mismatch surfaces as a schema
  error rather than silent misconfiguration.

## Migration Plan

- No data, API, or dependency migration. Runtime behavior is unaffected.
- Rollback: revert `frontend/biome.json` to its previous content and remove the
  backend scripts. The nested-root conflict would return, so the rollback is
  only worth taking if the new structure proves wrong for another reason.
- Order: fix the configuration first, then the formatting defects, so the final
  verification sees both effects at once.

## Open Questions

None. The configuration structure, the backend's approach, and the file layout
were all resolved with the developer before this design was written.
