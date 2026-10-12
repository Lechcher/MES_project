# Proposal: Translate DESIGN.md to English

## Why

`DESIGN.md` — the UI design guide for the "WattVision" electrical monitoring system — is currently written in Spanish, which makes the project's design guidance inaccessible to English-speaking contributors and tooling that rely on it. Translating it to English unblocks anyone who needs to follow these visual rules while building the frontend.

## What Changes

- Translate the full content of `DESIGN.md` (36 lines) from Spanish to English, replacing the file in place.
- Preserve all technical values exactly: hex color codes, font names and sizes, spacing multiples, border radii, layout grid, and all Do's and Don'ts.
- Keep product-facing tokens unchanged: the "WattVision" name and the `Bs.` (Bolivianos) currency label remain as written, since they describe what the UI itself displays.
- Improve nothing else: no reformatting beyond the translation, no added/removed sections, no design-value changes. The Spanish original stays recoverable in git history (the file is committed).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a pure documentation change with no spec-level system behavior change, so `.openspec.yaml` declares `skip_specs: true`.

## Impact

- **Files:** `DESIGN.md` (repo root) only. No code, API, dependency, or configuration changes; nothing in `frontend/` or `backend/` is affected.
- **Consumers:** No code or config references `DESIGN.md` by path (verified by search), so in-place replacement breaks nothing. The doc is consumed by humans and coding agents as design guidance.
- **Out of scope:** Translating any other project documents (e.g., `frontend/README.md`, `AGENTS.md` files) and altering any of the design values the document specifies.
