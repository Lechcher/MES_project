# Proposal

## Why

`SYSTEM_PROCESS_FLOW-en.md` is the canonical English reference for the MES prototype's target system, but it is written as a *process flow*: it is organized around user roles, screen-by-screen behavior, state codes, and per-app flows. It defines the Odoo-like modular app model, the two-layer authorization mechanism, the four custom apps, and the shared code tables, yet it never presents the system as an *architecture* — there is no single view of the module boundaries, the layers, the core engines, the shared domain model, or how the pieces fit together. An empty placeholder, `SYSTEM_ARCHITECTURE.md`, already sits at the repo root, so the architecture path is a dead end that promises a reference document and delivers nothing.

## What Changes

- Write `SYSTEM_ARCHITECTURE.md` (currently empty, 0 bytes) as a comprehensive system architecture document, derived solely from `SYSTEM_PROCESS_FLOW-en.md`.
- Cover, at minimum: document purpose and scope; architectural principles (Odoo-like modular core, two-layer authorization, deterministic KPI engine, shared code registry); the logical architecture of the Core Base Module plus the four apps (`Jobs`, `Planning`, `Performance`, `Settings`) with a diagram; the layered view (presentation/UI rendering, app/module layer, core services, data layer); a module/capability catalog with each app's responsibilities and role-based screens; the shared domain model (ticket state machine and leave codes); the two-layer authorization architecture and permission matrix; the core engines (RBAC & Permission Matrix, Telegram Webhook Notification, Deterministic Performance/KPI, Auto-forking, Print/Export); cross-cutting concerns and non-functional notes; integration points; the future expansion architecture; and a glossary of state/leave codes.
- Ground every architectural claim in `SYSTEM_PROCESS_FLOW-en.md`; stay technology-neutral (no framework, hosting, or infrastructure choices).
- Preserve all coded tokens and values exactly: ticket state codes (`REQ`, `ACT`, `PEN`, `APP`, `REJ`, `CAN`, `OVERDUE`) and the `ACT - ...` badges; leave codes (`AL`, `UAL`, `SL`, `USL`, `PL`, `ML`, `CL`, `EL`, `LWP`, `TOIL`, `VTO`); app names and aliases (`Jobs`, `Planning`, `Performance`, `Settings`); role names; KPI point values; percentage thresholds; and deadline times.
- Keep the document in English (matching the English source) and in Markdown, using the same visual conventions as the source (ASCII box diagrams, Markdown tables, LaTeX expressions where they clarify structure).
- Leave `SYSTEM_PROCESS_FLOW-en.md` and every other project file unchanged; this is additive documentation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a pure documentation change with no spec-level system behavior change, so `.openspec.yaml` declares `skip_specs: true`.

## Impact

- **Files:** Adds content to `SYSTEM_ARCHITECTURE.md` (repo root) only. `SYSTEM_PROCESS_FLOW-en.md` and all other files are left byte-for-byte unchanged.
- **Consumers:** No code, config, or build file references `SYSTEM_ARCHITECTURE.md` or `SYSTEM_PROCESS_FLOW-en.md` by path (verified by repository-wide search outside `.git/` and `openspec/`), so filling in the file breaks nothing. The document is consumed by humans and coding agents as architecture guidance.
- **Out of scope:** Any implementation or code change; the concrete technology stack and deployment/infrastructure (the document is deliberately technology-neutral); the SQL data schema in `DATABASE_SCHEMA_EXAMPLE.sql` and any other project document (`SYSTEM_PROCESS_FLOW-vi.md`, `DESIGN.md`, `API_CONTACT_SPECIFICATION.md`, `AGENTS*.md`, READMEs); and changing any of the behaviors, codes, or values the source document describes.
