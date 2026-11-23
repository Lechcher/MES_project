import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { loadConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import {
	shoptifyProducts,
	shoptifyStores,
	shoptifyVariants,
} from "../../db/schema";
import { createTestDatabase, type TestDatabase } from "../../db/test-db";
import {
	ingestProductWebhook,
	listProducts,
	updateVariant,
	variantsByMasterSku,
} from "./catalog";
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
	return {
		db: await freshDatabase(),
		config: loadConfig({ NODE_ENV: "test" }),
	};
}

/** Two stores sharing one master SKU — the cross-store sync fixture. */
async function seedCrossStore(db: DatabaseHandle) {
	const stores = ["store-a.myshopify.com", "store-b.myshopify.com"];
	for (const domain of stores) {
		await db.insert(shoptifyStores).values({
			id: crypto.randomUUID(),
			name: domain,
			shopDomain: domain,
			accessToken: "encrypted-token",
		});
	}
	await ingestProductWebhook(db, {
		shopDomain: stores[0],
		payload: {
			id: 7001,
			title: "Desk Lamp",
			status: "active",
			variants: [
				{ id: 8001, sku: "LAMP-BLACK", price: "19.99", inventory_quantity: 12 },
			],
		},
	});
	await ingestProductWebhook(db, {
		shopDomain: stores[1],
		payload: {
			id: 7002,
			title: "Desk Lamp (B)",
			status: "active",
			variants: [
				{ id: 8002, sku: "LAMP-BLACK", price: "21.50", inventory_quantity: 3 },
			],
		},
	});
}

describe("catalog ingestion", () => {
	test("stores products with minor-unit prices and shared master SKUs", async () => {
		const { db } = await setup();
		await seedCrossStore(db);

		const rows = await db.select().from(shoptifyVariants);
		expect(rows).toHaveLength(2);
		const byStore = Object.fromEntries(
			rows.map((row) => [row.shopifyVariantId, row]),
		);
		expect(byStore["8001"]?.masterSku).toBe("LAMP-BLACK");
		expect(byStore["8001"]?.price).toBe(1999);
		expect(byStore["8002"]?.price).toBe(2150);

		const groups = await db
			.select()
			.from(shoptifyVariants)
			.where(eq(shoptifyVariants.masterSku, "LAMP-BLACK"));
		expect(groups).toHaveLength(2);
	});

	test("a repeated product webhook updates in place", async () => {
		const { db } = await setup();
		await seedCrossStore(db);
		const before = await db.select().from(shoptifyProducts);

		await ingestProductWebhook(db, {
			shopDomain: "store-a.myshopify.com",
			payload: {
				id: 7001,
				title: "Desk Lamp (renamed)",
				variants: [
					{
						id: 8001,
						sku: "LAMP-BLACK",
						price: "24.00",
						inventory_quantity: 5,
					},
				],
			},
		});

		const products = await db.select().from(shoptifyProducts);
		expect(products).toHaveLength(2);
		const variants = await db
			.select()
			.from(shoptifyVariants)
			.where(eq(shoptifyVariants.shopifyVariantId, "8001"));
		expect(variants).toHaveLength(1);
		expect(variants[0].price).toBe(2400);
		expect(variants[0].availableQuantity).toBe(5);
		expect(products.length).toBe(before.length);
	});
});

