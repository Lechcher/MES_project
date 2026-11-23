# Spec Delta

## Purpose

Operates the business's Shopify stores from inside the MES platform: connects stores securely, ingests their orders and catalog data, executes order and fulfillment operations across stores, tracks payouts and net profit, and runs lightweight automation — all under the platform's existing identity, authorization, audit, notification, and live-update services.

## ADDED Requirements

### Requirement: Connect and disconnect Shopify stores
The system SHALL let a permitted user connect a Shopify store either through the OAuth handshake or by manually registering a Custom App offline access token, and SHALL let a permitted user deactivate a connected store. Each connection SHALL record the shop domain, scopes, currency, and last sync time, and a deactivated store SHALL stop receiving webhooks and stop serving store data until reconnected.

#### Scenario: OAuth connect
- **WHEN** a permitted user completes the Shopify OAuth handshake for a store
- **THEN** the store appears as an active connection with its shop domain, scopes, and currency recorded

#### Scenario: Manual offline-token connect
- **WHEN** a permitted user registers a Custom App offline access token for a shop domain
- **THEN** the store appears as an active connection without any OAuth round trip

#### Scenario: Deactivate a store
- **WHEN** a permitted user deactivates a connected store
- **THEN** its webhook processing stops, its orders no longer appear in listings, and historical records remain intact

### Requirement: Protect store credentials at rest and in transit
The system SHALL encrypt stored access tokens and webhook secrets at rest and SHALL never return them through any query, notification, log, or audit record. Credential material SHALL appear in no API response; masked forms MAY be shown where a setting is surfaced.

#### Scenario: Token never returned
- **WHEN** any store listing or detail is requested through the API
- **THEN** the response contains no access token or webhook secret, in any masked-or-plain form beyond a masked indicator, and none is written to logs or audit records

#### Scenario: Webhook secret stays internal
- **WHEN** webhook validation succeeds or fails for a store
- **THEN** the store's webhook secret is not exposed in the response or in the error detail

### Requirement: Verify Shopify webhooks before any processing
The webhook receiver SHALL validate the HMAC signature of every received request against the store's webhook secret using the raw request body, SHALL reject requests with a missing or invalid signature, and SHALL acknowledge a valid request with an HTTP success before doing any data work so Shopify never retries a successfully received event.

#### Scenario: Valid webhook acknowledged quickly
- **WHEN** Shopify delivers a webhook with a valid HMAC signature
- **THEN** the receiver responds with an HTTP 2xx immediately and processes the payload afterward

#### Scenario: Invalid signature rejected
- **WHEN** a webhook arrives with a missing, malformed, or wrong HMAC signature
- **THEN** the receiver rejects it and performs no data change

#### Scenario: Duplicate delivery is harmless
- **WHEN** the same webhook topic and payload identifier arrives twice
- **THEN** the second delivery causes no duplicate order, fulfillment, or inventory change

### Requirement: Ingest orders and refunds from stores
The system SHALL create or update local order records from order webhooks, keyed by store and Shopify order id, SHALL track financial and fulfillment status, tags, and notes, and SHALL record refunds received from store refund webhooks without double-counting.

#### Scenario: New order ingested
- **WHEN** an order-create webhook arrives for an active store
- **THEN** an order record is stored with its identifiers, statuses, totals, currency, and Shopify creation time

#### Scenario: Order update ingested
- **WHEN** an order-update webhook arrives for an existing order
- **THEN** the stored order's statuses, tags, and totals reflect the webhook payload

#### Scenario: Refund recorded once
- **WHEN** a refund webhook arrives for an order
- **THEN** exactly one refund is recorded for that Shopify refund id and the order's financial status reflects it

### Requirement: List and filter orders across stores
The system SHALL provide an order listing that filters by store, financial status, fulfillment status, exception flag, and date range, SHALL paginate results, and SHALL restrict results to the caller's permitted scope.

#### Scenario: Cross-store filtered listing
- **WHEN** a permitted user lists orders filtering by store and unfulfilled status
- **THEN** only matching unfulfilled orders from the selected store are returned, paginated

#### Scenario: Scope enforcement on listing
- **WHEN** a caller without access to a store requests that store's orders
- **THEN** no order data from that store is returned

