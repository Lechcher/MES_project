# Tasks

## 1. Foundations: registries, module registry, and RBAC

- [x] 1.1 Create `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` (currently empty) with an English header describing scope (optimized, expansion-ready reference schema derived from the architecture/workflow docs; Postgres; idempotent) and the enum types: `approval_status_enum`, `task_request_type_enum`, `notification_status_enum`, `department_type_enum`, plus any others introduced. Use `gen_random_uuid()` (no `uuid-ossp` extension). Verify by confirming the file is non-empty, the header is in English, and it contains no `uuid-ossp`.
- [x] 1.2 Add the global code registries as reference tables — `ticket_states(code PK, name, color, description, is_terminal, sort_order)` and `leave_codes(code PK, name, category, is_paid, payroll_rule, deducts_wage, is_penalty)` — replacing the bare `ticket_state_enum` / `leave_code_enum`. Verify by confirming both tables exist with columns that carry the documented metadata (state name + identifying color; leave payroll/timekeeping rule) and that ticket/leave code columns elsewhere will reference them by the same codes.
- [x] 1.3 Add the module registry and RBAC: `modules(code PK: jobs/planning/performance/settings)`, move `permissions.module` to `module_code` referencing `modules(code)`, and refactor `roles`, `user_roles`, `permissions`, `role_permissions` and `system_audit_logs` with consistent constraints, timestamps, and indexes. Verify by confirming `modules` exists, `permissions.module_code` has an FK to it, and the five role codes (`SUPER_ADMIN`, `TECH_LEAD`, `HR_MANAGER`, `DEPT_HEAD`, `EMPLOYEE`) remain the documented role set.
- [x] 1.4 Refactor `departments` (add `parent_id` self-FK and `department_type`) and `users` (consistent timestamps, soft-delete, referencing the leave registry instead of embedding quota policy). Verify by confirming `departments.parent_id` is a self-referencing FK, `department_type` uses `department_type_enum`, and `users` retains `user_code`/`email` uniqueness.
- [x] 1.5 Add the `set_updated_at()` trigger function and attach an `updated_at` trigger to every table that has an `updated_at` column. Verify by confirming the function is defined once and each such table has a matching trigger.

## 2. Jobs, Planning, attendance, and leave funds

- [x] 2.1 Refactor `projects` and `tasks` with explicit `NOT NULL`/`CHECK`s, complete timestamps, soft-delete, and approval metadata (`approved_by`, `approved_at`, `reviewed_by`, `reviewed_at`); keep `tasks.state` referencing `ticket_states(code)`. Verify by confirming `tasks` has a FK to `ticket_states`, the approval columns exist, and `progress_percentage` keeps its 0–100 `CHECK`.
- [x] 2.2 Add `task_state_transitions(task_id, from_state, to_state, actor_id, reason, created_at)` with FKs to `tasks` and `ticket_states`, and refactor `task_progress_logs` and `task_requests` (now using `task_request_type_enum` and `approval_status_enum`). Verify by confirming the history table exists with both `from_state`/`to_state` FKs and that `task_requests` no longer stores `request_type`/`status` as unconstrained `VARCHAR`.
- [x] 2.3 Add the normalized `attachments(owner_type, owner_id, url, file_name, mime_type, uploaded_by, created_at)` store and remove (or mark as derived) the repeated `attachment_urls JSONB` columns on `task_progress_logs`, `task_requests`, and `leave_requests`. Verify by confirming `attachments` exists and the three tables reference attachments rather than each carrying a duplicated blob column that is the only source.
- [x] 2.4 Refactor `leave_requests` and `attendance_records`: constrain status with `approval_status_enum`, reference `leave_codes(code)`, and add the missing constraints/indexes/timestamps. Verify by confirming `leave_requests.leave_code` and `attendance_records.leave_code` have FKs to `leave_codes`, and the `UNIQUE(user_id, work_date)` attendance constraint is preserved.
- [x] 2.5 Add `leave_balance_entries` (the AL/TOIL ledger) and `overtime_records` (backing TOIL), plus a `v_user_leave_balances` view exposing current `AL`/`TOIL` balances. Verify by confirming both tables exist with FKs to `users`/`leave_codes`, and the view returns a current balance per user and leave code.

## 3. Performance/KPI, notifications, housekeeping, and seeds

