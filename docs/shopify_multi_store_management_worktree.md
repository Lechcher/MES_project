# Shopify Multi-Store Management — Worktree Change Record

**Baseline:** commit `da8fabf` (`fix(settings): surface the telegram bot settings presence
flags over GraphQL`) on `main`, in the worktree
`/home/liberian/.herdr/worktrees/MES_project/shopify_multi_store_management`.
**Recorded:** 2026-11-21. **Scope:** the full working-tree diff at that date — 31 modified
paths plus 18 untracked entries (70 paths expanded with `git status -uall`) — dominated by
the `shoptify` (Shopify Commerce) app.

This document is a **point-in-time record** of this worktree, not a living contract. The
durable behavioral contracts for the module live in
[`API_CONTACT_SPECIFICATION.md` §6.6](API_CONTACT_SPECIFICATION.md) and
[`SYSTEM_ARCHITECTURE.md` §6.6](SYSTEM_ARCHITECTURE.md); the requirements and design
decisions live in `openspec/changes/add-shoptify-commerce/`. This record answers three
questions the specs do not: what this worktree changed, where each change came from, and
how the new module is put together.

## 1. Baseline & change inventory

The worktree departs from `da8fabf` with 49 `git status` entries, grouped by area
(untracked expanded with `-uall`):

| Area | Modified | New (untracked) |
| --- | --- | --- |
| Root docs | 2 (`API_CONTACT_SPECIFICATION.md`, `SYSTEM_ARCHITECTURE.md`) | 3 (`docs/shopify_multi_store_management_prompt.md`, `…_prompt_optimized.md`, `…_worktree.md` — this file) |
| Backend | 21 | 30 paths (`backend/drizzle/0005_stiff_psynapse.sql` + snapshot, 26 files under `src/domain/shoptify/`, `src/graphql/resolvers/shoptify.ts` + test) |
| Frontend | 8 | 20 paths (6 pages, 9 components, queries module + navigation test, e2e page object + spec, plus `frontend/test-results/.last-run.json` — transient Playwright output; remove or gitignore before commit) |
| OpenSpec | 0 | 17 files across 3 changes (`add-shoptify-commerce`, `optimize-shopify-prompt`, `document-shoptify-worktree-changes` — this planning change) |

Two completed changes account for the work:

- **`add-shoptify-commerce`** (29/29 tasks) — the whole `shoptify` app: schema/migration,
  domain, GraphQL, frontend, e2e, contract updates. Detailed in §3–§5.
- **`optimize-shopify-prompt`** (18/18 tasks) — rewrote the engineering prompt into the
  system-compatible source document `docs/shopify_multi_store_management_prompt_optimized.md`
  (PostgreSQL/standalone-module assumptions → MES: Bun + Elysia, one GraphQL API, SQLite);
  the original prompt is kept untouched.

Everything else is one pre-existing blocker fixed to unblock the app shell (§7).

**Sources:** `git rev-parse --short HEAD`, `git status --porcelain` at record time;
`openspec/changes/add-shoptify-commerce/tasks.md` (29/29);
`openspec/changes/optimize-shopify-prompt/tasks.md` (18/18).

## 2. Sources

The implementation derives from these sources, in order of authority:

| Source | Role |
| --- | --- |
| `docs/shopify_multi_store_management_prompt_optimized.md` | System-compatible engineering prompt — **the implementation source** (same 7-section structure as the original, §5 rewritten for Drizzle SQLite) |
| `docs/shopify_multi_store_management_prompt.md` | Original prompt (PostgreSQL, standalone-module assumptions); kept untouched as the requirements record |
| `openspec/changes/add-shoptify-commerce/` (proposal 71, design 172, tasks 57 lines + specs/) | Governing change artifacts — scope, decisions D1–D5, task-level verification |
| `openspec/changes/optimize-shopify-prompt/` | The prompt-rewrite change |
| Shopify official docs + npm registry (checked 2026-11-21) | Version and Admin-API verification (§2, §8) |

