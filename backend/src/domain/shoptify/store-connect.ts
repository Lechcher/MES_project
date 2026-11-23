/**
 * Store connection: OAuth handshake, manual Custom App tokens, and webhook
 * registration.
 *
 * The OAuth handshake is implemented directly against Shopify's documented
 * token endpoints rather than through `shopify-api`'s `auth.begin` /
 * `auth.callback`: those functions are bound to a Node-style request/response
 * pair with signed cookies, while this service runs on Elysia's fetch-style
 * handlers. The flow is the documented one — authorize redirect with a CSRF
 * nonce, verify the nonce on callback, exchange the code for a token — and
 * every step is unit-tested without a browser.
 *
 * The per-store nonce lives in `app_settings` (module `shoptify`) rather than
 * a cookie, so the callback and the redirect can be served by different
 * instances and the state survives a restart.
 */

import { createHmac, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { AppConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import { appSettings, shoptifyStores } from "../../db/schema";
import {
	createStoreClient,
	decodeTokenEncryptionKey,
	encryptToken,
	requireShopifySettings,
} from "./core";
import type { ShoptifyWebhookTopic } from "./types";
import { SHOPTIFY_WEBHOOK_TOPICS } from "./types";

export interface StoreConnectDependencies {
	db: DatabaseHandle;
	config: AppConfig;
	/** Injectable for tests; defaults to global fetch. */
	fetchImpl?: typeof fetch;
}

/** A resolved OAuth begin: where to send the merchant's browser. */
export interface OAuthBegin {
	redirectUrl: string;
	/** The CSRF nonce recorded for this attempt (tests assert it is stored). */
	nonce: string;
}

function stateSettingKey(nonce: string): string {
	return `oauth_state:${nonce}`;
}

/** Absolute URL of this deployment's API base (no trailing slash). */
function apiBaseUrl(
	config: AppConfig,
	shopify: { oauthCallbackUrl: string },
): string {
	if (shopify.oauthCallbackUrl !== "") {
		return shopify.oauthCallbackUrl.replace(
			/\/api\/v1\/shoptify\/oauth\/callback\/?$/,
			"",
		);
	}
	return config.authUrl.replace(/\/+$/, "");
}

/**
 * Begin the OAuth handshake for a shop: issue the nonce, record it, return
 * the authorize URL to redirect the browser to.
 */
export async function beginOAuth(
	deps: StoreConnectDependencies,
	shop: string,
): Promise<OAuthBegin> {
	const shopify = requireShopifySettings(deps.config);
	const nonce = randomBytes(16).toString("hex");
	await deps.db.insert(appSettings).values({
		id: crypto.randomUUID(),
		moduleCode: "shoptify",
		key: stateSettingKey(nonce),
		value: shop,
		isSecret: false,
		description: `OAuth state nonce issued at ${new Date().toISOString()}`,
	});

	const callbackUrl = `${apiBaseUrl(deps.config, shopify)}/api/v1/shoptify/oauth/callback`;
	const query = new URLSearchParams({
		client_id: shopify.apiKey,
		scope: shopify.scopes,
		redirect_uri: callbackUrl,
		state: nonce,
	});
	return {
		redirectUrl: `https://${shop}/admin/oauth/authorize?${query.toString()}`,
		nonce,
	};
}

/**
 * Complete the handshake: verify the nonce, verify Shopify's query HMAC,
 * exchange the code, and persist the store with its webhooks registered.
 */
export async function completeOAuth(
	deps: StoreConnectDependencies,
	query: { shop: string; state: string; code: string; hmac?: string },
): Promise<{ storeId: string; shopDomain: string }> {
	const shopify = requireShopifySettings(deps.config);

	// The nonce must exist, unexpired, and issued for this very shop.
	const [stateRow] = await deps.db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, stateSettingKey(query.state)))
		.limit(1);
	if (!stateRow || stateRow.value !== query.shop) {
		throw new Error("OAuth state mismatch: restart the connection attempt.");
	}
	await deps.db
		.delete(appSettings)
		.where(eq(appSettings.key, stateSettingKey(query.state)));

	// Shopify's callback query HMAC proves the parameters were not tampered
	// with in transit; computed over all query params except `hmac` itself.
	if (query.hmac) {
		const computed = createHmac("sha256", shopify.apiSecretKey)
			.update(oauthCallbackMessage({ ...query, hmac: undefined }))
			.digest("hex");
		if (computed !== query.hmac) {
			throw new Error("OAuth callback HMAC mismatch.");
		}
	}

	const token = await exchangeCodeForToken(deps, query.shop, query.code);
	return persistStoreFromToken(
		deps,
		query.shop,
		token.access_token,
		token.scope,
	);
}

