# Proposal

## Why

Commit `c724c1b761a3ced17fce180a74190a18f2837f76` (Fri Oct 23 20:12:49 2026, `docs(openspec): mark the completion-request implementation tasks done`) and its parent `1efd964d8cd04e76edb5bef75c55789bb09bcb8b` (Fri Oct 23 20:08:14 2026, `feat(jobs): add completion requests, journey list and stage-derived progress`) were created on branch `ai/step-5/add-job-completion-requests` but were never merged into `main`.

Pull Request #2 ("ai/step 5/add job completion requests") is **OPEN** on GitHub, is **mergeable**, and its head is `c724c1b` on branch `ai/step-5/add-job-completion-requests`. PR #2 therefore already contains both Oct 23 commits: `1efd964` (the completion-requests feature: job-ticket Complete flow, journey list, stage-derived progress, S3 attachments, DB migrations) and `c724c1b` (marks task 7.4 done in `openspec/changes/add-job-completion-requests/tasks.md`).

From `main`'s perspective this work is lost. This change retrieves both commits by merging PR #2 into `main` so the completion-request change's task tracking and feature work reflect reality.

## What Changes

- Merge Pull Request #2 (head `c724c1b`, branch `ai/step-5/add-job-completion-requests`) into `main`. This brings in commit `1efd964` (completion-requests feature) and commit `c724c1b` (task 7.4 marked done) together with their ancestry.
- Push `main` to remote `origin` so the recovered change is available on GitHub.
- No application code, API, database, GraphQL contract, or system behavior changes are introduced by this change itself — PR #2's own content (including `1efd964`) is what is being retrieved.

## Capabilities

### New Capabilities

None. This change is a one-time operational recovery via an existing open PR; it introduces no durable system behavior capability of its own. (The retrieved `1efd964` introduces completion-requests behavior, but that behavior is specified by PR #2 / the `add-job-completion-requests` change, not by this recovery change.)

### Modified Capabilities

None. No existing capability's REQUIREMENTS are changing via this change itself. Per `openspec/changes/retrieve-lost-code-and-merge/.openspec.yaml`, `skip_specs: true` is set because this change introduces no spec-level behavior change.

## Impact

- `openspec/changes/add-job-completion-requests/tasks.md`: task 7.4 changes from `- [ ]` to `- [x]` on `main` (via commit `c724c1b`).
- `main` branch gains commits `1efd964` and `c724c1b` (and their ancestors not already in `main`), delivered through merge of PR #2.
- Remote `origin/main` updated by push.
- Branch `ai/step-5/add-job-completion-requests` is left in place (this change only merges PR #2 into `main`; it does not delete the source branch).
