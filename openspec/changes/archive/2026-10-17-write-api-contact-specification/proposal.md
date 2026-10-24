# Proposal

## Why

The MES prototype's behavior, structure, and data model are already documented — `SYSTEM_PROCESS_FLOW-en.md` (roles, screens, flows), `SYSTEM_ARCHITECTURE.md` (modules, engines, authorization), and `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` (the persisted domain model) — but there is no single contract that tells a client how to talk to the system. An empty placeholder, `API_CONTACT_SPECIFICATION.md`, already sits at the repo root, so the API path is a dead end that promises a contract and delivers nothing. Without a shared contract, frontend and backend work drifts, and the two-layer authorization model has nothing to enforce at the interface boundary.

## What Changes

- Write `API_CONTACT_SPECIFICATION.md` (currently empty, 0 bytes) as a comprehensive **GraphQL API contract** using a **JSON** wire format, derived from `SYSTEM_PROCESS_FLOW-en.md`, `SYSTEM_ARCHITECTURE.md`, and `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql`.
- Define the API conventions: GraphQL-over-HTTP transport, a single versioned endpoint, JSON request/response envelopes, operation naming, pagination, filtering/sorting, and a consistent error format.
- Define **authentication and session** operations (login, logout, current session/user, password/account flows) and how session+bearer authentication and role-based authorization protect every operation, mapped to the two-layer authorization model (app-level and view/action-level guards) and the role set (`SUPER_ADMIN`, `TECH_LEAD`, `HR_MANAGER`, `DEPT_HEAD`, `EMPLOYEE`).
- Define the GraphQL type system (object types, enums, inputs, scalars) for the shared domain model — the ticket state codes (`REQ`, `ACT`, `PEN`, `APP`, `REJ`, `CAN`, `OVERDUE`) and leave codes (`AL`, `UAL`, `SL`, `USL`, `PL`, `ML`, `CL`, `EL`, `LWP`, `TOIL`, `VTO`), users, departments, roles, and permissions — grounded in the optimized schema's tables.
- Define **queries and mutations** covering all four apps plus shared/core concerns:
  - **Jobs** — projects and tasks (create/allocate, accept, progress reporting, submit/approve/return, cancel, extension requests, late-submission explanation), task state history, attachments.
  - **Planning** — matrix calendar, attendance records, leave requests (register/approve/reject), penalty leave assignment (`UAL`/`USL`), leave balances (`AL`/`TOIL`) and overtime.
  - **Performance** — personal KPI dashboard, KPI score events, and the three-level audit views (company, department, employee).
  - **Settings & IAM** — user directory and account lifecycle, organization structure and auto-forking, RBAC roles/permissions, system audit logs, and Telegram webhook/notification configuration.
  - **Shared/core** — the global code registries, notification log, and print/export operations.
- Specify authorization per operation (required role + scope: `All`, `Company-wide`, `Department-only`, `Personal`), preserving documented asymmetries (only HR/Super Admin assign `UAL`/`USL`; only Super Admin/Tech Lead manage RBAC and webhook; HR sees the user directory only; audit tables hidden from Employees).
- Preserve all coded tokens, values, and rules exactly: ticket state codes and `ACT - ...` badges, leave codes, role/app names, KPI point values, deadlines, and progress milestones.
- Keep the document in English and in Markdown, using GraphQL SDL code blocks, JSON examples, and Markdown tables consistent with the existing docs.
- Leave the three source documents and every other project file unchanged; this is additive documentation.

## Capabilities

### New Capabilities

None. This is a pure documentation change — it writes a contract document and defines no runtime behavior change to the system, so `.openspec.yaml` declares `skip_specs: true`.

### Modified Capabilities

None.

## Impact

- **Files:** Adds content to `API_CONTACT_SPECIFICATION.md` (repo root) only. `SYSTEM_PROCESS_FLOW-en.md`, `SYSTEM_ARCHITECTURE.md`, `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql`, and all other files are left unchanged.
- **Consumers:** The document is consumed by humans and coding agents as the interface contract between the `frontend/` and `backend/` workspaces. No code, config, or build file references `API_CONTACT_SPECIFICATION.md` by path today, so filling in the file breaks nothing. It is a specification, not generated code — it adds no GraphQL schema file, resolver, or client.
- **Out of scope:** Any implementation or code change (no resolvers, no GraphQL server, no client codegen); the concrete runtime stack beyond the transport/wire-format conventions the contract needs (the schema itself remains the domain contract); the persistence implementation details that are not part of the public contract; and changing any behavior, code, or value the source documents describe.
