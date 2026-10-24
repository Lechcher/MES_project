# Design

## Context

The frontend is a `create-next-app` scaffold: only `/` (untouched template page), a root layout loading Geist fonts, one shadcn primitive (`Button`), better-auth mounted at `/api/auth/*` with zero UI, and `chart.js` + `lucide-react` installed but unused. `globals.css` carries the stock neutral shadcn token set (`--radius: 0.625rem`) and a broken `--font-sans: var(--font-sans)` self-reference. The backend is a bare Elysia "Hello" server — there is no API to call yet, which is exactly why this change builds against mock data (see proposal.md — Why).

Authoritative sources: `SYSTEM_PROCESS_FLOW-en.md` (screens, role matrix, flows), `API_CONTACT_SPECIFICATION.md` (entity shapes, enums, pagination, permissions), `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` (seeded registries: state names/colors, leave payroll rules, KPI point rules), and the current `DESIGN.md`.

**Theme authority — conflict resolved:** `AGENTS.md`'s Design one-liner still says "dark, data-dashboard … cyan data accent … monospaced KPI numbers", but the current `DESIGN.md` (version `alpha`, `IBM-design-analysis`, recently rewritten) defines a **light IBM Carbon-inspired system**: white canvas, IBM Blue `#0f62fe`, flat-square 0px corners, IBM Plex Sans, hairline borders, no shadows, footer-only inversion. `AGENTS.md` itself defers to `DESIGN.md` for palette/typography/styling, so **the current `DESIGN.md` wins**; the stale sentence is aligned by a task in this change. Also stale: the stock create-next-app page, README font mentions, and "Create Next App" metadata — all replaced or fixed here.

## Goals / Non-Goals

**Goals:**

- A walkable prototype: sign in as any of the 5 roles, see exactly the apps/tabs/actions the permission matrix allows, run every documented flow end to end on mock data.
- A typed mock layer that mirrors the GraphQL contract closely enough that swapping in a real client later is a service-layer swap, not a UI rewrite.
- Full `DESIGN.md` conformance: IBM Blue accent, square corners, Plex Sans, hairline borders, inverse footer.
- Domain tokens rendered verbatim (`REQ`…`OVERDUE`, `AL`…`VTO`).

**Non-Goals:**

- No backend integration, no real auth (the better-auth route stays mounted but unused), no real print/export files, no file uploads (attachments are filenames only).
- No new npm dependencies: no form libs (react-hook-form/zod), no state libs (zustand), no chart wrapper libs (recharts). shadcn CLI additions come from the existing `base-nova` registry.
- The dedicated Audit Log **app** (App 5) — it ships with `add-audit-log-module`. Settings' own System Audit Logs trail *is* in scope (it is one of App 4's documented functions).
- No i18n (English only), no mobile-specific design beyond `DESIGN.md` breakpoints, no cleanup of `@neodrag/solid` or `.env` wiring (flagged for a separate change).

## Decisions

### 1. Mock layer: typed module store + per-module services (`frontend/src/lib/mock/`)

- `types.ts` — domain types mirroring the GraphQL types (camelCase fields, nullable relations, `OffsetPageInfo`).
- `db.ts` — a module-level in-memory store seeded deterministically from fixtures; re-seeded on reload. Dates are computed relative to `new Date()` at seed time so Today/Overdue/calendar views are always populated.
- `registries.ts` — ticket states and leave codes with their seeded names, colors, terminal/penalty/balance flags (from the SQL seed data).
- `session.ts` — the current viewer (demo account), held in React context; sign-out clears it.
- `services/<module>.ts` — `auth`, `jobs`, `planning`, `performance`, `settings`: read functions returning connection-shaped lists with role scoping applied inside the service (mirroring what the API would do), plus mutation functions that enforce lifecycle rules and append transition/audit/KPI records.

**Alternatives rejected:** MSW/network mocking (adds a dependency and violates the zero-network spirit — the seam we want is the service function, not the transport); keeping fixtures inline in components (no seam, untestable scoping).

**Alternatives rejected for state:** zustand/redux (new dependency; overkill for a prototype). Reactivity is a store subscribe hook (`useSyncExternalStore`) — no external library needed.

### 2. Rendering model: client components for screens, server root layout

Every screen depends on the viewer session and mock store, so app pages are client components. The root layout stays a server component (fonts, theme, metadata). No SSR data fetching anywhere; no loading states beyond local ones.

### 3. Theme: re-token `globals.css` to IBM Carbon values, keep the shadcn variable architecture

Keep the existing shadcn token *names* (`--background`, `--primary`, `--radius`, sidebar/chart tokens) and remap their values to `DESIGN.md`: canvas `#ffffff`, primary `#0f62fe`, ink scale `#161616/#525252/#8c8c8c`, surfaces `#f4f4f4/#e0e0e0`, hairlines, semantic `#24a148/#f1c21b/#da1e28`, `--radius` scale collapsed to 0 (dropdowns 4px per `DESIGN.md` `rounded.sm`). `.dark` block is removed (light-only app; footer inverts by design, not by mode). Fonts: load **IBM Plex Sans** (weights 300/400/600) via `next/font/google` in `layout.tsx`, wire `--font-sans` to it (fixing the self-reference), drop Geist. Chart tokens map to the semantic palette. Because primitives like `Button` hardcode `rounded-lg`, components added from the registry get their radius from the collapsed `--radius` scale or a local override — square corners are verified visually, not assumed.

**State badge colors** come from the seeded registry color names — White/Yellow/Blue/Green/Orange/Red/Red (Warning). Mapping: `ACT`→warning `#f1c21b`, `PEN`→primary `#0f62fe`, `APP`→success `#24a148`, `CAN`/`OVERDUE`→error `#da1e28`, `REQ`→neutral outline on white, and `REJ`→one supplementary orange (`#ee5c25`, IBM Carbon orange — `DESIGN.md` has no orange token; documented here as the single palette extension).

