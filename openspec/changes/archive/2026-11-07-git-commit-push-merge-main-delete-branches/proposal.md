# Proposal

## Why

The MES Prototype lacks a documented, repeatable process for promoting completed work from feature branches to `main`. Work is committed in feature branches, but there is no standardized flow for committing all pending changes, pushing them to GitHub, switching to `main`, merging the feature branch, and deleting the remaining branch. This leads to inconsistent commit practices, stale branches accumulating, and uncertainty about what has been merged into `main`.

## What Changes

- Document a standardized git workflow: commit all pending changes, push to `origin`, switch to `main`, merge the feature branch, then delete the feature branch.
- Add OpenSpec planning artifacts (proposal, design, tasks) tracking this workflow as a repeatable change.
- No application code, API, database, or system behavior changes.

## Capabilities

### New Capabilities

None. This change introduces no system behavior capability.

### Modified Capabilities

None. This change modifies no existing capability's requirements.

## Impact

**Scope:** Developer workflow / process only.

**Affected:**
- `openspec/changes/git-commit-push-merge-main-delete-branches/` — planning artifacts for this workflow.

**Not affected (no changes):**
- Application source code (`frontend/`, `backend/`).
- GraphQL API contract or database schema.
- CI configuration or dependencies.

**Dependencies:** None new.

**Breaking changes:** None.

**Assumptions recorded for implementation:**
- Git remote name: `origin`
- Target/default branch: `main`
- Commit messages follow existing conventional-commits style (human: `hh/<type>/<description>`, agent: `ai/<agent-name>/<description>` per `AGENTS_GIT.md`)