Verified dependency versions (from `backend/package.json` / `backend/bun.lock`):

| Package | Version | Why |
| --- | --- | --- |
| `@shopify/shopify-api` | `^15.1.2` | OAuth handshake + webhook validation entry points |
| `@shopify/admin-api-client` | `^2.0.1` | Per-store Admin API GraphQL client (built-in 429/503 retries) |
| `@shopify/shopify-app-session-storage` | `^7.0.4` | `SessionStorage` interface (type only) |
| `@shopify/shopify-app-session-storage-drizzle` | `^6.0.4` | `DrizzleSessionStorageSQLite` — adopted, not reimplemented (§6) |

Admin API version: **`2026-10`** (`ApiVersion.October26`), the latest stable quarterly
version as of 2026-11-21; configured as a single constant used by every store client.

**Sources:** `backend/package.json`, `backend/bun.lock`, `openspec/changes/add-shoptify-commerce/design.md` D5, task 1.1.

## 3. Detailed structure — backend

### 3.1 Modified files

| File | Change |
| --- | --- |
| `backend/src/config.ts` + test | `ShopifySettings` credential group (api key/secret, token encryption key, OAuth callback URL, scopes) + rate-limit threshold (default 150); all-or-nothing validation, module unconfigured (`null`) when nothing set |
| `backend/src/db/enums.ts` | `MODULE_CODES` gains `shoptify`; `SHOPTIFY_PAYOUT_STATUSES`, `SHOPTIFY_EXCEPTION_REASONS`, `SHOPTIFY_AUTOMATION_TRIGGERS` vocabularies for `sqlCodeList` |
| `backend/src/db/schema.ts` | 12 `shoptify_*` tables + 12 row-type aliases; 4 `module_code`/`code` check constraints extended with `shoptify` |
| `backend/src/db/seed.ts` + test | `shoptify` module row (sortOrder 6), 9 commerce permissions, grants for `SUPER_ADMIN`/`TECH_LEAD` only (`HR_MANAGER` explicitly excluded); seed counts now 6 modules / 30 permissions / 96 role-permissions |
| `backend/src/graphql/schema.ts` + test | shoptify types, inputs, 3 enums, `extend type Query/Mutation` blocks (21 operations); documented-operation lists extended |
| `backend/src/graphql/access.ts` | 21 commerce entries in `OPERATIONS` (`roles: TECHNICAL`, `scope: TECHNICAL_SCOPE`) — the seeded role matrix; widening happens through Settings data, not code |
| `backend/src/graphql/change-areas.ts` + test | 14 entries: 13 mutations → `"shoptify"` change area, `shoptifyBeginOAuth` inert (no displayed data changes); `ChangeArea` gains `"shoptify"` (`events/event-bus.ts`) |
| `backend/src/graphql/resolvers/index.ts` | Registers `shoptifyQuery` / `shoptifyMutation` |
| `backend/src/index.ts` | Mounts the module's two raw routes; bootstrap creates the typed webhook bus and wires `wireShoptifySubscriptions` |
| `backend/contract-diff.ts` | §6.6 parity checks: 21 operations, 16 types + 12 inputs, 3 enums, signature comparison for query/mutation blocks |
| `backend/.env.example` | 6 `SHOPTIFY_*` entries (key/secret, encryption key, callback URL, scopes, rate-limit threshold) — examples only |
| `backend/package.json` / `bun.lock` | 4 `@shopify/*` dependencies pinned (§2) |
| `backend/drizzle/meta/_journal.json` | Migration 5 journal entry |

### 3.2 New files

`backend/drizzle/0005_stiff_psynapse.sql` (271 lines) + `meta/0005_snapshot.json`,
`backend/src/graphql/resolvers/shoptify.ts` (482) + `shoptify.test.ts` (203), and 26 files
under `backend/src/domain/shoptify/` (14 source + 12 tests, 6,042 lines total — see §3.4).

### 3.3 Data model — 12 `shoptify_*` tables

