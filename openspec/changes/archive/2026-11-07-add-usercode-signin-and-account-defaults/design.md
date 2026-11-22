# Design

## Context

See proposal.md — Why. The change spans four capabilities and both tiers:

- **Backend today:** `backend/src/auth/index.ts` owns credentials (`betterAuth`
  `signInEmail`) and a `nextUserCode` helper that mints `U-0001`-style codes from
  `COUNT(*)` for accounts created without one; the domain
  `createUser` (`backend/src/domain/settings.ts`) inserts the user row directly
  and *requires* an explicit `userCode` from `CreateUserInput`
  (`backend/src/graphql/schema.ts`). The GraphQL `login` resolver
  (`backend/src/graphql/resolvers/auth.ts`) forwards `{ email, password }` to
  `signIn`. Audit rows are returned raw by `toSystemAuditLog`
  (`backend/src/graphql/shapes.ts`) from `resolvers/audit-log.ts` and
  `resolvers/settings.ts`; the DB stores user **ids** in `resource_id` and in
  `old_data`/`new_data` JSON (e.g. `assignedTo`), never codes — so re-coding
  users cannot orphan audit references.
- **Frontend today:** the sign-in page (`frontend/src/app/signin/page.tsx`)
  posts one `email` field through `useMesSession().signIn` to the same-origin
  session route (`frontend/src/app/api/mes/session/route.ts`), which calls the
  `login` mutation. The User Directory (`frontend/src/components/settings/user-
  directory.tsx`) starts `password` empty in both the Create and Reset dialogs,
  asks for a `userCode` at creation, and shows no code column.
  `MesViewer` already carries `userCode`; `USER_REF`/`USER_BRIEF` already select
  it, so no schema addition is needed for display.

Constraints: single-branch `main`, Biome, bun:test, and a versioned GraphQL
contract documented in `API_CONTACT_SPECIFICATION.md`.

## Goals / Non-Goals

**Goals:**

- One generator, one format: every new account code comes from the same
  `V0000000`–`V9999999` allocator, wherever an account is created.
- Code sign-in with no account-enumeration leak: an unknown code fails exactly
  like a wrong password.
- Readable audit labels produced once, server-side, consumed by both audit
  screens without duplicated mapping logic.
- Wire compatibility: existing `{ email, password }` login callers keep working.

**Non-Goals:**

- Codes for any non-user entity (departments, roles).
- Readable labels in the XLSX/CSV audit export (keeps raw ids).
- Any change to password hashing, sessions, or the reset-by-email flow.

## Decisions

### 1. Suggested default password is a frontend constant
`user-directory.tsx` prefills `password: "password"` in `EMPTY_DRAFT` (Create)
and seeds the Reset dialog's `newPassword` state with the same value; the inputs
stay editable and the existing disabled-conditions (`!draft.password`,
`newPassword.length === 0`) then pass by default. No backend rule moves —
`setUserPassword` already accepts 8-character passwords and the administrative
reset audits the action as today.
*Alternative:* a server-side default in the mutation input. Rejected: the
password is never defaulted on the server, so no credential can be set without
the admin submitting it.

### 2. One shared V-range allocator, max+1 not COUNT+1
A single `nextUserCode` in `backend/src/auth/index.ts` is rewritten to select
`MAX` numeric suffix over `user.userCode` values matching `V%` and return
`V` + the next index padded to 7 digits, failing `CONFLICT` past `V9999999`.
Both creation paths use it: the `betterAuth` `user.create.before` hook (accounts
created outside the admin UI) and the domain `createUser` when
`CreateUserInput.userCode` is omitted. `CreateUserInput.userCode` becomes
optional (`String`), keeping explicit codes accepted for API compatibility.
*Alternative:* keep the current `COUNT(*)+1`. Rejected: it re-issues codes after
deletes and cannot reach the documented `V9999999` ceiling semantics. The
existing UNIQUE constraint on `user_code` remains the backstop for races; a
collision surfaces as the `CONFLICT` the create path already maps.

