# Engineering Prompt: Shopify Multi-Store Management Module (`shoptify-commerce`)

## 1. Context & Objective

Build a centralized **Shopify Multi-Store Order Management & Operations Module**
(internal module code `shoptify`) inside the existing **MES system**: a
TypeScript backend on **Bun + Elysia** exposing a **single GraphQL API**
(`POST /api/v1/graphql`) over a **SQLite database** (Drizzle ORM via
`bun:sqlite`). The system must allow administrators and staff to connect
multiple Shopify stores (via OAuth 2.0 or Custom App offline tokens), receive
real-time order/inventory updates via Webhooks, manage and fulfill orders in
bulk across stores, track net profit, and automate alerts.

This module lands as a new app of the existing platform (alongside `jobs`,
`planning`, `performance`, `settings`, `audit-log`), reusing the system's core
services — identity, authorization, audit, notifications, live updates, and
exports — instead of reimplementing them. It is *not* a standalone
microservice.

## 2. Tech Stack & Official SDK Integration

* **Runtime & ORM:** Bun, TypeScript, SQLite (`bun:sqlite`) + Drizzle ORM.

* **Host application (already present — do not re-add):** Elysia (HTTP +
  route layer), `graphql` (GraphQL.js schema execution for the versioned
  endpoint), `better-auth` (sessions), `grammY` (Telegram bot), `exceljs` /
  `pdf-lib` (exports), `zod`, `@sentry/node`. Verify current versions with the
  `npm-check-updates` skill before touching dependencies.

* **Official Shopify Packages (intended additions — verify latest versions
  against the official docs before adding):**

  * `@shopify/admin-api-client`: Use `createAdminApiClient` as the
    lightweight, strongly-typed GraphQL Admin API client for all data
    operations (built-in automatic retries on `429`/`503` errors and
    TypeScript query typing).

  * `@shopify/shopify-api`: Use strictly for the OAuth 2.0 handshake, webhook
    registration, and HMAC signature validation (`shopify.webhooks.validate`).
    Do **NOT** use embedded App or App Bridge packages — the dashboard is
    external and standalone, embedded inside the existing application.

  * `@shopify/shopify-app-session-storage-drizzle`: **Verify at adoption
    time.** The package's documented target is PostgreSQL; this system runs
    SQLite. If the package does not support the SQLite dialect, implement the
    `shopify-api` `SessionStorage` interface directly over the SQLite
    `shoptify_sessions` table instead (see §5).

* **Proactive Rate Limit Wrapper:** Wrap `createAdminApiClient` inside
  `backend/src/domain/shoptify/core.ts` to inspect
  `extensions.cost.throttleStatus` and proactively pause/back-off when
  available points drop below the configured threshold during multi-store
  batch jobs.

## 3. Architectural Constraints (CRITICAL)

1. **Layered backend, not a module monolith.** This repository has no
   umbrella module directory. Code belongs in the project's existing layers:
   domain logic under `backend/src/domain/shoptify/`, GraphQL types in the
   single `backend/src/graphql/schema.ts`, resolver maps in
   `backend/src/graphql/resolvers/shoptify.ts` (registered in
   `resolvers/index.ts`), and tables in the single `backend/src/db/schema.ts`.
   There is no per-module `index.ts` entry point and no per-module route
   prefix beyond the raw HTTP endpoints listed in §6.

2. **Strict domain separation.** Inside `domain/shoptify/`, organize code by
   domain, and never import another domain's internals or query its tables
   directly:

    * `core.ts`: `shopify-api` setup, session storage adapter,
      `admin-api-client` wrapper (`shoptify.client`), AES-256 token
      encryption, and typed domain-event wiring for webhooks.

    * `webhooks.ts`: HMAC handler, topic → event mapping, registration of
      topics on store connect.

    * `orders.ts`: Unified multi-store order listing, order editing, bulk
      fulfillment/tracking updates, exception flagging, and refunds.

    * `catalog.ts`: Product syncing, bulk price/status updates, and real-time
      cross-store inventory synchronization mapped via `master_sku`.

    * `customers.ts`: 360° cross-store customer profiles, abandoned checkouts,
      and high-risk/blacklist customer flagging.

    * `finance.ts`: Shopify Payments payout tracking, dispute monitoring,
      COGS/ad-spend input, and net profit calculation.

    * `automation.ts`: Rule engine (`If-Condition-Then-Action`, minimal v1 —
      see §7) and alert raising.

