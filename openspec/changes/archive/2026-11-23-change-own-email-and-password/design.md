# Design

## Context

Self-service password change already exists end-to-end on the backend
(`backend/src/auth.changePassword` → `authMutation.changePassword` →
`changePassword` mutation, with tests) but has no UI. Email change does not
exist. The Settings app is hidden from `EMPLOYEE`/`DEPT_HEAD` by two gating
layers: the app-access matrix in `frontend/src/lib/mes/navigation.ts` and
`settingsMenusFor` in `frontend/src/lib/mes/queries/access.ts`.

Constraints that shape the approach:

- The browser never holds the API token; it talks to the same-origin
  `/api/mes/session` route, which forwards bearer-token calls to
  `POST /api/v1/graphql`. Better Auth's own REST routes are not
  browser-facing.
- Token-consuming screens are public routes on the web origin that call a
  GraphQL mutation (the `/reset-password` pattern), and mail links point at the
  web origin, never the API origin.
- Mail delivery, notification logging, and failure reporting already exist for
  the password-reset message and must be reused unchanged.
- Better Auth 1.7.10 semantics (the version installed here; re-confirmed
  during planning against `backend/node_modules/better-auth/dist`):
  `user.changeEmail.enabled` is off by default; when on, `auth.api.changeEmail`
  sends a verification message to the **new** address and the email changes only
  after that address is verified; the confirmation link works only for the
  account that requested it and does not sign anyone in; the library call takes
  **no password**, so the MES layer must verify the current password itself.
  `auth.api.changePassword` already takes `currentPassword` +
  `revokeOtherSessions`.
- `user.email` carries a unique constraint, so any race at apply time surfaces
  as a constraint failure that maps to `CONFLICT`.

**Porting constraint:** a sibling worktree
(`~/.herdr/worktrees/MES_project/change_mail_pasword`, branch base `da8fabf`)
holds a complete, tested implementation of this same change against a divergent
history. It is a **reference**, ported per file — no merge, no rebase — because
the histories diverged and a merge would create conflicts in shared files.

See `proposal.md` for motivation and the spec deltas under
`specs/frontend/account-self-service` for the behavior contract.

## Goals / Non-Goals

**Goals:**

- One Account tab in Settings with two forms (password, email) acting on the
  signed-in user, reachable by every authenticated role.
- Email change that verifies the new address before applying, reusing the
  existing SMTP pipeline and its failure guarantees.
- Audit events for both completed changes, with no credential material.
- Contract, schema, and both message locales updated atomically with the code.

**Non-Goals:**

- No approval step via the current address (the library's
  `sendChangeEmailConfirmation` is not used; the current password is the
  re-authentication).
- No `updateEmailWithoutVerification` — the immediate-update mode is
  deliberately not enabled.
- No change to sign-up/verification behavior, password policy, or session
  revocation rules for password change (already `revokeOtherSessions: true`).
- No rate-limit configuration for the new auth operations, no Telegram
  notification, no password-strength meter.

## Decisions

### 1. Email change is two GraphQL operations, mirroring the reset pair

`requestEmailChange(input: { currentPassword, newEmail })` and
`confirmEmailChange(token: String!)`. The web-origin link carries the token as a
query parameter to a public `/confirm-email` route (same shape as
`/reset-password`), which calls the mutation through the normal GraphQL client.
This keeps the browser on the web origin, keeps Better Auth's REST surface
internal, and makes the confirmation work on any device without a session — the
token binds the account, which the library already enforces.

Alternative considered: link straight to the API's verify endpoint with a
`callbackURL`. Rejected: it would point the browser at the API origin, which the
reset flow deliberately avoids, and would bypass the GraphQL contract.

### 2. Library configuration: enable change-email, reuse the reset mail hook shape

- `user: { changeEmail: { enabled: true } }`.
- One `emailVerification.sendVerificationEmail` hook that composes an
  email-change verification message and delivers it through the existing
  `deliverMail` pipeline with a notification-log row — the same mechanism
  `sendResetPassword` uses. The hook receives `{ user, url, token }`; MES ignores
  `url` and composes its own link to `${webOrigin}/confirm-email?token=<token>`
  (mirroring `composePasswordResetMessage`), so origin and wording stay under
  MES control.

A single global hook is acceptable because MES never calls the library's
sign-up endpoint — users are created by the GraphQL `createUser` mutation, which
writes rows directly — so the only flow that can fire the hook is the
change-email request. A regression test asserts that user creation through the
API sends no mail.

### 3. Current password is verified by MES, before the library call

`auth.api.changeEmail` takes no password, so the email-change request verifies
the current password first, using the existing `verifyPassword` helper against
the caller's credential row (the same lookup `verifyCredentials` uses), then
maps library failures with the existing `authErrorCode` helper: an
already-taken address becomes `DomainError("CONFLICT", …)`, anything else a
`VALIDATION_FAILED`. The password change path keeps its current-password
verification inside the library call, unchanged.

