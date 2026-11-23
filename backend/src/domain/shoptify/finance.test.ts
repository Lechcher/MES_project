import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { loadConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import {
	shoptifyOrderExpenses,
	shoptifyOrders,
	shoptifyPayouts,
	shoptifyStores,
	systemAuditLogs,
	user,
} from "../../db/schema";
import { createTestDatabase, type TestDatabase } from "../../db/test-db";
import { createContext } from "../../graphql/context";
import {
	financeSummary,
	listPayouts,
	recordPayout,
	setOrderExpenses,
} from "./finance";
import { ingestOrderWebhook } from "./orders";

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
	const adminId = crypto.randomUUID();
	await db.insert(user).values({
		id: adminId,
		name: "Admin",
		email: "admin@example.com",
		userCode: "ADMIN-1",
	});
	const config = loadConfig({ NODE_ENV: "test" });
	return {
		db,
		adminId,
		config,
		ctx: createContext({
			db,
			config,
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
		}),
	};
}

async function seedStoreAndOrder(db: DatabaseHandle) {
	await db.insert(shoptifyStores).values({
		id: crypto.randomUUID(),
		name: "Store",
		shopDomain: "shop.myshopify.com",
		accessToken: "encrypted-token",
	});
	await ingestOrderWebhook(db, {
		shopDomain: "shop.myshopify.com",
		payload: {
			id: 300,
			email: "buyer@example.com",
			total_price: "100.00",
			currency: "USD",
			created_at: "2026-11-05T00:00:00Z",
		},
	});
	const [order] = await db.select().from(shoptifyOrders);
	return { orderId: order.id };
}

describe("order expenses", () => {
	test("net profit is revenue minus the recorded components", async () => {
		const { db, ctx } = await setup();
		const { orderId } = await seedStoreAndOrder(db);

		const order = await setOrderExpenses(ctx, {
			orderId,
			revenue: 10000,
			cogs: 3000,
			shipping: 800,
			gatewayFee: 290,
			adSpend: 1500,
		});

		expect(order.netProfit).toBe(4410);
		const [row] = await db
			.select()
			.from(shoptifyOrderExpenses)
			.where(eq(shoptifyOrderExpenses.orderId, orderId));
		expect(row.netProfit).toBe(4410);

		const events = await db.select().from(systemAuditLogs);
		expect(events).toHaveLength(1);
		expect(events[0].action).toBe("shoptify.order.expenses");
	});

	test("a second submission replaces the components, not accumulates them", async () => {
		const { db, ctx } = await setup();
		const { orderId } = await seedStoreAndOrder(db);
		await setOrderExpenses(ctx, { orderId, revenue: 10000, cogs: 3000 });
		const order = await setOrderExpenses(ctx, {
			orderId,
			revenue: 10000,
			cogs: 4000,
		});
		expect(order.netProfit).toBe(6000);
		const rows = await db.select().from(shoptifyOrderExpenses);
		expect(rows).toHaveLength(1);
	});
});

describe("payouts", () => {
	test("records a payout with its lifecycle status and updates it", async () => {
		const { db, ctx } = await setup();
		const [store] = await db
			.insert(shoptifyStores)
			.values({
				id: crypto.randomUUID(),
				name: "Store",
				shopDomain: "pay.myshopify.com",
				accessToken: "encrypted-token",
			})
			.returning();

		const payout = await recordPayout(ctx, {
			storeId: store.id,
			shopifyPayoutId: "gid://shopify/PaymentPayout/1",
			amount: 500000,
			currency: "USD",
			status: "IN_TRANSIT",
			payoutDate: new Date("2026-11-20T00:00:00Z"),
		});
		expect(payout.status).toBe("IN_TRANSIT");
		expect(payout.amount).toBe(500000);

		await recordPayout(ctx, {
			storeId: store.id,
			shopifyPayoutId: "gid://shopify/PaymentPayout/1",
			amount: 500000,
			currency: "USD",
			status: "PAID",
		});

		const rows = await db.select().from(shoptifyPayouts);
		expect(rows).toHaveLength(1);
		expect(rows[0].status).toBe("PAID");

		const listed = await listPayouts(db, store.id, { offset: 0, limit: 20 });
		expect(listed.rows).toHaveLength(1);
		expect(listed.totalCount).toBe(1);
	});

	test("rejects an unknown payout status", async () => {
		const { db, ctx } = await setup();
		const [store] = await db
			.insert(shoptifyStores)
			.values({
				id: crypto.randomUUID(),
				name: "Store",
				shopDomain: "bad.myshopify.com",
				accessToken: "encrypted-token",
			})
			.returning();
		await expect(
			recordPayout(ctx, {
				storeId: store.id,
				shopifyPayoutId: "x",
				amount: 1,
				currency: "USD",
				status: "NOT_A_STATUS",
			}),
		).rejects.toThrow(/Unknown payout status/);
	});
});

describe("finance summary", () => {
	test("aggregates profit components and payout statuses for a store", async () => {
		const { db, ctx } = await setup();
		const { orderId } = await seedStoreAndOrder(db);
		await setOrderExpenses(ctx, {
			orderId,
			revenue: 20000,
			cogs: 8000,
			shipping: 500,
			gatewayFee: 580,
			adSpend: 2000,
		});
		const [store] = await db.select().from(shoptifyStores);
		await recordPayout(ctx, {
			storeId: store.id,
			shopifyPayoutId: "p1",
			amount: 10000,
			currency: "USD",
			status: "SCHEDULED",
		});

		const summary = await financeSummary(db, { storeId: store.id });
		expect(summary.revenue).toBe(20000);
		expect(summary.cogs).toBe(8000);
		expect(summary.netProfit).toBe(8920);
		expect(summary.orderCount).toBe(1);
		expect(summary.payoutsByStatus.SCHEDULED).toEqual({
			count: 1,
			amount: 10000,
		});
	});
});
