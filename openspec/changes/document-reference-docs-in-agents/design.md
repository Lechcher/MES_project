# Design

## Context

`AGENTS.md` (94 lines) has a short "system documents" list under **Design** linking four docs, plus `AGENTS_GIT.md` under **Rules → Git**. The diagram files are unlinked. Main specs live under `openspec/specs/{backend,core,frontend,tooling}`. Known drift (observed by grep):

- No reference doc mentions SQLite; the SQL reference header says PostgreSQL while the runtime is Drizzle + `bun:sqlite`.
- No doc covers live updates (`frontend/realtime-updates`).
- `API_CONTACT_SPECIFICATION.md` lists `requestPasswordReset` / `resetPassword`, but no doc covers SMTP mail delivery (`core/email-delivery`) or the reset flow's architecture.

## Goals / Non-Goals

**Goals:** one place in `AGENTS.md` that indexes all seven docs and says when to update them; close existing drift.

**Non-Goals:** rewriting the docs, translating `SYSTEM_PROCESS_FLOW-vi.md`, touching `DATABASE_SCHEMA_EXAMPLE.sql` / `DATABASE_SCHEMA_EXAMPLE_DIAGRAM.md` (superseded originals), adding CI enforcement.

## Decisions

- **Replace the inline list with a "Reference Documents" section** (table: document, covers, update when). Alternative — inline the docs' content into `AGENTS.md` — rejected: ~4,700 lines, breaks the 500-line file rule and duplicates the sources of truth.
- **Rule lives under Rules → General**, next to the openspec workflow rule, so it is read when changes are planned. Mapping: `backend/graphql-api` → API spec; `backend/persistence` → SQL + DB diagram; `core/*` → architecture + architecture diagram (+ process flow when roles/screens change); `frontend/*` → process flow (+ API spec when operations change); Git workflow → `AGENTS_GIT.md`.
- **SQL reference stays PostgreSQL-flavored** but its header notes the prototype runs SQLite via Drizzle and the Drizzle schema in `backend/` is authoritative for runtime. Alternative — port the SQL to SQLite — rejected as out of scope.
- **Catch-up limited to drift found against main specs**; in-flight changes (`add-backend-run-logs`, etc.) update docs themselves under the new rule.

## Risks / Trade-offs

- [Rule is advisory, not enforced] → tasks template reminder via the rule text; CI check can come later.
- [Catch-up may miss subtle drift] → task 2.1 does a per-spec cross-check before editing.
