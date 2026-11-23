# Spec Delta

## Purpose

The in-platform dashboard for the Shopify multi-store module: role-gated entry into store connection, a cross-store order board with bulk fulfillment, catalog and inventory management keyed by master SKU, customer profiles, a finance view over payouts and net profit, and automation rule management — all in the platform's DESIGN.md theme with live refresh and exports.

## ADDED Requirements

### Requirement: Reach the shoptify app only with commerce access
The shoptify app SHALL appear in the dashboard launcher, the top navigation, and the app switcher only for roles granted commerce access by the platform's permission matrix, and its routes SHALL be unreachable for viewers without that access.

#### Scenario: No entry without access
- **WHEN** a viewer whose role has no commerce access opens the dashboard and the top navigation
- **THEN** no shoptify entry appears in either, and opening a shoptify route directly redirects to sign-in or an access-denied state

#### Scenario: Entry with access
- **WHEN** a viewer whose role has commerce access opens the dashboard
- **THEN** the shoptify entry appears with its name and description, and its route opens the stores overview

### Requirement: Manage store connections from the app
The stores overview SHALL list every connected store with its connection status, currency, and last sync time, and SHALL provide the connect and deactivate actions available to the viewer's role. It SHALL never display token or secret values, and a connect action SHALL start either the OAuth handshake or the manual offline-token registration.

#### Scenario: Stores overview
- **WHEN** a permitted viewer opens the shoptify app
- **THEN** each connected store is listed with status, currency, and last sync time, and no credential values are shown

#### Scenario: Start OAuth connect
- **WHEN** a permitted viewer starts the connect action for a new store
- **THEN** the app leads into the Shopify OAuth handshake and shows the outcome after the callback completes

### Requirement: Operate orders across stores in one board
The orders view SHALL show a unified list across the viewer's permitted stores with filters for store, financial status, fulfillment status, exception flag, and date range, SHALL show each order's state and identifiers, and SHALL expose order detail with fulfillment and refund history.

#### Scenario: Filtered cross-store board
- **WHEN** a permitted viewer filters the board by one store and open orders
- **THEN** only matching open orders for that store are shown, paginated

#### Scenario: Order detail
- **WHEN** a permitted viewer opens an order
- **THEN** its totals, customer, addresses, annotations, fulfillment history, and refund history are shown

### Requirement: Fulfill orders in bulk with tracking
The orders view SHALL let a permitted viewer select multiple open orders across stores and submit one fulfillment with tracking company, tracking number, and tracking URL, SHALL show per-order results including failures, and SHALL refresh the affected rows when the operation completes.

#### Scenario: Bulk fulfillment from the board
- **WHEN** a permitted viewer selects several open orders and submits tracking details
- **THEN** each order's row shows the fulfillment outcome, failures name their order and error, and successful rows update without a manual page reload

### Requirement: Manage catalog and cross-store inventory
The catalog view SHALL list synced products and variants with their store, price, and available quantity, SHALL group variants by `master_sku`, and SHALL let a permitted viewer update quantity, price, and status in bulk for one variant so every store variant sharing its `master_sku` is affected. Low-stock variants SHALL be visually flagged.

#### Scenario: Bulk update by master SKU
- **WHEN** a permitted viewer updates the quantity of a variant group
- **THEN** every variant row in that group updates and a low-stock flag appears on any variant below its minimum

### Requirement: Review cross-store customers
The customers view SHALL list aggregated customer profiles with order count and total spend, and the profile SHALL show that customer's orders across stores, with blacklist and high-risk indicators wherever the profile appears.

#### Scenario: Customer profile with blacklist flag
- **WHEN** a permitted viewer opens a customer profile marked blacklisted
- **THEN** the profile shows the blacklist indicator and all the customer's cross-store orders

### Requirement: Review finance: payouts, costs, and net profit
The finance view SHALL show payouts with status, amount, and period, SHALL let a permitted viewer record per-order cost components (cost of goods, shipping, gateway fee, ad spend), and SHALL show net profit per order and aggregated by store and period.

#### Scenario: Record costs and see net profit
- **WHEN** a permitted viewer records cost components for an order
- **THEN** the order's net profit appears immediately and the store's period total reflects it

### Requirement: Manage automation rules
The automation view SHALL list stored rules with their scope (global or per store), trigger event, and enabled state, and SHALL let a permitted viewer create, edit, enable, and disable rules. Each rule SHALL state its trigger event, its conditions, and its actions, and the app SHALL show the actions this version supports only.

#### Scenario: Enable a rule
- **WHEN** a permitted viewer saves a rule with a valid trigger, conditions, and actions and enables it
- **THEN** the rule appears in the list as enabled and its next matching event performs its actions once

### Requirement: Keep commerce screens current and exportable
Commerce listing views SHALL refresh in place from the platform's live update signal without a manual reload, and the order and catalog listings SHALL offer the platform's spreadsheet and PDF export entry points, producing the same artifacts and download route the platform's other apps use.

#### Scenario: Live refresh
- **WHEN** a commerce mutation succeeds anywhere (including webhook ingestion)
- **THEN** the viewer's open commerce listing refreshes in place, without a manual reload

#### Scenario: Export orders
- **WHEN** a permitted viewer exports the current order listing
- **THEN** a spreadsheet or PDF artifact of the filtered listing is produced and downloadable through the platform's export route