# Design

## Context

This change adds a standardized git workflow for promoting completed work from feature branches to `main`. See `proposal.md - Why` for motivation; it is not restated here.

Current state and constraints that shape the approach (from `AGENTS_GIT.md`, the repo's single source of truth for Git collaboration):

- Every branch must declare its origin with a prefix: `hh/` for human developers, `ai/` for AI agents.
- AI agents must never push directly to protected branches (`main`, `master`, `production`, `staging`, `release/*`). All integration into a protected branch happens through a Pull Request / Merge Request.
- Merging an `ai/*` branch requires explicit manual review and approval from a human developer. No auto-merge, no self-approval, no bypassing review.
- AI commit messages must include an AI co-author trailer (`Co-authored-by: AI Agent <agent@local>`), optionally with a brief prompt summary.
- Branches are ephemeral: after a PR is merged, delete the branch locally and on the remote, then `git fetch --prune`. Use safe deletion (`git branch -d`); avoid `-D` unless the work is preserved elsewhere.
- This repository has no CI/CD pipeline configured yet; the workflow below assumes local git operations plus a GitHub-hosted remote named `origin`.

This change introduces no application code, API, database, or system behavior changes. It is a developer workflow / process change tracked through OpenSpec planning artifacts.

## Goals / Non-Goals

**Goals:**
- A repeatable, safe sequence: commit all pending changes → push to `origin` → switch to `main` → merge the feature branch via PR → human approval → delete the feature branch.
- Preserve branch provenance (prefix `ai/` for agent work, `hh/` for human work).
- Keep commit metadata explicit (AI co-author trailer) for agent-authored commits.
- Delete stale feature branches after merge to keep the repository clean.
- Never force-delete an unmerged branch.

**Non-Goals:**
- Configuring CI/CD pipelines or branch protection rules (covered as recommendations only in `AGENTS_GIT.md`, not created by this change).
- Modifying application source, the GraphQL contract, or the database schema.
- Auto-merging or self-approving any `ai/*` PR (explicitly forbidden).
- Pushing directly to `main` from an agent.

## Decisions

### 1. Branch name for this change
**Decision:** `ai/opencode/git-commit-push-merge-main-delete-branches`

**Rationale:** Prefix `ai/` declares agent origin; `opencode` names the agent; the description is kebab-case and specific, per `AGENTS_GIT.md` segment rules.

**Alternatives considered:**
- `hh/...` — rejected: this change is agent-generated work, not human-authored.
- `ai_...` (underscore alias) — rejected: canonical separator is `/`; underscore is only for environments where slash is not viable.

### 2. Commit message style
**Decision:** Conventional-commit style (`feat:`, `chore:`, etc.) plus an AI co-author trailer and optional prompt summary.

**Rationale:** Matches existing project convention (AI commits include `Co-authored-by: AI Agent <agent@local>`; human commits follow conventional commits without AI trailers).

**Alternatives considered:**
- Plain description-only commits — rejected: loses provenance and convention consistency.
- No co-author trailer — rejected: violates `AGENTS_GIT.md` commit standards.

### 3. Integration into `main`
**Decision:** Push the feature branch to `origin`, open a Pull Request against `main`, require explicit human approval, then merge via PR — never a direct push to `main`.

**Rationale:** `AGENTS_GIT.md` forbids AI agents from pushing directly to protected branches and mandates PR + human review for `ai/*` merges.

**Alternatives considered:**
- Direct push to `main` — rejected: forbidden for AI agents.
- Auto-merge / self-approval — rejected: explicitly forbidden.

### 4. Branch deletion after merge
**Decision:** Delete the feature branch locally and on `origin` after the PR is merged, using `git branch -d` (safe delete), then `git fetch --prune`.

**Rationale:** `AGENTS_GIT.md` recommends this routine to keep agent branches (short-lived and numerous) from accumulating. Safe delete refuses unmerged branches, preventing accidental data loss.

**Alternatives considered:**
- `git branch -D` (force delete) — rejected: only after confirming work is preserved elsewhere; not the default.
- Leaving the branch — rejected: leads to stale-branch accumulation, the problem this change addresses.

### 5. Remote name and target branch
**Decision:** Remote `origin`, target branch `main`.

**Rationale:** Standard GitHub remote and the repo's default/protected branch per `AGENTS_GIT.md`.

**Alternatives considered:** None material; these are the repo's established defaults.

## Risks / Trade-offs

[Risk] Merge conflicts when merging the feature branch into `main` → [Mitigation] Rebase or merge `main` into the feature branch before opening the PR; resolve conflicts in the feature branch, not on `main`.

[Risk] Accidental force-deletion of an unmerged branch discarding work → [Mitigation] Use `git branch -d` (safe delete) by default; reserve `-D` only after confirming the work is merged, rebased, or intentionally abandoned.

[Risk] Pushing sensitive data (secrets, credentials) to `origin` → [Mitigation] Follow the repo's existing secret handling (`.env` is gitignored; never commit `.env`); review staged files before committing.

[Risk] PR sits unreviewed because human approval is required → [Mitigation] This is by design per `AGENTS_GIT.md` ("a human is always accountable for what is merged"); communicate to the requesting human that review is needed.

[Risk] Working tree has unstaged or untracked changes not included in "commit every changes" → [Mitigation] Explicitly stage all relevant changes (`git add -A` or targeted paths) and review `git status` before committing; untracked files are only included if intentionally added.

## Migration Plan

**Deploy:** No deployment required. The workflow is a local git process plus GitHub PR. Apply it whenever a feature branch is ready to promote to `main`.

**Rollback:** Not applicable — no system behavior or code is deployed. If a merge is unwanted, revert the merge commit on `main` via a new PR, or delete the feature branch without merging.

**Verification:** After merge and branch deletion, confirm `git branch --list 'ai/*'` no longer lists the merged branch locally, and `git fetch --prune` removes it from remote-tracking refs.

## Open Questions

None. All decisions are grounded in `AGENTS_GIT.md` and the proposal; no deferrable unknowns remain.
