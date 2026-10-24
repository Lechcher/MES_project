# Proposal

## Why

The website shows internal code tokens to its users: table cells read `MEDIUM`,
`HOURLY`, `PENDING`, `EXTENSION`, and `DIVISION`; badges append the token to the
name (`Pending (PEN)`); dropdowns and filter boxes list raw enum values; and a
person's department appears as a code qualifier (`· ENG`). Those tokens exist for
the data contract and access logic, not for reading. The product owner requires
the interface to present English natural language only, so the site is usable
without knowing the enum vocabulary.

## What Changes

- Add a single display-label registry for every user-facing domain enum — ticket
  states, leave codes, priority, task type, approval status, task-request type,
  department type, audit modules, roles, and task-state badges — as the only
  place code-to-label mappings live.
- Convert every render site to labels: table cells, filter and form dropdowns,
  status pills, badges, calendar cells, module and role listings, and short
  description copy. Badges show the English name alone; no `Name (CODE)` form and
  no bare codes.
- Show a department's name wherever a department is shown as a qualifier next to
  another record (assignee list, KPI audit tables).
- Stop displaying record identifiers users do not need: the task code
  (`T202610-0011`), user code (`SA-001`), Employee ID, and department code
  columns and qualifiers are removed from user-facing screens for every role,
  including confirmation toasts that quote them. Identifier form fields that
  capture a code remain unchanged as inputs to the data contract.
- Keep codes only where they are the actual content, and only on the apps
  already restricted to `TECH_LEAD` and `SUPER_ADMIN` (Settings' Org Structure,
  RBAC, System Audit Logs, and the Audit Log app): permission codes, audit
  module/action/resource references, and the department code field.
- Keep domain codes verbatim in data, queries, mutations, and access logic —
  labels are presentation only, so no API, backend, or dependency change.
- Add a registry-coverage unit test so a new enum value cannot ship without a
  label.
- **BREAKING (spec):** remove the `frontend/app-shell` requirement
  "Domain vocabulary rendered verbatim" — it required the opposite of this
  change — and move token preservation into the new capability's data-contract
  requirement.
- Update the `frontend/jobs`, `frontend/planning`, `frontend/performance`, and
  `frontend/settings` requirements whose specified display text embeds code
  tokens (badge labels, calendar bars and day cells, audit-table column headers
  including the Employee ID and Department Code columns, the ticket-row task
  code, org-structure type, attendance leave code).

## Capabilities

### New Capabilities

- `frontend/display-labels`: The presentation rule that every domain enum and
  related code renders as English natural language in the UI, from one label
  registry, while codes remain the data and logic contract.

### Modified Capabilities

- `frontend/app-shell`: REMOVED "Domain vocabulary rendered verbatim" (superseded
  by `frontend/display-labels`).
- `frontend/jobs`: MODIFIED "Ticket rows show state badges and lifecycle flags"
  and "Extension request flow" — badge display text drops the `ACT -` prefixes.
- `frontend/planning`: MODIFIED "Calendar renders ticket bars and day badges" and
  "Attendance summary and leave-fund balances" — bars, day cells, and attendance
  records show English names instead of state and leave codes.
- `frontend/performance`: MODIFIED "Audit Table 1 — company employees" and
  "Audit Table 3 — employees within a department" — column headers drop the
  parenthetical code keys.
- `frontend/settings`: MODIFIED "Org Structure management with Auto-forking" —
  the type column shows Department or Division.

## Impact

- **Code**: `frontend/src/lib/mes/queries/registries.ts` (label tables and lookup
  helpers), a role helper for the technical-role gate, `frontend/src/components/**`
  render sites across Jobs, Planning, Performance, Settings, and Audit Log, plus
  shared badges (`shared/state-badge.tsx`, `shared/secondary-badge.tsx`).
- **No change**: backend, GraphQL contract, database, environment variables,
  dependencies. Code tokens in data, filters, and mutations are untouched.
- **Verification**: `bun test` (frontend, including a new registry-coverage
  test), backend suite unchanged, `bun run typecheck`, `bun run lint` in both
  packages, and `next build` to confirm no presentation regressions.
