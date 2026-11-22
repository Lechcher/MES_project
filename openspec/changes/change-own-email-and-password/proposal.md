# Proposal

## Why

Users can only change their credentials through an administrator (the User
Directory's reset action) or the public forgot-password flow — there is no way
for a signed-in user to change their own email or password. The API already
exposes a self-service password change and the Settings app is the natural home
for credential management, so giving each user an Account tab removes the
administrator dependency and lets users keep their contact address current.

## What Changes

- Add an **Account** tab to the Settings app with two forms: change email and
  change password, both acting on the signed-in user's own account only.
- Change password: requires the current password and a new password meeting the
  shared minimum-length policy; on success other sessions are revoked while the
  current one stays signed in. The backend mutation already exists — this wires
  it into the UI. **BREAKING** (visually): the Settings app is no longer fully
  hidden from `EMPLOYEE` and `DEPT_HEAD` — they open Settings and see only the
  Account tab; other roles see Account alongside their existing menus.
- Change email: requires the current password and a new address; the system
  sends a verification link to the **new** address and the email changes only
  after the link is confirmed. A delivery failure is reported as a failure, not
  a success. An address already used by another account is rejected. Reusing
  the existing SMTP mail infrastructure (same transport and outcome recording
  as password-reset mail); with no mail endpoint configured the request fails
  explicitly.
- Both operations append a system audit event (actor, action, resource,
  timestamp, IP). No password, token, or credential value is ever written to
  the audit trail, logs, or API responses.
- Both mutations are guarded by an authenticated session only — no role
  permission is required, consistent with the personal scope every
  authenticated user already holds.

## Capabilities

### New Capabilities

- `frontend/account-self-service`: A signed-in user manages their own account
  email and password from the Settings app's Account tab — password change
  with current-password verification, email change via a verification link
  sent to the new address, session and audit consequences included.

### Modified Capabilities

- `frontend/settings`: the role-visibility requirement changes — the Settings
  app is no longer fully hidden from `EMPLOYEE` and `DEPT_HEAD` (they see the
  Account tab only); every other role gains the Account tab as well.
- `backend/graphql-api`: the "Authenticated API sessions" requirement gains
  the self-service email-change operations (request + confirm via the
  verification link).
- `core/email-delivery`: email-change verification mail joins password-reset
  mail under the same transport, web-origin link, outcome-recording, and
  failure-reporting guarantees.
- `core/authorization`: new requirement — the self-service credential
  operations are granted to any authenticated viewer, independent of role
  permission codes.

## Impact

- **Backend**: `backend/src/auth` (email-change operations wrapping the auth
  library), `backend/src/graphql/resolvers/auth.ts`, `backend/src/graphql/schema.ts`,
  `backend/src/mail` (verification message), `backend/src/domain/settings.ts`
  (audit events), plus unit tests. Config gains the verification sender hook
  on the Better Auth instance.
- **API contract**: `API_CONTACT_SPECIFICATION.md` §3.3 and the GraphQL schema
  gain `requestEmailChange` / `confirmEmailChange` operations; `changePassword`
  is already documented and stays unchanged.
- **Frontend**: `frontend/src/app/(app)/settings/page.tsx` (visibility for all
  authenticated users), `frontend/src/components/settings/settings-view.tsx`
  (Account tab + gating), new account tab component,
  `frontend/src/lib/mes/queries/auth.ts` (mutations + policy reuse),
  `frontend/src/lib/mes/queries/access.ts` (menu list), messages `en.json` /
  `vi.json` for both locales, unit tests, and an e2e Playwright flow.
- **Deployment**: a configured mail endpoint (`MES_SMTP_URL`) becomes required
  for email change to work — the same requirement password reset already has.