/** The canonical message Shopify's callback HMAC is computed over. */
function oauthCallbackMessage(
	params: Record<string, string | undefined>,
): string {
	return Object.entries(params)
		.filter(
			([key, value]) => key !== "hmac" && value !== undefined && value !== "",
		)
		.map(([key, value]) => `${key}=${value}`)
		.sort()
		.join("");
}

interface TokenResponse {
	access_token: string;
	scope: string;
}

async function exchangeCodeForToken(
	deps: StoreConnectDependencies,
	shop: string,
	code: string,
): Promise<TokenResponse> {
	const shopify = requireShopifySettings(deps.config);
	const fetchImpl = deps.fetchImpl ?? fetch;
	const response = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
		method: "POST",
		headers: { "content-type": "application/json", accept: "application/json" },
		body: JSON.stringify({
			client_id: shopify.apiKey,
			client_secret: shopify.apiSecretKey,
			code,
		}),
	});
	if (!response.ok) {
		throw new Error(
			`Shopify token exchange failed with status ${response.status}.`,
		);
	}
	return (await response.json()) as TokenResponse;
}

/**
 * Connect a store with a manually registered Custom App offline token: the
 * token is verified against the Admin API before anything is stored.
 */
export async function connectManualToken(
	deps: StoreConnectDependencies,
	input: { shopDomain: string; accessToken: string },
): Promise<{ storeId: string; shopDomain: string }> {
	// The credentials check happens in `persistStoreFromToken`; the probe only
	// needs the shop domain and the token being registered.
	const probe = createStoreClient({
		shopDomain: input.shopDomain,
		accessToken: input.accessToken,
		apiVersion: "2026-10",
		fetchImpl: deps.fetchImpl,
	});
	const result = (await probe.request(
		`query ProbeShop { shop { name currency } }`,
	)) as {
		data?: { shop?: { name?: string; currency?: string } };
		errors?: unknown;
	};
	if (result.errors || !result.data?.shop) {
		throw new Error("The offline token was rejected by the Shopify Admin API.");
	}
	return persistStoreFromToken(
		deps,
		input.shopDomain,
		input.accessToken,
		undefined,
		result.data.shop,
	);
}

/**
 * Deactivate a store by its shop domain.
 *
 * Used by the `app/uninstalled` webhook: the store stops serving data but
 * keeps its history and its row (an admin can reconnect it).
 */
export async function deactivateStoreByDomain(
	db: DatabaseHandle,
	shopDomain: string,
): Promise<boolean> {
	const [store] = await db
		.select({ id: shoptifyStores.id })
		.from(shoptifyStores)
		.where(eq(shoptifyStores.shopDomain, shopDomain))
		.limit(1);
	if (!store) return false;
	await db
		.update(shoptifyStores)
		.set({ isActive: false, updatedAt: new Date() })
		.where(eq(shoptifyStores.id, store.id));
	return true;
}

/**
 * Persist the store (encrypting its token) and register its webhooks.
 *
 * Webhooks registered through the Admin API are signed with the app's API
 * secret, so that is what the store row records as its webhook secret —
 * encrypted like the access token.
 */
