/**
 * Shopify webhook intake.
 *
 * Three responsibilities, in this order:
 *
 * 1. **Verify before touching anything.** HMAC-SHA256 over the *raw* request
 *    body against the store's webhook secret, compared with
 *    `crypto.timingSafeEqual`. An unverified payload never reaches the domain.
 * 2. **Answer fast.** Shopify retries any webhook not acknowledged within
 *    ~5 seconds, so the receiver returns HTTP 200 immediately and the data
 *    work runs afterwards on the event bus — never inside the request.
 * 3. **Decouple the data work.** Verified payloads are published as typed
 *    domain events (`webhook.orders/create`, ...); the domains subscribe
 *    (see `orders.ts`, `catalog.ts`) and own the upserts. The receiver stays
 *    read-light, so the acknowledgement never waits on the data work.
 *
 * Webhook topics are registered on store connect (see `oauth.routes.ts`).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DatabaseHandle } from "../../db";
import { shoptifyStores } from "../../db/schema";
import type { ShoptifyWebhookTopic } from "./types";

/** The events this module publishes, with their payload shape. */
export interface ShoptifyEventMap {
	"webhook.orders/create": { shopDomain: string; payload: WebhookPayload };
	"webhook.orders/updated": { shopDomain: string; payload: WebhookPayload };
	"webhook.orders/edited": { shopDomain: string; payload: WebhookPayload };
	"webhook.refunds/create": { shopDomain: string; payload: WebhookPayload };
	"webhook.fulfillments/create": {
		shopDomain: string;
		payload: WebhookPayload;
	};
	"webhook.fulfillments/update": {
		shopDomain: string;
		payload: WebhookPayload;
	};
	"webhook.products/update": { shopDomain: string; payload: WebhookPayload };
	"webhook.inventory_levels/update": {
		shopDomain: string;
		payload: WebhookPayload;
	};
	"webhook.app/uninstalled": { shopDomain: string; payload: WebhookPayload };
}

export type ShoptifyEventName = keyof ShoptifyEventMap;

/** Parsed webhook JSON; unknown shapes live under `payload`. */
export interface WebhookPayload {
	id?: number | string;
	[key: string]: unknown;
}

type Listener<K extends ShoptifyEventName> = (
	event: ShoptifyEventMap[K],
) => void | Promise<void>;

export interface ShoptifyEventBus {
	on<K extends ShoptifyEventName>(event: K, listener: Listener<K>): () => void;
	emit<K extends ShoptifyEventName>(
		event: K,
		payload: ShoptifyEventMap[K],
	): Promise<void>;
}

/** Create the process-local typed bus. One instance per service. */
export function createShoptifyEventBus(): ShoptifyEventBus {
	const listeners = new Map<ShoptifyEventName, Set<Listener<never>>>();
	return {
		on(event, listener) {
			const set = listeners.get(event) ?? new Set();
			set.add(listener as Listener<never>);
			listeners.set(event, set);
			return () => {
				set.delete(listener as Listener<never>);
			};
		},
		async emit(event, payload) {
			// Copy first: a listener that unsubscribes during fan-out must not
			// shift the set under the remaining listeners.
			for (const listener of [...(listeners.get(event) ?? [])]) {
				await listener(payload as never);
			}
		},
	};
}

/**
 * Compute the HMAC Shopify expects for a payload.
 *
 * Base64-encoded SHA-256 of the raw body keyed with the store's webhook
 * secret — the same algorithm Shopify documents for `X-Shopify-Hmac-Sha256`.
 */
export function computeWebhookHmac(rawBody: string, secret: string): string {
	return createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
}

/**
 * Verify a webhook signature against the store's secret.
 *
 * Constant-time comparison via `timingSafeEqual` (equal lengths are required
 * by it, so a length mismatch is a plain rejection, never a crash). The
 * comparison happens on the raw body — JSON parsing would rewrite the bytes
 * and break every signature.
 */
