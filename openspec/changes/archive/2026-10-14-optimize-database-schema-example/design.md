# Design

## Context

See `proposal.md` — Why. This change produces `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` (repo root, currently 0 bytes) as an expansion-ready PostgreSQL schema, derived from four reviewed sources: `DATABASE_SCHEMA_EXAMPLE.sql` (273 lines: 14 tables, 5 indexes, Postgres, Vietnamese comments), `SYSTEM_ARCHITECTURE.md` (structure), `SYSTEM_ARCHITECTURE_DIAGRAM.md` (visual views), and `SYSTEM_PROCESS_FLOW-en.md` (behavior).

Current-state facts that shape the design:

- The original defines 14 tables: `departments`, `users`, `roles`, `user_roles`, `permissions`, `role_permissions`, `system_audit_logs`, `projects`, `tasks`, `task_progress_logs`, `task_requests`, `leave_requests`, `attendance_records`, `kpi_monthly_summaries`.
- It uses Postgres-only constructs (`ENUM` types, `JSONB`, `uuid-ossp`), and carries no seed data.
- The user chose: **refactor + close architecture gaps**, **optimize freely** (new file; the original is preserved), and **English** comments. The schema stays PostgreSQL (assumption recorded in the proposal).
- The prototype backend uses SQLite/Drizzle (`backend/lib/auth-schema.ts`) and does not reference this file; aligning the two is out of scope.

## Goals / Non-Goals

**Goals:**

- A clean, consistent, well-constrained schema that resolves the concrete gaps listed in the proposal.
- Data-driven global code registries (codes as the single source of truth) so the UI, payroll, and KPI logic read metadata instead of hard-coded constants.
- Traceability: ticket transitions, approvals, KPI score events, notifications, and leave-fund movements are recorded, not just their current value.
- An explicit extension point for the modular design so future apps can be added without redesigning the core tables.
- Idempotent seed data for the registries, roles, modules, and permission matrix the docs define.

**Non-Goals:**

- No live migration from the original schema; no running the DDL.
- No SQLite dialect or Drizzle/ORM models; no backend or frontend code.
- No concrete domain tables for `Recruitment`, `Payroll`, or `Assets` — only the module-registry extension point.
- No edits to the four source files.

## Decisions

### D1 — One standalone PostgreSQL file, free to restructure

`DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` is a single idempotent SQL file (`CREATE ... IF NOT EXISTS`, seeds via `ON CONFLICT DO NOTHING`), Postgres dialect.

