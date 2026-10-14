# Proposal

## Why

The two reference SQL schemas exist only as DDL text: `DATABASE_SCHEMA_EXAMPLE.sql` (14 tables) and `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` (25 tables + 4 views). A reader must reconstruct the entities, keys, and relationships by hand from the `CREATE TABLE` / `REFERENCES` statements, and neither schema has any visual view. There is no diagram that renders in a Markdown viewer, so understanding the data model — especially the optimized schema's added entities — is slow and error-prone.

## What Changes

- Create two **new** Markdown files at the repo root (neither exists today):
  - `DATABASE_SCHEMA_EXAMPLE_DIAGRAM.md` — ER diagrams for `DATABASE_SCHEMA_EXAMPLE.sql`.
  - `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED_DIAGRAM.md` — ER diagrams for `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql`.
- Use **Mermaid `erDiagram`** blocks, which render in Markdown viewers (consistent with the project's existing Mermaid usage in `SYSTEM_ARCHITECTURE_DIAGRAM.md`).
- Structure each file as: a short intro + legend, **one full ER diagram** covering every table, then **smaller per-domain ER diagrams** for readability. The domains follow the SQL section layout:
  - registries (code/catalog tables), organization & identity, RBAC & audit, jobs & projects, planning/attendance/leave funds, performance & KPI, platform settings & notifications.
- Represent each entity faithfully to the DDL: attributes, primary keys, foreign keys, and relationship cardinality derived strictly from the `CREATE TABLE`, `REFERENCES`, and `UNIQUE`/`PRIMARY KEY` statements. Do not invent tables, columns, or relationships.
- For the optimized file, also include the four database **views** (`v_user_leave_balances`, `v_kpi_audit_level1_company`, `v_kpi_audit_level2_department`, `v_kpi_audit_level3_employee`), showing the tables each reads from.
- Keep both documents in English, with a brief caption and a `*Source:*` line per diagram pointing to the SQL file it derives from.
- Leave `DATABASE_SCHEMA_EXAMPLE.sql`, `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql`, and every other project file unchanged; this is additive.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a pure documentation change with no spec-level system behavior change, so `.openspec.yaml` declares `skip_specs: true`.

## Impact

- **Files:** Creates `DATABASE_SCHEMA_EXAMPLE_DIAGRAM.md` and `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED_DIAGRAM.md` (repo root) only. Both SQL files and all other files are left unchanged.
- **Consumers:** No code, config, or build file references either diagram file by path (no such files exist yet), so creating them breaks nothing. They are consumed by humans and coding agents as visual schema references.
- **Out of scope:** editing either SQL file; non-Mermaid diagram tooling (PlantUML, Graphviz, DBML, SchemaSpy); generated image/binary assets; a highlight/diff of what changed between the original and optimized schemas (the optimized diagram is drawn as-is); database deployment, migrations, or ORM models; and any application code.