describe("cross-store inventory updates", () => {
	test("one quantity change applies to every variant sharing the master SKU", async () => {
		const { db, config } = await setup();
		await seedCrossStore(db);

		const [variant] = await db
			.select()
			.from(shoptifyVariants)
			.where(eq(shoptifyVariants.shopifyVariantId, "8001"));
		const group = await variantsByMasterSku(db, variant.id);
		expect(group).toHaveLength(2);

		const result = await updateVariant(
			{ db, config },
			{
				variantId: variant.id,
				availableQuantity: 7,
				price: 2550,
			},
		);

		expect(result.updated).toHaveLength(2);
		expect(result.failed).toEqual([]);

		const rows = await db
			.select()
			.from(shoptifyVariants)
			.where(eq(shoptifyVariants.masterSku, "LAMP-BLACK"));
		expect(rows.map((row) => row.availableQuantity)).toEqual([7, 7]);
		expect(rows.map((row) => row.price)).toEqual([2550, 2550]);
	});

	test("a variant without a master SKU updates itself only", async () => {
		const { db, config } = await setup();
		await seedCrossStore(db);
		const [variant] = await db
			.select()
			.from(shoptifyVariants)
			.where(eq(shoptifyVariants.shopifyVariantId, "8001"));
		await db
			.update(shoptifyVariants)
			.set({ masterSku: null })
			.where(eq(shoptifyVariants.id, variant.id));

		const result = await updateVariant(
			{ db, config },
			{
				variantId: variant.id,
				availableQuantity: 2,
			},
		);
		expect(result.updated).toHaveLength(1);

		const [other] = await db
			.select()
			.from(shoptifyVariants)
			.where(eq(shoptifyVariants.shopifyVariantId, "8002"));
		expect(other.availableQuantity).toBe(3);
	});

	test("a quantity below the minimum is reported as low stock", async () => {
		const { db, config } = await setup();
		await seedCrossStore(db);
		const [variant] = await db
			.select()
			.from(shoptifyVariants)
			.where(eq(shoptifyVariants.shopifyVariantId, "8001"));
		await db
			.update(shoptifyVariants)
			.set({ minStockLevel: 5 })
			.where(eq(shoptifyVariants.masterSku, "LAMP-BLACK"));

		const result = await updateVariant(
			{ db, config },
			{
				variantId: variant.id,
				availableQuantity: 2,
			},
		);
		expect(result.lowStock).toHaveLength(2);
	});

	test("a pushed price reaches the store through the injected client", async () => {
		const { db, config } = await setup();
		await seedCrossStore(db);
		const pushed: unknown[] = [];
		const client: AdminApiClient = {
			request: async <T>(
				_document: string,
				options?: { variables?: Record<string, unknown> },
			) => {
				pushed.push(options?.variables);
				return { data: { productVariantUpdate: { userErrors: [] } } } as T;
			},
		};
		const [variant] = await db
			.select()
			.from(shoptifyVariants)
			.where(eq(shoptifyVariants.shopifyVariantId, "8001"));

		await updateVariant(
			{ db, config, clientFactory: () => client },
			{
				variantId: variant.id,
				price: 3050,
			},
		);

		expect(pushed).toHaveLength(2);
		expect((pushed[0] as { input: { price: string } }).input.price).toBe(
			"30.50",
		);
	});
});

describe("product listing", () => {
	test("filters by low stock and by master SKU", async () => {
		const { db } = await setup();
		await seedCrossStore(db);
		const [variant] = await db
			.select()
			.from(shoptifyVariants)
			.where(eq(shoptifyVariants.shopifyVariantId, "8001"));
		// 12 on hand against a minimum of 20: this variant alone is low.
		await db
			.update(shoptifyVariants)
			.set({ minStockLevel: 20 })
			.where(eq(shoptifyVariants.id, variant.id));

		const all = await listProducts(db, {}, { offset: 0, limit: 20 });
		expect(all.rows).toHaveLength(2);
		expect(all.totalCount).toBe(2);

		const low = await listProducts(
			db,
			{ lowStockOnly: true },
			{ offset: 0, limit: 20 },
		);
		expect(low.rows).toHaveLength(1);
		expect(low.rows[0].variants).toHaveLength(1);
		expect(low.rows[0].variants[0].isLowStock).toBe(true);

		const grouped = await listProducts(
			db,
			{ masterSku: "LAMP-BLACK" },
			{ offset: 0, limit: 20 },
		);
		expect(grouped.rows).toHaveLength(2);
	});
});
