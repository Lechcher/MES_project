# Design

## Context

Frontend runs Next.js `16.4.0` with React `19.3.0`, Bun package manager, Tailwind CSS v4, shadcn UI, and Chart.js. `next.config.ts` uses Turbopack, React Compiler, and `cacheComponents`/`partialPrefetching`/`agentFeedback` experimental flags. See proposal.md for motivation — this design covers only how to apply the version bump safely.

## Goals / Non-Goals

**Goals:**
- Move `next` from `16.4.0` to `16.4.3` in `frontend/package.json`
- Regenerate `frontend/bun.lockb` via `bun install`
- Confirm `bun run build` and `next dev` work after the upgrade
- Keep all existing behavior unchanged (patch-level, same major version)

**Non-Goals:**
- No Next.js 17.x migration (does not exist as a stable release)
- No React version change (stays `19.3.0`)
- No code refactoring or API changes
- No config changes beyond what the upgrade requires

## Decisions

**Patch upgrade only (16.4.0 → 16.4.3):**
- Rationale: Latest stable Next.js is `16.4.3`; no `17.x` exists. Same major version means no breaking changes expected.
- Alternative considered: minor upgrade within 16.x — not applicable, `16.4.3` is the latest 16.x patch.

**Bun as package manager:**
- Rationale: Project already uses Bun (`bun@1.4.2`, `packageManager: bun@1.4.2`). Use `bun install` to regenerate the lockfile.
- Alternative considered: npm — rejected, inconsistent with project stack.

## Risks / Trade-offs

[Risk] New Next.js patch may deprecate or change an experimental flag used in `next.config.ts` (`agentFeedback`, `cacheComponents`, `partialPrefetching`, `reactCompiler`) → Mitigation: Review `next` release notes for 16.4.1–16.4.3 and run `next dev` + `bun run build` to catch deprecation warnings.

[Risk] Lockfile regeneration could pull transitive dependency changes → Mitigation: Review `bun.lockb` diff after `bun install`; confirm no unexpected dependency version changes.

## Migration Plan

1. Edit `frontend/package.json`: change `next` from `16.4.0` to `16.4.3`
2. Run `cd frontend && bun install` to regenerate `bun.lockb`
3. Run `cd frontend && bun run build` to verify compilation
4. Run `cd frontend && bun run dev` briefly to verify dev server starts
5. Rollback: revert `frontend/package.json` and `frontend/bun.lockb` if build fails

## Open Questions

None — all decisions are straightforward for a patch-level dependency upgrade.
