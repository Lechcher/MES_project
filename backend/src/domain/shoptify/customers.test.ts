import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { loadConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import {
	shoptifyCustomers,
	shoptifyOrders,
	shoptifyStores,
	systemAuditLogs,
	user,
} from "../../db/schema";
import { createTestDatabase, type TestDatabase } from "../../db/test-db";
import { createContext } from "../../graphql/context";
import {
	listCustomers,
	refreshCustomerForOrder,
	setCustomerFlags,
} from "./customers";
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
	return { db, adminId, config: loadConfig({ NODE_ENV: "test" }) };
}

/** Two stores, each with one order for the same buyer. */
async function seedSameBuyerTwoStores(db: DatabaseHandle) {
	for (const domain of ["store-a.myshopify.com", "store-b.myshopify.com"]) {
		await db.insert(shoptifyStores).values({
			id: crypto.randomUUID(),
			name: domain,
			shopDomain: domain,
			accessToken: "encrypted-token",
		});
	}
	await ingestOrderWebhook(db, {
		shopDomain: "store-a.myshopify.com",
		payload: {
			id: 100,
			email: "buyer@example.com",
			total_price: "30.00",
			currency: "USD",
			created_at: "2026-11-01T00:00:00Z",
		},
	});
	await ingestOrderWebhook(db, {
		shopDomain: "store-b.myshopify.com",
		payload: {
			id: 200,
			email: "buyer@example.com",
			total_price: "45.50",
			currency: "USD",
			created_at: "2026-11-03T00:00:00Z",
		},
	});
}

describe("customer aggregation", () => {
	test("two stores' orders for one buyer aggregate onto one profile", async () => {
		const { db } = await setup();
		await seedSameBuyerTwoStores(db);

		const first = await refreshCustomerForOrder(db, {
			email: "buyer@example.com",
			phone: null,
			orderTotal: 3000,
		});
		const second = await refreshCustomerForOrder(db, {
			email: "buyer@example.com",
			phone: null,
			orderTotal: 4550,
		});

		expect(first.created).toBe(true);
		expect(second.created).toBe(false);

		const profiles = await db.select().from(shoptifyCustomers);
		expect(profiles).toHaveLength(1);
		expect(profiles[0].totalOrdersCount).toBe(2);
		expect(profiles[0].totalSpent).toBe(7550);
	});

	test("a contactless order creates no profile", async () => {
		const { db } = await setup();
		const result = await refreshCustomerForOrder(db, {
			email: null,
			phone: null,
			orderTotal: 100,
		});
		expect(result).toEqual({ customerId: "", created: false });
		const profiles = await db.select().from(shoptifyCustomers);
		expect(profiles).toHaveLength(0);
	});
});

describe("customer flags", () => {
	test("blacklisting is audited and visible in listings", async () => {
		const { db, adminId } = await setup();
		await seedSameBuyerTwoStores(db);
		const { customerId } = await refreshCustomerForOrder(db, {
			email: "buyer@example.com",
			phone: null,
			orderTotal: 3000,
		});

		const ctx = createContext({
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

		const flagged = await setCustomerFlags(ctx, {
			customerId,
			isBlacklisted: true,
			notes: "Chargeback history",
		});
		expect(flagged.isBlacklisted).toBe(true);
		expect(flagged.notes).toBe("Chargeback history");

		const events = await db.select().from(systemAuditLogs);
		expect(events).toHaveLength(1);
		expect(events[0].moduleCode).toBe("shoptify");
		expect(events[0].action).toBe("shoptify.customer.flags");

		const blacklisted = await listCustomers(
			db,
			{ isBlacklisted: true },
			{ offset: 0, limit: 20 },
		);
		expect(blacklisted.rows).toHaveLength(1);
		expect(blacklisted.totalCount).toBe(1);
	});

	test("the blacklist flag appears beside the customer's orders", async () => {
		const { db } = await setup();
		await seedSameBuyerTwoStores(db);
		const { customerId } = await refreshCustomerForOrder(db, {
			email: "buyer@example.com",
			phone: null,
			orderTotal: 3000,
		});
		await db
			.update(shoptifyCustomers)
			.set({ isBlacklisted: true })
			.where(eq(shoptifyCustomers.id, customerId));

		// The listing shape carries the flag; order rows carry the contact
		// that resolves to it — the dashboard joins on the same identifiers.
		const orders = await db
			.select()
			.from(shoptifyOrders)
			.where(eq(shoptifyOrders.customerEmail, "buyer@example.com"));
		expect(orders).toHaveLength(2);
		const [profile] = await db
			.select()
			.from(shoptifyCustomers)
			.where(eq(shoptifyCustomers.id, customerId));
		expect(profile.isBlacklisted).toBe(true);
	});
});
