# Engineering Prompt: Shopify Multi-Store Management Module (`shoptify-commerce`)

## 1. Context & Objective

Build a centralized **Shopify Multi-Store Order Management & Operations Module** (`shoptify-commerce`) inside an existing TypeScript backend (Modular Monolith architecture using **PostgreSQL** and **Drizzle ORM**). The system must allow administrators and staff to connect multiple Shopify stores (via OAuth or Custom App offline tokens), receive real-time order/inventory updates via Webhooks, manage and fulfill orders in bulk across stores, track net profit, and automate alerts.

## 2. Tech Stack & Official SDK Integration

* **Runtime & ORM:** TypeScript, PostgreSQL, Drizzle ORM.

* **Official Shopify Packages:**

  * `@shopify/admin-api-client`: Use `createAdminApiClient` as the lightweight, strongly-typed GraphQL Admin API client for all data operations (built-in automatic retries on `429`/`503` errors and TypeScript query typing).

  * `@shopify/shopify-api`: Use strictly for the OAuth 2.0 handshake, webhook registration, and HMAC signature validation (`shopify.webhooks.validate`). Do **NOT** use `@shopify/shopify-app-remix` or embedded App Bridge packages since this is an external standalone multi-store dashboard.

  * `@shopify/shopify-app-session-storage-drizzle`: Use `DrizzleSessionStorage` backed by PostgreSQL to persist OAuth offline sessions/tokens cleanly.

* **Proactive Rate Limit Wrapper:** Wrap `createAdminApiClient` inside `core/shoptify.client.ts` to inspect `extensions.cost.throttleStatus` and proactively pause/back-off when available points drop below threshold during multi-store batch jobs.

## 3. Architectural Constraints (CRITICAL)

1. **Hierarchical Umbrella Module:** Everything must be encapsulated inside a single parent module directory `src/modules/shoptify-commerce/` and exposed via a single public entry point (`index.ts`) and unified API route prefix (`/api/shoptify/*`).

2. **Strict Sub-module Separation:** Inside `shoptify-commerce/`, organize code into isolated domain sub-modules:

   * `core/`: `@shopify/shopify-api` & `DrizzleSessionStorage` setup, `@shopify/admin-api-client` wrapper (`shoptify.client.ts`), AES-256 token encryption, Webhook HMAC handler, and internal typed `EventBus`.

   * `orders/`: Unified multi-store order listing, order editing, bulk fulfillment/tracking updates, exception flagging, and refunds.

   * `catalog/`: Product syncing, bulk price/status updates, and real-time cross-store inventory synchronization mapped via `master_sku`.

   * `customers/`: 360° cross-store customer profiles, abandoned checkouts, and high-risk/blacklist customer flagging.

   * `finance/`: Shopify Payments/Stripe payout tracking, dispute monitoring, COGS/ad-spend input, and net profit calculation.

   * `automation/`: Rule engine (`If-Condition-Then-Action`) and real-time notifications (Telegram Bot / WebSockets).

3. **Decoupled Communication:** Sub-modules must NOT directly import services or query database tables belonging to other sub-modules. Cross-domain side effects must happen asynchronously via `shoptifyEventBus` (e.g., `webhook.orders/create`, `order.synced`, `stock.low`).

4. **GraphQL Only:** Use the **Shopify GraphQL Admin API** (version `2026-01` or latest stable) via `@shopify/admin-api-client` instead of the deprecated REST Admin API.

## 4. Directory Structure

Generate the module following this exact folder layout:

```
src/modules/shoptify-commerce/
├── core/
│   ├── shopify.sdk.ts           # @shopify/shopify-api & DrizzleSessionStorage initialization
│   ├── shoptify.client.ts       # @shopify/admin-api-client wrapper with throttleStatus back-off
│   ├── crypto.service.ts        # AES-256-GCM encryption/decryption for stored access tokens
│   ├── webhook.handler.ts       # Raw-body HMAC verification & fast 200 OK response
│   ├── event-bus.ts             # Strongly-typed internal EventEmitter
│   └── core.routes.ts           # OAuth callbacks, manual store connection, webhook registration
├── orders/
│   ├── order.service.ts
│   ├── fulfillment.service.ts
│   └── order.routes.ts
├── catalog/
│   ├── product.service.ts
│   ├── inventory.service.ts
│   └── catalog.routes.ts
├── customers/
│   ├── customer.service.ts
│   └── customer.routes.ts
├── finance/
│   ├── payout.service.ts
│   ├── profit.service.ts
│   └── finance.routes.ts
├── automation/
│   ├── rule-engine.service.ts
│   ├── notifier.service.ts
│   └── automation.routes.ts
├── db/
│   └── schema.ts                # Drizzle PostgreSQL schema with `shoptify_` table prefix
├── shared/
│   └── types.ts
├── routes.ts                    # Aggregates all sub-routers under /api/shoptify
└── index.ts                     # Single public export file for the host application

```

