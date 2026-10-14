# Proposal

## Why

This repository is developed by both human developers and autonomous AI agents, but it has **no written Git convention**. The placeholder `AGENTS_GIT.md` exists at the repo root and is empty (0 bytes), so the collaboration rules the team intends to follow are not documented anywhere. Without a written contract, the project risks: unclear code provenance (nobody can tell at a glance whether a branch was authored by a human or an agent), AI-generated code reaching `main` without human review, inconsistent branch names, and an ever-growing set of stale agent branches that are hard to audit or clean up. The repo's default branch is `main` (GitHub remote `origin`), and there is no CI configuration yet, so today nothing enforces any of this.

## What Changes

- Fill in `AGENTS_GIT.md` (currently empty) with the mandatory Git branching strategy and human/AI-agent collaboration guidelines. The document covers, in order:
  1. **Overview & Philosophy** — why human branches (`hh/`) and agent branches (`ai/`) must be distinguishable, and the core principles: **Code Provenance**, **enhanced CI/CD scrutiny for AI code**, **Accountability**, and **easy repository maintenance** (cleaning up ephemeral AI branches).
  2. **Branch Naming Conventions** — the structure `hh/<type>/<description>` for humans and `ai/<agent-name>/<description>` for agents, the prefix rules (`hh/`/`hh_` reserved for humans; `ai/`/`ai_` reserved for code generated or refactored by AI agents such as Aider, OpenCode, Pi Agent), and an examples table (`hh/feature/auth-system`, `hh/hotfix/db-connection`, `ai/aider/refactor-user-service`, `ai/agent/add-unit-tests`).
  3. **Workflow & Guardrails** — **AI agents MUST NEVER push directly** to `main`, `master`, `production`, or stable staging branches; all `ai/*` branches must merge via Pull/Merge Request with explicit human review and approval; commit messages must carry AI metadata (e.g. `Co-authored-by: AI Agent <agent@local>` or a brief prompt summary).
  4. **Maintenance & Utility Commands** — standard Git commands to list, track, and safely delete merged AI branches (e.g. `git branch -d $(git branch --list 'ai/*')`).
  5. **CI/CD Integration Recommendations** — brief guidance to apply stricter automated checks (linters, static analysis, security scanning, coverage thresholds) to branches starting with `ai/`, with an illustrative pipeline snippet (the repo has no CI yet, so these are recommendations, not edits to an existing pipeline).
- **Standardize the prefix separator on `/`** (canonical form), documenting `hh_` / `ai_` as accepted legacy aliases, so the document has one clear default while honoring both forms.
- Write the document in **clean, professional English**, production-ready Markdown: headings, bold highlights, fenced code blocks, and structured comparison tables.
- Ground the guidance in the repo's real context (default branch `main`, GitHub `origin`, no CI yet) while keeping it portable.
- Leave `AGENTS_GIT.md`'s sibling files (`AGENTS.md`, `AGENTS_BACKEND.md`, `AGENTS_FRONTEND.md`, `CLAUDE.md`) and every other file unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a pure documentation change with no spec-level system behavior change, so `.openspec.yaml` declares `skip_specs: true`.

## Impact

- **Files:** Adds content to `AGENTS_GIT.md` (repo root) only. All other files are left byte-for-byte unchanged.
- **Consumers:** No code, config, or build file references `AGENTS_GIT.md` by path today; it is consumed by humans and coding agents as process guidance.
- **Out of scope:** wiring the document into `AGENTS.md`/`CLAUDE.md` or the other `AGENTS_*.md` files; creating or editing actual CI/CD workflow files; configuring GitHub branch protection or repository settings; changing any application code, tests, or dependencies.
