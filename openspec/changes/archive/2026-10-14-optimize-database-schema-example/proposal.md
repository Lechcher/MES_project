# Proposal

## Why

`DATABASE_SCHEMA_EXAMPLE.sql` is the reference PostgreSQL schema for the system, but it has drifted from the current architecture and workflow documents (`SYSTEM_ARCHITECTURE.md`, `SYSTEM_ARCHITECTURE_DIAGRAM.md`, `SYSTEM_PROCESS_FLOW-en.md`). Concretely, after reviewing the four files side by side:

- **Notification has no persistence.** The architecture's core "Telegram Webhook Notification Engine" and the `Settings` app's webhook configuration (bot, alert group chat ID, webhook URL endpoints) are absent from the schema.
- **Ticket lifecycle has no history.** The workflow's state machine (`REQ → ACT → PEN → {APP | REJ}`, `CAN`, `OVERDUE`) is stored only as the *current* `tasks.state`; transitions and approvals (`approved_by`/`approved_at`) are not recorded, so the flow cannot be traced.
- **Leave balances are not ledgers.** `users.annual_leave_quota` and `users.toil_quota` are current values only. There is no ledger of accrual/consumption, and no overtime records even though `TOIL` is defined as drawing on the OT hours fund, while the docs show an `AL Balance` / `TOIL Balance`.
- **Status/type fields are unconstrained text.** `task_requests.status`, `leave_requests.status`, `task_requests.request_type`, and audit `action`/`resource_type` are `VARCHAR` with comments instead of constrained types.
- **Attachments are denormalized.** `attachment_urls JSONB` is repeated across `task_progress_logs`, `task_requests`, and `leave_requests`.
- **KPI is not reproducible or auditable.** Point values live in comments; there is no configurable rule table and no per-event score ledger, so the "deterministic engine" cannot be re-computed or audited from data.
- **The global code registries are bare enums.** `ticket_state_enum` / `leave_code_enum` hold codes only, without the registry metadata the docs describe (state name, identifying color, leave payroll/timekeeping rules).
- **No module registry.** `permissions.module` is free text; the modular, app-based design has no way to register/enable apps (and no extension point for future modules).
- **Organization is flat.** `departments` has no hierarchy, although the docs group the matrix calendar by Department/Division.
- **Housekeeping gaps.** Only 5 indexes for 14 tables; no `updated_at` trigger; several tables lack `created_at`/`updated_at` and soft-delete; `uuid-ossp` is required where `gen_random_uuid()` now suffices; no seed data for the codes, roles, permissions, and modules the docs define.

`DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` already exists at the repo root as an empty placeholder (0 bytes), so the "optimized schema" path is a dead end that promises an expansion-ready schema and delivers nothing.

## What Changes

- Produce `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` (currently empty) as a clean, expansion-ready PostgreSQL schema that (a) refactors the existing 14 tables and (b) closes the architecture/workflow gaps above.
- **Refactor the existing tables:** consistent naming, explicit constraints and `CHECK`s, complete `created_at`/`updated_at`, soft-delete where appropriate, an `updated_at` trigger, broader index coverage (all FK/query columns), and `gen_random_uuid()` in place of `uuid-ossp`.
- **Close architecture gaps** by adding, among others: a **global code registry** (state and leave codes as reference tables carrying their names, colors, and payroll/timekeeping rules — codes unchanged); a **notification config + outbound notification log** for the Telegram webhook engine; **task state history** and approval metadata; a **leave-balance ledger** and **overtime records**; a **KPI rule/point configuration** and a **KPI score-event ledger** (with the documented bonus/penalty values); a normalized **attachment store**; a **module registry** (as the extension point for the modular design); and **department hierarchy**.
- **Provide idempotent seed data** for the global code registries, the five roles (`SUPER_ADMIN`, `TECH_LEAD`, `HR_MANAGER`, `DEPT_HEAD`, `EMPLOYEE`), the four app modules (`jobs`, `planning`, `performance`, `settings`), and the permission-matrix entries the docs define.
- **Keep every code and value from the docs** verbatim: ticket state codes (`REQ`, `ACT`, `PEN`, `APP`, `REJ`, `CAN`, `OVERDUE`) with their identifying colors; leave codes (`AL`, `UAL`, `SL`, `USL`, `PL`, `ML`, `CL`, `EL`, `LWP`, `TOIL`, `VTO`) with their rules; role names; module/app names; and the KPI point values (`+10`, `+20`, `+5`, `+50`, `-15`, `-5`, `-2`, `-10`).
- Optimize freely (this is a new file): renaming and reorganizing are allowed for a clean design. Write all SQL comments in **English**.
- Leave `DATABASE_SCHEMA_EXAMPLE.sql` and the three Markdown documents unchanged; this is additive.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a reference-schema/documentation change with no spec-level system behavior change, so `.openspec.yaml` declares `skip_specs: true`.

## Impact

- **Files:** Adds content to `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` (repo root) only. `DATABASE_SCHEMA_EXAMPLE.sql`, `SYSTEM_ARCHITECTURE.md`, `SYSTEM_ARCHITECTURE_DIAGRAM.md`, and `SYSTEM_PROCESS_FLOW-en.md` are left unchanged.
- **Consumers:** Nothing references either `.sql` file by path (verified by repository-wide search outside `.git/` and `openspec/`), so filling in the file breaks nothing. It is a reference design consumed by humans and coding agents.
- **Assumption:** the schema stays **PostgreSQL**, matching the original file's header (`SYSTEM DATABASE SCHEMA (PostgreSQL)`) and its Postgres-only constructs (`ENUM`, `JSONB`, `uuid-ossp`).
- **Out of scope:** editing the original `DATABASE_SCHEMA_EXAMPLE.sql`; application code; the prototype backend's actual SQLite/Drizzle schema (`backend/lib/auth-schema.ts`) and any dialect migration to it; database migrations, ORM models, or running the DDL against a live database; and concrete tables for the planned `Recruitment`, `Payroll`, and `Assets` modules (scope is "close architecture gaps", so future modules are represented only by the module-registry extension point).
