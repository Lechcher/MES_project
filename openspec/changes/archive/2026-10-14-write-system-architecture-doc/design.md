# Design

## Context

See `proposal.md` — Why. The change must produce `SYSTEM_ARCHITECTURE.md` (repo root, currently 0 bytes) from a single source: `SYSTEM_PROCESS_FLOW-en.md` (263 lines, `18594` bytes). That source is a *process-flow* document, not an architecture document: it leads with two standard code tables (ticket states, leave codes), then a two-layer authorization/permission matrix, then four app sections each written as Purpose → Functions & Operational Flow → Functional Screens & Role-Based Display → Print/Export, and closes with a future-expansion section.

Constraints that shape the approach:

- The user chose to ground the document **only** in `SYSTEM_PROCESS_FLOW-en.md` and to make it **comprehensive**; the stack and infrastructure are deliberately excluded, so the output is a logical, technology-neutral architecture.
- Project doc conventions already established at the repo root: standalone Markdown files (`SYSTEM_PROCESS_FLOW-en.md`, `DESIGN.md`), English, with ASCII box diagrams, Markdown tables, and LaTeX expressions.
- No specs exist in `openspec/specs/`, and no code or config references either document by path (verified). This change declares `skip_specs: true`.

## Goals / Non-Goals

**Goals:**

- A single, self-contained architecture reference that lets a new contributor or agent understand the system's structure without reading the whole process-flow document.
- Express the architecture that the source *implies*: module boundaries, layers, core engines, shared domain model, authorization model, integrations, and extension points.
- Preserve every code, identifier, point value, threshold, and time from the source exactly.
- Make the relationship to the source explicit so the two documents stay reconcilable.

**Non-Goals:**

- No implementation, no code, no schema, no API contract. `DATABASE_SCHEMA_EXAMPLE.sql`, `API_CONTACT_SPECIFICATION.md`, and the actual `frontend/`/`backend/` code are **not** inputs.
- No technology stack, hosting, or deployment infrastructure (user decision: technology-neutral).
- No reproduction of the source's screen-by-screen process flows; the architecture document references them rather than restating them.
- No spec-level behavior is defined here (no `specs/` deltas).

## Decisions

### D1 — One standalone Markdown file at the repo root

`SYSTEM_ARCHITECTURE.md` is a single self-contained Markdown document at the repo root, matching existing doc conventions.

- *Why:* the file already exists as an empty placeholder at that exact path; the project keeps top-level docs as single files; a single file is easy to consume as agent context.
- *Alternatives considered:* splitting into `docs/architecture/*.md` (rejected — no `docs/` convention exists, and the placeholder path is fixed); embedding into `SYSTEM_PROCESS_FLOW-en.md` (rejected — the user asked for a separate file, and merging would conflate process and architecture views).

### D2 — Technology-neutral logical architecture

Describe modules, layers, services, and data flow conceptually; do not name frameworks, languages, databases, or hosts.

- *Why:* user-confirmed. The source contains no technology choices, so naming any would invent facts.
- *Alternatives considered:* documenting the actual prototype stack (Next.js/Bun/PostgreSQL) — rejected by the user; a hybrid with a clearly-labeled "implementation note" section — also rejected.

### D3 — Reorganize, do not copy

Re-frame the source's role/flow-centric material into architecture views rather than reproducing it. Maintain a traceability section mapping each architecture section back to its source section(s).

- *Why:* the value of the new document is the structural synthesis; a near-copy would duplicate the source and drift.
- *Alternatives considered:* a literal summary of the source in the same order (rejected — adds little over the source); a purely conceptual free-form architecture with no traceability (rejected — hard to verify against the source).

### D4 — Reuse the source's visual vocabulary

Keep the ASCII box-diagram style for the module/core diagram, reuse Markdown tables for code registries and the permission matrix, and keep LaTeX expressions where they clarify (state-transition and KPI formulas). Reuse the shared code tables (ticket states, leave codes) verbatim in content so codes stay identical.

