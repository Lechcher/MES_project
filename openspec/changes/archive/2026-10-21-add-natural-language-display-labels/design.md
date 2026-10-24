# Design

## Context

`frontend/src/lib/mes/queries/registries.ts` is already the home of documented
code metadata: ticket states carry `code` + `name` + color, leave codes carry
`code` + `name` + color, and `TASK_STATE_BADGE_LABELS` holds the `ACT - …`
badge texts. The remaining enums (priority, task type, approval status,
task-request type, department type, roles, audit modules) have no label source
and are rendered as raw codes at the sites found in exploration: jobs list and
quick-add cells, task detail, request review, create-ticket selects and assignee
list, planning status pills / request types / attendance rows, performance audit
tables and the KPI rule table, settings org structure and RBAC, the audit-log
module filter, plus three description strings that name `PENDING`. Module names
duplicate across `AUDIT_LOG_MODULES` (access.ts) and a local `MODULE_NAMES` in
rbac.tsx.

Constraints from the project: code tokens stay verbatim in data and logic
(AGENTS.md domain vocabulary); prefer editing existing files; no new
dependencies or environment variables.

## Goals / Non-Goals

**Goals:**
- One registry module owns every code-to-label mapping; components never
  restate a label inline.
- A coverage test makes an unlabeled enum value a test failure.
- Pixel-level behavior (badge colors, layouts) is unchanged except for the label
  text itself.
- No backend, API, database, dependency, or environment change.

**Non-Goals:**
- Translating dates, numbers, or free-text audit actions — the audit trail's
  action prose is not an enum and stays as written.
- Renaming or translating the tokens themselves (they remain the contract).
- Server-side label fields in the GraphQL contract.

## Decisions

**1. Extend `registries.ts` instead of adding a new labels module.**
The file already defines `TicketStateMeta`/`LeaveCodeMeta` with names and colors;
splitting labels into a second registry would fork one concept. Add
`PRIORITY_LABELS`, `TASK_TYPE_LABELS`, `APPROVAL_STATUS_LABELS`,
`TASK_REQUEST_TYPE_LABELS`, `DEPARTMENT_TYPE_LABELS`, `EXPORT_FORMAT_LABELS`,
`ROLE_CODE_LABELS`, and a shared `MODULE_LABELS` (hoisting the name list out of
`rbac.tsx`, reusing `AUDIT_LOG_MODULES`'s existing pairs), plus a
`labelFor(code, table)` helper whose fallback returns the input unchanged (for
non-enum strings such as audit action prose).
*Alternative:* a new `frontend/src/lib/mes/labels.ts` — rejected: two registries
for one concept invites drift.

**2. Labels are presentation-only; the GraphQL contract is untouched.**
All mapping happens client-side.
*Alternative:* add `label` fields per enum on the API — rejected: it changes the
contract for every enum, duplicates names the frontend already documents, and
contradicts token preservation.

**3. Badges drop the `(CODE)` suffix; compact cells truncate, they don't fall
back to codes.** `StateBadge` renders `info.name` alone; `compact` renders the
name with `truncate` and `title={info.name}` so dense calendar cells stay narrow
without showing tokens. `SecondaryBadge` labels become
"Active — Urgent Processing" etc. (the color mapping is unchanged and stays
keyed by code in the requirement text).
*Alternative:* keep bare codes in compact cells for density — rejected by the
user's rule; truncation with a tooltip preserves density and readability.

**4. Two-tier display policy: labels for everyone, identifiers for no one,
codes as content only on technical surfaces.**
- *Regular screens (all roles):* enums render as English labels, and record
  identifiers — task code, user code, Employee ID, department code — are not
  rendered at all, including confirmation messages that quote them. Identifier
  form fields that capture a code (create/edit user, org-structure code field)
  stay inputs to the data contract.
- *Technical apps (Org Structure, RBAC, System Audit Logs, Audit Log — already
  restricted to `TECH_LEAD` and `SUPER_ADMIN`):* codes stay where they are the
  record's actual content (permission codes, audit module/action/resource
  references, the department code field); role and module listings render by
  name.
*Alternative:* keep identifier columns for everyone (a code is the record's
name, not an enum) — rejected by the user's clarification: these are exactly the
IDs users don't need to know. *Alternative 2:* bring identifier columns back for
technical roles on regular screens — rejected: the columns identify records for
users, and no user-facing screen needs them; the technical role's value is the
technical surfaces, which keep their codes as content.

**5. One helper decides the technical-role gate.**
A single `isTechnicalViewer(role)`-style predicate (with the existing access
helpers in `queries/access.ts`) defines who may see codes-as-content, so no
component restates the role list. The gate wraps the few content-carrying
surfaces (RBAC permission list, audit rows, org code field), which are already
unreachable for other roles — the predicate is defense in depth, not a new
authorization layer.

**6. Role display prefers the API's role name, with the registry as fallback.**
`role.code — role.name` becomes just the name; the new `ROLE_CODE_LABELS`
table covers any surface without a loaded role record.

**7. Coverage test asserts registry completeness, not render sites.**
The test enumerates each covered enum's values — mirroring the canonical lists
in `backend/src/db/enums.ts` (documented as the source) — and asserts a
non-empty label per value and that no label merely repeats its code. Render-site
completeness is guarded by the task list's enumerated sites plus a verification
grep for raw-enum JSX.

## Risks / Trade-offs

- *Long names overflow narrow cells* → truncation with a `title` tooltip
  (calendar cells, compact badges).
- *Audit-stream prose is not enum-shaped* → `labelFor`'s identity fallback
  keeps free text untouched rather than mapping it wrongly.
- *Users lose a quotable ticket reference* (the `T202610-0011` column) →
  acceptable to the product owner; titles link to detail, the code remains in
  the data contract and the audit trail, and technical roles still see it as
  content on Audit Log rows. Re-adding a visible column is a one-component
  change if review disagrees.
- *Identifiers vanish while form fields still capture them* → the create/edit
  forms keep the code inputs (data contract); only displays drop them, so no
  write path changes.
- *A render site is missed in the sweep* → tasks enumerate the sites found in
  exploration (enums and identifiers listed separately); final verification
  greps for raw-enum and identifier JSX patterns and typechecks.
- *Wording disagreements on specific labels* (e.g., "Multi-day" vs
  "Multi day") → labels live in one table, so wording is a one-line change after
  review.

## Migration Plan

Frontend-only change: label tables, render-site edits, three copy strings, and
the coverage test. Deploy with the frontend build; rollback is reverting the
frontend commit. No data migration, no API versioning, no environment changes.

## Open Questions

None — label wording is adjustable in the registry without touching specs.
