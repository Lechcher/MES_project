# Proposal

## Why

`SYSTEM_ARCHITECTURE.md` documents the system's structure in prose, tables, and a single ASCII box diagram. It is accurate and complete, but a reader has to reconstruct the shape of the system — the module map, the layers, the ticket lifecycle, the approval flows, and the authorization decision path — from text. There is no at-a-glance visual view, and no diagram that renders in a Markdown viewer. An empty placeholder, `SYSTEM_ARCHITECTURE_DIAGRAM.md`, already sits at the repo root, so the visual-companion path is a dead end that promises diagrams and delivers nothing.

## What Changes

- Write `SYSTEM_ARCHITECTURE_DIAGRAM.md` (currently empty, 0 bytes) as the **visual companion** to `SYSTEM_ARCHITECTURE.md`, using **Mermaid** diagrams that render in Markdown viewers.
- Derive content from the two existing documents: `SYSTEM_ARCHITECTURE.md` (structure — modules, layers, engines, authorization, extension model) and `SYSTEM_PROCESS_FLOW-en.md` (behavior — state transitions, per-app flows, role-based screens).
- Provide a comprehensive set of views, each as its own labeled Mermaid diagram with a short caption and a pointer to the section it illustrates:
  1. **System & module map** — the Core Base Module plus the four apps (`Jobs`, `Planning`, `Performance`, `Settings`).
  2. **Layered view** — presentation/UI rendering → app/module → core services → data.
  3. **Core engines & services** — RBAC & Permission Matrix, Telegram Webhook Notification, Deterministic Performance (KPI), Auto-forking, Print/Export, Global Code Registry, and the apps that consume them.
  4. **Ticket state machine** — `REQ → ACT → PEN → {APP | REJ}`, with `CAN` and `OVERDUE`.
  5. **End-to-end task lifecycle** — a sequence view of assignment, acceptance, progress/report, review, and acceptance.
  6. **Leave-request workflow** — a sequence view of request, review, approval/rejection, and penalty-code assignment.
  7. **Authorization / RBAC decision flow** — the two-layer guard (app-level and view/action-level) and role scope resolution.
  8. **KPI & audit data flow** — how task, attendance, and leave signals feed the deterministic KPI engine and the three-level audit tables.
  9. **Extensibility roadmap** — how `Recruitment`, `Payroll`, and `Assets` plug into the existing core and apps.
- Preserve every coded token and value exactly: ticket state codes (`REQ`, `ACT`, `PEN`, `APP`, `REJ`, `CAN`, `OVERDUE`) and the `ACT - ...` badges; leave codes (`AL`, `UAL`, `SL`, `USL`, `PL`, `ML`, `CL`, `EL`, `LWP`, `TOIL`, `VTO`); role names (`Super Admin`, `Manager / Tech Lead`, `HR Manager`, `Department Head`, `Employee`); app names and aliases (`Jobs`, `Planning`, `Performance`, `Settings`); KPI point values; deadline times; and progress milestones.
- Stay technology-neutral, matching `SYSTEM_ARCHITECTURE.md`: diagrams show logical modules, layers, services, and flows — no frameworks, hosting, or infrastructure.
- Keep the document in English and ensure each diagram is syntactically valid Mermaid within a fenced ```mermaid block.
- Leave `SYSTEM_ARCHITECTURE.md`, `SYSTEM_PROCESS_FLOW-en.md`, and every other project file unchanged; this is additive documentation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a pure documentation change with no spec-level system behavior change, so `.openspec.yaml` declares `skip_specs: true`.

## Impact

- **Files:** Adds content to `SYSTEM_ARCHITECTURE_DIAGRAM.md` (repo root) only. `SYSTEM_ARCHITECTURE.md`, `SYSTEM_PROCESS_FLOW-en.md`, and all other files are left byte-for-byte unchanged.
- **Consumers:** No code, config, or build file references `SYSTEM_ARCHITECTURE_DIAGRAM.md` by path (same as the other root docs), so filling in the file breaks nothing. It is consumed by humans and coding agents as a visual architecture reference.
- **Out of scope:** Non-Mermaid diagram tooling (PlantUML, Graphviz, etc.); image or other binary assets; a Vietnamese companion document; editing `SYSTEM_ARCHITECTURE.md` or `SYSTEM_PROCESS_FLOW-en.md` to embed the new diagrams; and any implementation, code, or technology-stack change.