- *Why:* consistency with `SYSTEM_PROCESS_FLOW-en.md`; codes are the system's shared vocabulary and must not be paraphrased.

### D5 — Required section outline (comprehensive)

The document must contain, in a sensible order:

1. **Purpose & Scope** — what the document is, who it is for, and an explicit statement that it derives from `SYSTEM_PROCESS_FLOW-en.md`.
2. **System Overview & Context** — what the system is and the problems it covers (project/task planning, attendance, leave, performance, administration).
3. **Architectural Principles** — Odoo-like modular core; shared code registry; two-layer authorization; deterministic (rule-based) scoring; role-driven UI rendering.
4. **Logical Architecture** — the Core Base Module and the four apps as modules, with an ASCII diagram in the source's style.
5. **Layered View** — presentation/UI-rendering layer, app/module layer, core-services layer, data layer, with the responsibility of each.
6. **Module Catalog** — per app (`Jobs`, `Planning`, `Performance`, `Settings`): purpose, responsibilities, key capabilities, and role-based interface visibility.
7. **Shared Domain Model** — ticket state machine (`REQ → ACT → PEN → {APP | REJ}`, with `CAN` and `OVERDUE`) and the ticket state code/color table; leave code registry.
8. **Authorization Architecture** — the two-layer model (app-level guard, view/action-level guard) and the permission matrix summarized as an architecture concern.
9. **Core Engines & Services** — RBAC & Permission Matrix Engine, Telegram Webhook Notification Engine, Deterministic Performance Calculation Engine (KPI), Auto-forking Engine, Print/Export Engine, and the global state/leave code registry.
10. **Cross-Cutting Concerns & Non-Functional Notes** — auditability (system audit log), notification, report outputs (PDF/Excel/CSV), and any constraints the source states.
11. **Integration Points** — the Telegram webhook as the external integration, described at an architecture level.
12. **Extensibility & Future Modules** — how the modular core admits `Recruitment`, `Payroll`, and `Assets` without redesign.
13. **Glossary of Codes** — consolidated state and leave codes with their meanings.

- *Why:* this is the "comprehensive" depth the user selected and the set of views an architecture document needs; ordering goes from context → structure → behavior → cross-cutting → extension.
- *Alternatives considered:* a shorter outline (the "concise" option) — declined by the user.

### D6 — Conceptual runtime view only

Where the source implies a runtime/deployment shape (a core with pluggable app modules, a webhook endpoint, scheduled/automatic state transitions such as `OVERDUE`), describe it conceptually. Do not specify runtimes, servers, or schedules as implementation facts.

## Risks / Trade-offs

- **Duplication with the source** → Mitigate by writing architecture views (module, layer, service, domain-model) and cross-referencing the source for screen-level process detail instead of restating it; keep the traceability section so overlap is intentional and auditable.
- **Inventing architecture not present in the source** → Mitigate by treating the source as the only authority: no new modules, roles, codes, or values; anything structural is a synthesis of stated facts, not a new claim. Codes and numeric values are copied verbatim.
- **Drift if the source later changes** → Mitigate by stating, in the Purpose section, which document the architecture is derived from, so a future revision can be reconciled.
- **Scope creep into stack/schema/implementation** → Mitigate by the explicit Non-Goals above and by not opening `DATABASE_SCHEMA_EXAMPLE.sql` or the code as inputs during apply.
- **Ambiguity in what "architecture" should include** → Resolved before apply via the user's two choices (source-only grounding, comprehensive depth) and the fixed outline in D5.

## Migration Plan

Not applicable — this is additive documentation with no runtime, data, or API migration. Rollback is `git revert`/deleting the added file content. The change is archived after review, per project workflow.

## Open Questions

- Whether a Vietnamese companion (`SYSTEM_ARCHITECTURE-vi.md`) should later be produced to sit alongside `SYSTEM_PROCESS_FLOW-vi.md` is a deferrable follow-up; it does not change this document's structure or the task breakdown. Default: not in this change.