Conventions (repo-wide): integer **minor units** for money, **JSON-as-text**, **Unix-ms**
timestamps, **UUID text** ids, cascade deletes from parent to child.

| Table | Purpose | Key points |
| --- | --- | --- |
| `shoptify_sessions` | Shopify session storage | Column names follow the adopted adapter's contract exactly (ISO-8601 text `expires`/`refreshTokenExpires`, `access_token` NOT NULL, blob bigint `user_id`) |
| `shoptify_stores` | Connected store | `shop_domain` unique; `access_token` AES-256-GCM encrypted; `webhook_secret` = encrypted app secret; `scopes` JSON-as-text; `last_sync_at` |
| `shoptify_orders` | Synced order | Unique `(store_id, shopify_order_id)` — the ingestion idempotency key; `total_price` minor units; `has_exception` + `exception_reason` |
| `shoptify_fulfillments` | Fulfillment + tracking | Unique `(order_id, shopify_fulfillment_id)` |
| `shoptify_refunds` | Refund records | Unique `(order_id, shopify_refund_id)`; amount minor units |
| `shoptify_products` | Synced product | Unique `(store_id, shopify_product_id)` |
| `shoptify_variants` | Synced variant | `master_sku` = cross-store identity (variants sharing it stock-sync together); `min_stock_level` for low-stock; unique `(store_id, shopify_variant_id)` |
| `shoptify_customers` | Cross-store customer profile | One row per contact identifier (email, phone fallback); aggregates recomputed from orders; CHECK requires email or phone |
| `shoptify_payouts` | Shopify Payments payout | Status lifecycle `SCHEDULED → IN_TRANSIT → PAID/FAILED` (CHECK); unique `(store_id, shopify_payout_id)` |
| `shoptify_order_expenses` | Per-order cost components | `net_profit = revenue − cogs − shipping − gateway_fee − ad_spend`; one row per order |
| `shoptify_automation_rules` | if-condition-then-action rule | `store_id` null = global; `conditions`/`actions` JSON-as-text; trigger CHECK |
| `shoptify_automation_log` | Execution log | Unique `(rule_id, event_key)` — the idempotency claim that makes each rule fire at most once per event |

Check constraints: the four platform constraints (`ck_permissions_module`, `ck_audit_module`,
`ck_app_settings_module`, `ck_modules_code`) are extended with `shoptify` (SQLite
table-rebuild pattern in the migration), plus four module-specific CHECKs
(`ck_shoptify_orders_exception_reason`, `ck_shoptify_payouts_status`,
`ck_shoptify_rules_trigger`, `ck_shoptify_customers_contact`).

**Sources:** `backend/drizzle/0005_stiff_psynapse.sql` (`CREATE TABLE` list, `ck_*` list),
`backend/src/db/schema.ts` (12 `typeof shoptify_*.$inferSelect` aliases), `backend/src/db/seed.ts`.

### 3.4 Backend domain — `src/domain/shoptify/`

| File | Lines | Role |
| --- | --- | --- |
| `types.ts` | 52 | SDK type aliases behind module names; 9 `SHOPTIFY_WEBHOOK_TOPICS` |
| `core.ts` | 205 | AES-256-GCM token encrypt/decrypt (key decode + `requireShopifySettings` guard); `createStoreClient`; throttle-aware request wrapper |
| `session-storage.ts` | 44 | Session storage bound to `shoptify_sessions` via the adopted adapter |
| `webhooks.ts` | 249 | Raw-body HMAC verification (`timingSafeEqual`), typed event bus, intake status contract, header parsing |
| `oauth.routes.ts` | 97 | The module's two raw HTTP routes (webhook receiver + OAuth callback) |
| `store-connect.ts` | 360 | OAuth handshake (nonce in `app_settings`, code exchange, callback HMAC), manual Custom App token connect with `shop { name currency }` probe, webhook registration, deactivate-by-domain |
| `orders.ts` | 583 | Webhook ingestion (idempotent upserts), filtered/paginated listing, order flags, bulk fulfillment (per-order result; Shopify `fulfillmentCreateV2` + local row), refund ingest |
| `catalog.ts` | 421 | Product/variant ingestion, `master_sku` cross-store propagation, bulk quantity/price update with low-stock reporting |
| `customers.ts` | 202 | Cross-store profiles keyed by contact identifiers; aggregates recomputed; blacklist/high-risk flags (audited) |
| `finance.ts` | 265 | Expense entry + net profit, store/period summary, payout lifecycle records |
| `automation.ts` | 430 | Rule storage + minimal v1 engine (predicates on the event row; actions `flag_exception`/`annotate`/`notify`; `(rule, eventKey)` claim before acting) |
| `subscriptions.ts` | 107 | Verified-payload fan-out: ingest → customer refresh → automation; `app/uninstalled` → deactivate store |
| `shapes.ts` | 329 | Row → API shape mappers; JSON columns parsed; `toMinorUnits` split-based money parsing (no float rounding) |
| `exports.ts` | 223 | Order/catalog listing exports as real XLSX/CSV files + `export_artifacts` rows served by the existing download route |
| 12 `*.test.ts` | 2,475 | Bun tests per file above (see §8) |