## 5. Database Schema Requirements (Drizzle PostgreSQL)

All database tables MUST use the `shoptify_` prefix:

* `shoptify_sessions`: Standard Drizzle session table required by `@shopify/shopify-app-session-storage-drizzle` (`id`, `shop`, `state`, `isOnline`, `scope`, `expires`, `accessToken`, `userId`, etc.).

* `shoptify_stores`: `id`, `name`, `shop_domain` (unique), `access_token` (AES-256 encrypted offline token), `webhook_secret`, `currency`, `is_active`, `last_sync_at`, `created_at`.

* `shoptify_orders`: `id`, `store_id` (FK), `shopify_order_id`, `order_number`, `customer_email`, `customer_phone`, `shipping_address` (JSONB), `financial_status`, `fulfillment_status`, `total_price`, `currency`, `tags`, `note`, `has_exception` (boolean), `exception_reason`, `shopify_created_at`, `updated_at`.

* `shoptify_fulfillments`: `id`, `order_id` (FK), `shopify_fulfillment_id`, `tracking_company`, `tracking_number`, `tracking_url`, `shipment_status`, `created_at`.

* `shoptify_products` & `shoptify_variants`: Include `master_sku` (indexed) on variants to synchronize stock levels across multiple stores, plus `cost_of_goods` (COGS) for profit calculation.

* `shoptify_customers`: Aggregated cross-store customer records (`email`, `phone`, `total_orders_count`, `total_spent`, `is_blacklisted`, `notes`).

* `shoptify_payouts` & `shoptify_order_expenses`: Track payout statuses (`SCHEDULED`, `IN_TRANSIT`, `PAID`, `FAILED`) and per-order net profit (`revenue - cogs - shipping - gateway_fee - ad_spend`).

* `shoptify_automation_rules`: `id`, `name`, `store_id` (nullable for global rules), `trigger_event`, `conditions` (JSONB), `actions` (JSONB), `is_active`.

## 6. Key Technical & Security Specifications

1. **Webhook Verification & 5-Second SLA:**

   * Extract the unparsed `rawBody` string before JSON parsing to validate `X-Shopify-Hmac-Sha256` (either via `shopify.webhooks.validate` or `crypto.timingSafeEqual`).

   * Emit the payload to `shoptifyEventBus` via `queueMicrotask` and immediately return HTTP `200 OK` within < 500ms to prevent Shopify webhook retries.

2. **Per-Store Rate Limit Management:**

   * Initialize `createAdminApiClient` with `retries: 3` for automatic `429`/`503` recovery, and inspect `extensions.cost.throttleStatus.currentlyAvailable` per store instance in `ShoptifyGraphQLClient` to proactively delay requests when points drop below `150`.

3. **Token Security:**

   * Never expose Shopify `access_token` values to the frontend client. All frontend dashboard requests must go through `/api/shoptify/*` endpoints with RBAC checks.

   * Encrypt `access_token` at rest using AES-256-GCM before saving to `shoptify_stores`.

## 7. Step-by-Step Implementation Instructions

Please implement this module incrementally in the following order:

1. **Step 1 (Database & Types):** Create PostgreSQL `db/schema.ts` (including `shoptify_sessions` for DrizzleSessionStorage) and `shared/types.ts`.

2. **Step 2 (Core Infrastructure):** Implement `shopify.sdk.ts`, `crypto.service.ts`, `event-bus.ts`, `shoptify.client.ts` (wrapping `@shopify/admin-api-client`), `webhook.handler.ts`, and `core.routes.ts` (supporting both OAuth flow and manual Custom App token connection + automatic webhook registration).

3. **Step 3 (Orders & Fulfillment):** Implement `order.service.ts`, `fulfillment.service.ts`, and `order.routes.ts` with multi-store filtering and bulk fulfillment mutations (`fulfillmentCreateV2`).

4. **Step 4 (Catalog, Customers, Finance & Automation):** Implement the remaining sub-modules and wire all listeners to `shoptifyEventBus`.

5. **Step 5 (Module Entrypoint):** Wire everything cleanly in `routes.ts` and `index.ts`.