export function verifyWebhookHmac(input: {
	rawBody: string;
	hmacHeader: string | null | undefined;
	secret: string;
}): boolean {
	if (!input.hmacHeader) return false;
	const expected = computeWebhookHmac(input.rawBody, input.secret);
	const provided = input.hmacHeader.trim();
	const expectedBytes = Buffer.from(expected, "base64");
	let providedBytes: Buffer;
	try {
		providedBytes = Buffer.from(provided, "base64");
	} catch {
		return false;
	}
	if (providedBytes.length !== expectedBytes.length) return false;
	// Copy into plain Uint8Arrays: the current lib's ArrayBufferView does not
	// structurally accept node's Buffer type here.
	return timingSafeEqual(
		new Uint8Array(providedBytes),
		new Uint8Array(expectedBytes),
	);
}

/** What the receiver resolved from the HTTP request. */
export interface WebhookIntake {
	/** Look up the active store by its shop domain. */
	resolveStore(shopDomain: string): Promise<{
		id: string;
		webhookSecret: string | null;
	} | null>;
	/** Publish the verified payload onto the domain bus. */
	publish(
		topic: ShoptifyWebhookTopic,
		shopDomain: string,
		payload: WebhookPayload,
	): Promise<void>;
}

export type WebhookOutcome =
	| { status: 200; reason: "acknowledged" }
	| { status: 400; reason: "malformed" }
	| { status: 401; reason: "invalid-signature" }
	| { status: 404; reason: "unknown-store" }
	| { status: 204; reason: "uninteresting-topic" };

/**
 * Intake one webhook request.
 *
 * Order is deliberate: raw body (never JSON) first, then HMAC, then topic
 * resolution, then publish, then 200. The HTTP layer awaits this function
 * only to learn the status — heavy listeners must not block the response,
 * so subscribers are expected to defer their own work (the publisher awaits
 * listeners; see `emit`, whose implementations keep their writes chunked).
 */
export async function intakeWebhook(
	intake: WebhookIntake,
	request: {
		rawBody: string;
		topic: string;
		shopDomain: string | null;
		hmacHeader: string | null;
	},
): Promise<WebhookOutcome> {
	if (!request.shopDomain || !request.topic) {
		return { status: 400, reason: "malformed" };
	}
	const store = await intake.resolveStore(request.shopDomain);
	if (!store) return { status: 404, reason: "unknown-store" };
	if (!store.webhookSecret) return { status: 401, reason: "invalid-signature" };

	if (
		!verifyWebhookHmac({
			rawBody: request.rawBody,
			hmacHeader: request.hmacHeader,
			secret: store.webhookSecret,
		})
	) {
		return { status: 401, reason: "invalid-signature" };
	}

	let payload: WebhookPayload;
	try {
		payload = JSON.parse(request.rawBody) as WebhookPayload;
	} catch {
		return { status: 400, reason: "malformed" };
	}

	if (!SUBSCRIBED_TOPICS.includes(request.topic as ShoptifyWebhookTopic)) {
		return { status: 204, reason: "uninteresting-topic" };
	}

	await intake.publish(
		request.topic as ShoptifyWebhookTopic,
		request.shopDomain,
		payload,
	);

	return { status: 200, reason: "acknowledged" };
}

/** Topics this module registers and processes; anything else is ignored. */
const SUBSCRIBED_TOPICS: readonly ShoptifyWebhookTopic[] = [
	"orders/create",
	"orders/updated",
	"orders/edited",
	"refunds/create",
	"fulfillments/create",
	"fulfillments/update",
	"products/update",
	"inventory_levels/update",
	"app/uninstalled",
];

/** Read the store the webhook is for from Shopify's headers. */
export function webhookHeaders(headers: Headers): {
	topic: string | null;
	shopDomain: string | null;
	hmacHeader: string | null;
} {
	return {
		topic: headers.get("x-shopify-topic"),
		shopDomain: headers.get("x-shopify-shop-domain"),
		hmacHeader: headers.get("x-shopify-hmac-sha256"),
	};
}

/** Load the active store row for a shop domain (adapter over the schema). */
export async function resolveStoreForWebhook(
	db: DatabaseHandle,
	shopDomain: string,
): Promise<{ id: string; webhookSecret: string | null } | null> {
	const [store] = await db
		.select({
			id: shoptifyStores.id,
			webhookSecret: shoptifyStores.webhookSecret,
		})
		.from(shoptifyStores)
		.where(eq(shoptifyStores.shopDomain, shopDomain))
		.limit(1);
	return store ?? null;
}