### 3.5 GraphQL surface & platform wiring

**21 operations** (7 queries, 14 mutations), all authorized server-side via
`authorize(ctx, "<operation>")`:

- Queries: `shoptifyStores`, `shoptifyOrders`, `shoptifyOrder`, `shoptifyProducts`,
  `shoptifyCustomers`, `shoptifyPayouts`, `shoptifyAutomationRules`
- Mutations: `shoptifyBeginOAuth`, `shoptifyConnectStore`, `shoptifyDeactivateStore`,
  `shoptifyUpdateOrderFlags`, `shoptifyBulkFulfill`, `shoptifyUpdateVariant`,
  `shoptifySyncInventory`, `shoptifySetCustomerFlags`, `shoptifySetOrderExpenses`,
  `shoptifyRecordPayout`, `shoptifySaveRule`, `shoptifyDeleteRule`, `shoptifyExportOrders`,
  `shoptifyExportProducts`

Wiring: 21 entries in `graphql/access.ts` `OPERATIONS` (TECHNICAL roles, TECHNICAL scope —
seeded to `SUPER_ADMIN`/`TECH_LEAD`, widened through the permission matrix); 14 entries in
`MUTATION_AREAS` (13 → `"shoptify"` area for live updates, `shoptifyBeginOAuth` → `null`);
20 operation documents on the frontend (the 14th mutation, `shoptifySyncInventory`, is a
backend read-back with no frontend document).

Raw HTTP surface (the only non-GraphQL routes): `POST /api/v1/shoptify/webhooks` (receiver)
and `GET /api/v1/shoptify/oauth/callback` (handshake completion + redirect back to the app).

**Sources:** `backend/src/graphql/schema.ts`, `backend/src/graphql/resolvers/shoptify.ts`,
`backend/src/graphql/access.ts`, `backend/src/graphql/change-areas.ts`,
`backend/src/domain/shoptify/oauth.routes.ts`; parity: `backend/contract-diff.ts` (§8).

## 4. Detailed structure — frontend

### 4.1 Modified files

