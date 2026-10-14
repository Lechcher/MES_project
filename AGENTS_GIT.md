# AGENTS_GIT.md

> **Mandatory Git branching strategy and collaboration guidelines for the MES prototype repository.**
>
> This repository is developed by both **human developers** and **autonomous AI agents**. This document defines the branching model, naming conventions, guardrails, maintenance commands, and CI/CD expectations that all contributors — human and automated — must follow. It is binding, not advisory.

**Contents**

1. [Overview & Philosophy](#1-overview--philosophy)
2. [Branch Naming Conventions](#2-branch-naming-conventions)
3. [Workflow & Guardrails](#3-workflow--guardrails)
4. [Maintenance & Utility Commands](#4-maintenance--utility-commands)
5. [CI/CD Integration Recommendations](#5-cicd-integration-recommendations)

---

## 1. Overview & Philosophy

### Why distinguish human branches from AI branches

Code in this repository has two possible origins: it was written or reviewed by a **human developer**, or it was **generated, refactored, or completed by an AI agent** (Aider, OpenCode, Pi Agent, or similar tools). Those two origins carry different expectations around review depth, testing, and trust.

If both kinds of work share the same branch names, nobody can tell from the branch list alone where a change came from, how much scrutiny it has already received, or whether it is safe to merge. To prevent that, every branch **must** declare its origin up front:

- **`hh/` (or `hh_`)** — reserved strictly for **human developers**.
- **`ai/` (or `ai_`)** — reserved for code **generated or refactored by AI Agents**.

This one convention makes provenance visible everywhere: in the branch list, in the network graph, in CI, and in code review.

### Core principles

| Principle | What it means in practice |
| --- | --- |
| **Code Provenance** | The origin of every change is explicit. A reviewer can tell at a glance whether a branch was authored by a human or an agent, without reading commits. |
| **Enhanced CI/CD scrutiny for AI code** | Branches under `ai/` are subjected to **stricter** automated checks (linting, static analysis, security scanning, coverage thresholds) than human branches, because machine-generated code needs tighter verification. |
| **Accountability** | Every change has a responsible party. Human work is owned by its author; agent work is owned by the agent that produced it **and** the human developer who reviews and approves it. |
| **Easy Repository Maintenance** | Agent branches are often short-lived and numerous. Clear naming makes it trivial to list, audit, and safely delete them once merged, keeping the repository clean. |

> **Guiding rule:** an AI agent may propose work, but a human is always accountable for what is merged.

---

## 2. Branch Naming Conventions

### Structure

Every branch name is built from a **category prefix** combined with a **description**:

```text
<prefix>/<type-or-agent>/<short-description>
```

- **Human developers:**

  ```text
  hh/<type>/<description>
  ```

- **AI agents:**

  ```text
  ai/<agent-name>/<description>
  ```

### Prefix rules

| Prefix | Reserved for | Notes |
| --- | --- | --- |
| **`hh/`** | Human developers **only** | Canonical human prefix. |
| **`hh_`** | Human developers **only** | Accepted alias for tooling that does not handle `/` in branch names. |
| **`ai/`** | Code generated or refactored by **AI Agents** | Canonical agent prefix. Name the agent in the next segment. |
| **`ai_`** | Code generated or refactored by **AI Agents** | Accepted alias for the same reason. |

**Separator policy:** the **canonical separator is `/`**. The underscore forms (`hh_`, `ai_`) are accepted **aliases** for environments where the slash is inconvenient; use them only when the slash form is not viable, and never mix the two forms within a branch name.

### Segment rules

| Segment | Rule |
| --- | --- |
| `<type>` (human branches) | A standard Git type: `feature`, `bugfix`, `hotfix`, `refactor`, `chore`, `docs`, `test`, `release`. |
| `<agent-name>` (AI branches) | The tool that produced the work: `aider`, `opencode`, `pi-agent`, etc. Use `agent` when the tool has no short identifier. |
| `<description>` | Lowercase **kebab-case** (`[a-z0-9-]`), short and specific. No spaces, no uppercase, no trailing slash. |

### Examples

| Branch name | Origin | Meaning |
| --- | --- | --- |
| `hh/feature/auth-system` | Human | A developer building the authentication system. |
| `hh/hotfix/db-connection` | Human | A developer fixing a database connection defect. |
| `ai/aider/refactor-user-service` | AI (Aider) | Aider refactoring the user service. |
| `ai/agent/add-unit-tests` | AI (generic) | An agent adding unit tests. |

Additional valid examples:

```text
hh/bugfix/login-redirect
hh/docs/update-readme
hh/chore/bump-dependencies

ai/opencode/migrate-schema
ai/pi-agent/fix-lint-errors
ai/aider/implement-dashboard
```

---

## 3. Workflow & Guardrails

These rules are **mandatory**. They are not suggestions.

### 3.1 Protected branches — direct pushes are forbidden for AI

**AI agents MUST NEVER push directly** to any protected or stable branch, including:

| Branch | Status | AI agent access |
| --- | --- | --- |
| `main` | Default / protected | **No direct push.** Pull Request only. |
| `master` | Protected (if present) | **No direct push.** Pull Request only. |
| `production` | Protected / stable | **No direct push.** Pull Request only. |
| `staging`, `release/*` | Stable staging / release | **No direct push.** Pull Request only. |

Agents may only push to their own `ai/*` branch. All integration into a protected branch happens through a reviewed Pull Request / Merge Request.

### 3.2 Review policy

- **Every `ai/*` branch must be merged via a Pull Request / Merge Request.**
- An `ai/*` merge **requires explicit manual review and approval from a human developer** (an `hh` contributor). No auto-merge, no self-approval, no bypassing review.
- Human branches (`hh/*`) follow the team's normal review policy; direct pushes to protected branches remain prohibited for everyone.
- Reviewers should treat `ai/*` changes with **extra scrutiny** and confirm that tests, types, and edge cases are genuinely handled rather than merely plausible.

### 3.3 Commit standards

Commit messages from AI agents **must** make the automation explicit:

- Include an **AI co-author trailer**, for example:

  ```text
  Co-authored-by: AI Agent <agent@local>
  ```

- Optionally include a **brief prompt summary** describing what the agent was asked to do, for example:

  ```text
  feat: refactor user service to repository pattern

  Prompt summary: "Extract data access from UserService into a repository."
  Co-authored-by: AI Agent <agent@local>
  ```

- Human commits should follow the project's conventional-commit style. Do not add AI co-author trailers to purely human commits.

---

## 4. Maintenance & Utility Commands

AI branches are ephemeral by design. Use the commands below to inventory and clean them up. Prefer the **safe** deletion flag (`-d`), which refuses to delete branches that are not fully merged.

```bash
# List every local AI-generated branch
git branch --list 'ai/*'

# List AI branches already merged into the current branch
git branch --merged | grep -E '^\s*ai/'

# Safely delete a single merged AI branch
git branch -d ai/aider/refactor-user-service

# Safely delete all merged AI branches at once
git branch -d $(git branch --list 'ai/*')

# Delete a merged AI branch on the remote
git push origin --delete ai/aider/refactor-user-service

# Remove stale remote-tracking references after remote branches are deleted
git fetch --prune
```

> **Warning:** `git branch -D <branch>` **force-deletes** a branch even when it is **not** merged, discarding unmerged commits. Use `-D` only after confirming the work is preserved elsewhere (merged, rebased, or intentionally abandoned).

**Recommended routine:** after an `ai/*` Pull Request is merged, delete the branch locally and on the remote, then run `git fetch --prune`.

---

## 5. CI/CD Integration Recommendations

> **Status:** this repository has **no CI/CD pipeline configured yet**. The guidance below is a **recommendation** for when one is added (for example, with GitHub Actions under `.github/workflows/`). Nothing here creates or modifies an existing pipeline.

Apply **stricter automated checks to branches whose name starts with `ai/`**. Because agent-authored code may look correct while missing edge cases, gates should be tighter than for human work.

| Check | Applies to `ai/*` | Suggested strictness for `ai/*` |
| --- | --- | --- |
| **Linters** | Yes | Fail on warnings, not just errors. |
| **Static analysis / type checks** | Yes | Strict mode; no suppressions without review. |
| **Security scanning** | Yes | Dependency + secret + SAST scans required to pass. |
| **Coverage thresholds** | Yes | Enforce (or raise) a minimum coverage gate; fail on regression. |

Illustrative GitHub Actions job (recommendation only):

```yaml
# .github/workflows/ci.yml  (illustrative - not yet present in this repo)
name: CI

on:
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Detect whether the PR branch is agent-authored
      - id: origin
        run: |
          if [[ "${{ github.head_ref }}" == ai/* ]]; then
            echo "agent=true" >> "$GITHUB_OUTPUT"
          else
            echo "agent=false" >> "$GITHUB_OUTPUT"
          fi

      - run: bun install --frozen-lockfile

      # Human branches: standard checks
      - if: steps.origin.outputs.agent == 'false'
        run: bun run lint

      # AI branches: stricter checks
      - if: steps.origin.outputs.agent == 'true'
        run: |
          bun run lint -- --max-warnings=0
          bun run typecheck -- --strict
          bun run test -- --coverage --coverage.thresholds.lines=90
          bun run audit
```

**Optional hardening:** pair these checks with branch protection on `main`/`master`/`production` that requires the CI job to pass and requires at least one human approval before merging an `ai/*` branch.

---

## Rules at a Glance

| Rule | Requirement |
| --- | --- |
| Human branches | `hh/<type>/<description>` (or `hh_…` alias) |
| AI branches | `ai/<agent-name>/<description>` (or `ai_…` alias) |
| Canonical separator | `/` (underscore forms are aliases only) |
| Direct push to `main`/`master`/`production`/staging | **Forbidden for AI agents** — Pull Request only |
| Merging an `ai/*` branch | Requires PR/MR + **explicit human approval** |
| AI commit metadata | `Co-authored-by: AI Agent <agent@local>` (and/or prompt summary) |
| Branch cleanup | Safe delete merged `ai/*` branches with `git branch -d`; avoid `-D` |
| CI on `ai/*` | Stricter linting, static analysis, security scanning, coverage gates |

---

*This document is the single source of truth for Git collaboration in this repository. Propose changes to it through a reviewed Pull Request.*
