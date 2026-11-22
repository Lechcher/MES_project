# Tasks

## 1. Backend — V-range user codes and code sign-in

- [x] 1.1 Rewrite `nextUserCode` in `backend/src/auth/index.ts` as the shared V-range allocator (`V` + 7-digit zero-padded `MAX` suffix + 1, `CONFLICT` past `V9999999`), and add `backend/src/auth/auth.test.ts` cases for the first code, the next-free code after a gap, and the exhausted-range failure; verify with `cd backend && bun test src/auth`
- [x] 1.2 Widen `LoginInput` in `backend/src/graphql/schema.ts` to `{ email: String, userCode: String, password: String! }` with exactly one identifier required, and extend `signIn` in `backend/src/auth/index.ts` to resolve a user code to its account's email while keeping the same neutral `UNAUTHENTICATED` failure for unknown codes and wrong passwords; verify with `cd backend && bun test src/auth src/graphql` covering code login, both-identifiers rejection, and unknown-code parity
- [x] 1.3 Update `API_CONTACT_SPECIFICATION.md` §3 for the login input change and verify the documented request example matches the assembled schema (`openspec`-agnostic check: the example shape appears in the doc)

## 2. Backend — optional code on create and readable audit labels

- [x] 2.1 Make `CreateUserInput.userCode` optional in `backend/src/graphql/schema.ts` and have `createUser` in `backend/src/domain/settings.ts` assign the next V-range code when it is omitted, keeping explicit codes accepted; add domain tests for both paths and verify with `cd backend && bun test src/domain/settings.test.ts`
- [x] 2.2 Add an optional `idLabels` map (user id → `FullName (userCode)`) to `toSystemAuditLog` in `backend/src/graphql/shapes.ts` that replaces `resourceId` and matching string leaves of `oldData`/`newData`, and wire both `resolvers/audit-log.ts` (`auditLogs`) and `resolvers/settings.ts` (`systemAuditLogs`) to collect the page's referenced user ids and load one label map per page; add resolver/schema tests asserting the readable labels, verbatim unknown ids, and a single label query per page, and verify with `cd backend && bun test src/graphql`

## 3. Data migration and seed

- [x] 3.1 Add `backend/drizzle/0002_assign-v-range-user-codes.sql` re-coding every non-V `user_code` to the V range in creation order (0-based rank, `created_at` then id), add a `backend/src/db/migrate.test.ts` case asserting legacy codes become `V0000000`… in creation order and re-application is a no-op, and verify with `cd backend && bun test src/db/migrate.test.ts`
- [x] 3.2 Update `DEMO_USERS` in `backend/src/db/seed.ts` to V-range codes (`V0000000`–`V0000004`) and verify with `cd backend && bun test src/db/seed.test.ts`
- [x] 3.3 Run `cd backend && bun run db:migrate` against the dev database and verify the five existing accounts now carry `V0000000`–`V0000004` (sqlite query on `user.user_code`)

## 4. Frontend — sign-in identifier, directory defaults, shell display

- [x] 4.1 Make the sign-in identifier accept a user code: `signIn(identifier, password)` in `frontend/src/lib/mes/session.tsx` and the session route in `frontend/src/app/api/mes/session/route.ts` send the value as `email` when it contains `@` and as `userCode` otherwise; update the sign-in screen label, placeholder, and failure message in `frontend/messages/en.json` and `frontend/messages/vi.json` to be identifier-neutral; verify with `cd frontend && bunx tsc --noEmit` and a manual sign-in once by V code and once by email against the dev server
- [x] 4.2 Prefill the suggested default password `password` in `EMPTY_DRAFT` and in the Reset Password dialog's `newPassword` seed in `frontend/src/components/settings/user-directory.tsx`, keeping both fields editable; verify the dialogs open prefilled and the create/reset buttons are enabled by default with a component test in the existing suite (verified via `bunx tsc --noEmit` + Biome — the repo has no DOM-rendering test infrastructure, so the prefill is exercised end-to-end in 5.2)
- [x] 4.3 Remove the user-code input from the Create User dialog (server assigns the code, drop `!draft.userCode` from the disabled condition) and add a User Code column to the directory table rendered from the `userCode` the query already returns, with its message key in `frontend/messages/en.json` and `vi.json`; verify with `cd frontend && bun test src/components/settings` covering the column and the code-free create flow (verified via `bunx tsc --noEmit`, Biome, and `bun test src/` 259/259 — the component has no DOM test in the repo's suite, so the rendered column and code-free create flow are exercised end-to-end in 5.2)
- [x] 4.4 Show the viewer's user code beside their name in the app-nav dropdown trigger in `frontend/src/components/shell/app-nav.tsx`; verify with `cd frontend && bunx tsc --noEmit` and that the trigger renders the code beside the name for the signed-in viewer (verified via tsc + Biome; the rendered trigger is checked in the live dev-server session in 5.2)
- [x] 4.5 Keep the two audit screens rendering the readable labels the API now returns (no client-side mapping: `frontend/src/components/audit-log/audit-log-view.tsx` and `frontend/src/components/settings/system-audit-logs.tsx`); verify with `cd frontend && bun test src/components/audit-log src/components/settings`

## 5. Integration verification

- [x] 5.1 Run the full verification set — `cd backend && bun test`, `cd frontend && bun test src/`, `cd frontend && bunx tsc --noEmit`, and `bunx biome check` from the repo root — and confirm every suite passes (backend 331/331, frontend 259/259, tsc exit 0; biome: 0 errors on the project source — `bunx biome check frontend backend` — with 34 pre-existing `noExplicitAny` warnings from the resolvers' established `args: any` convention. Caveat: the literal unscoped root `bunx biome check` also fails on `.playwright-mcp/`, a generated, untracked browser-profile directory predating this change; the root biome.json has no ignore rule for it)
- [x] 5.2 End-to-end check against the running dev servers: create a user with the default `password`, sign in with the new V code and again with an email, confirm the code appears in the User Directory table and the nav trigger, and confirm both audit screens show `FullName (userCode)` where the UUID `48937429-2afe-4466-a15c-4d8b715ad437` was displayed (verified in a headless browser against dev servers: sign-in by `V0000000` and by email, both neutral-failing alike; create dialog with no code field and prefilled `password` assigned `V0000005`; the new user signed in by code with the default password; code column and nav trigger (`Eve E2EV0000005Employee`) render codes; both audit screens render labels — `Diego Alvarez (V0000003)`, `Hana Suzuki (V0000002)` — with zero raw user UUIDs in any cell, confirmed server-side over 100 audit rows. The ephemeral test user was removed afterward, restoring the five seeded accounts.)

## Workflow follow-up

- Archive the change after review, per the project's git rules (direct commits to `main`).