| File | Change |
| --- | --- |
| `frontend/src/lib/mes/navigation.ts` | `MES_MODULE_CODES` + launcher entry (`shoptify` → "Shopify Stores", `/shoptify`) + `MES_APP_ACCESS` row: `ALL` for `SUPER_ADMIN`/`TECH_LEAD`, `HIDDEN` for the other three roles |
| `frontend/src/lib/mes/live.tsx` | `LiveArea` gains `"shoptify"` (mirrors the backend's change areas) |
| `frontend/src/lib/mes/queries/registries.ts` | `MODULE_LABELS` gains `shoptify` (module display name) |
| `frontend/src/lib/mes/queries/access.ts` | `canViewShoptifyApp(role)` — the client-side mirror of the seeded matrix |
| `frontend/src/components/home/dashboard-view.tsx` | `ICONS` map gains the `Store` icon (TypeScript requires the exhaustive `Record<MesModuleCode, …>`) |
| `frontend/messages/en.json` + `vi.json` | `shoptify` namespace (153 keys per locale, identical key sets) + `shell.apps.shoptify` + `enums.modules.shoptify` |
| `frontend/src/app/(app)/layout.tsx` | Pre-existing blocker fixed — see §7 |

### 4.2 New files

| Path | Lines | Role |
| --- | --- | --- |
| `src/app/(app)/shoptify/page.tsx` + 5 section pages | 14 each | Thin route components (stores, orders, catalog, customers, finance, automation) wrapped in the role gate |
| `src/components/shoptify/shoptify-view.tsx` | 27 | App shell (eyebrow/title/description) landing on the stores panel |
| `src/components/shoptify/shoptify-screen.tsx` | 42 | Role gate: renders the no-access state for roles without commerce access |
| `src/components/shoptify/stores-panel.tsx` | 213 | Store list + OAuth begin + manual Custom App token connect + deactivate |
| `src/components/shoptify/orders-panel.tsx` | 398 | Cross-store order board: filters, search, selection, bulk fulfillment with tracking, export |
| `src/components/shoptify/catalog-panel.tsx` | 246 | Variant table grouped by `master_sku`, low-stock badge, bulk quantity/price update |
| `src/components/shoptify/customers-panel.tsx` | 231 | Aggregated profiles, blacklist/high-risk badges, review + flag actions |
| `src/components/shoptify/finance-panel.tsx` | 375 | Payout lifecycle table, per-order cost entry (net profit read-back), payout record form |
| `src/components/shoptify/automation-panel.tsx` | 277 | Rule list + create form (trigger, v1 action set, condition field) + delete |
| `src/components/shoptify/shoptify-format.ts` | 23 | `useMoneyFormatter` — minor units → locale decimal + currency |
| `src/lib/mes/queries/shoptify.ts` | 332 | 20 operation documents (7 queries + 13 mutations; `shoptifySyncInventory` is backend-only) |
| `src/lib/mes/shoptify-navigation.test.ts` | 48 | Bun test: module registered, matrix complete per role, launcher visibility per role |
| `tests/pages/shoptify/shoptify.ts` | 39 | Playwright page object (route walkers) |
| `tests/tests/shoptify/multi-store.spec.ts` | 104 | E2E smoke: stores overview, order board, all sections, role without access |

All panels follow the platform's existing patterns: `useApiQuery` with
`liveArea: "shoptify"` for live refresh, `graphqlRequest` for mutations, shadcn
components (table/button/input/select/checkbox/badge), IBM Carbon theme from `DESIGN.md`,
and translations through `useTranslations("shoptify.*")`.

**Sources:** `frontend/src/components/shoptify/*`, `frontend/src/app/(app)/shoptify/`,
`frontend/src/lib/mes/queries/shoptify.ts`; key parity: `frontend/messages/en.json` vs
`frontend/messages/vi.json` (153 keys each, identical).

## 5. Data flow & token custody

**Reads/mutations (GraphQL):** browser component → `useApiQuery`/`graphqlRequest` →
same-origin proxy `/api/mes/graphql` → `POST /api/v1/graphql` → `executeGraphQL` →
resolver field (each calling `authorize(ctx, "<operation>")` first) → domain service
(`backend/src/domain/shoptify/*`) → Drizzle row → `shapes.ts` mapper → JSON with integer
minor units. A successful mutation publishes the `"shoptify"` change area (`MUTATION_AREAS`),
so open SSE streams tell clients to refetch.

**Webhooks (raw HTTP):** Shopify → `POST /api/v1/shoptify/webhooks` → raw body read before
any parsing → `resolveStoreForWebhook` by `X-Shopify-Shop-Domain` → HMAC-SHA256 over the
raw bytes vs the store's secret, `timingSafeEqual` → 404/401 before any data change on
failure; verified payloads are published on the typed bus (`webhook.orders/create`, …) and
acknowledged fast (~200). `subscriptions.ts` fans out: ingest (idempotent) → customer
aggregation → automation evaluation; `app/uninstalled` deactivates the store.

**Token custody:** access tokens are AES-256-GCM encrypted at rest
(`IV ‖ tag ‖ ciphertext`, base64) with the key from `SHOPIFY_TOKEN_ENCRYPTION_KEY`
(64 hex chars); decryption happens only inside the request that calls Shopify. Tokens,
webhook secrets, and the encryption key never appear in any GraphQL response or audit
payload — the connect audit event records only the shop domain.

**Sources:** `backend/src/domain/shoptify/oauth.routes.ts`, `webhooks.ts`,
`subscriptions.ts`, `core.ts`, `shapes.ts`; `backend/src/graphql/index.ts`;
`frontend/src/lib/mes/queries/use-api.ts`, `client.ts`.

## 6. Notable work

Decisions that a reader of the specs would not guess, all recorded in
`openspec/changes/add-shoptify-commerce/design.md` (D1–D5) and its tasks:

- **Session storage: adopt, don't build.** Task 3.2 first re-checked whether
  `@shopify/shopify-app-session-storage-drizzle@6.0.4` supports SQLite; the tarball ships
  `DrizzleSessionStorageSQLite`, so the custom adapter was dropped and the
  `shoptify_sessions` table was shaped to the adapter's contract (ISO-8601 text
  `expires`, blob bigint `user_id`, `access_token` NOT NULL). The table's property names
  mirror the adapter's expected schema; a documented cast bridges the published type
  declaration only (verified by the round-trip test).
