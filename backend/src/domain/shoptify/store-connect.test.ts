import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { ConfigurationError, loadConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import { appSettings, shoptifyStores } from "../../db/schema";
import { createTestDatabase, type TestDatabase } from "../../db/test-db";
import { decodeTokenEncryptionKey, decryptToken } from "./core";
import {
	beginOAuth,
	completeOAuth,
	connectManualToken,
	registerStoreWebhooks,
} from "./store-connect";

const open: TestDatabase[] = [];

afterAll(async () => {
	// Closing the generated databases in parallel keeps the teardown well
	// inside the hook timeout under a loaded server.
	await Promise.all(open.map((test) => test.close()));
});

async function freshDatabase(): Promise<DatabaseHandle> {
	const test = await createTestDatabase();
	open.push(test);
	return test.db;
}

const SHOPIFY_ENV = {
	SHOPIFY_API_KEY: "api-key",
	SHOPIFY_API_SECRET: "api-secret",
	SHOPIFY_TOKEN_ENCRYPTION_KEY: "a".repeat(64),
	SHOPIFY_SCOPES: "read_orders,write_orders",
};

async function setup() {
	return {
		db: await freshDatabase(),
		config: loadConfig({ NODE_ENV: "test", ...SHOPIFY_ENV }),
	};
}

const SHOP = "shop.myshopify.com";

describe("beginOAuth", () => {
	test("builds the authorize URL and records the nonce for the shop", async () => {
		const { db, config } = await setup();
		const result = await beginOAuth({ db, config }, SHOP);

		const url = new URL(result.redirectUrl);
		expect(url.origin + url.pathname).toBe(
			`https://${SHOP}/admin/oauth/authorize`,
		);
		expect(url.searchParams.get("client_id")).toBe("api-key");
		expect(url.searchParams.get("scope")).toBe("read_orders,write_orders");
		expect(url.searchParams.get("state")).toBe(result.nonce);
		expect(url.searchParams.get("redirect_uri")).toContain(
			"/api/v1/shoptify/oauth/callback",
		);

		const [state] = await db
			.select()
			.from(appSettings)
			.where(eq(appSettings.key, `oauth_state:${result.nonce}`));
		expect(state?.value).toBe(SHOP);
	});

	test("refuses to begin when commerce is not configured", async () => {
		const { db } = await setup();
		await expect(
			beginOAuth({ db, config: loadConfig({ NODE_ENV: "test" }) }, SHOP),
		).rejects.toThrow(ConfigurationError);
	});
});

describe("completeOAuth", () => {
	test("rejects a state that was not issued for this shop", async () => {
		const { db, config } = await setup();
		await expect(
			completeOAuth(
				{ db, config },
				{ shop: SHOP, state: "never-issued", code: "c" },
			),
		).rejects.toThrow(/state mismatch/i);
	});

	test("exchanges the code, persists the encrypted store, and consumes the nonce once", async () => {
		const { db, config } = await setup();
		const begun = await beginOAuth({ db, config }, SHOP);

		// Minimal Shopify-shaped transport: the token endpoint, then the
		// webhook-registration mutations that follow the store insert.
		const fetchImpl = (async (input: string | URL | Request) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: input.url;
			if (url.includes("/admin/oauth/access_token")) {
				return new Response(
					JSON.stringify({
						access_token: "shpat_live_token",
						scope: "read_orders,write_orders",
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					} as ResponseInit,
				);
			}
			return new Response(
				JSON.stringify({
					data: { webhookSubscriptionCreate: { userErrors: [] } },
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				} as ResponseInit,
			);
		}) as unknown as typeof fetch;

		await completeOAuth(
			{ db, config, fetchImpl },
			{ shop: SHOP, state: begun.nonce, code: "auth-code" },
		);

		const [store] = await db
			.select()
			.from(shoptifyStores)
			.where(eq(shoptifyStores.shopDomain, SHOP));
		expect(store?.isActive).toBe(true);
		expect(store?.accessToken).not.toContain("shpat_live_token");
		const key = decodeTokenEncryptionKey(
			SHOPIFY_ENV.SHOPIFY_TOKEN_ENCRYPTION_KEY,
		);
		expect(decryptToken(store?.accessToken ?? "", key)).toBe(
			"shpat_live_token",
		);
		expect(decryptToken(store?.webhookSecret ?? "", key)).toBe("api-secret");

		const [state] = await db
			.select()
			.from(appSettings)
			.where(eq(appSettings.key, `oauth_state:${begun.nonce}`));
		expect(state).toBeUndefined();

		// A replayed callback with the same nonce is refused.
		await expect(
			completeOAuth(
				{ db, config },
				{ shop: SHOP, state: begun.nonce, code: "auth-code" },
			),
		).rejects.toThrow(/state mismatch/i);
	});
});

describe("connectManualToken", () => {
	test("stores the token when the Admin API accepts it", async () => {
		const { db, config } = await setup();
		// The probe goes through the admin-api-client; stub its transport so
		// the unit test needs no network.
		const fetchImpl = (async (input: string | URL | Request) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: input.url;
			if (url.includes("/admin/oauth/access_token")) {
				return new Response(JSON.stringify({ access_token: "t" }), {
					status: 200,
					headers: { "content-type": "application/json" },
				} as ResponseInit);
			}
			return new Response(
				JSON.stringify({
					data: { shop: { name: "Test Store", currency: "EUR" } },
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				} as ResponseInit,
			);
		}) as unknown as typeof fetch;
		await connectManualToken(
			{ db, config, fetchImpl },
			{ shopDomain: SHOP, accessToken: "shpat_offline_token" },
		);

		const [store] = await db
			.select()
			.from(shoptifyStores)
			.where(eq(shoptifyStores.shopDomain, SHOP));
		expect(store?.name).toBe("Test Store");
		expect(store?.currency).toBe("EUR");
	});
});

describe("registerStoreWebhooks", () => {
	test("registers every subscribed topic and isolates failures", async () => {
		const seen: string[] = [];
		const client = {
			request: async (
				_document: string,
				options?: { variables?: Record<string, unknown> },
			) => {
				const topic = options?.variables?.topic as string;
				seen.push(topic);
				if (topic === "PRODUCTS_UPDATE") {
					return { errors: [{ message: "topic not supported" }] };
				}
				return { data: { webhookSubscriptionCreate: { userErrors: [] } } };
			},
		};

		const result = await registerStoreWebhooks({
			client: client as never,
			callbackUrl: "https://api.example.com/api/v1/shoptify/webhooks",
			topics: ["orders/create", "products/update", "app/uninstalled"],
		});

		expect(seen).toEqual([
			"ORDERS_CREATE",
			"PRODUCTS_UPDATE",
			"APP_UNINSTALLED",
		]);
		expect(result.registered).toEqual(["orders/create", "app/uninstalled"]);
		expect(result.failed).toEqual([
			{ topic: "products/update", error: expect.any(String) },
		]);
	});
});
