# Tasks

## 1. Overview, philosophy, and branch naming conventions

- [x] 1.1 Create/fill `AGENTS_GIT.md` (currently 0 bytes) with a title, a one-paragraph intro naming the document's purpose (mandatory Git branching strategy and human/AI-agent collaboration guidelines for this repo), and **Section 1 — Overview & Philosophy**. Cover: why human-authored branches must be distinguishable from AI-generated ones; and the four core principles — **Code Provenance**, **Enhanced CI/CD scrutiny for AI code**, **Accountability**, and **Easy Repository Maintenance** (cleanup of ephemeral AI branches). Verify by confirming the file is non-empty, the section heading exists, and all four principles are named.
- [x] 1.2 Add **Section 2 — Branch Naming Conventions**: the structure `hh/<type>/<description>` (humans) and `ai/<agent-name>/<description>` (agents); the prefix rules (`hh/`/`hh_` reserved for human developers; `ai/`/`ai_` reserved for code generated or refactored by AI agents such as Aider, OpenCode, Pi Agent); the canonical `/` separator with `_` documented as an accepted alias; and an **examples table** containing `hh/feature/auth-system`, `hh/hotfix/db-connection`, `ai/aider/refactor-user-service`, `ai/agent/add-unit-tests`. Verify by confirming all four example branch names appear in a table and both prefix families are documented.

## 2. Workflow guardrails and maintenance commands

- [x] 2.1 Add **Section 3 — Workflow & Guardrails** stated as hard rules: AI agents **MUST NEVER** push directly to `main`, `master`, `production`, or stable staging branches; every `ai/*` branch is merged only via Pull/Merge Request and requires explicit manual review and approval by a human developer (`hh`); commit messages must include AI metadata, including the literal `Co-authored-by: AI Agent <agent@local>` and/or a brief prompt summary. Verify by confirming the forbidden-push rule names `main`, `master`, and `production`, the human-approval rule is present, and the `Co-authored-by: AI Agent <agent@local>` string appears verbatim.
- [x] 2.2 Add **Section 4 — Maintenance & Utility Commands** with fenced code blocks: listing AI branches (`git branch --list 'ai/*'`), tracking merged ones (`git branch --merged`), safely deleting merged AI branches (`git branch -d $(git branch --list 'ai/*')`), a warning that `-D` force-deletes unmerged work, and a remote prune step. Verify by confirming each command appears in a code block and the `-D` warning is present.

## 3. CI/CD recommendations and document finish

- [x] 3.1 Add **Section 5 — CI/CD Integration Recommendations** (labeled as guidance, since the repo has no CI yet): a table/summary of stricter automated checks applied to branches starting with `ai/` (linters, static analysis, security scanning, coverage thresholds) and a short illustrative GitHub Actions snippet. Verify by confirming the section heading exists, that it names all four check categories, and that it is explicitly described as a recommendation.
- [x] 3.2 Finish the document: ensure the section order is 1→5 as specified, headings are consistent (`#`/`##`), a short "rules at a glance" or summary/limited-use note is included if useful, and the document reads as clean, production-ready Markdown. Verify by confirming the five section headings appear in the required order and the file contains no placeholder or unfinished text.

## 4. Verify the document

- [x] 4.1 Confirm structural completeness: every required section heading (Overview & Philosophy; Branch Naming Conventions; Workflow & Guardrails; Maintenance & Utility Commands; CI/CD Integration Recommendations) is present, at the intended heading level, and in order. Verify with a heading check (grep `^#`) and confirm no required section is missing.
- [x] 4.2 Confirm content fidelity against the request: the examples table contains the four named branch examples; the prefix rules name both `hh/`/`hh_` and `ai/`/`ai_`; the guardrails name `main`, `master`, `production`; the `Co-authored-by: AI Agent <agent@local>` string is present; the AI-branch deletion command is present; and the AI CI check categories are present. Verification passes when every listed item appears.
- [x] 4.3 Confirm the change touches nothing else: record `shasum -a 256 AGENTS.md AGENTS_BACKEND.md AGENTS_FRONTEND.md CLAUDE.md` at the start of apply, then re-run it and confirm all four hashes equal that baseline; run `git status --porcelain` and confirm the only new/changed content relative to the apply-time baseline is inside `AGENTS_GIT.md`.
- [x] 4.4 Read the finished document end to end and confirm it is coherent, professional English with no leftover placeholder text, uses headings/bold/code blocks/tables as requested, and stands alone as the repo's Git collaboration contract. Verification passes on a clean read-through.

## Workflow follow-up

- Archive the change after `AGENTS_GIT.md` is reviewed and the project's review requirements are satisfied.
- Verify the archived result: `AGENTS_GIT.md` remains complete and the sibling `AGENTS*.md`/`CLAUDE.md` files are still unchanged.

## Document Conventions (reference — untracked)

Decisions already made; do not re-litigate during apply:

- **Deliverable:** `AGENTS_GIT.md` only (repo root). Do not edit `AGENTS.md`, `AGENTS_BACKEND.md`, `AGENTS_FRONTEND.md`, `CLAUDE.md`, or any other file.
- **Language/format:** professional English; Markdown headings, bold highlights, fenced code blocks, and tables.
- **Separator:** canonical `/` (`hh/<type>/<description>`, `ai/<agent>/<description>`); `hh_`/`ai_` documented as accepted aliases.
- **Required sections (in order):** 1) Overview & Philosophy; 2) Branch Naming Conventions; 3) Workflow & Guardrails; 4) Maintenance & Utility Commands; 5) CI/CD Integration Recommendations.
- **Exact strings to include:** the four example branches (`hh/feature/auth-system`, `hh/hotfix/db-connection`, `ai/aider/refactor-user-service`, `ai/agent/add-unit-tests`) and `Co-authored-by: AI Agent <agent@local>`.
- **Guardrail:** agents MUST NEVER push directly to `main`, `master`, `production`, or stable staging; `ai/*` merges require human `hh` review.
- **Repo facts:** default branch `main`, GitHub `origin`, no CI yet (so Section 5 is guidance, and no workflow files are created).
