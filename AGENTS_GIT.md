# AGENTS_GIT.md

> **Simple Git workflow — everything on `main`.**

This repository uses a single-branch workflow. All work is committed directly to `main`. There are no feature branches, no pull requests, and no branch provenance prefixes.

## 1. Single Branch

All development happens on `main`. There is only one branch:

- **`main`** — the only branch. All commits, features, fixes, and documentation go here directly.

## 2. Workflow

1. Make your changes.
2. `git add <files>`
3. `git commit -m "<message>"`
4. `git push origin main`

No feature branches. No pull requests. No code review gate. Commit and push directly to `main`.

## 3. Commit Messages

Use conventional commits where helpful, but keep it simple:

```
feat: add completion-requests UI
fix: correct task state transition
docs: update API specification
chore: bump dependencies
```

AI-authored commits should include a co-author trailer:

```
Co-authored-by: AI Agent <agent@local>
```

## 4. No Branch Cleanup

Since there is only `main`, there are no feature branches to delete and no remote-tracking pruning needed.

## Rules at a Glance

| Rule | Requirement |
|------|-------------|
| Branches | `main` only |
| Direct push to `main` | Allowed |
| Pull requests | Not used |
| Branch prefixes | None (no `hh/`, `ai/`) |
| Commit style | Conventional commits (recommended) |
| AI commit metadata | `Co-authored-by: AI Agent <agent@local>` |

---

*This document is the single source of truth for Git collaboration in this repository.*
