# Tasks

## 1. Prepare `main`

- [ ] 1.1 Checkout `main`; verify `git status` is clean and `git branch --show-current` returns `main`.
- [ ] 1.2 Fetch remote branches so local `ai/step-5/add-job-completion-requests` tracks PR #2's head `c724c1b761a3ced17fce180a74190a18f2837f76`; verify `git rev-parse ai/step-5/add-job-completion-requests` equals `c724c1b`.

## 2. Human review and merge PR #2 into `main`

- [ ] 2.1 Confirm Pull Request #2 ("ai/step 5/add job completion requests") is open and mergeable on GitHub, targeting `main`, head `c724c1b` on branch `ai/step-5/add-job-completion-requests` (verified: PR #2 is OPEN and MERGEABLE).
- [ ] 2.2 Request explicit human review and approval of PR #2 (agent cannot self-approve or auto-merge per `AGENTS_GIT.md`); verify a human `hh` contributor has approved.
- [ ] 2.3 Merge the approved PR #2 into `main`; verify `git log main` contains commits `1efd964d8cd04e76edb5bef75c55789bb09bcb8b` and `c724c1b761a3ced17fce180a74190a18f2837f76`.

## 3. Push `main` and verify recovery

- [ ] 3.1 Push `main` to remote `origin`; verify `git ls-remote origin main` matches the local `main` commit.
- [ ] 3.2 Verify both commits are ancestors of `main`: `git merge-base --is-ancestor c724c1b761a3ced17fce180a74190a18f2837f76 main` and `git merge-base --is-ancestor 1efd964d8cd04e76edb5bef75c55789bb09bcb8b main` succeed.
- [ ] 3.3 Verify `openspec/changes/add-job-completion-requests/tasks.md` exists on `main` with task 7.4 marked `- [x]`; verify `openspec status --change add-job-completion-requests` reflects completion.

## Workflow follow-up

- Archive this change after the project's review requirements are satisfied (`/opsx-archive`).
- Verify the archived result.
