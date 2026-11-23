import { afterAll, describe, expect, test } from "bun:test";
import { loadConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import { shoptifyStores } from "../../db/schema";
import { createTestDatabase, type TestDatabase } from "../../db/test-db";
import { createShoptifyRoutes } from "./oauth.routes";
import { computeWebhookHmac, createShoptifyEventBus } from "./webhooks";

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

const SHOP = "shop.myshopify.com";
const SECRET = "webhook-secret";

async function setup() {
	return { db: await freshDatabase() };
}

async function seedStore(db: DatabaseHandle) {
	await db.insert(shoptifyStores).values({
		id: crypto.randomUUID(),
		name: "Test Store",
		shopDomain: SHOP,
		accessToken: "encrypted-placeholder",
		webhookSecret: SECRET,
	});
}

function post(body: string, headers: Record<string, string>) {
	return new Request("http://localhost/api/v1/shoptify/webhooks", {
		method: "POST",
		headers,
		body,
	});
}

describe("shoptify webhook route", () => {
	test("answers 200 fast for a valid webhook and publishes once", async () => {
		const { db } = await setup();
		await seedStore(db);
		const events = createShoptifyEventBus();
		const received: unknown[] = [];
		events.on("webhook.orders/create", (event) => {
			received.push(event.payload);
		});
		const app = createShoptifyRoutes({
			db,
			config: loadConfig({ NODE_ENV: "test" }),
			events,
		});

		const body = JSON.stringify({ id: 99, email: "buyer@example.com" });
		const started = performance.now();
		const response = await app.handle(
			post(body, {
				"content-type": "application/json",
				"x-shopify-topic": "orders/create",
				"x-shopify-shop-domain": SHOP,
				"x-shopify-hmac-sha256": computeWebhookHmac(body, SECRET),
			}),
		);
		const elapsed = performance.now() - started;

		expect(response.status).toBe(200);
		expect(elapsed).toBeLessThan(500);
		expect(received).toEqual([{ id: 99, email: "buyer@example.com" }]);
	});

	test("answers 401 for a bad signature with no publish", async () => {
		const { db } = await setup();
		await seedStore(db);
		const events = createShoptifyEventBus();
		let published = 0;
		events.on("webhook.orders/create", () => {
			published += 1;
		});
		const app = createShoptifyRoutes({
			db,
			config: loadConfig({ NODE_ENV: "test" }),
			events,
		});

		const body = JSON.stringify({ id: 99 });
		const response = await app.handle(
			post(body, {
				"content-type": "application/json",
				"x-shopify-topic": "orders/create",
				"x-shopify-shop-domain": SHOP,
				"x-shopify-hmac-sha256": Buffer.from("wrong-sig").toString("base64"),
			}),
		);

		expect(response.status).toBe(401);
		expect(published).toBe(0);
	});

	test("answers 404 for a shop with no connected store", async () => {
		const { db } = await setup();
		const app = createShoptifyRoutes({
			db,
			config: loadConfig({ NODE_ENV: "test" }),
			events: createShoptifyEventBus(),
		});

		const body = "{}";
		const response = await app.handle(
			post(body, {
				"x-shopify-topic": "orders/create",
				"x-shopify-shop-domain": "unknown.myshopify.com",
				"x-shopify-hmac-sha256": Buffer.from("x").toString("base64"),
			}),
		);

		expect(response.status).toBe(404);
	});
});