- **OAuth handshake implemented directly.** `shopify-api` v15's `auth.begin`/`auth.callback`
  are bound to a Node-style request/response pair with signed cookies, while this service
  runs Elysia fetch-style handlers. The documented HTTP flow (authorize redirect with CSRF
  nonce → verify nonce + callback query HMAC → exchange code) is implemented in
  `store-connect.ts`; the nonce lives in `app_settings` (module `shoptify`), is consumed on
  use, and survives a restart.
- **Two tables beyond the prompt's §5 list.** `shoptify_refunds` (idempotent refund ingest
  keyed by Shopify refund id) and `shoptify_automation_log` (the `(rule_id, event_key)`
  idempotency claim) — both driven by webhook retry and bus re-delivery realities.
- **Throttle-aware client.** `createAdminApiClient` with `retries: 3`, wrapped by
  `throttleAwareRequest`: batch calls pause with a capped back-off when
  `extensions.cost.throttleStatus.currentlyAvailable` drops below the configured threshold
  (default 150); a missing cost block is treated as "no information", never as a block.
- **Money parsing without floats.** `toMinorUnits` splits the decimal string
  (`"10.05"` → `1005`) instead of multiplying a float, so currency never sees binary
  rounding.
- **Prompt optimization.** `optimize-shopify-prompt` rewrote the PostgreSQL/standalone
  prompt into a MES-compatible source (SQLite conventions, single GraphQL API, reuse of
  core services) while keeping the original prompt untouched as the requirements record.

## 7. Pre-existing faults

### Fixed (to unblock this worktree)

- **`frontend/src/app/(app)/layout.tsx` exported `export const dynamic = "force-dynamic"`**,
  which `nextConfig.cacheComponents: true` rejects — every route in the `(app)` tree failed
  to compile, so no app screen (including the new `shoptify` ones) could render. The line
  was removed with a comment: the viewer resolves client-side via `RequireViewer`, so no
  route-segment dynamic config is needed. (The incompatibility came from the earlier
  `update-nextjs-newest-version` change.)

### Left untouched (not caused by this worktree; reported only)

- **28 backend test files** hard-code a macOS temp path (`/private/var/folders/.../T/opencode`)
  and fail to open their test database on Linux; the change's own tests use `tmpdir()`.
- **Root Biome install is the darwin build** (`node_modules/@biomejs/cli-darwin-x64`) and
  crashes on Linux; the runnable binary is `frontend/node_modules/.bin/biome`.
