# Tasks

## 1. AGENTS.md

- [x] 1.1 Replace the "system documents" list under **Design** with a **Reference Documents** section linking all seven docs (purpose + diagram companion); verify every link resolves (`ls` each target)
- [x] 1.2 Add the spec-to-document update rule and area mapping under **Rules → General**; verify `AGENTS.md` stays under 500 lines and `bunx biome check` is unaffected

## 2. Catch-up drift

- [x] 2.1 Cross-check each main spec in `openspec/specs/` against the docs in its mapped scope; list gaps in this task's notes before editing
  - Architecture docs: no SMTP email-delivery engine, no live change channel; §11 claims Telegram is the only integration.
  - SQL + diagram: `notifications` described as Telegram-only though `core/email-delivery` records `EMAIL` attempts there; header omits SQLite/Drizzle runtime. No new tables needed (reset tokens live in the auth library's own tables).
  - API spec: no `GET /api/v1/events` live-channel contract.
  - Process flow: no self-service password reset, no live-update behavior.
- [x] 2.2 `SYSTEM_ARCHITECTURE.md` + `SYSTEM_ARCHITECTURE_DIAGRAM.md`: add live-update channel and email-delivery (SMTP) engine; verify both docs name the same engines
  - SQLite note dropped here: `SYSTEM_ARCHITECTURE.md` §1 declares itself technology-neutral. The runtime note lives in the SQL header (2.3).
- [x] 2.3 `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` + diagram: note SQLite/Drizzle runtime in header; add any tables the main specs require that are missing (e.g. password-reset tokens, mail delivery log) to both files; verify each new table appears in both
  - No tables added: reset tokens and sessions are auth-library tables (noted in header). `notifications` comment + diagram now cover the `EMAIL` channel.
- [x] 2.4 `API_CONTACT_SPECIFICATION.md`: document the live-update channel contract per `frontend/realtime-updates`; verify reset operations match `frontend/password-reset` and `core/email-delivery`
- [x] 2.5 `SYSTEM_PROCESS_FLOW-en.md`: add password-reset flow and live-update behavior to affected screens; verify against `frontend/password-reset` and `frontend/realtime-updates` scenarios
- [x] 2.6 `AGENTS_GIT.md`: confirm consistent with **Rules → Git** in `AGENTS.md`; edit only on contradiction
  - Consistent (branch prefixes, protected branches, human approval, AI co-author trailer). No edit.

## 3. Verify

- [x] 3.1 Run `openspec validate document-reference-docs-in-agents --strict` and confirm it passes