### 4. Gating: account reaches every authenticated user through the existing two layers

- `MES_APP_ACCESS.settings`: `SUPER_ADMIN`/`TECH_LEAD` `ALL`, `HR_MANAGER`
  `USER_DIRECTORY_ONLY`, `DEPT_HEAD`/`EMPLOYEE` `ACCOUNT_ONLY` (a new access
  level following the `USER_DIRECTORY_ONLY` precedent; both special levels count
  as visible in `canViewApp`).
- `settingsMenusFor`: adds `"account"` — `["account"]` for `EMPLOYEE`/
  `DEPT_HEAD`, `["users", "account"]` for `HR_MANAGER`, all five menus plus
  `"account"` for `TECH_LEAD`/`SUPER_ADMIN`.
- The settings view renders the Account tab for `menus.includes("account")`; the
  existing `activeTab` fallback lands `EMPLOYEE`/`DEPT_HEAD` on `account`
  because it is their first menu. The `if (!viewer) return null` guard and the
  "no access" empty state stay for the viewer-less case only.

### 5. Audit events recorded on completion, from the auth resolvers

New action labels (`user.email_change`, `user.password_change`) in
`SETTINGS_AUDIT_ACTIONS` and one small helper beside them that calls the
existing `recordAuditEvent`, invoked by the auth resolvers after a successful
completion only. Payload carries old → new email for the email change (the same
fields the administrative `updateUser` audit already records) and nothing for
the password. No new tables and no migration: the library's verification rows
already live in the `verification` table the adapter maps.

### 6. Contract and localization move with the code

`API_CONTACT_SPECIFICATION.md` §3.3 gains the two operations and the input
type; `schema.ts` gains `RequestEmailChangeInput`, the two mutations, and the
resolver wiring; the frontend gains the two mutation constants next to the
existing reset ones in `queries/auth.ts`, reusing `passwordPolicyError` /
`MIN_PASSWORD_LENGTH` so the policy stays in one place on the client. All new
strings live in a `settings.account` namespace in **both** `en.json` and
`vi.json`.

### 7. Message keys stay flat

New `settings.account.*` keys are flat (`account.passwordTitle`, … — not
nested objects). The ported implementation proved that a nested shape pushes
TypeScript's `NamespacedMessageKeys` instantiation depth over the limit on
unrelated views (`TS2589`); flattening removes it while keeping the existing
flat convention of `settings.view`. The same flattening applies to both locales.

## Risks / Trade-offs

- **Enabling the global verification hook changes auth-library config** → it
  could fire on flows other than change-email. Mitigation: MES never calls the
  sign-up endpoint (verified above), a regression test asserts no mail on user
  creation, and the first backend task re-confirms the installed hook semantics
  from source before relying on them.
- **Duplicate address at confirm time (race between request and confirm)** →
  the `user.email` unique constraint fails the apply and is mapped to
  `CONFLICT`; a unit test covers the mapping.
- **Users who never confirm keep their old address** → by design (spec'd as
  pending-until-confirmed); expiry of the token follows the library's
  verification default.
- **Password policy appears in two places** (client constant and library
  default, both 8) → the established pattern for reset flows; kept, with a
  comment tying the client constant to `setUserPassword`'s rule.
- **All roles now see a Settings tile** → launcher and dashboard descriptions
  need the `ACCOUNT_ONLY` case; covered by the gating tasks and nav tests.
- **No rate limiting on the new auth operations** → an authenticated user can
  re-trigger verification mail to an address they propose; low severity, out of
  scope (configuring library rate limiting would affect every auth endpoint).

## Migration Plan

1. Backend first: enable the library options, add the two operations, mail
   message, and audit helper, with tests; contract updated in the same commit.
2. Frontend: gating, Account tab components, public `/confirm-email` route,
   mutations, messages (both locales), tests.
3. Deploy: no schema migration. A configured mail endpoint (`MES_SMTP_URL`)
   becomes a functional requirement for email change — exactly the requirement
   password reset already documents; without it the request fails explicitly.
4. Rollback: hide the Account tab and drop the two operations; no data cleanup
   (unapplied verification rows simply expire).

## Open Questions

None. The library API questions were resolved during planning against the
installed better-auth 1.7.10 (`backend/node_modules/better-auth/dist`), matching
the ported implementation's findings on 1.7.7:

- `auth.api.verifyEmail({ query: { token } })` applies a
  `change-email-verification` token (GET endpoint, token in query, applies the
  token's `updateTo` payload, creates no session).
- `auth.api.changeEmail` (POST, gated on `user.changeEmail.enabled`) takes no
  password and returns a neutral success for a taken address — so MES checks
  uniqueness itself before calling it.

Task 1.1 re-confirms both against the installed package as its first step.