3. **GraphQL only for dashboard operations.** All dashboard reads and writes
   are GraphQL operations on `POST /api/v1/graphql` (contract style of
   `API_CONTACT_SPECIFICATION.md`), not per-module REST routes. Every
   resolver calls `authorize(ctx, "<operation>")`
   (`backend/src/graphql/access.ts`) exactly like existing apps — server-side
   authorization on every protected operation.

4. **Decoupled communication.** Cross-domain side effects must pass through
   the typed domain event wiring in `core.ts` (e.g. `webhook.orders/create`,
   `order.synced`, `stock.low`) or the existing process change bus —
   `backend/src/events/event-bus.ts` (`createChangeBus`) with its
   `publish(area)` / `subscribe(listener)` contract — never direct imports.

5. **Reuse the five core services — never reimplement them:**

   * **Identity/authorization:** Better Auth session via `ViewerContext`
     (`backend/src/graphql/context.ts`); RBAC through the permission matrix —
     add module code `shoptify` to `MODULE_CODES` in
     `backend/src/db/enums.ts` and to the permission seeds.
   * **Audit:** every administrative write appends to `systemAuditLogs`
     (module `shoptify`), field changes redacted for secrets — same append-only
     trail the `audit-log` app reads.
   * **Notifications:** publish rows through `backend/src/domain/notifications.ts`
     (PENDING/SENT/FAILED) and let `backend/src/telegram/sender.ts`
     (`setTelegramSender`, `deliverTelegramPush`) deliver them. Do not create
     a second bot or call a `Bot` instance directly.
   * **Live updates:** after a mutation, `events.publish("<area>")` on the
     existing bus so open screens refresh;
     `frontend/src/lib/mes/live.tsx` handles the client side.
   * **Exports:** produce artifacts through `backend/src/reports/` +
     `exportArtifacts` and serve them with the existing
     `GET /api/v1/exports/:id` route.

6. **Shopify GraphQL Admin API only.** Use the **latest stable quarterly
   Shopify Admin API version (2026-01 or newer — verify the current line
   before implementing)** via `@shopify/admin-api-client`, never the
   deprecated REST Admin API.

## 4. Directory Structure

Generate the module following this layout — every path is relative to the
existing repository structure (new files marked `+`):

```
backend/src/
+── domain/shoptify/                  # all domain logic (new folder)
│   ├── core.ts                       # shopify-api setup, SessionStorage adapter,
│   │                                 #   admin-api-client wrapper (throttle-aware),
│   │                                 #   AES-256-GCM token crypto, domain events
│   ├── webhooks.ts                   # HMAC handler, topic→event map, topic
│   │                                 #   registration on store connect
│   ├── orders.ts                     # multi-store orders, editing, bulk
│   │                                 #   fulfillment/tracking, exceptions, refunds
│   ├── catalog.ts                    # product sync, bulk price/status,
│   │                                 #   cross-store inventory via master_sku
│   ├── customers.ts                  # 360° profiles, abandoned checkouts,
│   │                                 #   risk/blacklist flags
│   ├── finance.ts                    # payouts, disputes, COGS/ad-spend,
│   │                                 #   net profit
│   ├── automation.ts                 # rule engine (minimal v1) + alert raising
│   └── shapes.ts                     # row → API mappers (mirrors graphql/shapes.ts)
+── graphql/resolvers/shoptify.ts     # query/mutation resolver maps, registered
│                                     #   in graphql/resolvers/index.ts
├── db/schema.ts                      # + shoptify_* tables (single schema file)
├── db/enums.ts                       # + module code shoptify, any new vocab
│                                     #   tuples (with sqlCodeList for checks)
├── graphql/schema.ts                 # + extend type Query/Mutation (shoptify ops)
├── graphql/resolvers/index.ts        # + merge shoptifyQuery / shoptifyMutation
├── graphql/access.ts                 # (rule list extended per operation)
+── domain/shoptify/oauth.routes.ts   # OAuth callback + webhook receiver
│                                     #   (Elysia handlers, raw body)
├── index.ts                          # + mount /api/v1/shoptify/oauth/callback
│                                     #   and /api/v1/shoptify/webhooks
├── events/event-bus.ts               # (reused as-is; extend ChangeArea only if
│                                     #   the frontend subscribes to a new area)
├── reports/exports.ts                # (reused for XLSX/CSV/PDF artifacts)
└── telegram/sender.ts                # (reused for delivery)

frontend/src/
+── app/(app)/shoptify/               # Next.js App Router pages (stores,
│   ├── page.tsx                      #   orders, catalog, customers, finance,
│   ├── orders/page.tsx               #   automation) — same conventions as
│   ├── catalog/page.tsx              #   app/(app)/jobs/
│   ├── customers/page.tsx
│   ├── finance/page.tsx
│   └── automation/page.tsx
+── components/shoptify/              # shadcn + Base UI components
+── lib/mes/queries/shoptify.ts       # GraphQL queries via lib/mes/client.ts
├── lib/mes/navigation.ts             # + MES_MODULE_CODES / MES_APP_ACCESS entry
├── lib/mes/live.tsx                  # (reused for live refresh)
└── app/globals.css                   # (unchanged; design tokens live there)
frontend/messages/                    # + next-intl message files (en, vi, …)
```