- [x] 3.1 Add `kpi_point_rules(code, event, points, description, is_active)` and `kpi_score_events(user_id, task_id, rule_code, points, period_year, period_month, occurred_at)`, refactor `kpi_monthly_summaries` as a computed snapshot, and add the three audit-level views (`v_kpi_audit_level1_company`, `v_kpi_audit_level2_department`, `v_kpi_audit_level3_employee`). Verify by confirming both new tables exist, the views exist, and the seeded rule set will cover all eight documented point events.
- [x] 3.2 Add `app_settings(module_code, key, value JSONB, is_secret, updated_at)` and `notifications(id, channel, template, recipient, payload JSONB, status, attempts, related_type, related_id, sent_at, created_at)`, giving the Telegram webhook engine and the Settings app configuration persistence. Verify by confirming both tables exist, `app_settings.module_code` references `modules`, and `notifications.status` uses `notification_status_enum`.
- [x] 3.3 Do the housekeeping/index sweep: ensure every FK and hot query column is indexed (state, owner/user, period, status), every table has complete `created_at`/`updated_at` where applicable, soft-delete where decided, and named constraints throughout. Verify by confirming there is at least one index per FK column and that no `NOT NULL`-eligible column is left nullable without reason.
- [x] 3.4 Add idempotent seed data (`INSERT ... ON CONFLICT (code) DO NOTHING`) for `ticket_states` (7 codes + colors), `leave_codes` (11 codes + rules), `roles` (5), `modules` (4), `kpi_point_rules` (8), and the `permissions` + `role_permissions` entries derived from the documented permission matrix. Verify by confirming each seed block is idempotent and every seeded code matches the docs.

## 4. Verify the schema document

- [x] 4.1 Confirm the file is structurally sound: every `CREATE TABLE` has a primary key, every `REFERENCES` targets a table defined earlier in the file, `$$`-quoted function bodies are balanced, `CREATE ... IF NOT EXISTS` guards are used, and there is no `uuid-ossp`/`CREATE EXTENSION` dependency on it. Verify with a structural check over the file (grep/count PKs, FKs, and `$$` delimiters) and confirm no dangling reference.
- [x] 4.2 Confirm doc fidelity: search `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` for every ticket state code (`REQ`, `ACT`, `PEN`, `APP`, `REJ`, `CAN`, `OVERDUE`) with its color, every leave code (`AL`, `UAL`, `SL`, `USL`, `PL`, `ML`, `CL`, `EL`, `LWP`, `TOIL`, `VTO`), the five role codes, the four module codes, and the KPI point values (`+10`, `+20`, `+5`, `+50`, `-15`, `-5`, `-2`, `-10`). Verification passes when each token appears and matches the docs.
- [x] 4.3 Confirm gap coverage: check each gap named in `proposal.md` (notification persistence, state history, leave ledger/OT, constrained statuses, attachment normalization, KPI rules/events, code-registry metadata, module registry, department hierarchy, housekeeping/indexes/seeds) is addressed by at least one table, view, column, index, or seed. Verification passes when every gap has a mapped artifact.
- [x] 4.4 Confirm the change touches nothing else: record `shasum -a 256 DATABASE_SCHEMA_EXAMPLE.sql SYSTEM_ARCHITECTURE.md SYSTEM_ARCHITECTURE_DIAGRAM.md SYSTEM_PROCESS_FLOW-en.md` at the start of apply, then re-run it and confirm all four hashes equal that baseline; run `git status --porcelain` and confirm the only content change relative to the apply-time baseline is inside `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql`.
- [x] 4.5 Read the finished schema end to end and confirm it is one coherent, English-commented file with no Vietnamese text, sensible ordering (enums → registries → org/RBAC → jobs/planning → performance → notifications → indexes → seeds), and that it stands alone as an expansion-ready reference. Verification passes on a clean read-through.

## Workflow follow-up

- Archive the change after the optimized schema is reviewed and the project's review requirements are satisfied.
- Verify the archived result: `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` remains complete and the four source files are unchanged.

## Document Conventions (reference — untracked)

Decisions already made; do not re-litigate during apply:

- **Sources:** derive from `DATABASE_SCHEMA_EXAMPLE.sql`, `SYSTEM_ARCHITECTURE.md`, `SYSTEM_ARCHITECTURE_DIAGRAM.md`, and `SYSTEM_PROCESS_FLOW-en.md`. Do not pull the prototype backend SQLite/Drizzle schema into the design.
- **Deliverable:** `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` only; the original file and the three Markdown docs stay unchanged.
- **Dialect:** PostgreSQL, matching the original's header; idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`); use `gen_random_uuid()`, not `uuid-ossp`.
- **Scope:** refactor the existing 14 tables **and** close the architecture/workflow gaps (notification config + log, state history + approval metadata, leave ledger + OT, attachments store, KPI rules + score events, code-registry metadata, module registry, department hierarchy, status enums, housekeeping, indexes, seeds). No concrete `Recruitment`/`Payroll`/`Assets` tables — extension point only.
- **Fidelity:** keep every code/value from the docs verbatim (states + colors, leave codes + rules, roles, modules, KPI points).
- **Language:** English comments.
