# Proposal

## Why

Every project document now exists — `SYSTEM_PROCESS_FLOW-en.md` (behavior), `SYSTEM_ARCHITECTURE.md` (structure), `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` (data), `API_CONTACT_SPECIFICATION.md` (interface), `DESIGN.md` (visual design), and `AGENTS_GIT.md` (Git collaboration) — but the repository's front door for coding agents, `AGENTS.md`, is an empty 0-byte placeholder. Agents landing in the repo have no concise orientation: no statement of what the app is, no stack summary, no design pointer, and no working rules. A reference example, `AGENTS_Example.md`, shows the intended shape. Filling `AGENTS.md` in gives every agent (and new contributor) a fast, correct starting point and a single place to state project-specific rules.

## What Changes

- Write `AGENTS.md` (currently empty, 0 bytes) as the MES prototype's agent guidelines, following the structure of `AGENTS_Example.md`: a title, then `## App`, `## Stack`, `## Design`, and `## Rules` sections.
- **App** — name (`MES prototype`), platform (web), and the directory layout (`frontend/`, `backend/`).
- **Stack** — a layer/technology table reflecting the tools actually present in the repo: Next.js 16 + React 19 + Tailwind CSS v4 + shadcn/Base UI on the frontend; Bun + Elysia + better-auth + Drizzle ORM on the backend; GraphQL as the API contract; Biome for linting/formatting; TypeScript throughout.
- **Design** — point to `DESIGN.md` (dark, data-dashboard theme) and the architecture/process/API/data documents that describe the system.
- **Rules** — the project-specific working rules an agent must follow, including: plan first and use the `openspec` workflow; keep diffs minimal; environment-variable handling (`.env` is gitignored, never read/write/commit it); dependency policy; the mandatory Git branching and review rules with a pointer to `AGENTS_GIT.md`; code style via Biome; TypeScript; and the shared domain vocabulary (ticket state codes and leave codes) that must be preserved verbatim.
- Keep the document in English and in Markdown, consistent with the other root documents.
- Leave the six named source documents, `AGENTS_Example.md`, and every other project file unchanged; this is additive documentation.

## Capabilities

### New Capabilities

None. This is a pure documentation change — it writes a guidance document and defines no runtime behavior change, so `.openspec.yaml` declares `skip_specs: true`.

### Modified Capabilities

None.

## Impact

- **Files:** Adds content to `AGENTS.md` (repo root) only. `AGENTS_Example.md`, `AGENTS_GIT.md`, `DESIGN.md`, `SYSTEM_PROCESS_FLOW-en.md`, `SYSTEM_ARCHITECTURE.md`, `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql`, `API_CONTACT_SPECIFICATION.md`, and all other files are left unchanged.
- **Consumers:** `AGENTS.md` is read by humans and coding agents as the repo's entry-point guidance. Note that `frontend/AGENTS.md` exists separately and is managed by `next dev`; the root `AGENTS.md` complements it and does not replace or edit it.
- **Out of scope:** Any implementation or code change; restating the full contents of the source documents (the guide summarizes and points to them); changing `AGENTS_GIT.md`, which remains the single source of truth for Git collaboration; and any behavior, code, or value the source documents describe.
