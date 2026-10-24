# Tasks

## 1. Foundation, dependencies, and configuration

- [x] 1.1 Confirm the worktree is on `ai/copilot/implement-mes-prototype` and preserve the existing dirty worktree; verify with `git branch --show-current` and `git status --short` that no pre-existing tracked or untracked work was discarded.
- [x] 1.2 Replace the 0-byte placeholder trees (`backend/src/**`, `backend/.env.example`, `backend/drizzle.config.ts`, `backend/tsconfig.json`, `frontend/src/lib/mes/**`, `docs/DEVELOPMENT.md`) with real content; verify no placeholder file remains empty with `find backend/src frontend/src/lib/mes docs -type f -size 0`.
- [x] 1.3 Confirm official usage and current versions for the missing Elysia, GraphQL, and report-generation packages; update only the required manifests and the project Stack table, then verify dependency installation and lockfiles.
- [x] 1.4 Configure backend/frontend URLs, auth secrets, database path, export storage, and reset-email sender through environment variables; document required values in `.env.example` and the developer setup guide, then verify startup reports missing required configuration explicitly.
- [x] 1.5 Add the Elysia service entry point and health check; verify the backend starts with the documented Bun command and responds to the health request.

## 2. Persistence and authentication

- [x] 2.1 Define the Drizzle SQLite domain schema and additive migrations alongside the existing Better Auth tables; verify a clean-database migration, repeat application, foreign keys, constraints, and indexes, and document migration and backup procedures.
- [x] 2.2 Link MES profiles to Better Auth identities and implement GraphQL login, logout, viewer, password reset, password change, session expiry, and token resolution; verify authenticated/unauthenticated integration tests and document the session flow.
- [x] 2.3 Add deterministic local development/test seeds for roles, users, org structure, registries, tasks, attendance, leave, and KPI examples; verify repeatable seed tests and prove production startup does not load sample records or credentials.

## 3. GraphQL and domain services

- [x] 3.1 Implement `POST /api/v1/graphql`, the documented types and operation inventory, pagination, filters, introspection access, and error-code mapping; verify schema/transport tests against the API contract examples and document how to run the API contract checks.
- [x] 3.2 Implement server-side app/action authorization and personal, department, company, and all-data scopes; verify an automated role-by-operation matrix, including forbidden direct API calls and no out-of-scope record disclosure.
- [x] 3.3 Implement Jobs and Projects queries/mutations, task transitions, progress history, daily quick-add, deadline rules, Auto-forking, extension and late-submission requests, and cancellation (including an `EMPLOYEE` cancelling their own ticket); verify state-machine, scope, audit-history, and invalid-input tests, and document the workflow rules.
- [x] 3.4 Implement Planning queries/mutations for matrix calendars, attendance, leave approval, penalty leave, balances, and overtime; verify role-scope, ledger, approval, payroll-rule, and invalid-date tests, and document the leave and attendance behavior.
- [x] 3.5 Implement KPI rule events, monthly summaries, and all three audit-level queries; verify every bonus/penalty trigger and score aggregation against fixed test cases, and document the deterministic scoring rules.
- [x] 3.6 Implement Settings & IAM operations for users, departments, permissions, settings, and webhook configuration; verify create/update/deactivate and permission-change tests, including corresponding audit events, and document administrator workflows.
- [x] 3.7 Implement append-only system audit queries and per-module summaries, plus Telegram notification creation and delivery outcomes; verify ordering, filters, immutability, enabled/disabled delivery, and failure-recording tests, and document notification configuration.

## 4. Report generation

- [x] 4.1 Generate the specified Jobs, Planning, Performance, and Audit Log PDF/XLSX/CSV files and `ExportResult` URLs from authorized server-side queries; verify output format/content and role-scope tests for each report, and document download behavior and storage cleanup.

## 5. Frontend recovery and API integration

- [x] 5.1 Recover the app shell, Jobs, Planning, Performance, and Settings screens and shared components from the `build-frontend-mock-data` commits (`9b20f84`, `de1a5e4`, `2487945`, `d9f1c07`, `59de012`); verify each recovered screen satisfies the scenarios in `openspec/specs/frontend/*` before rewiring, and record any screen that does not.
- [x] 5.2 Add the typed authenticated GraphQL client and shared loading, empty, and error states; verify client tests for session headers, pagination, GraphQL errors, and failed requests without fixture fallback.
- [x] 5.3 Implement authenticated sign-in, protected routes, session restoration, role-aware dashboard, and app navigation; verify role-based UI tests and shared-token visual checks against the light IBM Carbon tokens.
- [x] 5.4 Replace the recovered screens' mock-service calls with API-backed reads and mutations, keeping the mock store reachable only from tests; verify no production route imports fixtures and that failed requests surface an actionable error.
- [x] 5.5 Connect Jobs screens and actions to persisted GraphQL data and generated reports; verify ticket lifecycle, employee-owned cancellation, filters, Auto-forking, and report flows for each role.
- [x] 5.6 Connect Planning screens to persisted calendars, leave, attendance, approval, balance, and overtime operations; verify role-specific views and generated report flows.
- [x] 5.7 Connect Performance dashboards, audit tables, ranking chart, and exports to persisted KPI queries; verify score rendering and authorized table/export visibility for every role.
- [x] 5.8 Connect Settings & IAM and the new Audit Log app to their API operations; verify menu visibility, persisted settings, newest-first immutable events, filtering, and export flows for authorized roles.
- [x] 5.9 Align the stale dark-dashboard sentence in `AGENTS.md`'s Design section with `DESIGN.md`; verify every screen uses the white canvas, charcoal ink, IBM Blue accent, flat-square corners, and IBM Plex Sans, and that footer inversion still holds.
- [x] 5.10 Restrict sample records and demo credentials to development/test entry points; verify production builds and runtime do not import or silently substitute fixtures.

## 6. Integrated verification

- [x] 6.1 Exercise authenticated journeys for all five roles across Jobs, Planning, Performance, Settings, and Audit Log; verify UI visibility, server authorization, persistent mutations, and audit/KPI side effects against the acceptance scenarios.
- [x] 6.2 Verify database migration/seed repeatability and rollback safety using a disposable SQLite database; confirm existing Better Auth sessions and user data are preserved.
- [x] 6.3 Run backend/frontend tests, type checks, Biome, and production builds; resolve failures and record the successful commands and any remaining environment prerequisites in the developer documentation.

## Workflow follow-up

- Archive the change after human review and approval, and verify the archived specifications.
