# Proposal

## Why

`AGENTS.md`'s `## Design` section describes the visual theme and links to `DESIGN.md`, but it says nothing about **how** UI should be built. The project is configured for **shadcn** (`frontend/components.json`, style `base-nova`, UI primitives under `frontend/src/components/ui/` such as `button.tsx`), yet a contributor or agent reading the guide has no instruction to use those components. The result is inconsistent UI: some work will hand-roll raw TSX/HTML tags (e.g. a bare `<button>` or `<input>`) instead of composing the established shadcn primitives. Stating the preference explicitly in `AGENTS.md` keeps generated and hand-written UI consistent with the project's component system.

## What Changes

- Update the `## Design` section of `AGENTS.md` to state that this project uses **shadcn** and that contributors/agents must **prefer shadcn components over native TSX/HTML tags**.
- State the concrete convention: UI primitives live in `frontend/src/components/ui/` and are configured via `frontend/components.json`; add components with the shadcn CLI rather than writing raw markup; compose/extend the existing primitives instead of re-implementing them; use native tags only when no shadcn component (or a thin wrapper) fits, and keep them styled with Tailwind.
- Keep the addition inside `## Design` as requested; do not restructure other sections.
- Keep the document in English and Markdown, consistent with the rest of `AGENTS.md`.
- Leave every other project file unchanged; this is additive documentation.

## Capabilities

### New Capabilities

None. This is a pure documentation change — it edits a guidance document and defines no runtime behavior change, so `.openspec.yaml` declares `skip_specs: true`.

### Modified Capabilities

None.

## Impact

- **Files:** Edits `AGENTS.md` (repo root, `## Design` section) only. All other files are left unchanged.
- **Consumers:** `AGENTS.md` is read by humans and coding agents as the repo's entry-point guidance; the added rule influences how UI code is written but changes no code, config, or build output.
- **Out of scope:** Any implementation or code change; adding or editing shadcn components; changing `frontend/components.json`, `frontend/AGENTS.md`, or `DESIGN.md`; and any behavior, code, or value the source documents describe.
