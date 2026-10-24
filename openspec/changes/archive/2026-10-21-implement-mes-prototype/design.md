# Design

## Context

See `proposal.md` — Why for motivation and scope.

Current repository state that shapes the approach:

- `frontend/` is back at the Next.js starter screen (`frontend/src/app/page.tsx`, `layout.tsx`, `globals.css`, one shadcn `button`): commit `11100f1` ("up to main branch for devide more worktree") reverted the previously built MES screens to make the work splittable. Those screens still exist in git history (`9b20f84`, `de1a5e4`, `2487945`, `d9f1c07`, `59de012`) and are described by the six deployed specs under `openspec/specs/frontend/`.
- `frontend/src/lib/mock/**` (the typed in-memory mock layer those screens used) is likewise not in the working tree.
- `backend/` has a Better Auth setup in history (deleted from the tree), an Elysia-less `package.json` (`better-auth`, `bun`, `drizzle-orm` only), and a real generated migration `backend/drizzle/0000_aromatic_hiroim.sql` plus its snapshot.
- An untracked tree of **0-byte placeholders** exists at `backend/src/**` (45 files), `frontend/src/lib/mes/client.ts`, `frontend/src/lib/mes/errors.ts`, `backend/.env.example`, `backend/drizzle.config.ts`, `backend/tsconfig.json`, and `docs/DEVELOPMENT.md`. These record intended file paths; they contain no implementation and must be replaced with working code, not treated as existing work.
- The dark/light theme conflict is real: `AGENTS.md` summarises a dark data-dashboard while `DESIGN.md` is a light IBM Carbon canvas. `DESIGN.md` is authoritative (per the decision below).
- The reference `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` is PostgreSQL; the stack is Bun/Elysia + Drizzle/SQLite. `API_CONTACT_SPECIFICATION.md` is the API authority; `SYSTEM_PROCESS_FLOW-en.md` governs process behavior.

## Goals / Non-Goals

**Goals:**

- Preserve the documented API contract and domain vocabulary while implementing it on the repository's current stack.
- Keep business rules, authorization, persistence, audit, scoring, and notifications consistent across UI and API.
- Make migration and local development repeatable without destroying existing Better Auth data.
- Recover the already-designed UI rather than re-deriving it, so the deployed `openspec/specs/frontend/*` behavior is honored.

**Non-Goals:**

- Add Recruitment, Payroll, or Assets domain behavior.
- Add PostgreSQL support or promise compatibility with the PostgreSQL reference script as executable SQL.
- Replace the documented GraphQL API with REST endpoints.
- Rebuild the frontend visual design from scratch; reuse the built screens and only rewire their data layer and auth.

## Decisions

1. **Keep the API as a single versioned GraphQL boundary.** Expose `POST /api/v1/graphql` from the Bun/Elysia backend and group schema operations by the five documented apps plus shared services. Use domain services between resolvers and persistence so UI code, authorization, and business rules do not depend on database details. This follows the contract and keeps a future transport change from duplicating domain behavior; REST-only routes were rejected because they would change the specified API.

2. **Reuse Better Auth for credentials and sessions.** Retain the existing auth tables and password handling, align configuration with `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET`, and resolve the contract's `Authorization` session token into a viewer in GraphQL context. Link each MES user profile to the Better Auth user ID rather than creating a second, independently keyed identity. This avoids parallel credential stores; passwordless role selection is removed from production. Password-reset delivery must use a configured mail sender and return an explicit failure when delivery is unavailable.

3. **Adapt the reference data model to SQLite instead of running the PostgreSQL script.** Add Drizzle-managed migrations for MES profiles, organization and RBAC, code registries, projects and task history, attendance and leave ledgers, KPI events, settings, notifications, and audit events. Represent enum-like codes as constrained text, IDs and date/timestamp values using SQLite-compatible representations, and preserve the reference schema's foreign keys, uniqueness, checks, and query indexes. Use the KPI event ledger as the score source of truth and keep any monthly summaries derived and rebuildable. The PostgreSQL-only enums, PL/pgSQL triggers, JSONB, and UUID defaults are not copied verbatim. Build additively from the existing `0000` migration so Better Auth tables and data are preserved.

4. **Keep mutations in domain services and commit related records atomically.** Enforce role and scope checks before returning or changing domain records. A task transition, its actor-attributed history, required KPI event, and audit event are committed consistently; Telegram delivery is attempted after the domain commit and its outcome is recorded separately so an external outage cannot falsely roll back or falsely report a successful notification. Validate business rules before writes and map failures to the contract's stable GraphQL error codes.

