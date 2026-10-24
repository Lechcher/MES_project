# Proposal

## Why

The repository currently holds the Next.js starter screen, a Better Auth setup, a Drizzle-generated SQLite migration, and the project's specification documents — but not the operational MES modules, their GraphQL services, or any domain implementation. `SYSTEM_ARCHITECTURE.md`, `SYSTEM_PROCESS_FLOW-en.md`, `API_CONTACT_SPECIFICATION.md`, and `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` describe a working system that does not exist in code. Implementing the documented workflows end to end turns the prototype into a usable system for work planning, attendance and leave, performance, administration, and audit.

## What Changes

- Build the five documented apps and shared core as a persistent full-stack application: authenticated role-aware UI, a GraphQL API, and durable domain data.
- Replace the runtime-only mock data path with API-backed reads and mutations; retain deterministic seed data for local development and tests.
- Restore the previously built frontend screens (app shell, Jobs, Planning, Performance, Settings) from git history — they were reverted to the Next.js starter in `11100f1` — and rewire them from the in-memory mock services to the authenticated API instead of rebuilding the UI from scratch.
- Implement the shared ticket and leave registries, role/scope enforcement, task and leave workflows, KPI scoring, append-only audit events, Telegram notification delivery, and documented print/export outputs.
- Add the technical Audit Log app and include it in the launcher only for `SUPER_ADMIN` and `TECH_LEAD`.
- Use the repository's Bun/Elysia, Better Auth, and Drizzle/SQLite stack. Adapt the PostgreSQL reference schema to SQLite migrations; PostgreSQL compatibility is not a goal of this change.
- Follow the light IBM Carbon theme defined in `DESIGN.md` as the visual authority, and align the stale one-line dark-dashboard summary in `AGENTS.md`'s Design section with it.
- **BREAKING** (frontend behavior): remove passwordless demo role selection and the zero-network mock data path; apps now require an authenticated session and read/write through `POST /api/v1/graphql`.
- Keep the future Recruitment, Payroll, and Assets modules out of scope.

## Capabilities

### New Capabilities

- `backend/graphql-api`: Implement the versioned GraphQL contract, authentication operations, app queries and mutations, pagination, filtering, and stable error responses.
- `backend/persistence`: Persist MES entities and workflow history in SQLite with Drizzle migrations, constraints, indexes, and repeatable development/test seed data.
- `core/authorization`: Enforce app access, operation permissions, and personal, department, and company data scopes on the server.
- `core/kpi-scoring`: Calculate and record reproducible KPI events and summaries from the documented fixed rule set.
- `core/audit-notifications`: Record append-only system audit events and dispatch configured Telegram notifications for documented events.
- `core/report-exports`: Generate the documented PDF, XLSX, and CSV outputs using the caller's authorized data scope.
- `frontend/audit-log`: Provide the role-restricted system and per-module audit stream, filters, activity summaries, and export entry points.

### Modified Capabilities

- `frontend/app-shell`: Replace passwordless, ephemeral demo selection with authenticated sessions; expose the Audit Log app only to its authorized roles; apply the light IBM Carbon theme from `DESIGN.md`.
- `frontend/jobs`: Use persisted API workflows and generated print/export outputs; follow the API contract's role annotations for actions, including employee-owned cancellation.
- `frontend/mock-data`: Replace the runtime no-network mock store with GraphQL-backed persistent data access while retaining exact domain tokens and paginated list shapes; keep fixtures to development and tests.
- `frontend/planning`: Connect calendar, attendance, leave, approval, and overtime workflows to persisted API data and generated outputs.
- `frontend/performance`: Use persisted KPI summaries and audit views, and provide generated reports and workbook exports.
- `frontend/settings`: Persist directory, organization, RBAC, webhook, and system-audit operations through the API.

## Impact

- Affects `frontend/` (Next.js UI restored from git history and rewired, authentication client, app modules, data access, and reports) and `backend/` (Bun/Elysia GraphQL service, Better Auth integration, Drizzle schema/migrations, domain services, and SQLite database).
- The worktree currently contains 0-byte placeholder trees for `backend/src/**`, `frontend/src/lib/mes/**`, `backend/.env.example`, `backend/drizzle.config.ts`, `backend/tsconfig.json`, and `docs/DEVELOPMENT.md`; only `backend/drizzle/0000_aromatic_hiroim.sql` and its snapshot hold real content. These placeholders are reference paths to fill with working code, not existing implementation.
- `backend/package.json` declares only `better-auth`, `bun`, and `drizzle-orm`; the Elysia, GraphQL, and report-generation dependencies the documented stack requires are not installed yet.
- Implements the contract in `API_CONTACT_SPECIFICATION.md` at `POST /api/v1/graphql`; uses `SYSTEM_PROCESS_FLOW-en.md` and `SYSTEM_ARCHITECTURE.md` for workflows and module boundaries, and adapts `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` to SQLite.
- Preserves ticket-state and leave-code tokens verbatim across the UI, API, and database.
- Planning assumptions recorded for implementation: the light IBM Carbon `DESIGN.md` is authoritative over the stale dark-dashboard sentence in `AGENTS.md`, and the existing Jobs spec excludes Employee cancellation while the API contract allows an Employee to cancel their own ticket — follow the API contract's per-operation annotations and update the conflicting spec text. Validate both decisions during implementation.
- Implementation stays on the already checked-out branch `ai/copilot/implement-mes-prototype` per `AGENTS_GIT.md`; this proposal does not create or switch branches and preserves the existing dirty worktree.
