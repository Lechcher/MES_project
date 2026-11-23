/**
 * Webhook fan-out: verified Shopify payloads → domain listeners.
 *
 * The receiver (`webhooks.ts`) only validates, acknowledges, and publishes;
 * this module subscribes to that typed bus and performs the data work in
 * chunks — the ingestion itself stays fast and idempotent (each domain
 * function keys its writes on Shopify resource identifiers).
 *
 * Wiring happens once per service (see `bootstrap`); the listeners are plain
 * functions, so tests subscribe their own bus without the HTTP layer.
 */

import type { AppConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import { evaluateRules } from "./automation";
import { ingestProductWebhook } from "./catalog";
import { refreshCustomerForOrder } from "./customers";
import { ingestOrderWebhook, ingestRefundWebhook } from "./orders";
import { deactivateStoreByDomain } from "./store-connect";
import type { ShoptifyEventBus } from "./webhooks";

/**
 * Subscribe every domain listener to the module's webhook bus.
 * Returns the unsubscribe handles (tests tear them down).
 */
export function wireShoptifySubscriptions(
	events: ShoptifyEventBus,
	db: DatabaseHandle,
	config?: AppConfig,
): (() => void)[] {
	const unsubscribes: (() => void)[] = [];

	const onOrders = async (
		topic: string,
		shopDomain: string,
		payload: Record<string, unknown>,
	) => {
		const { orderId } = await ingestOrderWebhook(db, { shopDomain, payload });
		if (orderId === "") return;
		await refreshCustomerForOrder(db, {
			email: typeof payload.email === "string" ? payload.email : null,
			phone: typeof payload.phone === "string" ? payload.phone : null,
			orderTotal: 0,
		});
		await evaluateRules(
			db,
			{
				trigger: topic === "orders/create" ? "ORDER_CREATED" : "ORDER_UPDATED",
				storeId: null,
				eventKey: `${topic}:${String(payload.id ?? "")}`,
				row: payload,
				orderId,
			},
			{ config },
		);
	};

	unsubscribes.push(
		events.on("webhook.orders/create", (event) =>
			onOrders("orders/create", event.shopDomain, event.payload),
		),
	);
	unsubscribes.push(
		events.on("webhook.orders/updated", (event) =>
			onOrders("orders/updated", event.shopDomain, event.payload),
		),
	);
	unsubscribes.push(
		events.on("webhook.orders/edited", (event) =>
			onOrders("orders/edited", event.shopDomain, event.payload),
		),
	);
	unsubscribes.push(
		events.on("webhook.refunds/create", async (event) => {
			await ingestRefundWebhook(db, {
				shopDomain: event.shopDomain,
				payload: event.payload,
			});
			await evaluateRules(
				db,
				{
					trigger: "REFUND_CREATED",
					storeId: null,
					eventKey: `refunds/create:${String(event.payload.id ?? "")}`,
					row: event.payload,
				},
				{ config },
			);
		}),
	);
	unsubscribes.push(
		events.on("webhook.products/update", async (event) => {
			await ingestProductWebhook(db, {
				shopDomain: event.shopDomain,
				payload: event.payload,
			});
		}),
	);
	unsubscribes.push(
		events.on("webhook.app/uninstalled", async (event) => {
			// The store is deactivated locally; history is kept.
			await deactivateStoreByDomain(db, event.shopDomain);
		}),
	);

	return unsubscribes;
}
