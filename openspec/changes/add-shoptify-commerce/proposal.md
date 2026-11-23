# Proposal

## Why

The business runs Shopify stores that no part of the MES platform can see:
store connection, orders, fulfillment, inventory, customers, payouts, and
profit all live outside the system. A complete Shopify Multi-Store Management
app was built and fully verified (29/29 tasks, plus the prompt rewrite at
18/18) in the worktree `shopify_multi_store_management`, but that worktree sits
on baseline `da8fabf` while `main` has moved 38 commits ahead — the PostgreSQL
cutover, the backend run logger, the schedule view, and the e2e repair among
them. Bringing the module over by branch merge is off the table; this change
lands it on today's `main` as a reviewed, file-grouped port.

## What Changes

- Add a new app `shoptify` (module code `shoptify`, table prefix `shoptify_`)
  covering: store connection (OAuth 2.0 + Custom App offline tokens),
  HMAC-verified webhook ingestion with fast acknowledgement, unified
  multi-store orders with bulk fulfillment/tracking and refunds, catalog sync
  with cross-store inventory via `master_sku`, cross-store customers with
  blacklist flags, payout tracking plus per-order net profit, and a minimal v1
  automation rule engine with alerts.
- Expose everything through the single GraphQL API with per-operation
  authorization; only two raw HTTP routes exist
  (`GET /api/v1/shoptify/oauth/callback`, `POST /api/v1/shoptify/webhooks`).
- Add the frontend app under `frontend/src/app/(app)/shoptify/` (stores,
  orders, catalog, customers, finance, automation) and register it in the app
  launcher, top navigation, and role access matrix.
- Persist with PostgreSQL: the module's `shoptify_*` tables follow main's
  Drizzle node-postgres schema conventions, and a **newly generated**
  migration (main is at `0002_…`; the worktree's SQLite `0005_stiff_psynapse`
  is not carried) extends the `module_code` check constraints on PostgreSQL
  terms — constraint drops/adds, not the SQLite 12-step table rebuild.
- Hand-merge the ~20 shared files `main` also changed since `da8fabf`
  (`index.ts`, `config.ts`, `db/schema.ts`, `db/seed.ts`, `graphql/schema.ts`,
  the resolver merge, `messages/{en,vi}.json`, navigation, and the two root
  docs); copy the module's own ~60 files wholesale where `main` did not touch
  them.
- New dependencies (versions re-verified against the registry):
  `@shopify/shopify-api@^15.1.2`, `@shopify/admin-api-client@^2.0.1`,
  `@shopify/shopify-app-session-storage@^7.0.4`,
  `@shopify/shopify-app-session-storage-drizzle@^6.0.4`.
- **BREAKING** for the API contract: `typeDefs` gains shoptify types and 21
  operations and the permission matrix gains a module — additive only;
  existing operations and roles are unchanged.
- Carry the worktree's source records into `docs/`: the two prompt documents
  and the point-in-time change record this port is planned from.

## Capabilities

### New Capabilities
- `backend/shoptify-commerce`: server-side commerce capability — store
  connection and token custody, webhook ingestion, orders/fulfillment,
  catalog/inventory sync, customers, finance/net profit, automation rules,
  and their authorization/audit/notification behavior.
- `frontend/shoptify`: the shoptify app UI — role-gated launcher entry, store
  connection (OAuth begin + manual token), multi-store order board with bulk
  actions, catalog and inventory views, customer profiles, finance dashboard,
  and automation rule management, in the DESIGN.md theme with live refresh
  and exports.

### Modified Capabilities
- `frontend/app-shell`: the dashboard launcher, top navigation, and app
  switcher include the new `shoptify` app for permitted roles.
- `core/authorization`: the permission matrix gains the `shoptify` module
  code, its operations, and role scopes; commerce operations follow the same
  two-layer enforcement as every other app.

## Impact

- **Code:** new `backend/src/domain/shoptify/*` (14 source + 12 test files),
  `backend/src/graphql/resolvers/shoptify.ts` + test,
  `backend/src/domain/shoptify/oauth.routes.ts`; extensions to
  `backend/src/db/schema.ts`, `db/enums.ts`, `db/seed.ts`,
  `graphql/schema.ts`, `graphql/access.ts`, `graphql/change-areas.ts`,
  `graphql/resolvers/index.ts`, `events/event-bus.ts`, `index.ts`,
  `config.ts`, `contract-diff.ts`, `.env.example`, `package.json`; new
  frontend pages, 8 components, the queries module, navigation entries, and
  the `shoptify` message namespace in both locales.
- **API:** additive GraphQL operations; `API_CONTACT_SPECIFICATION.md` gains
  the `shoptify` section, merged into the doc's current revision.
- **Dependencies:** four `@shopify/*` packages, pinned and installed.
- **Docs:** `SYSTEM_ARCHITECTURE.md` module catalog; the prompt documents and
  the worktree change record land under `docs/` as the port's provenance.
- **Out of scope:** payments/checkout, Shopify POS, multi-currency
  conversion, and any automation action beyond local writes plus a
  notification row; GDPR `customers/redact` subscription; per-environment
  behavior beyond the module's own configuration. Those remain follow-up
  changes.