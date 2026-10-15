# Tasks

## 1. Document framing: App, Stack, and Design

- [x] 1.1 Open the empty `AGENTS.md` (repo root) and author the title and `## App` section, following the `AGENTS_Example.md` shape: state the app name (MES prototype), that the platform is web, and the directory layout (`frontend/`, `backend/`). Verify by confirming the file is no longer empty, the title and `## App` heading exist, and the two directories are named.
- [x] 1.2 Author the `## Stack` section as a layer/technology table grounded in the repository (not the example). Include: Frontend — Next.js 16, React 19, Tailwind CSS v4, shadcn/Base UI; Backend — Bun, Elysia, better-auth, Drizzle ORM; API — GraphQL; Language — TypeScript; Linting/Formatting — Biome. Verify by confirming every listed technology appears in the corresponding `package.json` or config file in the repo and no example-only technology (React Native, Sanity, RevenueCat, etc.) appears.
- [x] 1.3 Author the `## Design` section pointing to `DESIGN.md` (dark, data-dashboard theme) and to the system documents (`SYSTEM_ARCHITECTURE.md`, `SYSTEM_PROCESS_FLOW-en.md`, `API_CONTACT_SPECIFICATION.md`, `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql`). Verify by confirming each referenced file exists at the repo root and the section does not restate their contents.

## 2. Rules

- [x] 2.1 Author the `## Rules` section with a `### General` sub-section: plan first and use the `openspec` workflow; keep diffs minimal; follow existing conventions. Verify by confirming the sub-section exists and names the `openspec` workflow.
- [x] 2.2 Add the project-specific rule sub-sections: `### Environment Variables` (`.env` is gitignored; never read, write, or commit it; reference via env vars), `### Dependencies` (update the Stack table when the stack changes; prefer existing/installed packages; verify usage before adding), and `### Code Style` (Biome formats/lints; do not add competing formatters/linters; TypeScript). Verify by confirming each sub-section exists with its rules stated.
- [x] 2.3 Add the `### Git` rules sub-section that states the provenance model (human `hh/` vs AI `ai/` branches), that direct pushes to protected branches are forbidden for agents and merges of `ai/*` require human approval, and links to `AGENTS_GIT.md` as the source of truth (without restating the full policy). Verify by confirming the sub-section exists and links to `AGENTS_GIT.md`.
- [x] 2.4 Add the `### Domain Vocabulary` rule: preserve the shared code tokens exactly — ticket state codes (`REQ`, `ACT`, `PEN`, `APP`, `REJ`, `CAN`, `OVERDUE`) and leave codes (`AL`, `UAL`, `SL`, `USL`, `PL`, `ML`, `CL`, `EL`, `LWP`, `TOIL`, `VTO`). Verify by confirming all seven ticket state codes and all eleven leave codes appear verbatim.

## 3. Verify the document

- [x] 3.1 Confirm the structure matches `AGENTS_Example.md`: the document has a title, then `## App`, `## Stack`, `## Design`, and `## Rules` in that order, with `## Rules` containing grouped sub-sections. Verify by searching `AGENTS.md` for each heading and confirming the order.
- [x] 3.2 Confirm accuracy and no invented facts: every technology in the Stack table traces to a repo file, every referenced document exists, and no example-only content or unrelated tooling appears. Verification passes when no unsourced technology is present.
- [x] 3.3 Confirm all coded tokens are preserved: search `AGENTS.md` for every ticket state code and leave code and confirm exact presence with no additions or omissions. Verification passes when each token is present and identical to the sources.
- [x] 3.4 Confirm the change touches nothing else: record the hashes of the six named source documents plus `AGENTS_Example.md` at the start of apply, then re-run and confirm they equal that baseline; run `git status --porcelain` and confirm the only content changes are inside `openspec/changes/write-agents-guidelines/` and inside `AGENTS.md`.
- [x] 3.5 Read the finished document end to end and confirm it is coherent English, concise, and stands alone as the repo's agent entry point (adapting the example's structure to a web stack). Verification passes on a clean read-through against the outline in `design.md` (D2).

## Workflow follow-up

- Archive the change after the document is reviewed and the project's review requirements are satisfied.
- Verify the archived result: `AGENTS.md` remains complete and the six source documents plus `AGENTS_Example.md` are still unchanged.

## Document Conventions (reference — untracked)

Decisions already made; do not re-litigate during apply:

- **Structure:** mirror `AGENTS_Example.md` — title, `## App`, `## Stack`, `## Design`, `## Rules` (grouped sub-sections). Keep it concise.
- **Sources:** ground the content in `SYSTEM_PROCESS_FLOW-en.md`, `SYSTEM_ARCHITECTURE.md`, `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql`, `API_CONTACT_SPECIFICATION.md`, `AGENTS_GIT.md`, and `DESIGN.md`, plus the actual repo config (`package.json` files, `biome.json`, `backend/lib/auth.ts`). Do not copy the example's mobile stack.
- **Pointers, not duplication:** link to `DESIGN.md` and `AGENTS_GIT.md` rather than restating them.
- **Deliverable:** the single root file `AGENTS.md`; do not edit `AGENTS_Example.md`, `AGENTS_GIT.md`, `frontend/AGENTS.md`, or the six source documents.
- **Language:** English.
