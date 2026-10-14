# Design

## Context

See `proposal.md` — Why. This change must produce `SYSTEM_ARCHITECTURE_DIAGRAM.md` (repo root, currently 0 bytes) as a Mermaid visual companion to two existing sources:

- `SYSTEM_ARCHITECTURE.md` (294 lines) — structure: module map, layered view, module catalog, shared domain model, authorization architecture, core engines, cross-cutting concerns, integrations, extensibility, glossary, traceability.
- `SYSTEM_PROCESS_FLOW-en.md` (263 lines) — behavior: the code tables, the RBAC/permission matrix, and the four apps' operational flows, screens, and print/export behavior.

Constraints shaping the approach:

- The user chose **Mermaid** for rendering in Markdown viewers, and **comprehensive** coverage (~9 views).
- The repo currently contains **no** Mermaid, PlantUML, or Graphviz — the diagram document is the first to introduce Mermaid, so it must be self-contained and renderable without extra tooling.
- `SYSTEM_ARCHITECTURE.md` is deliberately technology-neutral; the diagram document must stay consistent with that.
- This change declares `skip_specs: true`; no specs exist in `openspec/specs/`.

## Goals / Non-Goals

**Goals:**

- Give an at-a-glance, renderable visual view of the system across nine complementary perspectives.
- Stay faithful to the two source documents: identical codes, names, values, and role scopes.
- Keep every diagram syntactically valid Mermaid and portable to common renderers (e.g. GitHub's).
- Keep each diagram traceable to the source section(s) it illustrates.

**Non-Goals:**

- No non-Mermaid tooling (PlantUML, Graphviz, D2), no generated image/binary assets.
- No new architectural content beyond what the two sources state; diagrams visualize, they do not extend.
- No edits to `SYSTEM_ARCHITECTURE.md` or `SYSTEM_PROCESS_FLOW-en.md` to embed the diagrams (that would be a separate change).
- No technology stack, hosting, or infrastructure in the diagrams.

## Decisions

### D1 — One standalone example file at the repo root, Mermaid only

`SYSTEM_ARCHITECTURE_DIAGRAM.md` is a single Markdown file; every diagram is a fenced ` ```mermaid ` block.

- *Why:* the placeholder path is fixed; Mermaid is the user's choice; a single file matches the project's root-doc convention.
- *Alternatives considered:* SVG/PNG assets (rejected — binary, un-reviewable, path-dependent); ASCII diagrams (rejected by the user in favor of Mermaid); splitting into one file per diagram (rejected — harder to consume as context).

### D2 — Diagram-type mapping (one Mermaid type per view)

Each view uses the Mermaid diagram type that fits it best:

| # | View | Mermaid type |
| --- | --- | --- |
| 1 | System & module map (core + 4 apps) | `flowchart` |
| 2 | Layered view | `flowchart` with `subgraph` per layer |
| 3 | Core engines & services (and consuming apps) | `flowchart` |
| 4 | Ticket state machine | `stateDiagram-v2` |
| 5 | End-to-end task lifecycle | `sequenceDiagram` |
| 6 | Leave-request workflow | `sequenceDiagram` |
| 7 | Authorization / RBAC decision flow | `flowchart` with decision nodes |
| 8 | KPI & audit data flow (three audit levels) | `flowchart` |
| 9 | Extensibility roadmap (future modules) | `flowchart` (dashed nodes for planned apps) |

- *Why:* state transitions are clearest as a state diagram; multi-actor approval flows as sequence diagrams; structural maps as flowcharts.
- *Alternatives considered:* a single diagram type throughout (rejected — poor fit for flows vs structure); `classDiagram` for the domain model (rejected — the sources describe a state machine and flows, not class structures).

### D3 — Diagram conventions

Every diagram follows the same structure: a `### N. <Title>` heading, a one-line caption, the fenced `mermaid` block, and a `*Source:*` line naming the section(s) of `SYSTEM_ARCHITECTURE.md` / `SYSTEM_PROCESS_FLOW-en.md` it visualizes.

- Node labels use the exact tokens from the sources (`REQ`, `ACT`, `PEN`, `APP`, `REJ`, `CAN`, `OVERDUE`; the eleven leave codes; the five role names; app names).
- Where the source defines identifying colors for ticket states, apply them with `classDef` (White, Yellow, Blue, Green, Orange, Red, Red (Warning)) so the diagram matches the source's color codes.
- Avoid emoji and exotic Mermaid features inside diagram blocks (emoji can break some renderers); keep to widely supported syntax (one diagram keyword, balanced `subgraph`/`end`, quoted labels where needed).
- Keep diagrams technology-neutral, mirroring `SYSTEM_ARCHITECTURE.md`.

### D4 — Comprehensiveness boundary

The nine views in D2 are the required set. Where a view would repeat another (for example, per-app screens inside the module map), summarize rather than duplicate; the diagram document complements the prose sources rather than replacing them.

### D5 — Verification without heavy tooling

Verification is structural and deterministic: confirm each diagram is inside a paired ` ```mermaid ` fence, uses a keyword from the allowed set, has balanced `subgraph`/`end` blocks, and references only tokens present in the source documents. If a Mermaid renderer is available in the environment, rendering to SVG is an optional additional check, not a requirement (the environment may be offline).

## Risks / Trade-offs

- **Mermaid syntax errors break rendering** → Mitigate with strict conventions (D3), balanced blocks, and the structural verification in D5; prefer simple, widely supported constructs.
- **Drift from the source documents** → Mitigate with a `*Source:*` line per diagram, a traceability table, and verbatim tokens; the diagrams are derived, not authoritative.
- **Duplication with the prose docs** → Mitigate by keeping diagrams visual (nodes/edges) and cross-referencing sections instead of restating prose; the captions point back to the source.
- **Renderer incompatibility** → Mitigate by avoiding emoji/unsupported features inside diagram blocks and sticking to common Mermaid versions' syntax.
- **Diagram count creep** → Mitigate by fixing the required set to the nine views in D2/D4.

## Migration Plan

Not applicable — additive documentation only. Rollback is deleting the added content (or `git revert`). The change is archived after review, per project workflow.

## Open Questions

- Whether to later embed the Mermaid diagrams into `SYSTEM_ARCHITECTURE.md` (so the prose document is self-visualizing) is a deferrable follow-up; it does not change this document's structure or the task breakdown. Default: not in this change.
