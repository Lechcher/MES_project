# Tasks

## 1. Branch creation and staging

- [x] 1.1 Create feature branch `ai/opencode/git-commit-push-merge-main-delete-branches` from `main`; verify `git branch --show-current` returns the new branch and it is based on `main`.
- [ ] 1.2 Stage all pending changes intended for this change; verify `git status` shows only the intended files staged and no unrelated changes.
- [ ] 1.3 Commit staged changes with a conventional-commit message plus an AI co-author trailer (`Co-authored-by: AI Agent <agent@local>`); verify `git log -1` shows the commit and trailer.

## 2. Push to origin and open Pull Request

- [ ] 2.1 Push the feature branch to remote `origin`; verify `git ls-remote origin` lists the branch.
- [ ] 2.2 Open a Pull Request on GitHub targeting `main` from the feature branch; verify the PR exists and targets `main`.
- [ ] 2.3 Request explicit human review and approval of the PR (AI cannot self-approve or auto-merge); verify a human `hh` contributor has approved.
- [ ] 2.4 Merge the approved PR into `main`; verify `git log main` contains the merge commit and the feature branch's commits.

## 3. Delete the feature branch

- [ ] 3.1 Delete the feature branch locally using `git branch -d` (safe delete); verify `git branch --list 'ai/*'` no longer lists it locally.
- [ ] 3.2 Delete the feature branch on remote `origin`; verify the branch is gone from `git ls-remote origin`.
- [ ] 3.3 Run `git fetch --prune`; verify remote-tracking references for the deleted branch are removed.

## 4. Verification

- [ ] 4.1 Confirm `main` contains the merged changes and the feature branch is fully removed; verify via `git log main` and `git branch --list` (local and remote).

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result.