export async function persistStoreFromToken(
	deps: StoreConnectDependencies,
	shopDomain: string,
	accessToken: string,
	scope: string | undefined,
	shopInfo?: { name?: string; currency?: string },
): Promise<{ storeId: string; shopDomain: string }> {
	const shopify = requireShopifySettings(deps.config);
	const key = decodeTokenEncryptionKey(shopify.tokenEncryptionKey);

	// Read-after-write so reconnecting an existing store returns its real id
	// (an `onConflictDoUpdate` keeps the original row's id).
	const [existing] = await deps.db
		.select({ id: shoptifyStores.id })
		.from(shoptifyStores)
		.where(eq(shoptifyStores.shopDomain, shopDomain))
		.limit(1);

	await deps.db
		.insert(shoptifyStores)
		.values({
			id: existing?.id ?? crypto.randomUUID(),
			name: shopInfo?.name ?? shopDomain,
			shopDomain,
			accessToken: encryptToken(accessToken, key),
			webhookSecret: encryptToken(shopify.apiSecretKey, key),
			scopes: scope ?? null,
			currency: shopInfo?.currency ?? "USD",
			isActive: true,
		})
		.onConflictDoUpdate({
			target: shoptifyStores.shopDomain,
			set: {
				name: shopInfo?.name ?? undefined,
				accessToken: encryptToken(accessToken, key),
				webhookSecret: encryptToken(shopify.apiSecretKey, key),
				scopes: scope ?? null,
				isActive: true,
				updatedAt: new Date(),
			},
		});

	const [storeRow] = await deps.db
		.select({ id: shoptifyStores.id })
		.from(shoptifyStores)
		.where(eq(shoptifyStores.shopDomain, shopDomain))
		.limit(1);
	const storeId = storeRow?.id ?? "";

	const client = createStoreClient({
		shopDomain,
		accessToken,
		apiVersion: "2026-10",
		fetchImpl: deps.fetchImpl,
	});
	await registerStoreWebhooks({
		client,
		callbackUrl: `${apiBaseUrl(deps.config, shopify)}/api/v1/shoptify/webhooks`,
		topics: SHOPTIFY_WEBHOOK_TOPICS as readonly ShoptifyWebhookTopic[],
	});

	return { storeId, shopDomain };
}

/**
 * Register the module's webhook topics for one store.
 *
 * Failures are collected per topic: one unsupported topic must not abort the
 * rest of the registration.
 */
export async function registerStoreWebhooks(options: {
	client: ReturnType<typeof createStoreClient>;
	callbackUrl: string;
	topics: readonly ShoptifyWebhookTopic[];
}): Promise<{
	registered: string[];
	failed: { topic: string; error: string }[];
}> {
	const registered: string[] = [];
	const failed: { topic: string; error: string }[] = [];

	for (const topic of options.topics) {
		try {
			const response = (await options.client.request(
				`mutation RegisterWebhook($topic: WebhookSubscriptionTopic!, $url: URL!) {
					webhookSubscriptionCreate(topic: $topic, webhookSubscription: { callbackUrl: $url, format: JSON }) {
						webhookSubscription { id }
						userErrors { field message }
					}
				}`,
				{
					variables: {
						topic: topic.toUpperCase().replace("/", "_"),
						url: options.callbackUrl,
					},
				},
			)) as {
				errors?: unknown;
				data?: {
					webhookSubscriptionCreate?: { userErrors?: { message: string }[] };
				};
			};
			if (response.errors) throw new Error("GraphQL errors returned");
			const userErrors =
				response.data?.webhookSubscriptionCreate?.userErrors ?? [];
			if (userErrors.length > 0) {
				throw new Error(userErrors.map((e) => e.message).join("; "));
			}
			registered.push(topic);
		} catch (error) {
			failed.push({ topic, error: (error as Error).message });
		}
	}

	return { registered, failed };
}
