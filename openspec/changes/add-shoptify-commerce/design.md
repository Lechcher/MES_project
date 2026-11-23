# Design

## Context

A complete Shopify Multi-Store Management app was built and verified in the
worktree `shopify_multi_store_management` (change `add-shoptify-commerce`
29/29, prompt rewrite 18/18) sitting on baseline `da8fabf` with uncommitted
work. This repository's `main` has since moved **38 commits** — the
PostgreSQL cutover, the backend run logger, the schedule view, and the e2e
repair among them. The user's direction: **review the changes and bring them
across, do not merge the worktree.**

This design governs the **port**. The module's behavioral specs are carried
verbatim (they were verified against them), and the original implementation
decisions (D1–D9 in the worktree's design, carried into this repo as
`docs/` provenance) remain authoritative for module internals — except where
this repository's current reality differs, which is what the decisions below
cover.

What was verified while drafting (the port's risk surface):

- Of the ~38 non-module paths the worktree touches, **20 were also changed on
  `main`** since `da8fabf` — heaviest: `db/seed.ts` (+2676/−30),
  `index.ts` (+422/−185), `config.ts` (+138/−3), `messages/*.json`
  (+76/−42), `API_CONTACT_SPECIFICATION.md` (+127/−11).
- `main`'s persistence is **PostgreSQL** (Drizzle node-postgres, migrations
  `0000`–`0002`); the worktree's migration `0005_stiff_psynapse.sql` is
  **SQLite** and cannot be carried.
- `@shopify/shopify-app-session-storage-drizzle@6.0.4` ships
  `DrizzleSessionStoragePostgres` (verified by inspecting the package
  tarball), so the adopted adapter survives the dialect swap.
- `main`'s seed asserts 5 modules / 21 permissions / 78 role-permissions;
  the module's grants take it to 6 / 30 / 96 (the worktree's verified
  numbers).

## Goals / Non-Goals

**Goals:**

- Land the verified module on today's `main` with equivalent behavior and
  green gates, as reviewed file groups — no branch merge, no re-derivation.
- Correct persistence for this repository: one newly generated PostgreSQL
  migration carrying the module's tables and constraint extensions.
- Every gate the original change passed, re-run here: the module's backend
  tests, `contract-diff`, frontend unit tests, both typechecks, Biome, seed
  counts, and the e2e smoke against dev servers.

**Non-Goals:**

- No re-architecture or feature additions to the module; no changes to
  main's existing behavior beyond what the module additive-wires.
- No carrying of the worktree's already-obsolete environment fixes (P8).
- Out of scope stays: payments/checkout, POS, multi-currency conversion,
  automation actions beyond local writes + a notification row.

## Decisions

### P0 — Port by verified file groups, gate per group

Classify every ported path into one of three treatments and land groups in
dependency order, each followed by its verification:

1. **Wholesale copy** — the module's own files and every shared file `main`
   did not touch since `da8fabf` (the 14 domain sources + 12 tests, the
   resolver file, the two raw routes, the frontend pages/components/queries,
   `db/enums.ts`, `events/event-bus.ts`, `contract-diff.ts`, `live.tsx`, the
   two root docs' shoptify sections, the `docs/` provenance files).
2. **Hand-merge** — the ~20 files `main` also changed: the module's addition
   is re-applied on top of main's current content (P3–P6).
3. **Regenerate** — the migration (P1) and, if its interface moved, the
   session-storage binding (P2).

A group is done when its gate is green: backend `bun test` on the touched
files, frontend `bun test src/`, `bunx tsc --noEmit` in both packages, Biome
on touched files. No group is skipped because "it came from a verified
worktree" — each is re-verified here.

### P1 — PostgreSQL replaces SQLite (the one real re-architecture)

- **New migration, not the worktree's.** `db:generate` produces the next
  migration (`0003_*`, main is at `0002`) against main's pg schema. The
  worktree's `0005_stiff_psynapse.sql` + its snapshot/journal entry are
  **not** copied; the journal is only extended by the generation.
- **Table definitions re-expressed with pg column types** inside main's
  `schema.ts`: the worktree's SQLite-flavored columns (ISO-8601 text
  `expires`, bigint-as-blob `user_id`) become pg timestamps/integers per the
  adapter contract (P2). Unchanged conventions: integer minor units for
  money, JSON-as-text, Unix-ms timestamps, UUID text ids, cascade deletes.
- **Check constraints on pg terms.** Extending `ck_permissions_module`,
  `ck_audit_module`, `ck_app_settings_module`, `ck_modules_code` is a
  constraint drop/add in the generated migration — pg needs no 12-step
  table rebuild.