### 4. Routing: App Router, one route group per app

- `/signin` — demo account picker (no password).
- `/` — Home Page Dashboard launcher (redirects to `/signin` without a viewer).
- `/jobs` — ticket list (day nav + filters); `/jobs/quick-add`; `/jobs/new` (create); `/jobs/tasks/[id]` (detail).
- `/planning` — tabbed: Matrix Calendar, Approval Board (role-gated), Attendance & Balances; `/planning/leave/new` — Create Leave Request.
- `/performance` — tabbed: Personal KPI, Audit Table 1, Table 2, Table 3, Ranking chart (each role-gated).
- `/settings` — tabbed: Users, Org Structure, RBAC, Webhook, Audit Logs (role-gated).

Tabs are links (URL-addressable for review), not client-only tab state. Hidden tabs are simply not rendered — no disabled states.

### 5. Role gating: two layers from one permission fixture

The mock seeds the `roles`/`permissions`/`role_permissions` tables exactly as the SQL seed does. A `can(viewer, permissionCode)` helper plus scope fields (`PERSONAL`/`DEPARTMENT_ONLY`/`COMPANY_WIDE`/`ALL`) drive both layers: Layer 1 (launcher/nav entries) and Layer 2 (tabs, columns, buttons) hide anything the viewer lacks. This mirrors the future backend's authorization so the UI needs no rework when the API lands.

**Documented conflicts resolved (from the process-flow doc's own ambiguities):**

- `UAL`/`USL` assignment: matrix + Planning §2 + API contract win → `HR_MANAGER` and `SUPER_ADMIN` only (the doc's "HR/Manager rejects" sentence at L160 is prose shorthand).
- Employee `Cancel Ticket`: the API contract's seeded grants win → Employee has no cancel action (the doc's "cancelled by the Employee or Manager" state description is aspirational prose).
- Settings account actions: L242 "Reset Password, Soft Delete" vs matrix "Reset/Lock" → modeled as one **Deactivate** action (soft delete/lock).
- App 3 label: the heading's `Performance / Users` is cosmetic; the module code is `performance`.
- Audit Table 1 vs Table 3 column drift (SL vs Immediate Approval/Returned): each table reproduces its documented columns exactly, drift included.
- Role capability questions always resolve to the permission matrix, never to prose interface labels ("Manager / HR Interface" etc.).

### 6. KPI effects: append-only events + incrementally updated monthly summaries

Mutations append `KpiScoreEvent`s using the fixed point rules (+10/+20/+5/+50; −15/−5/−2/−10) and incrementally update the affected user's current-month `KpiMonthlySummary` (counters + `totalKpiScore`). Audit-table rows and the personal dashboard read from summaries; recent-event lists read the ledger. Computing summaries fully from scratch on every read was considered and rejected as needless complexity for a prototype.

### 7. Charts: thin Chart.js wrappers, no wrapper library

`chart.js@4.5.1` is installed. Write two small canvas components (donut, column/bar) with registration scoped to the components that need it, colors from the semantic palette, destroy-on-unmount. Alternative — shadcn's chart primitive (Recharts) — rejected: adds a dependency.

### 8. Forms: plain controlled components, shadcn primitives

Controlled React state + native HTML validation + shadcn `input`/`select`/`checkbox`/`switch`. No react-hookForm/zod (not installed; mock persistence doesn't need schema validation). Validation rules that matter behaviorally (mandatory cancel reason, extension before deadline) are enforced in the service layer so the UI and the rules can't drift.

### 9. Print/Export: one shared mock result component

Every `[🖨️ Print]` / `[📥 Export]` button opens the same result component showing the would-be artifact (document-style name, format `PDF`/`XLSX`/`CSV`, scope) with an explicit "mock — no file generated" note. One component, consistent behavior, zero file I/O.

### 10. Git: work on the existing `ai/opencode/build-frontend-mock-data` branch

The branch already exists and is checked out (correct `ai/<agent-name>/<description>` form). Commits land there in phases with the `Co-authored-by: AI Agent <agent@local>` trailer; no direct pushes to protected branches; integration to `main` happens later via PR with human approval per `AGENTS_GIT.md`.

## Risks / Trade-offs

- **Large surface in one change** → tasks are phased (theme/shell → mock → Jobs → Planning → Performance → Settings) so each phase ends in a verifiable state; apps are independent after the mock layer exists.
- **Theme drift from shadcn defaults** (`rounded-lg` hardcoded in primitives) → collapsed radius scale + a visual theme-conformance check task (square corners, no shadows, IBM Blue CTAs) rather than assuming token remapping is enough.
- **Chart.js has no React wrapper installed** → thin hand-rolled wrappers; risk contained to two chart types (donut, column).
- **Fixture realism** → seed targets a fixed cast (~15 users across 4+ departments) with 40+ tasks covering every state/badge and current-month attendance; not exhaustive, but every documented element has an example (enforced by a spec scenario).
- **In-memory-only state** → mutations vanish on reload; accepted and specified (ephemeral session); reviewers who need reproducible walkthroughs just repeat the action.
- **Stale `AGENTS.md` theme sentence misleading future implementers** → alignment task included in this change.
- **`AGENTS_Example.md` is untracked and the repo has unrelated uncommitted modifications** → this change touches only `frontend/**` (+ the one `AGENTS.md` sentence); `git status` is checked before committing so unrelated changes are never swept into this branch's commits.

## Migration Plan

Prototype-only; no deployment or data migration. Rollout is commit-by-phase on the `ai/opencode/build-frontend-mock-data` branch; rollback is reverting the branch commits. Eventual merge to `main` via PR with human approval.
