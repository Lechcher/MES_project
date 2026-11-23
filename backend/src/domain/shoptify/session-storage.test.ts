import { afterAll, describe, expect, test } from "bun:test";
import { Session } from "@shopify/shopify-api";
import { loadConfig } from "../../config";
import { createTestDatabase, type TestDatabase } from "../../db/test-db";
import { createSessionStorage } from "./session-storage";

const open: TestDatabase[] = [];

afterAll(async () => {
	for (const test of open) await test.close();
});

async function storageWithDatabase() {
	const test = await createTestDatabase();
	open.push(test);
	return test.db;
}

describe("shopify session storage", () => {
	test("stores, loads, and deletes a session", async () => {
		const db = await storageWithDatabase();
		const storage = createSessionStorage(db);
		const session = new Session({
			id: "offline_shop.myshopify.com",
			shop: "shop.myshopify.com",
			state: "state-nonce",
			isOnline: false,
			accessToken: "shpat_offline_token",
		});

		expect(await storage.storeSession(session)).toBe(true);
		const loaded = await storage.loadSession("offline_shop.myshopify.com");
		expect(loaded?.shop).toBe("shop.myshopify.com");
		expect(loaded?.accessToken).toBe("shpat_offline_token");

		expect(await storage.deleteSession("offline_shop.myshopify.com")).toBe(
			true,
		);
		expect(
			await storage.loadSession("offline_shop.myshopify.com"),
		).toBeUndefined();
	});

	test("deleteSessions removes exactly the given ids", async () => {
		const db = await storageWithDatabase();
		const storage = createSessionStorage(db);
		const make = (id: string) =>
			new Session({
				id,
				shop: "shop.myshopify.com",
				state: `state-${id}`,
				isOnline: false,
				accessToken: `token-${id}`,
			});
		await storage.storeSession(make("s1"));
		await storage.storeSession(make("s2"));
		await storage.storeSession(make("s3"));

		expect(await storage.deleteSessions(["s1", "s3"])).toBe(true);
		expect(await storage.loadSession("s1")).toBeUndefined();
		expect(await storage.loadSession("s2")).toBeDefined();
		expect(await storage.loadSession("s3")).toBeUndefined();
	});

	test("storing twice updates in place (no duplicate rows)", async () => {
		const db = await storageWithDatabase();
		const storage = createSessionStorage(db);
		const base = {
			id: "offline_shop.myshopify.com",
			shop: "shop.myshopify.com",
			state: "state-nonce",
			isOnline: false,
		};
		await storage.storeSession(
			new Session({ ...base, accessToken: "first-token" }),
		);
		await storage.storeSession(
			new Session({ ...base, accessToken: "second-token" }),
		);
		const loaded = await storage.loadSession("offline_shop.myshopify.com");
		expect(loaded?.accessToken).toBe("second-token");
	});

	test("loads configuration through the standard test environment", () => {
		expect(loadConfig({ NODE_ENV: "test" }).shopify).toBeNull();
	});
});
