# Proposal

## Why

`AGENTS.md` tells developers to run `bunx biome check --write` at the repository
root, but that command currently **fails before it inspects a single file**:
Biome 2.5 finds `frontend/biome.json` declaring itself a second root
configuration and aborts with *"Found a nested root configuration, but there's
already a root configuration."* So the documented workflow is broken, and the
backend has no per-package entry point for linting at all — only the frontend
has `lint` and `format` scripts. Separately, the frontend's check exits non-zero
on a formatting defect in `(app)/layout.tsx`, and the frontend's config still
targets Biome 2.4.2 while the installed CLI is 2.5.15.

## What Changes

- Keep the repository's `./biome.json` as the **single root Biome configuration**
  (the developer's own configured file), and make `frontend/biome.json` a nested
  extension of it rather than a competing root.
- The frontend's nested config `extends` the root and overrides only what the
  frontend genuinely needs: space indentation, Next/React lint domains,
  Tailwind CSS parsing, and the `.next`/`node_modules`/`dist`/`build` exclusions.
- The backend needs **no config of its own** — verified to pass Biome cleanly by
  inheriting the root config unchanged, because its source is tab-indented and
  matches the root. It gains `lint` and `format` scripts so both packages have a
  per-package entry point.
- Bring the frontend's nested config onto the 2.5.15 schema and the current
  `preset`/`domains` syntax, replacing the stale 2.4.2 schema and deprecated
  `rules.recommended`.
- Fix the frontend formatting defect in `(app)/layout.tsx` so the frontend check
  exits zero, and give the root `./biome.json` the trailing newline Biome wants
  so it passes its own check.
- Document the two-config structure and the per-package commands in
  `docs/DEVELOPMENT.md` and `AGENTS.md`.
- No API, database, dependency, or application-behavior change.

## Capabilities

### New Capabilities

- `tooling/lint-configuration`: how the repository declares its Biome
  configuration, which commands lint and format each package, and the guarantee
  that both succeed without a configuration error.

This capability is new because no existing spec covers developer tooling. It
spans both packages, so it sits above the package-level `frontend/*` capability
layout rather than inside it.

### Modified Capabilities

None.

## Impact

- `./biome.json` — remains the root config; gains a trailing newline.
- `frontend/biome.json` — becomes a nested extension (`root: false` +
  `extends`) with frontend-specific overrides, on the current schema.
- `backend/package.json` — gains `lint` and `format` scripts.
- `frontend/src/app/(app)/layout.tsx` — formatting defect fixed.
- `docs/DEVELOPMENT.md`, `AGENTS.md` — document the structure and commands.
- No `backend/biome.json`: the root config already governs the backend.
- Dev tooling and developer experience only.
