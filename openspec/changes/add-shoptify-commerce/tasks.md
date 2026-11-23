# Tasks

Port rule for every group: module content comes from the worktree
`~/.herdr/worktrees/MES_project/shopify_multi_store_management` **by copying
files** (see its `docs/shopify_multi_store_management_worktree.md`, carried
into this repo as the provenance record) — never by merging the worktree
branch. Where `main` also changed a file, the module's addition is re-applied
on top of main's current content.

## 1. Foundations: dependencies, config, schema, migration

- [x] 1.1 Install the four pinned Shopify dependencies in `backend/package.json` (`@shopify/shopify-api@^15.1.2`, `@shopify/admin-api-client@^2.0.1`, `@shopify/shopify-app-session-storage@^7.0.4`, `@shopify/shopify-app-session-storage-drizzle@^6.0.4`, versions re-verified against the registry) and run `bun install`; verify the lockfile resolves and `bun run src/config.ts`-style startup still boots unchanged with no `SHOPTIFY_*` keys set.
- [x] 1.2 Add the `shoptify` module code plus payout-status, exception-reason, and automation-trigger tuples to `backend/src/db/enums.ts` (copied wholesale — `main` has not touched this file since the worktree baseline); verify `cd backend && bun run typecheck` passes and a unit check confirms `MODULE_CODES` contains `shoptify` and the new tuples are exported.
- [x] 1.3 Add the `ShopifySettings` credential group (API key/secret, token encryption key, OAuth callback URL, scopes) and the rate-limit threshold (default 150) to `backend/src/config.ts` alongside the logging settings (hand-merge), with all-or-nothing validation and `null` when unconfigured; add the six `SHOPTIFY_*` entries to `backend/.env.example` (examples only); verify `bun test src/config.test.ts` covers each default, the blank-secret default, and rejection of a half-configured group, and no secret appears in any error path.
- [x] 1.4 Add the twelve `shoptify_*` tables to `backend/src/db/schema.ts` (hand-merge into main's PostgreSQL schema), re-expressed with pg column types per design P1/P2 (pg timestamp `expires`, integer `user_id`, JSON-as-text, Unix-ms timestamps, UUID text ids, integer minor units, cascade deletes) and extend the four `module_code` check constraints on pg terms; verify `cd backend && bun run typecheck` passes.
- [x] 1.5 Generate the migration with `cd backend && bun run db:generate` (a new `0003_*` — the worktree's SQLite `0005_stiff_psynapse.sql` is NOT carried) and hand-review the generated SQL; replay it on a throwaway database with `bun run db:migrate`; verify all twelve tables exist and the extended constraints accept module `shoptify` and reject a bogus module.
- [x] 1.6 Swap the session-storage binding to `DrizzleSessionStoragePostgres` from the adopted package (design P2), re-typing `shoptify_sessions` to the adapter's 17-column pg contract behind the module's own `createSessionStorage` name; verify `bun test src/domain/shoptify/session-storage.test.ts` round-trips store/load/delete/deleteSessions against the test database.

## 2. Backend domain and GraphQL surface

- [ ] 2.1 Copy the fourteen domain sources and their twelve test files under `backend/src/domain/shoptify/` (wholesale — `main` has not touched this directory), fixing only the imports the hand-merged foundations changed; verify `cd backend && bun test src/domain/shoptify/` passes with the shared test database URL.
- [ ] 2.2 Copy `backend/src/graphql/resolvers/shoptify.ts` + its test (wholesale) and hand-merge the shoptify `extend type Query/Mutation` block, its types/inputs/enums, and the documented-operation lists into `backend/src/graphql/schema.ts`; verify `bun test src/graphql/schema.test.ts` passes and the schema parses.
- [ ] 2.3 Hand-merge the 21 commerce entries into `graphql/access.ts` `OPERATIONS` and the 14 entries into `graphql/change-areas.ts` `MUTATION_AREAS` (13 to the `shoptify` area, `shoptifyBeginOAuth` inert), add `shoptify` to `ChangeArea` in `events/event-bus.ts` (copied wholesale — untouched by main), and register `shoptifyQuery`/`shoptifyMutation` in `graphql/resolvers/index.ts`; verify `bun test src/graphql/change-areas.test.ts src/graphql/authorization.test.ts` passes and a caller without commerce access is denied.
- [ ] 2.4 Mount the module's two raw routes (`POST /api/v1/shoptify/webhooks`, `GET /api/v1/shoptify/oauth/callback`) by hand-merging `backend/src/index.ts` — routes registered after main's early hooks, raw body read before parsing — and create the typed webhook bus with `wireShoptifySubscriptions` in bootstrap; verify `bun test src/index.test.ts` passes and the receiver tests prove HMAC validation sees unparsed bytes, a bad signature changes no data, and a valid one is acknowledged before data work.
- [ ] 2.5 Verify the cross-cutting wiring lands against main's services: audit rows (module `shoptify`, secrets redacted), notification rows via `domain/notifications.ts`, the `shoptify` change area published on mutations and ingestion, and exports through `reports/*` + `exportArtifacts` + the existing download route; verify via the module's own tests (audit/notification/exports) that a token value appears in no audit payload and a generated XLSX artifact downloads through an authenticated request.

## 3. Seed grants

- [x] 3.1 Re-apply the seed additions to `backend/src/db/seed.ts` (hand-merge — main's seed was rewritten): the `shoptify` module row (sortOrder 6), the 9 commerce permissions, and the `rolePermissions` grants for `SUPER_ADMIN`/`TECH_LEAD` only with `HR_MANAGER` explicitly excluded; verify `bun test src/db/seed.test.ts` passes with counts moved 5/21/78 → 6/30/96 and re-running the seed stays idempotent.

## 4. Frontend app

- [ ] 4.1 Copy the frontend app wholesale: the six route files under `frontend/src/app/(app)/shoptify/`, the eight components under `frontend/src/components/shoptify/`, `frontend/src/lib/mes/queries/shoptify.ts`, and the navigation test; verify `bun test src/lib/mes/shoptify-navigation.test.ts` passes.
- [ ] 4.2 Hand-merge the registration points on main's current content: `navigation.ts` launcher entry + `MES_APP_ACCESS` row (`ALL` for `SUPER_ADMIN`/`TECH_LEAD`, `HIDDEN` for the other three roles), `live.tsx` area, `registries.ts` `MODULE_LABELS`, the frontend `queries/access.ts` mirror, and the `Store` icon in `dashboard-view.tsx`'s exhaustive icon map; verify `cd frontend && bunx tsc --noEmit` passes (main's known TS2589 is already fixed — it must not reappear) and the launcher renders the shoptify entry exactly for the seeded technical roles.
- [ ] 4.3 Hand-merge the 153-key `shoptify` namespace into `frontend/messages/en.json` and `frontend/messages/vi.json` (which gained telegram and schedule keys since the baseline) plus `shell.apps.shoptify` and `enums.modules.shoptify`; verify the Key sets are identical in both locales (the existing parity/labels test) and `bun test src/` passes.
- [ ] 4.4 Port the Playwright page object and the 4-spec smoke from the worktree, re-expressed on main's repaired e2e harness (shared `LoginPage`, seeded November window, fixed `testDir` config; the worktree's raw-input login is NOT carried); verify `cd frontend && bunx playwright test --list` resolves the specs and the smoke passes against the dev servers already running on :3000/:3001 (do not start or stop them).

## 5. Contracts, docs, provenance

- [ ] 5.1 Hand-merge the §6.6 shoptify section into `API_CONTACT_SPECIFICATION.md` on main's current revision (21 operations, 16 types + 12 inputs, 3 enums) and copy the `contract-diff.ts` parity checks wholesale (untouched by main); verify `cd backend && bun run contract-diff` reports no drift.
- [x] 5.2 Hand-merge the module catalog/extensibility updates into `SYSTEM_ARCHITECTURE.md` on main's current revision; verify the doc's app table lists `shoptify` with its module code and the Settings configuration note is present.
- [x] 5.3 Copy the three provenance documents into `docs/`: `shopify_multi_store_management_prompt.md` (original), `shopify_multi_store_management_prompt_optimized.md` (implementation source), and `shopify_multi_store_management_worktree.md` (the point-in-time change record this port was planned from); verify each opens cleanly and the record's §7 "Left untouched" list is re-checked against main (all four confirmed no-ops: main's layout uses `instant = false`, playwright testDir already `./tests/tests`, root-lint runs the frontend binary with telegram-web excluded, the TS2589 translator fix landed on main — design P8).

## 6. Final gates

- [ ] 6.1 Run the change's backend gate: `cd backend && MES_TEST_DATABASE_URL=<shared test url> bun test src/domain/shoptify/ src/graphql/resolvers/shoptify.test.ts src/graphql/change-areas.test.ts src/graphql/authorization.test.ts src/graphql/schema.test.ts src/config.test.ts src/db/seed.test.ts`; verify all pass and no pre-existing test regressed (main's full suite was 582/582 green before this change).
- [ ] 6.2 Run the frontend gate: `cd frontend && bunx tsc --noEmit`, `bun test src/`, and `./node_modules/.bin/biome check` on the touched files; verify all pass with no new diagnostics and no reformatting churn in untouched files.
- [ ] 6.3 Run the backend typecheck and lint: `cd backend && bun run typecheck` and `../frontend/node_modules/.bin/biome check src` (the repository's runnable Biome on Linux); verify typecheck exits 0 and the module's files are clean.
- [ ] 6.4 Verify the deployment story end to end on the running stack: `bun run db:migrate && bun run db:seed` apply cleanly to the dev database (seed counts 6/30/96), the stack's backend boots with and without the `SHOPTIFY_*` group, and the shoptify app renders in the stack origin for a seeded `TECH_LEAD` viewer while staying unreachable for an `EMPLOYEE` (design P1's replay + the frontend role gate); record the operator step that applies the migration to the dev database once.

## Workflow follow-up

- After review passes, archive the change with `openspec archive` and confirm the archived specs read correctly.
- Operator follow-ups carried from the worktree record: apply the migration to the dev database once (`bun run db:migrate && bun run db:seed`), decide the Next.js security-upgrade question, and (optional) the GDPR `customers/redact` subscription question if commerce goes live.