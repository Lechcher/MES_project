# Proposal

## Why

Account administration in Settings & IAM fights the admin at every step: creating
a user or resetting a password starts from an empty password box that must be
filled by hand, user codes are typed in manually at creation (and only emails
can sign in), and the code that identifies an account is invisible everywhere a
user is listed. Worse, the audit screens still surface raw UUIDs — a reviewer
reading the trail sees `48937429-2afe-4466-a15c-4d8b715ad437` where a person's
name belongs.

## What Changes

- **Suggested default password.** The Create User and Reset Password dialogs in
  the User Directory prefill the password field with the suggested default
  `password`. The field stays editable; the admin can type any other password.
  The default meets the 8-character minimum the backend already enforces, so no
  validation rule changes.
- **Automated user codes.** Accounts created from now on receive an
  auto-assigned code in the range `V0000000`–`V9999999` — the next free slot in
  that range, zero-padded to seven digits. The Create User dialog no longer
  asks for a code; the server assigns it. Existing accounts keep working and
  are re-coded into the V range in creation order by a data migration.
- **Sign in by user code.** The sign-in identifier accepts either an email
  address or a user code; a code resolves to its account and the credential
  check proceeds as today. Email sign-in is unchanged. **BREAKING (API):**
  `LoginInput.email` becomes optional and a new optional `LoginInput.userCode`
  is added — exactly one of the two is required — and `CreateUserInput.userCode`
  becomes optional (the server assigns it when omitted). Existing callers that
  post `{ email, password }` keep working unchanged.
- **Codes visible where users are listed.** The User Directory table gains a
  User Code column, and the navigation's user dropdown trigger shows the
  viewer's code beside their name.
- **Readable audit trail.** Both audit screens (the Audit Log app and Settings →
  System Audit Logs) render user UUIDs as readable labels — `FullName
  (userCode)` — in the Resource ID column and inside the old/new data JSON,
  instead of raw hash codes. UUIDs that resolve to no known user stay verbatim.
  The XLSX/CSV audit export keeps raw ids (out of scope).

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `frontend/settings`: User Directory management gains the automated code, the
  suggested default password, and a User Code column; the System Audit Logs
  trail renders user identifiers readably.
- `frontend/audit-log`: the Audit Log app renders resource identifiers readably
  (`FullName (userCode)`) in its event table.
- `frontend/app-shell`: sign-in accepts an email or a user code as the
  identifier, and the navigation's user dropdown trigger shows the viewer's
  code.
- `backend/graphql-api`: `login` accepts email or user code, `createUser`
  assigns automated V-range codes, and audit log queries resolve user ids to
  readable labels.

## Impact

- **Frontend:** `frontend/src/components/settings/user-directory.tsx` (default
  password, code column, automated-code create flow), `frontend/src/app/
  signin/page.tsx` and `frontend/src/lib/mes/session.tsx` /
  `frontend/src/app/api/mes/session/route.ts` (identifier accepts a code),
  `frontend/src/components/shell/app-nav.tsx` (trigger shows the code),
  `frontend/src/lib/mes/queries/auth.ts` and `queries/settings.ts` (documents),
  `frontend/messages/en.json` and `vi.json` (sign-in labels, directory column).
- **Backend:** `backend/src/graphql/schema.ts` (`LoginInput`, `CreateUserInput`),
  `backend/src/graphql/resolvers/auth.ts` (code-aware login),
  `backend/src/graphql/resolvers/audit-log.ts` and `resolvers/settings.ts`
  (audit list readability), `backend/src/auth/index.ts` (identifier resolution,
  V-range code generation), `backend/src/domain/settings.ts` (optional code on
  create), `backend/src/graphql/shapes.ts` (id → label resolution).
- **Data:** new drizzle migration re-coding existing accounts into the V range
  in creation order; `backend/src/db/seed.ts` adopts V-range codes.
- **Docs:** `API_CONTACT_SPECIFICATION.md` §3 login input and §6.4 create-user
  input.
- **Tests:** backend auth/settings/graphql suites and frontend unit tests cover
  the code generation, code sign-in, default password, and label rendering.

## Out of Scope

- The SSE `GET /api/mes/events` `failed to pipe response` socket error (separate
  known issue).
- Audit log XLSX/CSV exports (they continue to carry raw ids).
- Codes for departments, roles, or any non-user entity.
