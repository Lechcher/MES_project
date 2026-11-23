import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { loadConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import {
	shoptifyAutomationLog,
	shoptifyCustomers,
	shoptifyOrders,
	shoptifyStores,
	shoptifyVariants,
	user,
} from "../../db/schema";
import { createTestDatabase, type TestDatabase } from "../../db/test-db";
import { createContext } from "../../graphql/context";
import { saveRule } from "./automation";
import { wireShoptifySubscriptions } from "./subscriptions";
import { createShoptifyEventBus } from "./webhooks";

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
	// The audit trail references `user`; seed the acting admin per db.
	await db.insert(user).values({
		id: "system",
		name: "Admin",
		email: "admin@example.com",
		userCode: "ADMIN-1",
	});
	return db;
}

function seedStore(db: DatabaseHandle) {
	return db.insert(shoptifyStores).values({
		id: crypto.randomUUID(),
		name: "Store",
		shopDomain: "shop.myshopify.com",
		accessToken: "encrypted-token",
		webhookSecret: "secret",
	});
}

function adminContext(db: DatabaseHandle) {
	const config = loadConfig({ NODE_ENV: "test" });
	return createContext({
		db,
		config,
		request: { ipAddress: null, userAgent: "test" },
		viewer: {
			id: "system",
			userCode: "ADMIN-1",
			fullName: "Admin",
			email: "admin@example.com",
			departmentId: null,
			isActive: true,
			roleCodes: ["SUPER_ADMIN"],
		},
	});
}

describe("webhook fan-out", () => {
	test("a verified webhook ingests the order, aggregates the customer, and fires rules once", async () => {
		const db = await setup();
		await seedStore(db);
		const events = createShoptifyEventBus();
		wireShoptifySubscriptions(events, db);

		await saveRule(adminContext(db), {
			name: "Ping",
			triggerEvent: "ORDER_CREATED",
			actions: [{ type: "notify", template: "SHOPTIFY_ORDER_INGESTED" }],
		});

		const payload = {
			id: 42,
			email: "buyer@example.com",
			total_price: "12.00",
		};
		await events.emit("webhook.orders/create", {
			shopDomain: "shop.myshopify.com",
			payload,
		});
		// A retry of the same webhook: same payload, same event key.
		await events.emit("webhook.orders/create", {
			shopDomain: "shop.myshopify.com",
			payload,
		});

		const orders = await db.select().from(shoptifyOrders);
		expect(orders).toHaveLength(1);
		expect(orders[0].shopifyOrderId).toBe("42");

		// The customer listener ran: one profile for the buyer.
		const customers = await db.select().from(shoptifyCustomers);
		expect(customers).toHaveLength(1);
		expect(customers[0].email).toBe("buyer@example.com");

		// The automation log claims the (rule, event) pair exactly once.
		const log = await db.select().from(shoptifyAutomationLog);
		expect(log).toHaveLength(1);
		expect(log[0].eventKey).toBe("orders/create:42");
	});

	test("an uninstall webhook deactivates the store", async () => {
		const db = await setup();
		await seedStore(db);
		const events = createShoptifyEventBus();
		wireShoptifySubscriptions(events, db);

		await events.emit("webhook.app/uninstalled", {
			shopDomain: "shop.myshopify.com",
			payload: {},
		});

		const [store] = await db
			.select()
			.from(shoptifyStores)
			.where(eq(shoptifyStores.shopDomain, "shop.myshopify.com"));
		expect(store.isActive).toBe(false);
	});

	test("a product webhook upserts the product and its variants", async () => {
		const db = await setup();
		await seedStore(db);
		const events = createShoptifyEventBus();
		wireShoptifySubscriptions(events, db);

		await events.emit("webhook.products/update", {
			shopDomain: "shop.myshopify.com",
			payload: {
				id: 9,
				title: "Lamp",
				variants: [
					{ id: 10, sku: "LAMP", price: "5.00", inventory_quantity: 4 },
				],
			},
		});

		const variants = await db.select().from(shoptifyVariants);
		expect(variants).toHaveLength(1);
		expect(variants[0].masterSku).toBe("LAMP");
		expect(variants[0].price).toBe(500);
	});
});