- The generated SQL is reviewed by hand before `db:migrate` is applied to a
  throwaway database, then to the dev database once (operator step, like the
  original change's follow-up).

### P2 — Session storage: swap the adapter class, keep the adoption

The worktree adopted `DrizzleSessionStorageSQLite` after verifying the
package. The same tarball ships `DrizzleSessionStoragePostgres` accepting
`(PgDatabase, PostgresSessionTable)` with the same 17 property names
(`id, shop, state, isOnline, scope, expires, accessToken, userId, firstName,
lastName, email, accountOwner, locale, collaborator, emailVerified,
refreshToken, refreshTokenExpires`). The port swaps the class and re-types
`shoptify_sessions` to that contract — the documented cast still bridges only
the published declaration. The round-trip test carries over unchanged.

### P3 — Seed grants re-applied by hand

`main`'s `seed.ts` was rewritten since the baseline; the port re-applies, in
main's structure: the `shoptify` module row (sortOrder 6), the 9 commerce
permissions, and the `rolePermissions` grants for `SUPER_ADMIN`/`TECH_LEAD`
only (`HR_MANAGER` explicitly excluded, per the original D1). The seed
test's counts move 5/21/78 → 6/30/96.

### P4 — Config merge, same contract

`ShopifySettings` (API key/secret, token encryption key, OAuth callback URL,
scopes, rate-limit threshold default 150) is added to main's `AppConfig`
alongside the logging settings, with the same all-or-nothing validation: the
module is configured only when its keys are set, and appears as `null` when
not — so an unconfigured deployment behaves exactly as today. `SHOPTIFY_*`
entries are added to `backend/.env.example` (examples only, no secrets).

### P5 — Mounting in main's service chain

The two raw routes mount in main's `index.ts` Elysia chain, obeying two
facts main's history established: hooks must be registered **before** the
routes they apply to, and the webhook receiver must read the **raw body
before parsing** (HMAC over unparsed bytes). The typed webhook bus is
created in bootstrap and `wireShoptifySubscriptions` fans out ingest →
customer refresh → automation, with `app/uninstalled` deactivating the
store.

### P6 — Messages and navigation merge

The 153-key `shoptify` namespace merges into both catalogues (which gained
telegram and schedule keys since the baseline) with identical key sets in
`en`/`vi` — the existing parity test is the gate. `navigation.ts` merges the
launcher entry and the `MES_APP_ACCESS` row (`ALL` for `SUPER_ADMIN`/
`TECH_LEAD`, `HIDDEN` for the other roles); `live.tsx`, `registries.ts`, and
the frontend `access.ts` mirror follow.

### P7 — E2E smoke adapted to main's repaired harness

The worktree's smoke (4 specs) predates main's e2e repair: it signed in
through raw input ids because the shared login page object predated a label
refactor. On main it is re-expressed with the repaired harness — the shared
`LoginPage`, the seeded November window the repaired specs already target,
and the fixed `testDir` config — then run against the dev servers on
:3000/:3001 as the group's gate.

### P8 — Do not carry the worktree's obsolete environment fixes

Four fixes in the worktree are now **no-ops on main** and are verified as
such rather than ported: the `(app)/layout.tsx` `force-dynamic` export (main
uses `export const instant = false`), `playwright.config.ts` `testDir` (main
already points at `./tests/tests`), the root Biome darwin binary (main's
lint excludes the vendored telegram-web build and runs the frontend binary),
and the frontend `task-detail-view.tsx` TS2589 (fixed on main). The port's
frontend typecheck must pass **without** re-introducing them.

### P9 — Dependencies

Four packages pinned at the re-verified versions (registry checked while
drafting): `@shopify/shopify-api@^15.1.2`, `@shopify/admin-api-client@^2.0.1`,
`@shopify/shopify-app-session-storage@^7.0.4`,
`@shopify/shopify-app-session-storage-drizzle@^6.0.4`. The Node adapter is
imported once (`@shopify/shopify-api/adapters/node`); Admin API version
`2026-10` stays the single constant in `core.ts`.

## Carried over from the worktree design (unchanged)

Commerce access matrix seeded narrow (SUPER_ADMIN/TECH_LEAD, widened through
Settings data); one `extend type Query/Mutation` block; OAuth handshake
implemented directly against Elysia (nonce in `app_settings`, callback HMAC);
throttle-aware per-store client (`SHOPIFY_RATE_LIMIT_THRESHOLD`, default 150,
a missing cost block means "no information", never a block); money parsed
without floats (`toMinorUnits` string split); HMAC receiver with
`timingSafeEqual` and fast acknowledgement before data work; the automation
`(rule_id, event_key)` idempotency claim. The full originals live in the
carried worktree record and prompt documents under `docs/`.

## Risks / Trade-offs

- **Generated migration drift** → hand-review the generated SQL before
  applying; replay on a throwaway database first, then the dev database.
- **Adapter contract vs our table shape** → the documented cast bridges only
  the declaration; the round-trip test proves runtime equivalence. If the pg
  adapter's runtime diverges, the fallback is the ~100-line adapter the
  original design named.
- **Merge conflicts in `seed.ts`/`index.ts`/`config.ts`** → P0's hand-merge
  groups run their gates immediately, so a bad merge surfaces in its group,
  not at the end.
- **E2E smoke flakiness** → the smoke exercises only seeded-shape flows
  (stores overview, board, sections, role gating) against the same dev
  servers the repaired suite uses; failures are diagnosed per spec.
- **Shopify Admin API drift** → version pinned in one constant (carried).

## Migration Plan

1. Land foundations (P1, P2, P4, P9) and generate the migration; verify on a
   throwaway database.
2. Land the module (domain, GraphQL surface, cross-cutting wiring) with its
   gates.
3. Land the frontend app and the seed grants; verify counts and parity.
4. Land docs/contract updates and the e2e smoke; run the full gates.
5. Rollback = deactivate via the permission matrix; no existing data is
   touched by the additive migration beyond constraint extensions.