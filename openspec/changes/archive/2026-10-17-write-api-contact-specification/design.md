# Design

## Context

See `proposal.md` — Why. The change must produce `API_CONTACT_SPECIFICATION.md` (repo root, currently 0 bytes) from three sources:

- `SYSTEM_PROCESS_FLOW-en.md` (263 lines) — the behavior reference: the two standard code tables (ticket states, leave codes), the two-layer authorization/permission matrix, and the four app sections written as Purpose → Functions & Operational Flow → Functional Screens & Role-Based Display → Print/Export.
- `SYSTEM_ARCHITECTURE.md` (294 lines) — the structure reference: module catalog, core engines (RBAC & Permission Matrix, Telegram Webhook Notification, Deterministic KPI, Auto-forking, Print/Export), shared domain model, authorization architecture, and integration points.
- `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` (755 lines) — the data reference: 25 tables, 4 views, the code registries, RBAC tables, and the KPI/leave-fund/notification tables that the contract's types must mirror.

Constraints that shape the approach:

- The user chose a **GraphQL** contract with a **JSON** wire format, including **auth/session** operations, covering **all four apps plus shared/core**.
- This is a documentation change only. Project doc conventions: standalone Markdown files at the repo root, English, with ASCII/tables and code blocks. This document uses GraphQL SDL and JSON blocks plus Markdown tables.
- No specs exist in `openspec/specs/` (only `.gitkeep`), and no code, config, or build file references `API_CONTACT_SPECIFICATION.md` or the source documents by path. This change declares `skip_specs: true`.
- The prototype's actual runtime is a bare skeleton (a single `GET /` on an Elysia server and a better-auth/Drizzle auth schema); the contract must not depend on it, and must not add code to it.

## Goals / Non-Goals

**Goals:**

