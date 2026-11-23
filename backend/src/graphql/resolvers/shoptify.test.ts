import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { loadConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import { shoptifyStores, systemAuditLogs, user } from "../../db/schema";
import { createTestDatabase, type TestDatabase } from "../../db/test-db";
import { createContext } from "../context";
import { shoptifyMutation, shoptifyQuery } from "./shoptify";

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

async function setup(
	roleCodes: (
		| "SUPER_ADMIN"
		| "TECH_LEAD"
		| "HR_MANAGER"
		| "EMPLOYEE"
		| "DEPT_HEAD"
	)[],
) {
	const db = await freshDatabase();
	const viewerId = crypto.randomUUID();
	await db.insert(user).values({
		id: viewerId,
		name: "Viewer",
		email: "viewer@example.com",
		userCode: "V-1",
	});
	const ctx = createContext({
		db,
		config: loadConfig({ NODE_ENV: "test" }),
		request: { ipAddress: null, userAgent: "test" },
		viewer: {
			id: viewerId,
			userCode: "V-1",
			fullName: "Viewer",
			email: "viewer@example.com",
			departmentId: null,
			isActive: true,
			roleCodes,
		},
	});
	return { db, ctx, contextValue: { ctx } };
}

describe("shoptify resolver authorization", () => {
	test("a caller without commerce access is denied every read", async () => {
		const { contextValue } = await setup(["EMPLOYEE"]);
		for (const resolver of [
			shoptifyQuery.shoptifyStores,
			shoptifyQuery.shoptifyOrders,
			shoptifyQuery.shoptifyProducts,
			shoptifyQuery.shoptifyCustomers,
			shoptifyQuery.shoptifyPayouts,
			shoptifyQuery.shoptifyAutomationRules,
		]) {
			await expect(resolver(null, {}, contextValue, null)).rejects.toThrow(
				/permission/,
			);
		}
	});

	test("a caller without module access is denied every write", async () => {
		const { contextValue } = await setup(["HR_MANAGER"]);
		for (const [name, resolver] of Object.entries(shoptifyMutation)) {
			await expect(
				resolver(null, argsFor(name), contextValue, null),
			).rejects.toThrow(/permission/);
		}
	});

	test("a granted role reads the commerce surface", async () => {
		const { contextValue, db } = await setup(["TECH_LEAD"]);
		await db.insert(shoptifyStores).values({
			id: crypto.randomUUID(),
			name: "Store",
			shopDomain: "shop.myshopify.com",
			accessToken: "encrypted-token",
		});

		const stores = await shoptifyQuery.shoptifyStores(
			null,
			{},
			contextValue,
			null,
		);
		expect(stores).toHaveLength(1);

		const orders = await shoptifyQuery.shoptifyOrders(
			null,
			{},
			contextValue,
			null,
		);
		expect(orders).toEqual({
			nodes: [],
			pageInfo: { offset: 0, limit: 20, totalCount: 0, hasNextPage: false },
		});
	});

	test("an unauthenticated request is refused before any data is touched", async () => {
		const { db } = await setup(["SUPER_ADMIN"]);
		const config = loadConfig({ NODE_ENV: "test" });
		const contextValue = {
			ctx: createContext({
				db,
				config,
				request: { ipAddress: null, userAgent: "test" },
			}),
		};
		await expect(
			shoptifyQuery.shoptifyStores(null, {}, contextValue, null),
		).rejects.toThrow(/Authentication is required/);
	});

	test("deactivating a store writes an audit event without secrets", async () => {
		const { db, contextValue } = await setup(["SUPER_ADMIN"]);
		const storeId = crypto.randomUUID();
		await db.insert(shoptifyStores).values({
			id: storeId,
			name: "Store",
			shopDomain: "shop.myshopify.com",
			accessToken: "encrypted-token",
			webhookSecret: "encrypted-secret",
		});

		const updated = await shoptifyMutation.shoptifyDeactivateStore(
			null,
			{ storeId },
			contextValue,
			null,
		);
		expect((updated as { isActive: boolean }).isActive).toBe(false);

		const events = await db
			.select()
			.from(systemAuditLogs)
			.where(eq(systemAuditLogs.moduleCode, "shoptify"));
		expect(events).toHaveLength(1);
		expect(events[0].action).toBe("shoptify.store.deactivate");
		// No credential material in the audit payload.
		const payload = JSON.stringify([events[0].oldData, events[0].newData]);
		expect(payload).not.toContain("encrypted-token");
		expect(payload).not.toContain("encrypted-secret");
	});
});

/** Minimal well-formed args per mutation, for the authorization sweep. */
function argsFor(name: string): Record<string, unknown> {
	switch (name) {
		case "shoptifyBeginOAuth":
			return { shopDomain: "shop.myshopify.com" };
		case "shoptifyConnectStore":
			return { input: { shopDomain: "shop.myshopify.com", accessToken: "t" } };
		case "shoptifyDeactivateStore":
			return { storeId: "x" };
		case "shoptifyUpdateOrderFlags":
			return { input: { orderId: "x" } };
		case "shoptifyBulkFulfill":
			return { input: { items: [] } };
		case "shoptifyUpdateVariant":
		case "shoptifySyncInventory":
			return { input: { variantId: "x" }, variantId: "x" };
		case "shoptifySetCustomerFlags":
			return { input: { customerId: "x" } };
		case "shoptifySetOrderExpenses":
			return { input: { orderId: "x", revenue: 0 } };
		case "shoptifyRecordPayout":
			return {
				input: {
					storeId: "x",
					shopifyPayoutId: "p",
					amount: 0,
					currency: "USD",
				},
			};
		case "shoptifySaveRule":
			return { input: { name: "n", triggerEvent: "ORDER_CREATED" } };
		case "shoptifyDeleteRule":
			return { ruleId: "x" };
		default:
			return {};
	}
}
