# Design

## Context

See `proposal.md` — Why. This change fills in `AGENTS_GIT.md` (repo root, currently 0 bytes) with the Git branching strategy and human/AI-agent collaboration guidelines for this repository.

Facts about the repo that shape the document:

- Default branch is `main`; remote is `origin` on GitHub (`https://github.com/Lechcher/MES_prototype_project-planning_appointments.git`).
- **No CI configuration exists** (no `.github/`, no workflow files), so the CI/CD section is guidance only.
- Sibling files `AGENTS.md`, `AGENTS_BACKEND.md`, `AGENTS_FRONTEND.md` are also empty, and `CLAUDE.md` contains only `AGENTS.md`; none of them are touched by this change.
- No existing branch-naming conventions are documented anywhere, so there is nothing to reconcile.

The user chose: **canonical `/` separator with `_` as an accepted alias**, and **only `AGENTS_GIT.md`** (no wiring into the other files). The document must be English, production-ready Markdown.

## Goals / Non-Goals

**Goals:**

- A clear, enforceable-looking contract that separates human branches from agent branches and states the hard guardrails.
- One canonical naming default (`/`) plus an explicitly sanctioned alias (`_`), so both forms in the request are honored.
- Directly usable maintenance commands and CI guidance.
- Self-contained: readable without any other document.

**Non-Goals:**

- No edits to `AGENTS.md`, `AGENTS_BACKEND.md`, `AGENTS_FRONTEND.md`, or `CLAUDE.md`.
- No CI workflow files, no GitHub branch-protection changes, no repository settings.
- No application code, tests, or dependency changes.
- Not a general Git tutorial — it documents this repo's conventions only.

## Decisions

### D1 — One English Markdown file at the repo root

`AGENTS_GIT.md`, consistent with the existing root-doc convention (`DESIGN.md`, `SYSTEM_ARCHITECTURE.md`, etc.).

- *Why:* the placeholder path is fixed by the request; a single file is easy to consume as agent context.
- *Alternatives considered:* splitting into multiple files (rejected — the request names one file).

### D2 — Canonical `/` separator, `_` documented as an alias

Standardize on `hh/<type>/<description>` and `ai/<agent-name>/<description>`; note `hh_`/`ai_` as accepted legacy aliases.

- *Why:* the request's examples table uses `/`, while the prefix rules mention both; picking one canonical form avoids ambiguity while keeping both valid.
- *Alternatives considered:* treating both equally (rejected — no default weakens the convention); slash-only (rejected — would drop a form the request explicitly allows).

### D3 — Branch taxonomy

- Humans: `hh/<type>/<description>` where `<type>` is a standard Git type (`feature`, `bugfix`, `hotfix`, `refactor`, `chore`, `docs`, `test`, `release`).
- Agents: `ai/<agent-name>/<description>` where `<agent-name>` identifies the tool (`aider`, `opencode`, `pi-agent`, etc.).
- Descriptions are lowercase kebab-case (`[a-z0-9-]`), no spaces or uppercase.

- *Why:* a predictable structure keeps branches sortable, greppable, and self-describing; naming the agent supports provenance.
- *Alternatives considered:* a flat type-only scheme (rejected — loses provenance, the whole point).

### D4 — Guardrails stated as hard rules

State explicitly, as rules: agents **MUST NEVER** push directly to `main`, `master`, `production`, or stable staging/release branches; every `ai/*` branch merges only via Pull/Merge Request with explicit human review and approval by an `hh` developer; commits carry AI metadata (`Co-authored-by: AI Agent <agent@local>` and/or a short prompt summary).

- *Why:* these are the request's core safety requirements and must read as non-negotiable, not suggestions.
- *Alternatives considered:* a softer "recommended" tone (rejected — undermines the guardrail).

### D5 — Maintenance commands that are safe by default

Give commands to list (`git branch --list 'ai/*'`), track merged agent branches (`git branch --merged`), safely delete merged ones (`git branch -d`), and warn that `-D` force-deletes unmerged work. Include a remote-prune step.

- *Why:* the request asks for listing/tracking/safe-deletion commands; safe-by-default avoids accidental data loss.
- *Alternatives considered:* a single aggressive one-liner with `-D` (rejected — unsafe).

### D6 — CI/CD guidance matched to the repo's reality

Because the repo has no CI yet, present the section as recommendations for GitHub Actions (path `.github/workflows/`), with a short illustrative snippet and a table mapping agent branches to stricter checks (linters, static analysis, security scanning, coverage thresholds). Clearly label it as guidance, not an existing pipeline.

- *Why:* the request asks for "brief guidelines"; labeling avoids implying a pipeline exists.
- *Alternatives considered:* assuming a specific existing CI (rejected — none exists).

### D7 — Repo facts as illustrative context

Use the real default branch (`main`) and GitHub remote in examples, while keeping the rules portable to `master`/other hosts.

### D8 — Formatting

Clear `#`/`##`/`###` headings, bold highlights, fenced code blocks, and comparison/allowed-vs-forbidden tables. Professional tone, no emoji, English throughout.

### D9 — Verification without heavy tooling

Structural and token checks: every required section heading is present; the examples table contains the four example branch names from the request; the forbidden-push rule names `main`, `master`, and `production`; the commit-metadata string `Co-authored-by: AI Agent <agent@local>` appears; the maintenance and CI sections exist; and the sibling `AGENTS*.md`/`CLAUDE.md` files are unchanged (hash check).

## Risks / Trade-offs

- **Over-prescribing beyond the request** → Mitigate by covering exactly the five requested sections and the named examples; extra detail stays illustrative.
- **`_` alias causing confusion** → Mitigate by stating one canonical form and treating `_` as an explicit alias.
- **Maintenance commands differing by shell/OS** → Mitigate with portable command forms and a note.
- **CI snippet mistaken for an applied pipeline** → Mitigate by labeling the section as recommendations and not creating any workflow file.
- **Drift from team practice** → The document is the single source of truth; future revisions are separate changes.

## Migration Plan

Not applicable — additive documentation. Rollback is clearing the file (or `git revert`).

## Open Questions

- Whether to later (a) reference `AGENTS_GIT.md` from `AGENTS.md`/`CLAUDE.md`, (b) add real CI workflow files, or (c) enable GitHub branch protection is a deferrable follow-up that does not change this document's structure or the task breakdown. Default: not in this change.
