import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { loadConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import {
	shoptifyAutomationLog,
	shoptifyAutomationRules,
	shoptifyOrders,
	shoptifyStores,
	systemAuditLogs,
	user,
} from "../../db/schema";
import { createTestDatabase, type TestDatabase } from "../../db/test-db";
import { createContext } from "../../graphql/context";
import { deleteRule, evaluateRules, matchesAll, saveRule } from "./automation";
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
			id: 400,
			email: "buyer@example.com",
			total_price: "500.00",
			currency: "USD",
			created_at: "2026-11-07T00:00:00Z",
		},
	});
	const [order] = await db.select().from(shoptifyOrders);
	return { orderId: order.id };
}

describe("rule storage", () => {
	test("creates, edits, and deletes a rule with audit events", async () => {
		const { db, ctx } = await setup();
		const rule = await saveRule(ctx, {
			name: "Flag big orders",
			triggerEvent: "ORDER_CREATED",
			conditions: [{ field: "total_price", operator: "gt", value: 1000 }],
			actions: [{ type: "flag_exception", reason: "FRAUD_RISK" }],
		});
		expect(rule.triggerEvent).toBe("ORDER_CREATED");
		expect(rule.isActive).toBe(true);

		const updated = await saveRule(ctx, {
			id: rule.id,
			name: "Flag big orders (v2)",
			triggerEvent: "ORDER_CREATED",
			isActive: false,
		});
		expect(updated.name).toBe("Flag big orders (v2)");
		expect(updated.isActive).toBe(false);

		expect(await deleteRule(ctx, rule.id)).toBe(true);
		const rows = await db.select().from(shoptifyAutomationRules);
		expect(rows).toHaveLength(0);

		const events = await db
			.select()
			.from(systemAuditLogs)
			.where(eq(systemAuditLogs.moduleCode, "shoptify"));
		expect(events.map((row) => row.action)).toEqual([
			"shoptify.rule.create",
			"shoptify.rule.update",
			"shoptify.rule.delete",
		]);
	});

	test("refuses an unknown action type at save time", async () => {
		const { ctx } = await setup();
		await expect(
			saveRule(ctx, {
				name: "Bad rule",
				triggerEvent: "ORDER_CREATED",
				actions: [{ type: "wire_money" as never }],
			}),
		).rejects.toThrow(/Unsupported action type/);
	});
});

describe("rule evaluation", () => {
	test("fires once per event and writes its action", async () => {
		const { db, ctx } = await setup();
		const { orderId } = await seedStoreAndOrder(db);
		await saveRule(ctx, {
			name: "Flag big orders",
			triggerEvent: "ORDER_CREATED",
			conditions: [{ field: "total_price", operator: "gt", value: 100 }],
			actions: [{ type: "flag_exception", reason: "FRAUD_RISK" }],
		});

		const event = {
			trigger: "ORDER_CREATED" as const,
			storeId: null,
			eventKey: "ORDER_CREATED:400",
			row: { total_price: "500.00" } as Record<string, unknown>,
			orderId,
		};

		const first = await evaluateRules(db, event);
		expect(first).toHaveLength(1);
		expect(first[0].executed).toBe(true);
		expect(first[0].errors).toEqual([]);

		const [order] = await db
			.select()
			.from(shoptifyOrders)
			.where(eq(shoptifyOrders.id, orderId));
		expect(order.hasException).toBe(true);
		expect(order.exceptionReason).toBe("FRAUD_RISK");

		// The duplicate delivery is claimed, not re-executed.
		const second = await evaluateRules(db, event);
		expect(second[0].executed).toBe(false);
		expect(second[0].reason).toBe("already-executed");
	});

	test("a disabled rule is inert, and non-matching conditions skip", async () => {
		const { db, ctx } = await setup();
		const { orderId } = await seedStoreAndOrder(db);
		await saveRule(ctx, {
			name: "Disabled",
			triggerEvent: "ORDER_CREATED",
			isActive: false,
			actions: [{ type: "flag_exception", reason: "FRAUD_RISK" }],
		});
		await saveRule(ctx, {
			name: "Never matches",
			triggerEvent: "ORDER_CREATED",
			conditions: [{ field: "total_price", operator: "gt", value: 900000 }],
			actions: [{ type: "annotate", note: "big" }],
		});

		const outcomes = await evaluateRules(db, {
			trigger: "ORDER_CREATED",
			storeId: null,
			eventKey: "ORDER_CREATED:400",
			row: { total_price: "500.00" },
			orderId,
		});

		expect(outcomes).toHaveLength(1);
		expect(outcomes[0].executed).toBe(false);
		expect(outcomes[0].reason).toBe("conditions-not-met");
		const [order] = await db
			.select()
			.from(shoptifyOrders)
			.where(eq(shoptifyOrders.id, orderId));
		expect(order.hasException).toBe(false);
	});

	test("a notify action reaches the injected notifier once", async () => {
		const { db, ctx } = await setup();
		await saveRule(ctx, {
			name: "Ping",
			triggerEvent: "ORDER_CREATED",
			actions: [{ type: "notify", template: "SHOPTIFY_ORDER_INGESTED" }],
		});

		const notified: string[] = [];
		const outcomes = await evaluateRules(
			db,
			{
				trigger: "ORDER_CREATED",
				storeId: null,
				eventKey: "ORDER_CREATED:1",
				row: { id: 1 },
			},
			{
				notify: async (action) => {
					notified.push(action.template ?? "");
				},
			},
		);
		expect(outcomes[0].executed).toBe(true);
		expect(notified).toEqual(["SHOPTIFY_ORDER_INGESTED"]);
	});

	test("the log key is unique per rule and event", async () => {
		const { db, ctx } = await setup();
		await saveRule(ctx, {
			name: "Ping",
			triggerEvent: "ORDER_CREATED",
			actions: [{ type: "notify" }],
		});
		await evaluateRules(db, {
			trigger: "ORDER_CREATED",
			storeId: null,
			eventKey: "ORDER_CREATED:7",
			row: { id: 7 },
		});
		const rows = await db.select().from(shoptifyAutomationLog);
		expect(rows).toHaveLength(1);
		expect(rows[0].eventKey).toBe("ORDER_CREATED:7");
	});
});

describe("matchesAll", () => {
	test("an empty condition set matches", () => {
		expect(matchesAll({}, null)).toBe(true);
		expect(matchesAll({}, [])).toBe(true);
	});

	test("every condition must hold", () => {
		expect(
			matchesAll({ total_price: "500.00", currency: "USD" }, [
				{ field: "total_price", operator: "gt", value: 1000 },
				{ field: "currency", operator: "equals", value: "USD" },
			]),
		).toBe(false);
		expect(
			matchesAll({ total_price: "500.00", currency: "USD" }, [
				{ field: "total_price", operator: "gt", value: 100 },
				{ field: "currency", operator: "equals", value: "USD" },
			]),
		).toBe(true);
	});
});