5. **Use one typed GraphQL client for production UI data.** App screens consume the authenticated API and surface request failures; they do not silently substitute fixtures. Keep deterministic seed data limited to development and tests. The Better Auth user and MES profile share an ID, while the browser receives only viewer and session data required by the contract.

6. **Recover the frontend screens from git history instead of rebuilding them.** Restore the app shell, Jobs, Planning, Performance, and Settings screens and their shared components from the `build-frontend-mock-data` commits, then replace their mock-service calls with the typed GraphQL client. Their rendering behavior, role gating, and domain-token usage already match `openspec/specs/frontend/*`, so re-deriving them would risk regressing spec-covered behavior for no benefit. Keep the recovered components; delete or relocate the mock store so it no longer serves production reads and is reachable only from tests.

7. **Treat `DESIGN.md` as the visual authority and align `AGENTS.md`.** `DESIGN.md` defines the light IBM Carbon direction (white surfaces, charcoal ink, single IBM Blue `#0f62fe` accent, flat-square 0–4px corners, IBM Plex Sans, hairline borders, footer-only inversion) and the frontend specs already reference the `DESIGN.md` theme. The stale one-line dark-dashboard summary in `AGENTS.md`'s Design section is corrected as part of implementation. Considered and rejected: rewriting `DESIGN.md` to a dark dashboard, which would contradict the deployed theme spec, the built UI, and the earlier `build-frontend-mock-data` alignment; and leaving the conflict unresolved, which would leave two authorities for acceptance.

8. **Generate reports from scoped domain queries.** Build each report only after applying the same server-side scope as its corresponding read operation. Store generated files outside source control, return the documented `ExportResult`, and serve its URL through an authenticated download route. Prefer established repository dependencies where available; verify official usage and current package versions before adding GraphQL or document-generation packages.

9. **Follow the API contract where it conflicts with an existing spec.** The API contract lets an `EMPLOYEE` cancel their own ticket; the deployed Jobs spec excluded it. Apply the API's own-ticket permission in both UI and server behavior and update the Jobs spec accordingly, since `SYSTEM_PROCESS_FLOW-en.md` states it governs behavior and is consistent with the API.

## Risks / Trade-offs

- [The PostgreSQL reference uses unsupported SQLite constructs] → Translate the schema into additive migrations and verify constraints, query results, and seed idempotency against a clean SQLite database.
- [The broad GraphQL contract and module scope can hide missing operations] → Build and test each module against the operation inventory and examples in `API_CONTACT_SPECIFICATION.md`; validate the schema against all documented queries and mutations.
- [SQLite write contention can affect concurrent workflow actions] → Keep transactions short, add indexes from query patterns, enable foreign keys, and test concurrent conflicting transitions.
- [Better Auth's current local URL and session handling do not yet match the API contract] → Resolve session creation and token lookup in the GraphQL adapter, move secrets and URLs to environment configuration, and test expiry, logout, and password-reset failures.
- [External Telegram or report generation can fail after a user action] → Persist domain changes first, record delivery/generation outcomes explicitly, and never return a success-shaped result when the requested artifact was not generated.
- [The reverted frontend makes it unclear what "existing UI" means] → Recover the exact screens from the named commits, compare them against `openspec/specs/frontend/*` scenarios, and verify each screen still satisfies its spec after rewiring.
- [The 0-byte placeholder tree could be mistaken for working code] → Treat every placeholder file as empty, prioritize the runnable path (entry point, schema, resolvers, client), and verify by execution (build, tests, HTTP request) rather than by file presence.
- [Missing backend dependencies block the start of work] → Confirm current official usage and versions for Elysia and the GraphQL/report packages first, add only what is required, and record the additions in the Stack table.
- [Two documents disagree on theme and on employee cancellation] → Resolve both explicitly (decisions 7 and 9) and update the losing document in the same change.

## Migration Plan

1. Confirm work stays on the already checked-out `ai/copilot/implement-mes-prototype` per `AGENTS_GIT.md`; preserve pre-existing worktree changes, and back up any existing SQLite database before applying schema changes.
2. Add additive, versioned migrations alongside the current Better Auth tables; do not drop or rename existing auth/session tables. Replace the 0-byte placeholder files with real content.
3. Recover the frontend screens from the `build-frontend-mock-data` commits, then rewire them to the API in a follow-up step so the UI diff stays reviewable.
4. Apply migrations and development/test-only seed data to a clean database, then verify migration and seed repeatability.
5. Deploy the backend/API and frontend together after compatibility checks; keep the prior application build available for rollback.
6. On rollback, restore the prior build and retain additive tables. Restore a database backup only if migration or data-integrity verification requires it; never remove user/session data as part of routine rollback.

## Open Questions

None that block the specified interface or architecture. The mail sender and local download storage location can be configured through environment-specific deployment settings without changing the contract.