## 5. Database Schema Requirements (Drizzle SQLite)

All tables live in the single `backend/src/db/schema.ts` and MUST use the
`shoptify_` prefix. Follow the file's existing conventions exactly
(`backend/src/db/schema.ts` is the reference):

* **SQLite only.** Use `sqliteTable` from `drizzle-orm/sqlite-core` and its
  column helpers for every table in this module.
* **JSON columns** (`shipping_address`, `conditions`, `actions`, ...) are
  `text` — serialize with `JSON.stringify` in the domain, parse in the
  shapes/mappers; never store stringified JSON through GraphQL to the client.
* **Timestamps** are Unix milliseconds: `integer(name, { mode: "timestamp_ms" })`
  with `.default(nowMs)` via the file's `createdAt()` / `updatedAt()` helpers
  (or the `timestampMs` helper directly).
* **Ids** are app-generated UUID `text` primary keys (no DB-side generation).
* **Money** is integer minor units in the row's currency (`totalPrice`,
  `costOfGoods`, gateway/ad amounts ...) — pick one convention (minor units)
  and apply it everywhere; format for display on the frontend.
* **Constrained vocabularies** are tuples in `backend/src/db/enums.ts` plus a
  `check()` constraint generated with the file's `sqlCodeList` helper
  (pattern: `check("ck_...", sql`column in (...)`))`. New vocabularies for
  this module: module code `shoptify` (add to `MODULE_CODES`), plus status
  codes for `shoptify_payouts.payout_status`
  (`SCHEDULED`, `IN_TRANSIT`, `PAID`, `FAILED`), exception reasons, and
  automation triggers.
* Declare foreign keys and query indexes in the table's constraint array
  (`index("idx_...", ...)`, `.references(() => x.id, { onDelete: ... })`).

Tables:

* `shoptify_sessions`: Backing store for the `shopify-api` `SessionStorage`
  adapter (D4). Columns MUST cover every interface method
  (`storeSession`, `loadSession`, `deleteSession`, `deleteSessions`):
  `id` (PK — Shopify session id), `shop`, `state`, `is_online`, `scope`,
  `expires` (nullable timestamp ms), `access_token` (AES-256-GCM encrypted
  offline token), `user_id`, `created_at`, `updated_at`; unique index on
  `(shop, state)` and index on `shop`.

* `shoptify_stores`: `id`, `name`, `shop_domain` (unique), `access_token`
  encrypted at rest, `webhook_secret`, `scopes` (text, webhook-registered
  topics), `currency`, `is_active`, `last_sync_at`, `created_at`, `updated_at`.

* `shoptify_orders`: `id`, `store_id` (FK), `shopify_order_id`,
  `order_number`, `customer_email`, `customer_phone`, `shipping_address`
  (text/JSON), `financial_status`, `fulfillment_status`, `total_price`
  (minor units), `currency`, `tags`, `note`, `has_exception` (boolean),
  `exception_reason`, `shopify_created_at`, `created_at`, `updated_at`;
  unique index on `(store_id, shopify_order_id)`.

* `shoptify_fulfillments`: `id`, `order_id` (FK),
  `shopify_fulfillment_id`, `tracking_company`, `tracking_number`,
  `tracking_url`, `shipment_status`, `created_at`, `updated_at`.

* `shoptify_products` & `shoptify_variants`: variants carry `master_sku`
  (indexed) to synchronize stock levels across stores, plus `cost_of_goods`
  (minor units) for profit calculation; products link `store_id` (FK) and
  `shopify_product_id`.

* `shoptify_customers`: aggregated cross-store records — `id`, `email`,
  `phone`, `total_orders_count`, `total_spent`, `is_blacklisted` (boolean),
  `notes`, `created_at`, `updated_at`.

* `shoptify_payouts` & `shoptify_order_expenses`: payouts track statuses
  (`SCHEDULED`, `IN_TRANSIT`, `PAID`, `FAILED`); order expenses carry the
  per-order profit inputs — `revenue`, `cogs`, `shipping`, `gateway_fee`,
  `ad_spend` (all minor units) — so net profit is
  `revenue - cogs - shipping - gateway_fee - ad_spend`.

* `shoptify_automation_rules`: `id`, `name`, `store_id` (nullable for global
  rules), `trigger_event`, `conditions` (text/JSON), `actions` (text/JSON),
  `is_active` (boolean), `created_at`, `updated_at`.

## 6. Key Technical & Security Specifications

1. **Webhook Verification & 5-Second SLA:**

   * The single receiver is `POST /api/v1/shoptify/webhooks` (mounted in
     `backend/src/index.ts` alongside the existing routes). **Checkpoint: the
     raw body string must be read before any JSON parsing** — verify with a
     bun:test that HMAC validation receives the unparsed body.
   * Validate `X-Shopify-Hmac-Sha256` on the raw body with
     `crypto.timingSafeEqual` (or `shopify.webhooks.validate`).
   * Emit the payload to the typed domain events in
     `backend/src/domain/shoptify/core.ts` and immediately return HTTP
     `200 OK` within < 500ms to prevent Shopify webhook retries. Heavy
     processing (persisting orders, syncing inventory) happens off the request
     path in the domain listener — SQLite has a single writer, so keep the
     receiver read-light and chunk the downstream writes.

2. **Per-Store Rate Limit Management:**

   * Initialize `createAdminApiClient` with `retries: 3` for automatic
     `429`/`503` recovery, and inspect
     `extensions.cost.throttleStatus.currentlyAvailable` per store instance in
     the wrapper at `backend/src/domain/shoptify/core.ts` to proactively delay
     requests when points drop below the configured threshold (default `150`,
     configurable via `AppConfig`).
   * Multi-store batch jobs (bulk fulfillment, catalog sync) issue chunked
     writes — no long-running transactions across stores.

3. **Token Security:**

   * Shopify `access_token` values are encrypted at rest with AES-256-GCM
     (key sourced from `AppConfig` / `.env.example` — never commit `.env`) and
     are **never exposed to the frontend**: no resolver returns the token; any
     secret setting surfaced elsewhere uses the existing `maskSecret` pattern
     from `backend/src/telegram/settings.ts`.
   * All frontend dashboard access goes through authenticated GraphQL
     operations gated by `authorize(ctx, "<operation>")`; the only raw HTTP
     surface of this module is the OAuth callback and the webhook receiver
     above.

## 7. Step-by-Step Implementation Instructions

Implement this module incrementally in the following order (each step lands
tests with its code — see quality gates below):

1. **Step 1 (Registries, Schema & Types):** Extend `backend/src/db/enums.ts`
   (module code `shoptify`, new vocabularies) and create the SQLite
   `shoptify_*` tables in `backend/src/db/schema.ts` (including
   `shoptify_sessions` for the SessionStorage adapter); generate and run the
   migration (quality gates, step g). Write a bun:test for the new check
   constraints and session-table round-trip.

2. **Step 2 (Domain Core):** Implement `backend/src/domain/shoptify/core.ts`
   (shopify-api setup, SessionStorage adapter over `shoptify_sessions`,
   throttle-aware `admin-api-client` wrapper, AES-256-GCM crypto, typed domain
   events), `webhooks.ts` (HMAC handler, topic registration), and the Elysia
   handlers in `backend/src/domain/shoptify/oauth.routes.ts` mounted from
   `backend/src/index.ts` — `GET /api/v1/shoptify/oauth/callback`
   (OAuth handshake + manual Custom App offline-token connect) and
   `POST /api/v1/shoptify/webhooks` (raw body first). Cover with bun:test:
   HMAC accepts/rejects, fast-200 path, session store/load/delete.

3. **Step 3 (GraphQL Surface):** Add `extend type Query/Mutation` blocks for
   the shoptify operations to `backend/src/graphql/schema.ts`, implement the
   resolver maps in `backend/src/graphql/resolvers/shoptify.ts` (every
   operation passing through `authorize(ctx, "<operation>")`; extend the rule
   lists in `backend/src/graphql/access.ts`), and register
   `shoptifyQuery`/`shoptifyMutation` in `backend/src/graphql/resolvers/index.ts`.
   Test with a bun:test resolver test asserting roles and scopes.

4. **Step 4 (Business Domains):** Implement `orders.ts`, `catalog.ts`,
   `customers.ts`, `finance.ts`, `automation.ts` with multi-store filtering
   and bulk mutations (e.g. `fulfillmentCreateV2`). Automation rules are a
   minimal v1: trigger = webhook events, conditions = simple predicates on the
   order row, actions = local writes + a notification row. Wire listeners to
   the typed domain events; heavier rule actions are a later change.

5. **Step 5 (Cross-Cutting Wiring):** Record administrative writes to
   `systemAuditLogs` (module `shoptify`, secrets redacted), raise alerts
   through `domain/notifications.ts` (delivered by the existing Telegram
   engine), publish the touched area on the existing change bus after
   mutations, and route exports through `reports/exports.ts` +
   `exportArtifacts`.

**Frontend subsection** (`shoptify` app):

* Pages under `frontend/src/app/(app)/shoptify/` (stores, orders, catalog,
  customers, finance, automation) and components under
  `frontend/src/components/shoptify/` — follow the conventions of
  `frontend/src/app/(app)/jobs/` and `frontend/src/components/jobs/`.
* Use shadcn + Base UI primitives and Tailwind v4 with the existing tokens;
  the visual theme is IBM Carbon-inspired (see `DESIGN.md`): light canvas,
  IBM Blue accent, flat-square corners, IBM Plex Sans, hairline borders.
* Data access goes through `frontend/src/lib/mes/{client,server,session}.ts`
  and per-module query modules (`frontend/src/lib/mes/queries/shoptify.ts`),
  matching the existing query modules; import messages from
  `frontend/messages/` (next-intl) and add a `shoptify` namespace.
* Register the app in `frontend/src/lib/mes/navigation.ts`
  (`MES_MODULE_CODES`, `MES_APP_ACCESS` with a `shoptify` entry) so Layer-1
  visibility matches the server permission matrix. Suggested access:
  `SUPER_ADMIN`/`TECH_LEAD` = `ALL`, `HR_MANAGER` = `COMPANY_WIDE`,
  `EMPLOYEE` = `PERSONAL`, `DEPT_HEAD` = `HIDDEN` (adjust with stakeholders
  when the permission matrix is decided).
* Live refresh rides the existing `frontend/src/lib/mes/live.tsx` subscription.

**Quality gates (run before every commit):**

a. Biome: `bunx biome check --write` at the repo root (or
   `bun run lint` / `bun run format` inside `frontend/` / `backend/`).
b. Backend unit: `cd backend && bun test` (domain, resolver, route tests).
c. Frontend unit: `cd frontend && bun test src/`.
d. Playwright e2e for new flows: `cd frontend && bun run test:e2e` (requires
   dev servers: frontend on :3000, backend on :3001).
e. Migration: `cd backend && bun run db:generate` (drizzle-kit) then
   `bun run db:migrate`; commit generated migrations.
f. Wrap external calls (Shopify Admin API, notifications) in Sentry spans
   (`sentrySpan`, `@sentry/node`), matching existing backend code.