- **`frontend/playwright.config.ts` `testDir` points at the retired `./tests/e2e/tests`**
  while the suite lives under `./tests/tests`; the smoke ran through a temporary config
  (deleted afterwards).
- **5 frontend `tsc` errors** across 4 files (`src/components/jobs/task-detail-view.tsx`,
  `tests/fixtures/data.ts`, `tests/global-setup.ts`, `tests/pages/jobs/ticket-detail.ts`),
  all outside this change.
- **Playwright version quirk:** the frontend-local binary (1.64.1) matches the installed
  chromium-1248; `bunx playwright` resolves 1.65.1 and cannot find its browser build.
- Formatting churn Biome would introduce in unrelated files was reverted
  (`git checkout --`) so the worktree diff stays scoped to this change.

## 8. Verification

Gate results as recorded by `openspec/changes/add-shoptify-commerce/tasks.md` task 8.3;
the two cheap gates were re-run while writing this record and still hold:

| Gate | Result | Re-runnable |
| --- | --- | --- |
| Backend tests (change's files) | **173 pass / 0 fail** across 18 files | `cd backend && bun test src/domain/shoptify/ src/graphql/resolvers/shoptify.test.ts src/graphql/change-areas.test.ts src/graphql/authorization.test.ts src/graphql/schema.test.ts src/config.test.ts src/db/seed.test.ts` |
| Contract parity | **holds** — 21 Shopify operations / 28 types and inputs (§6.6 vs `typeDefs`) | `cd backend && bun run contract-diff` |
| Frontend unit tests | **269 pass / 0 fail** (22 files) | `cd frontend && bun test src/` |
| E2E smoke | **4/4 specs pass** (stores overview, order board, all sections, role gating) against dev servers :3000/:3001 | `cd frontend && ./node_modules/.bin/playwright test --config=<config resolving ./tests/tests/shoptify>` |
| Typecheck | Backend `tsc --noEmit`: **0 errors**; frontend: **0 errors on new paths** (5 pre-existing elsewhere, §7) | `cd backend && bun run typecheck`; `cd frontend && bunx tsc --noEmit` |
| Biome | **0 errors** on the change's files (frontend Linux binary; root binary is darwin) | `./frontend/node_modules/.bin/biome check <paths>` |
| This document | Biome ignores Markdown (an explicitly passed `.md` is reported as ignored, not linted), so its formatting was verified by inspection: sequential heading levels, well-formed tables, no translated code identifiers | `./frontend/node_modules/.bin/biome check docs/shopify_multi_store_management_worktree.md` |
| Database | `db:generate` → `0005_stiff_psynapse.sql`; applied to a throwaway DB; seeds counted (6 modules / 30 permissions / 96 role-permissions / 1 commerce module row / 9 commerce permissions) | `cd backend && bun run db:migrate` (see §9) |

E2E credentials and environment: seeded demo users with password
`MES-dev-seed-2026!` (`tech.lead@mes.local` = TECH_LEAD has commerce access);
the smoke signed in through the form's own input ids because the shared login page object
predates a label refactor (pre-existing, §7).

## 9. Follow-ups

Owner actions after this record (nothing here is done by the record itself):

1. **Review, then archive** the two completed changes: `/opsx-archive add-shoptify-commerce`
   and `/opsx-archive optimize-shopify-prompt`.
2. **Apply the database locally once**: `cd backend && bun run db:migrate && bun run db:seed`
   (the dev DB binaries in the worktree were restored to their committed state; the
   migration is committed-new `0005_stiff_psynapse.sql`).
3. **Commit the worktree** — single-branch `main`, direct commit, conventional message,
   `Co-authored-by: AI Agent <agent@local>` trailer; drop the transient
   `frontend/test-results/` output first.
4. **Decide the Next.js security upgrade** — the frontend dev server prints a known-vulnerability
   advisory for the installed Next.js; the pending question is whether to run
   `next upgrade --agent=security` in a background worktree.
