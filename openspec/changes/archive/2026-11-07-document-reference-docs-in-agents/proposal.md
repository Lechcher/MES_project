# Proposal

## Why

`AGENTS.md` links only four of the seven project reference documents (the two diagram files are missing), and nothing tells an agent to keep those documents current when an OpenSpec change alters behavior. They have already drifted: none mention the SQLite runtime, live (realtime) updates, or SMTP mail delivery for password reset, all of which are now in `openspec/specs/`.

## What Changes

- Add a reference-document map to `AGENTS.md` covering all seven documents, each with its purpose and the spec areas it mirrors: `AGENTS_GIT.md`, `API_CONTACT_SPECIFICATION.md`, `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql`, `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED_DIAGRAM.md`, `SYSTEM_ARCHITECTURE.md`, `SYSTEM_ARCHITECTURE_DIAGRAM.md`, `SYSTEM_PROCESS_FLOW-en.md`.
- Add a rule to `AGENTS.md`: when a change adds, modifies, or removes spec requirements, the matching reference documents are updated in the same change, and a document and its diagram companion are kept in step.
- One-time catch-up of the existing drift between the reference documents and the current main specs (realtime updates, email delivery / password reset, persistence runtime).

## Capabilities

### New Capabilities
- `tooling/reference-docs`: how the project's reference documents are indexed in the agent guidelines and kept consistent with the OpenSpec specs.

### Modified Capabilities
<!-- none -->

## Impact

- `AGENTS.md` (doc map + maintenance rule).
- The seven reference documents listed above (catch-up edits only where drift exists).
- No code, API, schema, or dependency changes.