### Requirement: Manage order annotations and exceptions
The system SHALL let a permitted user set or clear internal notes, tags, and exception flags with a reason on local order records, SHALL record each change in the audit trail, and SHALL never treat an internal annotation as data synced back to Shopify.

#### Scenario: Flag an exception
- **WHEN** a permitted user flags an order as an exception with a reason
- **THEN** the order shows the flag and reason, and an audit event records the change

### Requirement: Fulfill orders in bulk with tracking
The system SHALL create fulfillments with tracking company, tracking number, and tracking URL for multiple orders across stores in one operation, SHALL update each order's fulfillment status and store a fulfillment record per successful order, and SHALL report per-order success or failure so one failed order does not block the rest.

#### Scenario: Bulk fulfillment succeeds
- **WHEN** a permitted user fulfills several open orders with tracking details
- **THEN** each order is fulfilled in its store, its fulfillment status updates, and a fulfillment record with tracking is stored

#### Scenario: Partial failure reported
- **WHEN** one order in a bulk fulfillment fails in its store
- **THEN** the other orders are fulfilled and the operation result names the failed order with its error

### Requirement: Sync catalog and inventory across stores via master SKU
The system SHALL sync products and variants from connected stores, SHALL map variants across stores by `master_sku`, and SHALL let a permitted user change inventory levels or price/status in bulk so a change for one variant applies to every store variant sharing its `master_sku`. A variant falling below its configured minimum SHALL raise a low-stock alert.

#### Scenario: Cross-store stock change
- **WHEN** a permitted user updates the available quantity for a variant with a `master_sku`
- **THEN** every store variant carrying that `master_sku` is updated and the change is recorded per store

#### Scenario: Low stock alert
- **WHEN** a synced variant's available quantity falls below its configured minimum
- **THEN** a low-stock alert is delivered through the platform's notification channel

### Requirement: Aggregate customers across stores
The system SHALL maintain one customer profile per person across stores — keyed by contact identifiers — aggregating order count and total spend, and SHALL let a permitted user mark a profile as blacklisted or high risk with a note, which SHALL be visible wherever that customer's orders are shown.

#### Scenario: Aggregated profile
- **WHEN** orders for the same customer synchronize from two stores
- **THEN** one customer profile shows the combined order count and total spend

#### Scenario: Blacklist visible on orders
- **WHEN** a permitted user blacklists a customer
- **THEN** that customer's orders carry the blacklist indicator in every listing and detail view

### Requirement: Track payouts and compute net profit
The system SHALL track store payouts with their status (scheduled, in transit, paid, failed), SHALL record per-order cost components (cost of goods, shipping, gateway fee, ad spend), and SHALL compute net profit for an order as revenue minus those components, aggregated by store and period.

#### Scenario: Payout status tracked
- **WHEN** a store payout is known to be in transit
- **THEN** the payout appears with its in-transit status, amount, and period

#### Scenario: Net profit computed
- **WHEN** a permitted user records a cost of goods amount, a shipping cost, a gateway fee, and an ad spend for an order
- **THEN** the order's net profit equals revenue minus those components and the store's period total updates

### Requirement: Apply automation rules
The system SHALL store if-condition-then-action rules that are either global or scoped to one store, SHALL let a permitted user create, edit, enable, and disable them, and SHALL evaluate enabled rules against the store events they subscribe to. For this capability a rule action SHALL be limited to writing a local record and raising a notification through the platform's notification channel.

#### Scenario: Rule fires on subscribed event
- **WHEN** an enabled rule subscribes to ingested orders, its condition matches an ingested order, and the order has no prior action from that rule
- **THEN** the rule's local write and notification action execute once for that order

#### Scenario: Disabled rule is inert
- **WHEN** a rule is disabled
- **THEN** it performs no action until it is enabled again

### Requirement: Authorize and audit commerce operations
Every commerce query and mutation SHALL be authorized on the server under the same permission model as the platform's other apps — including the module's access matrix — and every administrative write (store connection, rule change, expense entry, bulk operation) SHALL append an audit event naming the module, actor, resource, and changed fields with secrets redacted.

#### Scenario: Forbidden operation denied
- **WHEN** a caller without commerce access calls a commerce operation directly
- **THEN** the operation is denied and no data changes

#### Scenario: Admin write audited
- **WHEN** a permitted user changes an automation rule
- **THEN** an audit event records the module, actor, resource, and changed fields, with no secret values