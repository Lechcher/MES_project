# Tasks

## 1. Diagram file for the original schema (`DATABASE_SCHEMA_EXAMPLE.sql`)

- [x] 1.1 Create `DATABASE_SCHEMA_EXAMPLE_DIAGRAM.md` (new file) with an English header/intro and a legend: state that it is the ER-diagram view of `DATABASE_SCHEMA_EXAMPLE.sql`, that all diagrams are Mermaid `erDiagram`, how keys are marked (`PK`/`FK`), and how to read relationships + the `*Source:*` line. Verify by confirming the file exists, is non-empty, and names `DATABASE_SCHEMA_EXAMPLE.sql`.
- [x] 1.2 Add the **full ER diagram** (`erDiagram`) for the original schema: all **14 tables** (`departments`, `users`, `roles`, `user_roles`, `permissions`, `role_permissions`, `system_audit_logs`, `projects`, `tasks`, `task_progress_logs`, `task_requests`, `leave_requests`, `attendance_records`, `kpi_monthly_summaries`) with their attributes, `PK`/`FK` markers, and relationships. Verify by confirming there are exactly 14 entities and that every `REFERENCES` column in the SQL appears as a relationship edge.
- [x] 1.3 Add **per-domain ER diagrams** for the original schema, each self-contained: organization & identity, RBAC & audit, jobs & projects, planning/attendance, and performance. Verify by confirming each domain block uses `erDiagram`, contains only the tables of that domain (plus cross-domain FK attributes), and that the union of domains covers all 14 tables.

## 2. Diagram file for the optimized schema (`DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql`)

- [x] 2.1 Create `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED_DIAGRAM.md` (new file) with an English header/intro and a legend — including an entry stating that `v_*` entities are **read-only views**, not tables — and name `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` as the source. Verify by confirming the file exists, is non-empty, and documents the view convention.
- [x] 2.2 Add the **full ER diagram** for the optimized schema: all **25 tables** (code registries `ticket_states`/`leave_codes`, `modules`, `departments`, `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `system_audit_logs`, `projects`, `tasks`, `task_state_transitions`, `task_progress_logs`, `task_requests`, `attachments`, `leave_requests`, `attendance_records`, `leave_balance_entries`, `overtime_records`, `kpi_point_rules`, `kpi_score_events`, `kpi_monthly_summaries`, `app_settings`, `notifications`) with attributes, `PK`/`FK` markers, and relationships. Verify by confirming there are exactly 25 base entities and every `REFERENCES` clause in the SQL results in a relationship edge.
- [x] 2.3 Add **per-domain ER diagrams** for the optimized schema, each self-contained: code registries, organization & identity, RBAC & audit, jobs & projects, planning/attendance/leave-funds, performance & KPI, and platform settings & notifications. Verify by confirming each block uses `erDiagram` and that the union of domain diagrams covers all 25 tables.
- [x] 2.4 Add a **Database Views** section: include the four views (`v_user_leave_balances`, `v_kpi_audit_level1_company`, `v_kpi_audit_level2_department`, `v_kpi_audit_level3_employee`) as `v_`-prefixed entities in the full diagram with relationships to the tables they read, plus a Markdown table (view, purpose, source tables). Verify by confirming all four views appear and each is linked to at least one real table.

## 3. Verify both diagram documents

- [x] 3.1 Confirm both files are structurally sound Mermaid: every diagram is inside a paired ` ```mermaid ` … ` ``` ` fence, each opens with the `erDiagram` keyword, and every entity block's `{`/`}` is balanced. Verify with a structural check over both files (fence pairing, `erDiagram` count, brace balance) and confirm no mismatch.
- [x] 3.2 Confirm entity fidelity: extract the entity names from each full diagram and confirm they match (`DATABASE_SCHEMA_EXAMPLE_DIAGRAM.md` ↔ the 14 tables of `DATABASE_SCHEMA_EXAMPLE.sql`; `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED_DIAGRAM.md` ↔ the 25 tables + 4 views of `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql`), with no table missing and no entity invented. Verify by cross-checking entity names against `grep 'CREATE TABLE'` in each SQL file.
- [x] 3.3 Confirm relationship fidelity: for each full diagram, confirm every relationship edge corresponds to a real `REFERENCES`/FK column in the source SQL, with cardinality matching the nullability rule in `design.md` (D4). Verification passes when no fabricated relationship remains and no FK is missing.
- [x] 3.4 Confirm the change touches nothing else: record `shasum -a 256 DATABASE_SCHEMA_EXAMPLE.sql DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` at the start of apply, then re-run it and confirm both hashes equal that baseline; run `git status --porcelain` and confirm the only new content relative to the apply-time baseline is the two diagram Markdown files.
- [x] 3.5 Read both finished documents end to end and confirm they are coherent English (no Vietnamese text), each full diagram and domain diagram has a title, caption, and `*Source:*` line, and the documents stand alone as a visual overview of their schema. Verification passes on a clean read-through.

## Workflow follow-up

- Archive the change after the two diagram files are reviewed and the project's review requirements are satisfied.
- Verify the archived result: both diagram files remain complete and the two SQL files are still unchanged.

## Document Conventions (reference — untracked)

Decisions already made; do not re-litigate during apply:

- **Sources:** derive only from `DATABASE_SCHEMA_EXAMPLE.sql` and `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql`. Do not pull in `SYSTEM_ARCHITECTURE*.md` content beyond diagram styling.
- **Deliverables:** the two new root files `DATABASE_SCHEMA_EXAMPLE_DIAGRAM.md` and `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED_DIAGRAM.md`; the SQL files stay unchanged.
- **Format:** Mermaid `erDiagram` only; one fenced ` ```mermaid ` block per diagram; no PlantUML/DBML/SchemaSpy; no images.
- **Structure:** intro + legend, one full ER diagram, then per-domain ER diagrams (registries, organization & identity, RBAC & audit, jobs & projects, planning/attendance/leave-funds, performance & KPI, platform). The optimized file also lists the four views.
- **Attribute syntax:** single-token types (`uuid`, `varchar`, `text`, `boolean`, `timestamptz`, `date`, `numeric`, `int`, `smallint`, `jsonb`, `inet`); `PK`/`FK` markers; no commas/parentheses in type tokens.
- **Relationship syntax:** `PARENT ||--o{ CHILD : "fk"` for nullable FKs, `||--|{` for `NOT NULL` FKs; self-referential FKs point to the same entity.
- **Views:** shown as `v_`-prefixed entities with a legend saying they are read-only views.
- **No delta highlighting:** the optimized diagram is drawn as-is.
- **Language:** English (even though the original SQL's comments are Vietnamese).
