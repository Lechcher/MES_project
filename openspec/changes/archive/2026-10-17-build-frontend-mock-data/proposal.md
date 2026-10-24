# Proposal

## Why

The MES prototype is fully specified — `SYSTEM_PROCESS_FLOW-en.md` defines every screen and role view, `SYSTEM_ARCHITECTURE.md` the engines, `API_CONTACT_SPECIFICATION.md` the GraphQL contract, and `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` the data model — but none of it exists as a working frontend. Every role-aware surface (the Home Page Dashboard app launcher, the Jobs ticket lifecycle, the Planning matrix calendar, the Performance KPI dashboards and audit tables, the Settings & IAM administration) lives only on paper. Building the complete frontend against a typed mock data layer first decouples UI review from backend readiness: every screen, role view, and process flow can be demonstrated and iterated immediately, and the mock layer leaves a typed seam where the GraphQL client plugs in later without reworking the UI.

## What Changes

- Build the full web frontend inside `frontend/` (Next.js App Router), in **English**, following the **light IBM Carbon-inspired theme of the current `DESIGN.md`** (white canvas, IBM Blue `#0f62fe` accent, flat-square 0px corners, IBM Plex Sans, hairline borders, footer-only inversion), and preferring shadcn components over native TSX/HTML tags (per `AGENTS.md`).
- **Theme authority note:** the one-line summary in `AGENTS.md`'s Design section ("dark, data-dashboard … cyan data accent … monospaced KPI numbers") is stale — it predates the `DESIGN.md` rewrite and contradicts it. `DESIGN.md` is authoritative (AGENTS.md points to it for the actual palette); this change also aligns that stale sentence with the current `DESIGN.md`.
- Work on the branch `ai/opencode/build-frontend-mock-data` (already created and checked out per `AGENTS_GIT.md`; commit there with the AI co-author trailer; never push to protected branches).
- Add a **typed mock data layer** under `frontend/src/lib/mock/`: fixtures shaped by `API_CONTACT_SPECIFICATION.md` and `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` (camelCase fields, `OffsetPageInfo` pagination, enums verbatim: ticket states `REQ, ACT, PEN, APP, REJ, CAN, OVERDUE`; leave codes `AL, UAL, SL, USL, PL, ML, CL, EL, LWP, TOIL, VTO`), exposed through per-module service functions that make **no network calls**, so the real GraphQL layer can replace them later.
- **App shell**: a sign-in landing where a reviewer picks a demo account (role), the **Home Page Dashboard** app launcher whose icons are gated by the Layer-1 app access matrix, the global dark layout/theme, and the 1-Click Day Navigation Bar (`[ Yesterday ] [ Today ] [ Tomorrow ]`).
- **Jobs app**: role-scoped ticket lists (Employee personal vs Manager/HR department/company views), ticket detail with the full state lifecycle (`REQ → ACT → PEN → APP | REJ`, `CAN` anytime, `OVERDUE` after deadline) and secondary `ACT` badges, create-ticket form (task types with hourly slots 10:30/14:00/16:30, project attach, Auto-forking), Daily Quick-add, extension and late-submission flows, Print/Export buttons.
- **Planning app**: role-scoped matrix calendar (Gantt-like ticket bars with progress % and state codes, leave badges on day cells), Create Leave Request form (leave code, attachment, handover person), the Approval Board (work-report queue for `PEN` and the extension/late-submission queue), attendance summary and `AL Balance`/`TOIL Balance` table, penalty-leave (`UAL`/`USL`) assignment for HR/Super Admin only, Print/Export.
- **Performance app**: Personal KPI Dashboard (score card, donut chart, own `AL/TOIL` balances, recent events) for every role, plus the three-level audit tables with their documented columns — Level 1 (company employees), Level 2 (departments), Level 3 (department employees, also for Department Head) — and the company-wide ranking column chart, with role-based table visibility per the permission matrix.
- **Settings & IAM app**: User Directory (view/create/edit/reset password), Org Structure management with Auto-forking configuration, RBAC role/permission management, Telegram Webhook settings, and the read-only System Audit Logs trail; menu visibility gated by role (HR Manager sees only the User Directory).
- All write actions (accept, approve, return, cancel, approve leave, …) mutate **in-memory mock state**; Print/Export produce mock results — no real files, no network, no backend calls.
- **Out of scope:** the dedicated **Audit Log app (App 5)** — planned separately as the `add-audit-log-module` change; real authentication; real GraphQL integration; real file generation for print/export; future modules (Recruitment, Payroll, Assets); any backend change.

## Capabilities

### New Capabilities

- `frontend/app-shell`: sign-in/role selection, the role-gated Home Page Dashboard app launcher, the global dark dashboard layout, theme tokens from `DESIGN.md`, and the day navigation bar — the frame every app renders inside.
- `frontend/mock-data`: the typed mock data layer — entities and enums verbatim from the contract, pagination connections, deterministic role-scoped service functions per module, in-memory mutation of mock state, zero network/backend calls.
- `frontend/jobs`: the Jobs & Projects screens — ticket lists and filters, ticket detail and lifecycle actions, create-ticket form with task types and Auto-forking, Daily Quick-add, extension/late-submission flows, print/export entry points, rendered per the role matrix.
- `frontend/planning`: the Planning & Attendance screens — matrix calendar with per-role scope, leave request creation, the Approval Board queues, attendance/leave-balance summary, penalty-leave assignment, print/export entry points, rendered per the role matrix.
- `frontend/performance`: the Performance screens — Personal KPI Dashboard, the three-level audit tables with their exact documented columns, the company ranking column chart, role-based visibility of audit levels, print/export entry points.
- `frontend/settings`: the Settings & IAM screens — user directory management, org structure with Auto-forking, RBAC permissions, Telegram webhook configuration, and the read-only system audit trail, with role-gated menus.

### Modified Capabilities

None — the project has no existing specs; every capability above is new.

## Impact

- **Code**: new routes/pages under `frontend/src/app/**`, components under `frontend/src/components/**`, and the mock layer under `frontend/src/lib/mock/**`; additional shadcn primitives added via the shadcn CLI as needed. No `backend/` files change.
- **Dependencies**: stays on the existing stack (Next.js 16, React 19, Tailwind CSS v4, shadcn + Base UI, lucide-react, Chart.js); no new external packages are planned — shadcn CLI additions come from the existing registry setup.
- **Consumers**: reviewers and stakeholders run the app locally to walk through every documented screen and role view; the mock service functions are the future seam for the GraphQL client.
- **Docs**: none. The source documents stay untouched; the domain vocabulary is preserved verbatim in UI and mocks.