- A single, self-contained interface contract that lets a client developer or coding agent implement against the system without reading the three source documents end to end.
- A GraphQL type system that faithfully mirrors the persisted domain model (the optimized schema's tables and code registries) while staying at the contract level.
- Complete query/mutation coverage of the documented behavior for Jobs, Planning, Performance, Settings/IAM, and shared/core concerns, including auth/session.
- Enforceable authorization: every operation states the required role and scope, so the two-layer model is expressible at the interface boundary.
- Preserve every code, identifier, point value, deadline, and milestone from the sources exactly, and make sourcing explicit for reconciliation.

**Non-Goals:**

- No implementation: no resolvers, no GraphQL server or schema file, no client codegen, no changes to `backend/` or `frontend/`.
- No REST/OpenAPI surface — the chosen contract is GraphQL over HTTP.
- No persistence/query-planner detail, indexes, triggers, or migration SQL; the schema is used as the type source, not reproduced.
- No new modules, roles, codes, or values beyond those in the sources; future apps (`Recruitment`, `Payroll`, `Assets`) are noted as non-contractual extension points only.
- No spec-level behavior is defined here (no `specs/` deltas).

## Decisions

### D1 — One standalone Markdown file at the repo root

`API_CONTACT_SPECIFICATION.md` is a single self-contained Markdown document at the repo root, matching existing doc conventions.

- *Why:* the file already exists as an empty placeholder at that exact path; project docs are single top-level files; a single file is easy to consume as agent context.
- *Alternatives considered:* a `docs/api/*.md` split (rejected — no `docs/` convention and the placeholder path is fixed); generating a `schema.graphql` artifact (rejected — that is implementation output, out of scope).

### D2 — GraphQL over HTTP with a JSON wire format

The contract is a single GraphQL endpoint. Operations are named GraphQL queries and mutations; variable/input/response payloads are JSON. The document shows SDL type definitions in ` ```graphql ` blocks and example request/response documents in ` ```json ` blocks.

- *Why:* user-selected. GraphQL gives one typed contract that covers all four apps without per-endpoint path proliferation, and a strong type system matches a domain already modeled as tables and enums.
- *Alternatives considered:* OpenAPI/REST (declined by the user); a protocol-agnostic logical interface contract (declined by the user).

### D3 — Grounded in the three named sources only

Types derive from the optimized schema's tables and registries; behavior and authorization derive from the process-flow and architecture documents. Do not use `DATABASE_SCHEMA_EXAMPLE.sql`, the diagrams, `DESIGN.md`, the Vietnamese process flow, or the skeleton code as inputs.

- *Why:* user-specified sources; keeps the contract traceable and free of facts the sources do not state. `DATABASE_SCHEMA_EXAMPLE.sql` is the superseded predecessor of the optimized schema.
- *Alternatives considered:* mixing in the older schema (rejected — conflicting/older model); deriving from the live code (rejected — the code is a skeleton with no domain behavior).

### D4 — Include authentication and session operations

Define auth/session operations (login, logout, current session/user, password/account flows) as first-class mutations/queries, and state that all non-auth operations require an authenticated session with an associated role.

- *Why:* user-selected. The architecture already centralizes identity ("User Directory, RBAC") and the authorization model needs a subject; without defining how a session is established the contract's authorization rules are unenforceable.
- *Alternatives considered:* referencing auth only (declined by the user); omitting auth (declined by the user).

### D5 — Per-operation authorization annotations

Every query and mutation is documented with the required role(s) and scope (`All`, `Company-wide`, `Department-only`, `Personal`), expressed against the five roles (`SUPER_ADMIN`, `TECH_LEAD`, `HR_MANAGER`, `DEPT_HEAD`, `EMPLOYEE`) and mapped to the two authorization layers from `SYSTEM_ARCHITECTURE.md`.

- *Why:* the two-layer authorization model is a defining architectural principle and a documented permission matrix already exists; encoding it per operation makes the contract enforceable and keeps the asymmetries (only HR/Super Admin assign `UAL`/`USL`; only Super Admin/Tech Lead manage RBAC and webhook) explicit.
- *Alternatives considered:* a single global authorization note (rejected — operation-level scope is exactly what differs by role).

### D6 — Naming and type-convention mapping

- GraphQL object/field names use `camelCase`; map from the schema's `snake_case` columns (documented in a naming-convention table).
- Codes (`REQ`, `ACT`, `PEN`, `APP`, `REJ`, `CAN`, `OVERDUE`; `AL`, `UAL`, `SL`, `USL`, `PL`, `ML`, `CL`, `EL`, `LWP`, `TOIL`, `VTO`) become GraphQL `enum` values, preserving the exact tokens; the seeded metadata (name, color, rules) stays available as fields.
- `uuid` primary keys exposed via an opaque `ID` scalar; timestamps as an ISO-8601 `DateTime` scalar; `jsonb` as a JSON scalar; `numeric` decimals as a `Decimal` scalar.
- Pagination via cursor-style (Relay-like `Connection`/`Edge`/`PageInfo`) or simple offset/limit is chosen and applied consistently; list operations document filters and sort order.

- *Why:* a consistent, documented mapping prevents ambiguity and mismatches between client and contract; enums preserve the sources' exact code tokens.
- *Alternatives considered:* exposing raw `snake_case` names (rejected — GraphQL convention is `camelCase`, and a mapping table keeps fidelity); string codes instead of enums (rejected — loses type safety and the exact-token requirement).

### D7 — Consistent error and response shape

Document a uniform GraphQL error format (a top-level `errors` array plus a stable machine-readable `extensions.code`, e.g. for validation, unauthenticated, forbidden, not-found, conflict) and the partial-data semantics of GraphQL responses.

- *Why:* clients need a predictable way to distinguish authorization failures from validation and business-rule failures; this is the GraphQL analogue of a status-code table.
- *Alternatives considered:* per-operation ad-hoc errors (rejected — inconsistent and unverifiable).

### D8 — Required document outline

The document must contain, in a sensible order:

1. **Purpose & Scope** — what the document is, who it serves, and an explicit statement that it derives from the three named sources.
2. **API Conventions** — GraphQL-over-HTTP transport, single versioned endpoint, JSON wire format, request/response envelopes, operation naming, pagination, filtering/sorting, and the error format (D7).
3. **Authentication & Session** — how a session is established and carried, the auth operations, and the session subject (user + role + scope).
4. **Authorization Model** — the two-layer model, the role set, the scope vocabulary, and the per-operation annotation convention (D5).
5. **Type System** — scalars, enums, and shared object types for the code registries and the shared domain model (users, departments, roles, permissions).
6. **App APIs** — for each app, its types and its queries/mutations with inputs, outputs, and authorization:
   - **Jobs** — projects, tasks (create/allocate, accept, progress, submit/approve/return, cancel, extension, late explanation), state history, attachments.
   - **Planning** — matrix calendar, attendance, leave requests, penalty leave assignment, leave balances, overtime.
   - **Performance** — personal KPI dashboard, score events, and the three-level audit views.
   - **Settings & IAM** — users/accounts, org structure and auto-forking, RBAC, audit logs, webhook/notification configuration.
7. **Shared & Core APIs** — code registries, notifications, and print/export operations.
8. **Errors** — the error code catalog from D7.
9. **Examples** — representative end-to-end JSON request/response pairs.
10. **Traceability** — a mapping from each major section to the source document(s)/sections it derives from.

- *Why:* this is the comprehensive depth the user selected (all four apps + shared/core); the order goes conventions → identity/authorization → types → operations → errors/examples → traceability.
- *Alternatives considered:* a per-app-first ordering without a conventions section (rejected — conventions must be read before the operations that rely on them).

## Risks / Trade-offs

- **Drift from the schema or sources** → Mitigate with the Traceability section (D8) and by deriving types directly from named tables/registries; keep the Purpose section explicit about the source documents so future revisions can be reconciled.
- **Inventing fields or operations not supported by the sources** → Mitigate by treating the three documents as the only authority: every type maps to a table/registry, and every operation maps to a documented capability or flow. No new codes or roles.
- **Over-specifying implementation (resolvers, SQL, codegen)** → Mitigate with the explicit Non-Goals and by keeping the document at the contract level (SDL + JSON, not code).
- **GraphQL authorization is easy to under-specify** → Mitigate with the per-operation annotations of D5 and an explicit authorization section (D8 §4).
- **Enum fidelity** → Mitigate by copying code tokens verbatim and cross-checking them against the seed data in `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` and the code tables in the two Markdown sources during verification.
- **Scope creep into future apps** → Mitigate by listing `Recruitment`, `Payroll`, and `Assets` as non-contractual extension points only.

## Migration Plan

Not applicable — this is additive documentation with no runtime, data, or API migration and no code changes. Rollback is `git revert`/deleting the added file content. The change is archived after review, per project workflow.

## Open Questions

- Whether a Vietnamese companion document should later be produced is a deferrable follow-up; it does not change this document's structure or the task breakdown. Default: not in this change.
