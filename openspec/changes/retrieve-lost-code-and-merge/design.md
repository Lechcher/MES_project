# Design

## Context

See `proposal.md - Why` for motivation (not restated here).

Current state (observed from the repository and GitHub):

- Pull Request #2 ("ai/step 5/add job completion requests") is **OPEN** and **mergeable** on GitHub (https://github.com/Lechcher/MES_project/pull/2).
- PR #2's head is commit `c724c1b761a3ced17fce180a74190a18f2837f76` on branch `ai/step-5/add-job-completion-requests` (headRefOid matches).
- PR #2 contains both Oct 23, 2026 commits:
  - `1efd964d8cd04e76edb5bef75c55789bb09bcb8b` (`feat(jobs): add completion requests, journey list and stage-derived progress`) — the feature work.
  - `c724c1b761a3ced17fce180a74190a18f2837f76` (`docs(openspec): mark the completion-request implementation tasks done`) — marks task 7.4 done.
- Neither commit is an ancestor of `main`; PR #2 was never merged.
- Branch `ai/step-5/add-job-completion-requests` carries **18 commits** not in `main`; `c724c1b` is the tip/latest. The others include earlier feature work (Jobs app, Planning app, Performance dashboard, mock data, Vietnamese locale, etc.).
- On `main`, `openspec/changes/add-job-completion-requests/tasks.md` **does not exist**, so `c724c1b` alone cannot be cherry-picked cleanly onto `main`.
- `AGENTS_GIT.md` governs: AI agents never push directly to `main`; `ai/*` merges go through a Pull Request requiring explicit human (`hh`) approval; no self-approval or auto-merge.

## Goals / Non-Goals

**Goals:**
- Retrieve commits `1efd964` and `c724c1b` (the Oct 23 completion-requests work) into `main` by merging open PR #2.
- Push `main` to remote `origin` so the recovered change is available on GitHub.
- Follow `AGENTS_GIT.md`: PR #2 already exists; it needs human review/approval, then merge. Agent does not self-approve or auto-merge, and does not push directly to `main`.

**Non-Goals:**
- Opening a new PR (PR #2 already exists and is open/mergeable).
- Deleting branch `ai/step-5/add-job-completion-requests`.
- Any application code, API, database, or system behavior change introduced by this recovery change itself.

## Decisions

### 1. Vehicle for retrieval
**Decision:** Merge existing PR #2 (head `c724c1b`, branch `ai/step-5/add-job-completion-requests`) into `main`. Since `c724c1b` is PR #2's head and includes `1efd964` as its ancestor, merging PR #2 retrieves both Oct 23 commits together.

**Rationale:** PR #2 already exists, is open, and is mergeable. Cherry-picking `c724c1b` alone cannot apply cleanly on `main` because `openspec/changes/add-job-completion-requests/tasks.md` does not exist on `main` (c724c1b's diff expects it). Merging PR #2 is the straightforward, already-authored path.

**Alternatives considered:**
- Cherry-pick only `c724c1b` — rejected: will not apply cleanly (tasks.md missing on main; conflict-prone).
- Recreate `tasks.md` on `main` as a new commit — rejected: does not retrieve the commits as requested; loses authorship/history.
- Open a new PR duplicating #2 — rejected: PR #2 already exists and is mergeable.

### 2. Scope
**Decision:** Merge the entirety of PR #2 / branch `ai/step-5/add-job-completion-requests` into `main` (18 commits not in `main`, including `1efd964` feature work and `c724c1b` task marking). This is resolved — no longer an open question. The user explicitly asked to retrieve the code from commit `c724c1b` (and referenced `1efd964` too), and PR #2 is the vehicle containing both.

**Rationale:** `c724c1b` is PR #2's tip; merging the PR is the literal fulfillment of "retrieve the code and merge it." PR #2's branch name (`add-job-completion-requests`) indicates a completed change ready for `main`.

### 3. Integration into `main`
**Decision:** PR #2 already exists on GitHub targeting `main`. Request explicit human (`hh`) review and approval of PR #2, then merge it via the PR. No direct push to `main` by the agent; no self-approval or auto-merge.

**Rationale:** `AGENTS_GIT.md` forbids AI agents pushing directly to protected branches and mandates PR + human review for `ai/*` merges.

### 4. Remote and target
**Decision:** Remote `origin`, target branch `main`.

**Rationale:** Standard GitHub remote and the repo's default/protected branch per `AGENTS_GIT.md`.

## Risks / Trade-offs

[Risk] Merging PR #2 pulls all 18 branch commits into `main`, not just `c724c1b`/`1efd964` → [Mitigation] This is now the resolved, intentional scope: PR #2 is a completed change the user wants on `main`.

[Risk] Merge conflicts between branch and `main` (both diverged) → [Mitigation] Rebase or merge `main` into the feature branch before/at PR merge; resolve conflicts in the feature branch, never on `main`.

[Risk] PR #2 sits unreviewed because human approval is required → [Mitigation] By design per `AGENTS_GIT.md`; communicate to the requesting human that review of PR #2 is needed.

[Risk] Pushing sensitive data → [Mitigation] `.env` is gitignored; never commit `.env`; review files before committing.

## Migration Plan

**Deploy:** No deployment required. Local git operations plus merging GitHub PR #2.
1. Checkout `main` (clean working tree).
2. Ensure local branch `ai/step-5/add-job-completion-requests` tracks PR #2's head `c724c1b` (fetch if needed).
3. Human reviewer approves PR #2 on GitHub.
4. Merge PR #2 into `main` (resolve any conflicts in the feature branch first, never on `main`).
5. Push `main` to `origin`.
6. Verify `main` contains `c724c1b` (and `1efd964`) and `origin/main` is updated.

**Rollback:** Revert the merge commit on `main` via a new PR, or reset `main` to its pre-merge state if the merge has not been pushed.

**Verification:** `git log main` contains `c724c1b` and `1efd964`; `git ls-remote origin main` matches local `main`; `openspec status --change add-job-completion-requests` reflects task 7.4 as done; `openspec/changes/add-job-completion-requests/tasks.md` exists on `main`.

## Open Questions

None. Scope is resolved: merge PR #2 into `main`.