- *Why:* matches the original's header and the placeholder path; the user allowed free restructuring; idempotency makes the example safe to re-run.
- *Alternatives considered:* a migration diff against the original (rejected — the request is an optimized schema example, not a migration); SQLite (rejected — would discard the file's Postgres nature; backend alignment is out of scope).

### D2 — Global code registries as reference tables, not bare enums

Replace `ticket_state_enum` and `leave_code_enum` with `ticket_states(code PK, name, color, description, is_terminal, sort_order)` and `leave_codes(code PK, name, category, is_paid, payroll_rule, deducts_wage, is_penalty)`. Referencing columns keep the **same codes** as natural-key FKs (`VARCHAR`).

- *Why:* the docs describe a *global code registry* with metadata (state name + identifying color; leave payroll/timekeeping rules). Keeping the codes as natural keys keeps FKs readable and lets the system add codes without `ALTER TYPE`.
- *Alternatives considered:* keep the enums (rejected — no metadata, and value changes lock the type); surrogate-key registry (rejected — loses the readable `REQ`/`AL` codes the docs use everywhere).

### D3 — Status/type fields become constrained types

Add enums `approval_status_enum` (`PENDING`, `APPROVED`, `REJECTED`), `task_request_type_enum` (`EXTENSION`, `LATE_EXPLANATION`), `notification_status_enum` (`PENDING`, `SENT`, `FAILED`), and `department_type_enum` (`DEPARTMENT`, `DIVISION`). Apply them to `task_requests.status/request_type`, `leave_requests.status`, and notification status.

- *Why:* removes unconstrained `VARCHAR` status values flagged in the proposal.
- *Alternatives considered:* `CHECK` constraints on `VARCHAR` (viable, but named enums are clearer and reused).

### D4 — Ticket lifecycle traceability

Keep `tasks.state` as the current state, and add `task_state_transitions(task_id, from_state, to_state, actor_id, reason, created_at)` plus approval metadata on `tasks` (`approved_by`, `approved_at`, `reviewed_by`, `reviewed_at`).

- *Why:* the workflow depends on the `REQ → ACT → PEN → {APP | REJ}` lifecycle and cancellation/overdue; history + approver metadata make it auditable. Denormalized `tasks.state` keeps the matrix/list views fast.

### D5 — Leave-fund ledger and overtime

Add `leave_balance_entries(user_id, leave_code, entry_type, delta_days, period_year, reference_type, reference_id, created_at)` as the source of truth for `AL`/`TOIL` (and other) balances, and `overtime_records(user_id, work_date, hours, approved_by, created_at)` to back `TOIL`. Expose current balances via a view (e.g. `v_user_leave_balances`).

- *Why:* the docs show `AL Balance` / `TOIL Balance` and define `TOIL` as drawing on an OT fund; a ledger is auditable and a current-value column is not.
- *Alternatives considered:* keep only `users.annual_leave_quota`/`toil_quota` (rejected — no history, no OT source).

### D6 — Notification configuration and outbound log

Add `app_settings(module_code, key, value JSONB, is_secret, updated_at)` for configuration (including the Telegram bot, alert group chat ID, and webhook URL endpoints) and `notifications(id, channel, template, recipient, payload JSONB, status, attempts, related_type, related_id, sent_at, created_at)` as the outbound log.

- *Why:* the core Telegram Webhook Notification Engine and the `Settings` app's webhook configuration currently have no persistence.
- *Alternatives considered:* a dedicated `telegram_settings` table (rejected — a general `app_settings` also serves other modules and the module-registry design).

### D7 — Normalized attachment store

Add `attachments(id, owner_type, owner_id, url, file_name, mime_type, uploaded_by, created_at)` and stop repeating `attachment_urls JSONB` on `task_progress_logs`, `task_requests`, and `leave_requests` (or keep the columns nullable for convenience, documented as derived).

- *Why:* removes three duplicated blob columns; enables metadata, reuse, and cleanup.
- *Alternatives considered:* keep `JSONB` arrays (rejected — no metadata or referential cleanup).

### D8 — KPI rules and score-event ledger

Add `kpi_point_rules(code, event, points, description, is_active)` seeded with the documented values (`+10` on-time, `+20` on-time urgent, `+5` first-time approval, `+50` excellent attendance; `-15` overdue, `-5` returned, `-2` extension request, `-10` late/early/UALU/USL) and `kpi_score_events(user_id, task_id, rule_code, points, period_year, period_month, occurred_at)` as the event ledger. Refactor `kpi_monthly_summaries` into a computed snapshot and add views for the three audit levels (`v_kpi_audit_level1_company`, `v_kpi_audit_level2_department`, `v_kpi_audit_level3_employee`).

- *Why:* makes the "deterministic engine" reproducible and auditable from data, and surfaces the Level 1/2/3 audit tables the docs describe as views.
- *Alternatives considered:* keep hard-coded values in comments (rejected — not reproducible/auditable).

### D9 — Module registry as the extension point

Add `modules(code PK, name, description, is_enabled, sort_order)` seeded with `jobs`, `planning`, `performance`, `settings`, and point `permissions.module_code` at it via FK (replacing the free-text `module`).

- *Why:* gives the modular, app-based design a first-class registry and the extension point future apps plug into, without adding future-module domain tables.
- *Alternatives considered:* an `apps` join table with enable/disable per tenant (rejected — single-organization scope; over-engineering).

### D10 — Organization hierarchy

Add `departments.parent_id` (self-FK) and `departments.department_type` (`DEPARTMENT`/`DIVISION`).

- *Why:* the docs group the matrix calendar by Department/Division; a flat table cannot express that.
- *Alternatives considered:* a separate `divisions` table (rejected — a self-referential tree is simpler and sufficient).

### D11 — Housekeeping and consistency

Standardize: `snake_case` plural tables; `*_code` for human codes; `*_id` UUIDs; `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` (drop `uuid-ossp`); consistent `created_at`/`updated_at` (with a `set_updated_at()` trigger); `deleted_at` soft-delete on `users`, `departments`, `projects`, `tasks`; explicit `NOT NULL`, `CHECK`s, and named constraints; and indexes on every FK and hot query column (current state, owner, period).

- *Why:* addresses the housekeeping gaps (5 indexes for 14 tables; no trigger; missing timestamps).
- *Alternatives considered:* keep the original naming/pattern (rejected — the user allowed free restructuring).

### D12 — Idempotent seed data derived strictly from the docs

Seed, with `ON CONFLICT (code) DO NOTHING`: `ticket_states` (7 codes + colors), `leave_codes` (11 codes + rules), `roles` (5), `modules` (4), `permissions` + `role_permissions` from the permission matrix, and `kpi_point_rules` (8 rules).

- *Why:* the docs already define these registries and the matrix; seeding them makes the example immediately meaningful and keeps the matrix in one place.
- *Alternatives considered:* schema only, no seeds (rejected — the code registries and matrix are core to the design).

## Risks / Trade-offs

- **Over-engineering (too many tables)** → Mitigate by tying every addition to a gap named in the proposal; keep future modules registry-only; prefer a view over a table where aggregation suffices.
- **Breaking compatibility with the original** → Accepted (user chose "optimize freely"); the original file is preserved unchanged for reference.
- **Enum → registry changes FK typing** → Mitigate by keeping codes as natural keys and documenting the referencing columns.
- **Seed drift from the permission matrix** → Mitigate by deriving seeds strictly from the docs' matrix and the two code tables.
- **Postgres-only constructs** → Documented assumption; SQLite/ORM alignment is explicitly out of scope.
- **New score-event ledger vs. summary snapshot divergence** → Mitigate by defining the summary as computed from events (a view or a documented materialization), not an independently edited table.

## Migration Plan

Not applicable for this change — it writes a reference schema file, not a deployed migration. Converting a real database from the original schema would need a separate migration effort (out of scope). Rollback is deleting the file's content (or `git revert`).

## Open Questions

- Whether to later reconcile this PostgreSQL reference schema with the prototype backend's SQLite/Drizzle schema (`backend/lib/auth-schema.ts`) — e.g. by generating Drizzle models — is a deferrable follow-up that does not change this file's structure or the task breakdown. Default: not in this change.