### 3. login takes exactly one identifier
`LoginInput` becomes `{ email: String, userCode: String, password: String! }`
with exactly one of the two identifiers required (`VALIDATION_FAILED` when both
or neither). In `backend/src/auth/index.ts`, `signIn` resolves a userCode to its
account row (`user.userCode`) and calls `signInEmail` with that account's email;
unknown codes and wrong passwords raise the same `UNAUTHENTICATED` error, so the
screen cannot distinguish "no such code" from "wrong password". The frontend
keeps a single identifier field: the session route sends it as `email` when it
contains `@`, otherwise as `userCode`. The sign-in label, placeholder, and
failure message become identifier-neutral
("Email or user code" / "Invalid credentials") in `en` and `vi`.
*Alternative:* keep one field named `email` that may hold a code. Rejected: the
contract would hide which identifier was used, and introspection of the
documented schema (`API_CONTACT_SPECIFICATION.md`) would mislead clients.

### 4. Audit labels resolve server-side, in the audit shape
`toSystemAuditLog` (`backend/src/graphql/shapes.ts`) gains an optional
`idLabels: Map<string, string>` of user id → `FullName (userCode)`. Both
resolvers (`auditLogs`, `systemAuditLogs`) collect the user ids referenced by
the returned page — `userId`, `resourceId`, and every string leaf of
`old_data`/`new_data` — and load one label map with a single `inArray` query
before mapping rows through the shape. The shape replaces `resourceId` and any
matching string leaf with the label; non-matching ids (tasks, departments) and
unknown user ids stay verbatim. The frontend renders what it receives —
`formatJson` needs no change. Exports continue to use the raw rows.
*Alternative:* a frontend users query plus per-component mapping. Rejected:
two screens duplicate the resolution, the JSON columns need the same recursive
walk, and every new audit consumer re-implements it.

### 5. Migration re-codes existing accounts by creation order
A drizzle migration (`backend/drizzle/0002_assign-v-range-user-codes.sql`)
assigns `V` + 7-digit rank (0-based, ordered by `created_at`, id as tiebreak)
to every `user_code` not already in the V range; the dev seed
(`backend/src/db/seed.ts`) adopts `V0000000`–`V0000004` for the five demo
accounts so fresh databases never need the migration path. Rollback is a
schema-level no-op (nullable inputs are additive); a code rollback re-runs the
`UPDATE` with the prior codes if ever needed.

### 6. Display follows the existing data
User Directory gains a code column rendered from the `userCode` the
`USER_REF` fragment already returns; the app-nav dropdown trigger adds a muted
`viewer.userCode` span beside the full name. No new query fields in either
place.

## Risks / Trade-offs

- **Two identifier fields on `login`** → strict server-side validation
  (exactly one), so a malformed client fails loudly with `VALIDATION_FAILED`
  rather than silently ignoring a field.
- **Re-coding live accounts** → codes appear in the audit labels and in the
  nav/table; historical audit rows keep ids, so only the rendered label text
  changes, never a reference. Migration runs before the new code is deployed so
  the allocator never sees legacy codes.
- **Allocator reads MAX under concurrency** → the UNIQUE index converts a race
  into the existing `CONFLICT` mapping; the operator retries.
- **Range exhaustion** → explicit `CONFLICT` with a clear message, tested in
  the backend suite; no silent wrap-around.
- **Sign-in heuristic in the route** (`@` → email) → an identifier that is
  neither is sent as a userCode and fails neutrally; the API contract itself
  carries no ambiguity.

## Migration Plan

1. Add `backend/drizzle/0002_assign-v-range-user-codes.sql` and a
   `migrate.test.ts` case proving legacy codes (`SA-001`…) become the V range in
   creation order and a second application is a no-op.
2. Update `DEMO_USERS` codes in `backend/src/db/seed.ts`; seed tests follow.
3. Run `bun run db:migrate` against `backend/data/mes.db` before deploying the
   new allocator.
4. Deploy backend then frontend (the schema is additive; old clients unaffected).

## Open Questions

- (none)
