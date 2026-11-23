import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { loadConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import {
	exportArtifacts,
	shoptifyOrders,
	shoptifyStores,
	shoptifyVariants,
	user,
} from "../../db/schema";
import { createTestDatabase, type TestDatabase } from "../../db/test-db";
import { createContext } from "../../graphql/context";
import { ingestProductWebhook } from "./catalog";
import {
	exportShoptifyOrders,
	exportShoptifyProducts,
	normalizeShoptifyExportFormat,
} from "./exports";
import { ingestOrderWebhook } from "./orders";

const TMP_ROOT = join(tmpdir(), "mes-shoptify-tests");
const open: TestDatabase[] = [];
const exportDirs: string[] = [];

afterAll(async () => {
	// Closing the generated databases in parallel keeps the teardown well
	// inside the hook timeout under a loaded server.
	await Promise.all(open.map((test) => test.close()));
	for (const dir of exportDirs) {
		if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
	}
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
	const exportDir = join(TMP_ROOT, `exports-${crypto.randomUUID()}`);
	exportDirs.push(exportDir);
	return {
		db,
		adminId,
		exportDir,
		ctx: createContext({
			db,
			config: loadConfig({ NODE_ENV: "test", MES_EXPORT_DIR: exportDir }),
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

async function seedData(db: DatabaseHandle) {
	await db.insert(shoptifyStores).values({
		id: crypto.randomUUID(),
		name: "Store",
		shopDomain: "shop.myshopify.com",
		accessToken: "encrypted-token",
	});
	await ingestOrderWebhook(db, {
		shopDomain: "shop.myshopify.com",
		payload: {
			id: 1,
			name: "#1",
			email: "buyer@example.com",
			total_price: "10.00",
			currency: "USD",
			created_at: "2026-11-09T00:00:00Z",
		},
	});
	await ingestProductWebhook(db, {
		shopDomain: "shop.myshopify.com",
		payload: {
			id: 2,
			title: "Lamp",
			variants: [{ id: 3, sku: "LAMP", price: "5.00", inventory_quantity: 4 }],
		},
	});
}

describe("shoptify exports", () => {
	test("normalizes the format argument", () => {
		expect(normalizeShoptifyExportFormat(undefined)).toBe("XLSX");
		expect(normalizeShoptifyExportFormat("csv")).toBe("CSV");
		expect(() => normalizeShoptifyExportFormat("PDF")).toThrow(
			/Unsupported export format/,
		);
	});

	test("writes a real CSV artifact row pointing at a real file", async () => {
		const { db, ctx, adminId } = await setup();
		await seedData(db);

		const result = await exportShoptifyOrders(ctx, {
			filter: {},
			format: "CSV",
		});
		expect(result.format).toBe("CSV");
		expect(result.url).toBe(`/api/v1/exports/${result.id}`);

		const [row] = await db
			.select()
			.from(exportArtifacts)
			.where(eq(exportArtifacts.id, result.id));
		expect(row.userId).toBe(adminId);
		expect(row.format).toBe("CSV");
		expect(row.byteSize).toBeGreaterThan(0);
		expect(existsSync(row.storagePath)).toBe(true);
	});

	test("writes an XLSX artifact for the catalog listing", async () => {
		const { db, ctx } = await setup();
		await seedData(db);

		const result = await exportShoptifyProducts(ctx, { filter: {} });
		expect(result.format).toBe("XLSX");
		expect(result.mimeType).toContain("spreadsheet");

		const [row] = await db
			.select()
			.from(exportArtifacts)
			.where(eq(exportArtifacts.id, result.id));
		expect(existsSync(row.storagePath)).toBe(true);

		const variants = await db.select().from(shoptifyVariants);
		expect(variants).toHaveLength(1);
		const orders = await db.select().from(shoptifyOrders);
		expect(orders).toHaveLength(1);
	});
});
