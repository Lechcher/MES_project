import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { loadConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import {
	shoptifyFulfillments,
	shoptifyOrders,
	shoptifyRefunds,
	shoptifyStores,
	systemAuditLogs,
	user,
} from "../../db/schema";
import { createTestDatabase, type TestDatabase } from "../../db/test-db";
import { createContext } from "../../graphql/context";
import {
	bulkFulfill,
	getOrder,
	ingestOrderWebhook,
	ingestRefundWebhook,
	listOrders,
	updateOrderFlags,
} from "./orders";
import type { AdminApiClient } from "./types";

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

async function setup() {
	const db = await freshDatabase();
	// The audit trail references `user`; seed the acting admin once per db so
	// the FK holds without the wider seed.
	const adminId = crypto.randomUUID();
	await db.insert(user).values({
		id: adminId,
		name: "Admin",
		email: "admin@example.com",
		userCode: "ADMIN-1",
	});
	return {
		db,
		adminId,
		config: loadConfig({ NODE_ENV: "test" }),
	};
}

async function seedStoreAndOrder(db: DatabaseHandle) {
	const storeId = crypto.randomUUID();
	await db.insert(shoptifyStores).values({
		id: storeId,
		name: "Store",
		shopDomain: "shop.myshopify.com",
		accessToken: "encrypted-token",
	});
	await ingestOrderWebhook(db, {
		shopDomain: "shop.myshopify.com",
		payload: {
			id: 1001,
			name: "#1001",
			email: "buyer@example.com",
			total_price: "59.99",
			currency: "USD",
			financial_status: "paid",
			fulfillment_status: null,
			tags: "urgent,vip",
			created_at: "2026-11-01T10:00:00Z",
		},
	});
	return { storeId };
}

function viewerFor(db: DatabaseHandle, adminId: string) {
	return createContext({
		db,
		config: loadConfig({ NODE_ENV: "test" }),
		request: { ipAddress: null, userAgent: "test" },
		viewer: {
			id: adminId,
			userCode: "ADMIN-1",
			fullName: "Admin",
			email: "admin@example.com",
			departmentId: null,
			isActive: true,
			roleCodes: ["SUPER_ADMIN"],
		},
	});
}

const orderPayload = (id: number, extra: Record<string, unknown> = {}) => ({
	id,
	name: `#${id}`,
	email: "buyer@example.com",
	total_price: "25.00",
	currency: "USD",
	financial_status: "paid",
	fulfillment_status: null,
	created_at: "2026-11-02T09:00:00Z",
	...extra,
});

describe("order ingestion", () => {
	test("ingests an order with minor-unit money and parsed metadata", async () => {
		const { db } = await setup();
		await seedStoreAndOrder(db);
		const [order] = await db.select().from(shoptifyOrders);
		expect(order.shopifyOrderId).toBe("1001");
		expect(order.totalPrice).toBe(5999);
		expect(order.currency).toBe("USD");
		expect(order.tags).toBe("urgent,vip");
		expect(order.shopifyCreatedAt?.getTime()).toBe(
			new Date("2026-11-01T10:00:00Z").getTime(),
		);
	});

	test("a duplicate delivery updates the existing order, never duplicates it", async () => {
		const { db } = await setup();
		await seedStoreAndOrder(db);
		const second = await ingestOrderWebhook(db, {
			shopDomain: "shop.myshopify.com",
			payload: orderPayload(1001, { financial_status: "refunded" }),
		});
		expect(second.created).toBe(false);
		const rows = await db
			.select()
			.from(shoptifyOrders)
			.where(eq(shoptifyOrders.shopifyOrderId, "1001"));
		expect(rows).toHaveLength(1);
		expect(rows[0].financialStatus).toBe("refunded");
	});

	test("records one refund per Shopify refund id", async () => {
		const { db } = await setup();
		await seedStoreAndOrder(db);
		const refundPayload = {
			id: 555,
			order_id: 1001,
			transactions: [{ amount: "10.00", currency: "USD" }],
		};
		const first = await ingestRefundWebhook(db, {
			shopDomain: "shop.myshopify.com",
			payload: refundPayload,
		});
		const second = await ingestRefundWebhook(db, {
			shopDomain: "shop.myshopify.com",
			payload: refundPayload,
		});
		expect(first.created).toBe(true);
		expect(second.created).toBe(false);
		const rows = await db
			.select()
			.from(shoptifyRefunds)
			.where(eq(shoptifyRefunds.shopifyRefundId, "555"));
		expect(rows).toHaveLength(1);
		expect(rows[0].amount).toBe(1000);
	});
});

describe("order listing", () => {
	test("filters by store and fulfillment status", async () => {
		const { db } = await setup();
		await seedStoreAndOrder(db);
		await ingestOrderWebhook(db, {
			shopDomain: "shop.myshopify.com",
			payload: orderPayload(1002),
		});

		const all = await listOrders(db, {}, { offset: 0, limit: 20 });
		expect(all.rows).toHaveLength(2);
		expect(all.totalCount).toBe(2);

		const byNumber = await listOrders(
			db,
			{ search: "#1002" },
			{ offset: 0, limit: 20 },
		);
		expect(byNumber.rows).toHaveLength(1);
		expect(byNumber.rows[0].orderNumber).toBe("#1002");
	});

	test("getOrder returns the shape with empty related collections", async () => {
		const { db } = await setup();
		await seedStoreAndOrder(db);
		const [row] = await db.select().from(shoptifyOrders);
		const order = await getOrder(db, row.id);
		expect(order?.fulfillments).toEqual([]);
		expect(order?.refunds).toEqual([]);
		expect(order?.totalPrice).toBe(5999);
	});
});

describe("updateOrderFlags", () => {
	test("flags an exception and records the audit event", async () => {
		const { db, adminId } = await setup();
		await seedStoreAndOrder(db);
		const [row] = await db.select().from(shoptifyOrders);
		const ctx = viewerFor(db, adminId);

		const updated = await updateOrderFlags(ctx, {
			orderId: row.id,
			tags: ["hold"],
			hasException: true,
			exceptionReason: "FRAUD_RISK",
		});

		expect(updated.hasException).toBe(true);
		expect(updated.exceptionReason).toBe("FRAUD_RISK");
		expect(updated.tags).toEqual(["hold"]);

		const events = await db.select().from(systemAuditLogs);
		expect(events).toHaveLength(1);
		expect(events[0].moduleCode).toBe("shoptify");
		expect(events[0].action).toBe("shoptify.order.flags");
	});

	test("a no-op update writes nothing and records no audit", async () => {
		const { db, adminId } = await setup();
		await seedStoreAndOrder(db);
		const [row] = await db.select().from(shoptifyOrders);
		const ctx = viewerFor(db, adminId);

		const before = await getOrder(db, row.id);
		if (!before) throw new Error("order missing");
		const after = await updateOrderFlags(ctx, { orderId: row.id });
		expect(after).toEqual(before);
		const events = await db.select().from(systemAuditLogs);
		expect(events).toHaveLength(0);
	});
});

describe("bulkFulfill", () => {
	/** A fake Shopify client: open fulfillment order, then a created id. */
	function fakeClient(): AdminApiClient {
		let phase = "lookup";
		return {
			request: async <T>() => {
				if (phase === "lookup") {
					phase = "create";
					return {
						data: {
							order: {
								fulfillmentOrders: {
									edges: [
										{
											node: {
												id: "gid://shopify/FulfillmentOrder/1",
												status: "OPEN",
												lineItems: {
													edges: [
														{
															node: {
																id: "gid://shopify/FulfillmentOrderLineItem/1",
																remainingQuantity: 2,
															},
														},
													],
												},
											},
										},
									],
								},
							},
						},
					} as T;
				}
				return {
					data: {
						fulfillmentCreateV2: {
							fulfillment: { id: "gid://shopify/Fulfillment/9" },
							userErrors: [],
						},
					},
				} as T;
			},
		};
	}

	test("fulfills through an injected client factory", async () => {
		const { db, config } = await setup();
		await seedStoreAndOrder(db);
		const [order] = await db.select().from(shoptifyOrders);

		const result = await bulkFulfill(
			{
				db,
				config,
				clientFactory: () => fakeClient(),
			},
			[{ orderId: order.id, trackingCompany: "DHL", trackingNumber: "JD123" }],
		);

		expect(result.failed).toEqual([]);
		expect(result.succeeded).toEqual([order.id]);

		const [fulfillment] = await db.select().from(shoptifyFulfillments);
		expect(fulfillment.trackingNumber).toBe("JD123");
		expect(fulfillment.shopifyFulfillmentId).toBe(
			"gid://shopify/Fulfillment/9",
		);
		const [stored] = await db
			.select()
			.from(shoptifyOrders)
			.where(eq(shoptifyOrders.id, order.id));
		expect(stored.fulfillmentStatus).toBe("FULFILLED");
	});

	test("a failing order is reported and does not block the rest", async () => {
		const { db, config } = await setup();
		await seedStoreAndOrder(db);
		await ingestOrderWebhook(db, {
			shopDomain: "shop.myshopify.com",
			payload: orderPayload(1002),
		});
		const rows = await db.select().from(shoptifyOrders);

		const result = await bulkFulfill(
			{
				db,
				config,
				clientFactory: () => ({
					request: async <T>() => ({ errors: [{ message: "boom" }] }) as T,
				}),
			},
			rows.map((row) => ({
				orderId: row.id,
				trackingCompany: "DHL",
				trackingNumber: "JD",
			})),
		);

		expect(result.succeeded).toEqual([]);
		expect(result.failed).toHaveLength(2);
		expect(result.failed[0]?.message).toBe("boom");
	});
});
