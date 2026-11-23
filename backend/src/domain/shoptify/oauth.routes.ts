/**
 * Shopify HTTP surface: the OAuth callback and the webhook receiver.
 *
 * These endpoints are the module's raw HTTP routes — everything else is
 * GraphQL on `/api/v1/graphql`. They are mounted from `backend/src/index.ts`
 * alongside the platform's existing routes (export downloads, file upload,
 * SSE stream, Better Auth), so the module adds no separate route prefix
 * beyond these paths.
 *
 * The webhook receiver reads the raw request body *before* any parsing: HMAC
 * validation happens on those exact bytes (see `webhooks.ts`). Because no
 * Elysia body schema is declared, the framework hands us the untouched
 * `Request` and this file owns the whole body lifecycle.
 */

import { Elysia } from "elysia";
import type { AppConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import { completeOAuth } from "./store-connect";
import {
	intakeWebhook,
	resolveStoreForWebhook,
	type ShoptifyEventBus,
	webhookHeaders,
} from "./webhooks";

export interface ShoptifyRouteDependencies {
	db: DatabaseHandle;
	config: AppConfig;
	/** The typed bus verified payloads are published onto. */
	events: ShoptifyEventBus;
	/** Injectable transport for the token exchange (tests run offline). */
	fetchImpl?: typeof fetch;
}

/**
 * Build the module's routes. Created once per service from the injected
 * dependencies (same pattern as the file/export routes in `index.ts`).
 */
export function createShoptifyRoutes(deps: ShoptifyRouteDependencies) {
	return new Elysia({ name: "mes-shoptify-routes" })
		.post("/api/v1/shoptify/webhooks", async ({ request, set }) => {
			// Raw bytes first — never let a framework parse rewrite them.
			const rawBody = await request.text();
			const headers = webhookHeaders(request.headers);
			const outcome = await intakeWebhook(
				{
					resolveStore: (shopDomain) =>
						resolveStoreForWebhook(deps.db, shopDomain),
					publish: async (topic, shopDomain, payload) => {
						await deps.events.emit(
							`webhook.${topic}` as never,
							{
								shopDomain,
								payload,
							} as never,
						);
					},
				},
				{
					rawBody,
					topic: headers.topic ?? "",
					shopDomain: headers.shopDomain,
					hmacHeader: headers.hmacHeader,
				},
			);
			set.status = outcome.status;
			// A 2xx body stays tiny: Shopify only needs the fast
			// acknowledgement, and an empty body keeps the response fast.
			return outcome.status >= 200 && outcome.status < 300
				? "OK"
				: { error: outcome.reason };
		})
		.get("/api/v1/shoptify/oauth/callback", async ({ query, set }) => {
			// The merchant's browser lands here with the authorization code:
			// the handshake verifies the state nonce, exchanges the code,
			// stores the encrypted token, and registers the webhooks.
			try {
				const result = await completeOAuth(
					{ db: deps.db, config: deps.config, fetchImpl: deps.fetchImpl },
					{
						shop: String(query.shop ?? ""),
						state: String(query.state ?? ""),
						code: String(query.code ?? ""),
						hmac: query.hmac ? String(query.hmac) : undefined,
					},
				);
				set.status = 302;
				set.headers.location = `${deps.config.webOrigin}/shoptify?connected=${encodeURIComponent(result.shopDomain)}`;
				return "";
			} catch (error) {
				set.status = 302;
				set.headers.location = `${deps.config.webOrigin}/shoptify?error=${encodeURIComponent((error as Error).message)}`;
				return "";
			}
		});
}
