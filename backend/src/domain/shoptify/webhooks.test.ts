import { describe, expect, test } from "bun:test";
import {
	computeWebhookHmac,
	createShoptifyEventBus,
	intakeWebhook,
	verifyWebhookHmac,
	webhookHeaders,
} from "./webhooks";

const SECRET = "webhook-secret";

function signedRequest(body: string): {
	rawBody: string;
	hmacHeader: string;
} {
	const rawBody = body;
	const hmacHeader = computeWebhookHmac(rawBody, SECRET);
	return { rawBody, hmacHeader };
}

describe("webhook hmac verification", () => {
	test("accepts a signature computed over the raw body", () => {
		const body = JSON.stringify({ id: 1, email: "a@b.c" });
		const { rawBody, hmacHeader } = signedRequest(body);
		expect(verifyWebhookHmac({ rawBody, hmacHeader, secret: SECRET })).toBe(
			true,
		);
	});

	test("rejects a signature over re-serialized JSON (parsed body)", () => {
		const body = JSON.stringify({ id: 1, note: "café" }, null, 0);
		const { hmacHeader } = signedRequest(body);
		// Re-serializing with spacing changes the bytes: a verifier that
		// parsed first would accept this; the raw-body verifier must not.
		const reSerialized = JSON.stringify(JSON.parse(body), null, 2);
		expect(
			verifyWebhookHmac({
				rawBody: reSerialized,
				hmacHeader,
				secret: SECRET,
			}),
		).toBe(false);
	});

	test("rejects a missing header, wrong secret, or garbage header", () => {
		const { rawBody, hmacHeader } = signedRequest("{}");
		expect(
			verifyWebhookHmac({ rawBody, hmacHeader: null, secret: SECRET }),
		).toBe(false);
		expect(verifyWebhookHmac({ rawBody, hmacHeader, secret: "other" })).toBe(
			false,
		);
		expect(
			verifyWebhookHmac({
				rawBody,
				hmacHeader: "not-base64!!",
				secret: SECRET,
			}),
		).toBe(false);
		expect(
			verifyWebhookHmac({
				rawBody,
				hmacHeader: Buffer.from("short").toString("base64"),
				secret: SECRET,
			}),
		).toBe(false);
	});
});

describe("webhookHeaders", () => {
	test("reads Shopify's topic, shop, and hmac headers case-insensitively", () => {
		const headers = new Headers({
			"X-Shopify-Topic": "orders/create",
			"X-Shopify-Shop-Domain": "shop.myshopify.com",
			"X-Shopify-Hmac-Sha256": "sig",
		});
		expect(webhookHeaders(headers)).toEqual({
			topic: "orders/create",
			shopDomain: "shop.myshopify.com",
			hmacHeader: "sig",
		});
	});
});

describe("intakeWebhook", () => {
	test("acknowledges a valid webhook and publishes its payload", async () => {
		const { rawBody, hmacHeader } = signedRequest(JSON.stringify({ id: 42 }));
		const published: unknown[] = [];
		const outcome = await intakeWebhook(
			{
				resolveStore: async () => ({ id: "store-1", webhookSecret: SECRET }),
				publish: async (topic, shopDomain, payload) => {
					published.push({ topic, shopDomain, payload });
				},
			},
			{
				rawBody,
				topic: "orders/create",
				shopDomain: "shop.myshopify.com",
				hmacHeader,
			},
		);
		expect(outcome).toEqual({ status: 200, reason: "acknowledged" });
		expect(published).toEqual([
			{
				topic: "orders/create",
				shopDomain: "shop.myshopify.com",
				payload: { id: 42 },
			},
		]);
	});

	test("rejects a bad signature and publishes nothing", async () => {
		const { rawBody } = signedRequest(JSON.stringify({ id: 42 }));
		const published: unknown[] = [];
		const outcome = await intakeWebhook(
			{
				resolveStore: async () => ({ id: "store-1", webhookSecret: SECRET }),
				publish: async (...args) => {
					published.push(args);
				},
			},
			{
				rawBody,
				topic: "orders/create",
				shopDomain: "shop.myshopify.com",
				hmacHeader: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
			},
		);
		expect(outcome.status).toBe(401);
		expect(published).toEqual([]);
	});

	test("answers 404 for an unknown shop and 400 for malformed JSON", async () => {
		const { rawBody, hmacHeader } = signedRequest("{}");
		const unknown = await intakeWebhook(
			{ resolveStore: async () => null, publish: async () => {} },
			{
				rawBody,
				topic: "orders/create",
				shopDomain: "nope.myshopify.com",
				hmacHeader,
			},
		);
		expect(unknown.status).toBe(404);

		const { rawBody: body, hmacHeader: sig } = signedRequest("not-json");
		const malformed = await intakeWebhook(
			{
				resolveStore: async () => ({ id: "s", webhookSecret: SECRET }),
				publish: async () => {},
			},
			{
				rawBody: body,
				topic: "orders/create",
				shopDomain: "shop.myshopify.com",
				hmacHeader: sig,
			},
		);
		expect(malformed).toEqual({ status: 400, reason: "malformed" });
	});

	test("ignores topics this module does not subscribe to", async () => {
		const { rawBody, hmacHeader } = signedRequest("{}");
		const outcome = await intakeWebhook(
			{
				resolveStore: async () => ({ id: "s", webhookSecret: SECRET }),
				publish: async () => {
					throw new Error("must not publish");
				},
			},
			{
				rawBody,
				topic: "carts/update",
				shopDomain: "shop.myshopify.com",
				hmacHeader,
			},
		);
		expect(outcome).toEqual({ status: 204, reason: "uninteresting-topic" });
	});
});

describe("shoptify event bus", () => {
	test("fans out to subscribers and supports unsubscribe", async () => {
		const bus = createShoptifyEventBus();
		const received: number[] = [];
		const unsubscribe = bus.on("webhook.orders/create", (event) => {
			received.push(event.payload.id as number);
		});

		await bus.emit("webhook.orders/create", {
			shopDomain: "shop.myshopify.com",
			payload: { id: 1 },
		});
		unsubscribe();
		await bus.emit("webhook.orders/create", {
			shopDomain: "shop.myshopify.com",
			payload: { id: 2 },
		});

		expect(received).toEqual([1]);
	});

	test("a listener error does not stop the other listeners' publications", async () => {
		const bus = createShoptifyEventBus();
		const received: number[] = [];
		bus.on("webhook.orders/create", (event) => {
			received.push(event.payload.id as number);
		});
		bus.on("webhook.orders/create", () => {
			throw new Error("boom");
		});
		await expect(
			bus.emit("webhook.orders/create", {
				shopDomain: "s",
				payload: { id: 1 },
			}),
		).rejects.toThrow("boom");
		expect(received).toEqual([1]);
	});
});
