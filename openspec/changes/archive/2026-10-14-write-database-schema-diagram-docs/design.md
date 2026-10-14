# Design

## Context

See `proposal.md` — Why. This change creates two new Markdown files at the repo root, each an ER-diagram view of one reference schema:

- `DATABASE_SCHEMA_EXAMPLE_DIAGRAM.md` ← `DATABASE_SCHEMA_EXAMPLE.sql` (273 lines, **14 tables**, 5 indexes, Postgres, Vietnamese comments).
- `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED_DIAGRAM.md` ← `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` (755 lines, **25 tables + 4 views**, 40 indexes, English comments).

Constraints shaping the approach:

- The user chose **Mermaid `erDiagram`**, a **full ER + per-domain breakdown**, and **no delta highlighting**.
- The repo already uses Mermaid (`flowchart`/`stateDiagram-v2`/`sequenceDiagram`) in `SYSTEM_ARCHITECTURE_DIAGRAM.md`; `erDiagram` is new to the repo, so the files must be self-contained and portable to common renderers.
- Neither target file exists yet; both are new.
- The diagrams must be faithful to the DDL — no invented tables, columns, or relationships.

## Goals / Non-Goals

**Goals:**

- A renderable, at-a-glance ER view of each schema that is accurate to the DDL.
- Readability for both the small (14-table) and large (25-table) schema, via a full diagram plus per-domain diagrams.
- Correctly represented primary keys, foreign keys, and relationship cardinality.
- Each diagram traceable to its source SQL file.

**Non-Goals:**

- No edits to either SQL file.
- No non-Mermaid tooling (DBML, SchemaSpy, PlantUML) and no image/binary assets.
- No diff/highlight of what changed between the original and optimized schemas.
- No database deployment, migration, or ORM modeling.

## Decisions

### D1 — Two standalone Markdown files, one per schema

`DATABASE_SCHEMA_EXAMPLE_DIAGRAM.md` and `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED_DIAGRAM.md`, each self-contained.

- *Why:* the request names both files; a self-contained file per schema is easy to review and to consume as context.
- *Alternatives considered:* a single combined file (rejected — the request specifies two files, and the schemas are independent).

### D2 — Mermaid `erDiagram`, full view plus per-domain views

Each file contains: intro + legend, **one full `erDiagram`** with every table, then **per-domain `erDiagram`s** grouped as registries, organization & identity, RBAC & audit, jobs & projects, planning/attendance/leave funds, performance & KPI, and platform settings & notifications.

- *Why:* a full view gives completeness; per-domain views keep each diagram human-readable at 25 tables.
- *Alternatives considered:* a single full diagram only (rejected by the user); a `flowchart` relationship map (rejected — `erDiagram` gives keys and columns natively).

### D3 — Entity and attribute fidelity

Each entity is a table; each attribute is a column with a single-token type derived from the SQL type's first word (`uuid`, `varchar`, `text`, `boolean`, `timestamptz`, `date`, `numeric`, `int`, `smallint`, `jsonb`, `inet`). Primary keys are marked `PK`; foreign keys are marked `FK`; composite keys list each part with `PK`.

- *Why:* Mermaid `erDiagram` attribute syntax is `type name [PK|FK|UK]`, so types must be a single token (no spaces, parentheses, or commas).
- *Alternatives considered:* full SQL types (rejected — Mermaid would mis-parse `timestamp with time zone`); omitting columns (rejected — loses fidelity).

### D4 — Relationship cardinality rules

Relationships are derived strictly from `REFERENCES` and key definitions and written as `PARENT ||--o{ CHILD : "fk_column"`:

- Nullable FK → `||--o{` (parent one, child zero-or-many).
- `NOT NULL` FK → `||--|{` (parent one, child one-or-many).
- Self-referential FK (`departments.parent_id`) → `departments ||--o{ departments : "parent_id"`.
- Join tables (`user_roles`, `role_permissions`) are modeled as entities linked to both sides; the composite PK is shown as `PK` on each key column.

- *Why:* makes cardinality explicit and consistent, and keeps it derivable from the DDL.
- *Alternatives considered:* a single generic `||--o{` for everything (rejected — loses nullability/NOT NULL detail).

### D5 — Views in the optimized schema

The four views (`v_user_leave_balances`, `v_kpi_audit_level1_company`, `v_kpi_audit_level2_department`, `v_kpi_audit_level3_employee`) appear in the full diagram as entities prefixed `v_`, with a legend entry stating they are **read-only views**, not tables. A short Markdown table also lists each view, its purpose, and the tables it reads from.

- *Why:* `erDiagram` has no view notation; prefixing and a legend keep the visual complete without misrepresenting views as base tables.
- *Alternatives considered:* omitting views (rejected — they are part of the optimized schema); a separate `flowchart` (rejected — keeps a single notation).

### D6 — Diagram conventions

Each diagram has a `### <Title>` heading, a one-line caption, the fenced ` ```mermaid ` block, and a `*Source:*` line naming the SQL file and section. Entity and attribute names match the DDL exactly (snake_case). Avoid emoji and characters that could break the renderer inside diagram blocks.

- *Why:* consistent with the project's existing diagram document and easy to verify against the SQL.

### D7 — Per-domain diagrams stand alone

Per-domain diagrams re-declare their domain's entities (with their full attribute lists) and the cross-domain FK attributes, so each diagram renders independently in Mermaid.

- *Why:* Mermaid diagrams are self-contained; a per-domain diagram cannot reference entities declared in another block.
- *Trade-off:* some attribute lists repeat across the full and per-domain diagrams; acceptable for standalone readability.

### D8 — No delta highlighting

The optimized diagram is drawn as-is; it does not mark which objects are new versus the original.

- *Why:* user choice; keeps both files symmetric and avoids inventing a comparison layer.

### D9 — Verification without heavy tooling

Verification is structural and deterministic: every entity in the full diagram maps to a table (or view) in the source SQL, every relationship maps to a `REFERENCES` clause, ` ```mermaid ` fences are paired, the `erDiagram` keyword is present, and `{`/`}` are balanced. If a Mermaid renderer is available, rendering to SVG is an optional extra check, not a requirement.

## Risks / Trade-offs

- **Mermaid type parsing** → Mitigate by using single-token types (D3).
- **Large full diagram unreadable** → Mitigate with the per-domain breakdown (D2).
- **Cardinality drift from the DDL** → Mitigate with the explicit rules in D4 and the structural verification in D9.
- **Duplication across diagrams** → Accepted trade-off for standalone rendering (D7).
- **Divergence if the SQL changes later** → Mitigate with a `*Source:*` line per diagram and a short traceability note in each file.

## Migration Plan

Not applicable — additive documentation only. Rollback is deleting the two files (or `git revert`).

## Open Questions

- Whether to later add a machine-generated variant (DBML or SchemaSpy) or a diff view of original vs optimized is a deferrable follow-up; it does not change these files' structure or the task breakdown. Default: not in this change.
