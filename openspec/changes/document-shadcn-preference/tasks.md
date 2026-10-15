# Tasks

## 1. Update the `## Design` section of `AGENTS.md`

- [x] 1.1 In the `## Design` section of `AGENTS.md`, add a statement that this project uses **shadcn** and that contributors and agents must **prefer shadcn components over native TSX/HTML tags**, naming `frontend/components.json` (the shadcn config) and `frontend/src/components/ui/` (where primitives live). Verify by confirming the `## Design` section contains the words `shadcn`, `prefer`, and `native`, and names `components.json` and `components/ui`.
- [x] 1.2 State the concrete convention: add components with the shadcn CLI rather than writing raw markup; compose/extend the existing primitives under `frontend/src/components/ui/` instead of re-implementing them; use a native tag only when no shadcn component (or a thin wrapper) fits, and keep any such tag styled with Tailwind. Verify by confirming each of these points is present in the added text.

## 2. Verify the change

- [x] 2.1 Confirm placement and scope: the addition is inside the `## Design` section (after the existing Design content and before `## Rules`), and no other section of `AGENTS.md` was restructured. Verify by checking the heading order is unchanged (`# …`, `## App`, `## Stack`, `## Design`, `## Rules`, `### …`) and that the new text appears between `## Design` and `## Rules`.
- [x] 2.2 Confirm the change touches nothing else: record the hashes of `AGENTS.md` and the other root documents at the start of apply, then re-run and confirm only `AGENTS.md` changed; run `git status --porcelain` and confirm the only new content change is inside `AGENTS.md` (plus the change directory `openspec/changes/document-shadcn-preference/`).
- [x] 2.3 Read the updated `## Design` section end to end and confirm it is coherent English, reads naturally alongside the existing Design text, and clearly communicates the shadcn preference. Verification passes on a clean read-through.

## Workflow follow-up

- Archive the change after the edit is reviewed and the project's review requirements are satisfied.
- Verify the archived result: `AGENTS.md` still contains the shadcn preference and all other documents are unchanged.

## Document Conventions (reference — untracked)

Decisions already made; do not re-litigate during apply:

- **Target:** the `## Design` section of the root `AGENTS.md` only. Do not restructure other sections or edit any other file.
- **Message:** the project uses shadcn; prefer shadcn components over native TSX/HTML tags.
- **Grounding:** shadcn is configured at `frontend/components.json` and UI primitives live under `frontend/src/components/ui/` (for example `button.tsx`, `input.tsx`).
- **Deliverable:** the edited `AGENTS.md`; nothing else changes.
- **Language:** English.
