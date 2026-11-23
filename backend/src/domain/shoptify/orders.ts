/**
 * Orders domain: ingestion, cross-store listing, annotations, bulk
 * fulfillment, and refunds.
 *
 * Ingestion is driven by the webhook bus (see `subscriptions.ts`): every
 * write is idempotent on `(store, shopify_order_id)` so a duplicate delivery
 * is a no-op rather than a second row. Fulfillment writes go to Shopify
 * through the per-store Admin API client and land locally in the same
 * operation, with per-order failures collected instead of aborting the batch.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import type { AppConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import {
	shoptifyFulfillments,
	shoptifyOrders,
	shoptifyRefunds,
	shoptifyStores,
} from "../../db/schema";
import type { ViewerContext } from "../../graphql/context";
import { DomainError } from "../../graphql/errors";
import { recordAuditEvent } from "../audit";
import {
	createStoreClient,
	decodeTokenEncryptionKey,
	decryptToken,
	requireShopifySettings,
} from "./core";
import { toMinorUnits, toOrder } from "./shapes";
import type { AdminApiClient } from "./types";
import type { WebhookPayload } from "./webhooks";

/** Filter shape shared by the GraphQL input and the domain. */
export interface OrderFilter {
	storeId?: string;
	financialStatus?: string;
	fulfillmentStatus?: string;
	hasException?: boolean;
	createdAfter?: Date;
	createdBefore?: Date;
	search?: string;
}

export interface OrderFlagsInput {
	orderId: string;
	tags?: string[] | null;
	note?: string | null;
	hasException?: boolean;
	exceptionReason?: string | null;
}

export interface FulfillmentItemInput {
	orderId: string;
	trackingCompany: string;
	trackingNumber: string;
	trackingUrl?: string | null;
}

export interface BulkFulfillOutcome {
	succeeded: string[];
	failed: { orderId: string; message: string }[];
}

/** A store row as the client factory sees it: token still encrypted at rest. */
export interface StoreClientInput {
	shopDomain: string;
	/** AES-256-GCM ciphertext; unwrapped by the default factory only. */
	accessToken: string;
}

/**
 * Builds the Admin API client for a store. Injectable so tests never touch
 * Shopify or the token key; the default unwraps the token from config.
 */
export type StoreClientFactory = (store: StoreClientInput) => AdminApiClient;

/** Dependencies that touch Shopify; injectable in tests. */
export interface OrderDependencies {
	db: DatabaseHandle;
	config: AppConfig;
	clientFactory?: StoreClientFactory;
}

/** Resolve an active store's row by shop domain (webhook ingestion path). */
export async function findStoreByDomain(
	db: DatabaseHandle,
	shopDomain: string,
): Promise<{ id: string } | null> {
	const [store] = await db
		.select({ id: shoptifyStores.id })
		.from(shoptifyStores)
		.where(eq(shoptifyStores.shopDomain, shopDomain))
		.limit(1);
	return store ?? null;
}

/**
 * Upsert an order from an `orders/*` webhook payload.
 *
 * Idempotent on `(store, shopify_order_id)`: a duplicate delivery updates
 * the existing row instead of creating a second one.
 */
export async function ingestOrderWebhook(
	db: DatabaseHandle,
	input: { shopDomain: string; payload: WebhookPayload },
): Promise<{ orderId: string; created: boolean }> {
	const store = await findStoreByDomain(db, input.shopDomain);
	if (!store) return { orderId: "", created: false };

	const shopifyOrderId = String(input.payload.id ?? "");
	if (shopifyOrderId === "") {
		throw new Error("Order webhook payload carries no id.");
	}

	const values = {
		storeId: store.id,
		shopifyOrderId,
		orderNumber: (input.payload.name as string) ?? null,
		customerEmail: (input.payload.email as string) ?? null,
		customerPhone: (input.payload.phone as string) ?? null,
		shippingAddress: input.payload.shipping_address
			? JSON.stringify(input.payload.shipping_address)
			: null,
		financialStatus: (input.payload.financial_status as string) ?? null,
		fulfillmentStatus: (input.payload.fulfillment_status as string) ?? null,
		totalPrice: toMinorUnits(input.payload.total_price as string),
		currency: (input.payload.currency as string) ?? "USD",
		tags: (input.payload.tags as string) ?? null,
		note: (input.payload.note as string) ?? null,
		shopifyCreatedAt: input.payload.created_at
			? new Date(String(input.payload.created_at))
			: null,
	};

	const [existing] = await db
		.select({ id: shoptifyOrders.id })
		.from(shoptifyOrders)
		.where(
			and(
				eq(shoptifyOrders.storeId, store.id),
				eq(shoptifyOrders.shopifyOrderId, shopifyOrderId),
			),
		)
		.limit(1);

	if (existing) {
		await db
			.update(shoptifyOrders)
			.set({ ...values, updatedAt: new Date() })
			.where(eq(shoptifyOrders.id, existing.id));
		await db
			.update(shoptifyStores)
			.set({ lastSyncAt: new Date() })
			.where(eq(shoptifyStores.id, store.id));
		return { orderId: existing.id, created: false };
	}

	const orderId = crypto.randomUUID();
	await db.insert(shoptifyOrders).values({ id: orderId, ...values });
	await db
		.update(shoptifyStores)
		.set({ lastSyncAt: new Date() })
		.where(eq(shoptifyStores.id, store.id));
	return { orderId, created: true };
}

/**
 * Record a refund from a `refunds/create` webhook payload.
 *
 * Keyed on the Shopify refund id, so one refund webhook (which Shopify may
 * deliver more than once) is stored exactly once.
 */
export async function ingestRefundWebhook(
	db: DatabaseHandle,
	input: { shopDomain: string; payload: WebhookPayload },
): Promise<{ refundId: string; created: boolean }> {
	const store = await findStoreByDomain(db, input.shopDomain);
	if (!store) return { refundId: "", created: false };

	const shopifyRefundId = String(input.payload.id ?? "");
	if (shopifyRefundId === "") {
		throw new Error("Refund webhook payload carries no id.");
	}

	const order = await db
		.select({ id: shoptifyOrders.id })
		.from(shoptifyOrders)
		.where(
			and(
				eq(shoptifyOrders.storeId, store.id),
				eq(shoptifyOrders.shopifyOrderId, String(input.payload.order_id ?? "")),
			),
		)
		.limit(1);

	const transactions =
		(input.payload.transactions as { amount?: string; currency?: string }[]) ??
		[];
	const amount = toMinorUnits(transactions[0]?.amount ?? "0");

	if (!order[0]) {
		// A refund can precede the order webhook (out-of-order delivery);
		// the order will arrive with its financial status already reflecting
		// the refund, and no local refund row exists to store this against.
		return { refundId: "", created: false };
	}

	const [existing] = await db
		.select({ id: shoptifyRefunds.id })
		.from(shoptifyRefunds)
		.where(
			and(
				eq(shoptifyRefunds.orderId, order[0].id),
				eq(shoptifyRefunds.shopifyRefundId, shopifyRefundId),
			),
		)
		.limit(1);
	if (existing) return { refundId: existing.id, created: false };

	const refundId = crypto.randomUUID();
	await db.insert(shoptifyRefunds).values({
		id: refundId,
		orderId: order[0].id,
		shopifyRefundId,
		amount,
		currency: transactions[0]?.currency ?? "USD",
		reason: (input.payload.note as string) ?? null,
	});
	return { refundId, created: true };
}

export async function listOrders(
	db: DatabaseHandle,
	filter: OrderFilter,
	page: { offset: number; limit: number },
): Promise<{ rows: ReturnType<typeof toOrder>[]; totalCount: number }> {
	const conditions = [];
	if (filter.storeId)
		conditions.push(eq(shoptifyOrders.storeId, filter.storeId));
	if (filter.financialStatus)
		conditions.push(eq(shoptifyOrders.financialStatus, filter.financialStatus));
	if (filter.fulfillmentStatus)
		conditions.push(
			eq(shoptifyOrders.fulfillmentStatus, filter.fulfillmentStatus),
		);
	if (filter.hasException !== undefined)
		conditions.push(eq(shoptifyOrders.hasException, filter.hasException));
	if (filter.createdAfter)
		conditions.push(sql`${shoptifyOrders.createdAt} >= ${filter.createdAfter}`);
	if (filter.createdBefore)
		conditions.push(
			sql`${shoptifyOrders.createdAt} <= ${filter.createdBefore}`,
		);
	if (filter.search) {
		const like = `%${filter.search}%`;
		// `ilike`: PostgreSQL's LIKE is case-sensitive, and the search the
		// SQLite build served matched case-insensitively.
		conditions.push(
			sql`(${shoptifyOrders.orderNumber} ilike ${like} or ${shoptifyOrders.customerEmail} ilike ${like} or ${shoptifyOrders.customerPhone} ilike ${like})`,
		);
	}

	const where = conditions.length > 0 ? and(...conditions) : undefined;
	const rows = await db
		.select()
		.from(shoptifyOrders)
		.where(where)
		.orderBy(desc(shoptifyOrders.createdAt))
		.limit(page.limit)
		.offset(page.offset);

	const [countRow] = await db
		.select({ count: sql<number>`count(*)` })
		.from(shoptifyOrders)
		.where(where);

	return {
		rows: rows.map((row) => toOrder(row)),
		totalCount: Number(countRow?.count ?? 0),
	};
}

export async function getOrder(
	db: DatabaseHandle,
	id: string,
): Promise<ReturnType<typeof toOrder> | null> {
	const [row] = await db
		.select()
		.from(shoptifyOrders)
		.where(eq(shoptifyOrders.id, id))
		.limit(1);
	if (!row) return null;
	const [fulfillments, refunds] = await Promise.all([
		db
			.select()
			.from(shoptifyFulfillments)
			.where(eq(shoptifyFulfillments.orderId, id)),
		db.select().from(shoptifyRefunds).where(eq(shoptifyRefunds.orderId, id)),
	]);
	return toOrder(row, { fulfillments, refunds });
}

/** Set internal annotations and exception flags; audited per change. */
export async function updateOrderFlags(
	ctx: ViewerContext,
	input: OrderFlagsInput,
): Promise<ReturnType<typeof toOrder>> {
	const [existing] = await ctx.db
		.select()
		.from(shoptifyOrders)
		.where(eq(shoptifyOrders.id, input.orderId))
		.limit(1);
	if (!existing) {
		throw new DomainError("NOT_FOUND", "Order not found.");
	}

	const changes: Record<string, unknown> = {};
	if (input.tags !== undefined) changes.tags = input.tags?.join(",") ?? null;
	if (input.note !== undefined) changes.note = input.note;
	if (input.hasException !== undefined)
		changes.hasException = input.hasException;
	if (input.exceptionReason !== undefined)
		changes.exceptionReason = input.exceptionReason;

	if (Object.keys(changes).length > 0) {
		await ctx.db
			.update(shoptifyOrders)
			.set({ ...changes, updatedAt: new Date() })
			.where(eq(shoptifyOrders.id, input.orderId));
		await recordAuditEvent(ctx, {
			action: "shoptify.order.flags",
			moduleCode: "shoptify",
			resourceType: "shoptify_order",
			resourceId: input.orderId,
			oldData: {
				tags: existing.tags,
				note: existing.note,
				hasException: existing.hasException,
				exceptionReason: existing.exceptionReason,
			},
			newData: changes,
		});
	}

	const stored = await getOrder(ctx.db, input.orderId);
	if (!stored) {
		throw new DomainError("NOT_FOUND", "Order not found.");
	}
	return stored;
}

/**
 * Fulfill several orders across stores in one operation.
 *
 * Each order is an independent unit: its store client, its Shopify mutation,
 * and its local fulfillment row. A failure names its order and leaves the
 * rest of the batch intact.
 */
export async function bulkFulfill(
	deps: OrderDependencies,
	items: FulfillmentItemInput[],
): Promise<BulkFulfillOutcome> {
	const { db, config } = deps;

	const succeeded: string[] = [];
	const failed: { orderId: string; message: string }[] = [];

	for (const item of items) {
		try {
			const [order] = await db
				.select()
				.from(shoptifyOrders)
				.where(eq(shoptifyOrders.id, item.orderId))
				.limit(1);
			if (!order) throw new DomainError("NOT_FOUND", "Order not found.");

			const client = await resolveStoreClient(
				db,
				config,
				order.storeId,
				deps.clientFactory,
			);
			const shopifyFulfillmentId = await createFulfillmentInShopify(
				client,
				order.shopifyOrderId,
				item,
			);

			await db
				.insert(shoptifyFulfillments)
				.values({
					id: crypto.randomUUID(),
					orderId: order.id,
					shopifyFulfillmentId,
					trackingCompany: item.trackingCompany,
					trackingNumber: item.trackingNumber,
					trackingUrl: item.trackingUrl ?? null,
					shipmentStatus: "SUCCESS",
				})
				.onConflictDoUpdate({
					target: shoptifyFulfillments.id,
					set: { shopifyFulfillmentId, shipmentStatus: "SUCCESS" },
				});

			await db
				.update(shoptifyOrders)
				.set({ fulfillmentStatus: "FULFILLED", updatedAt: new Date() })
				.where(eq(shoptifyOrders.id, order.id));

			succeeded.push(order.id);
		} catch (error) {
			failed.push({
				orderId: item.orderId,
				message: (error as Error).message,
			});
		}
	}

	return { succeeded, failed };
}

/** The default factory: unwrap the encrypted token, build the real client. */
function defaultClientFactory(config: AppConfig): StoreClientFactory {
	return (store) => {
		const shopify = requireShopifySettings(config);
		const key = decodeTokenEncryptionKey(shopify.tokenEncryptionKey);
		return createStoreClient({
			shopDomain: store.shopDomain,
			accessToken: decryptToken(store.accessToken, key),
			apiVersion: "2026-10",
		});
	};
}

/**
 * Resolve the Admin API client for one order's store.
 *
 * An injected factory receives the row untouched (the token stays encrypted,
 * which is exactly why tests use it); the default unwraps it in memory.
 */
async function resolveStoreClient(
	db: DatabaseHandle,
	config: AppConfig,
	storeId: string,
	factory: StoreClientFactory | undefined,
): Promise<AdminApiClient> {
	const [store] = await db
		.select()
		.from(shoptifyStores)
		.where(eq(shoptifyStores.id, storeId))
		.limit(1);
	if (!store) throw new DomainError("NOT_FOUND", "Store not found.");
	const build = factory ?? defaultClientFactory(config);
	return build({
		shopDomain: store.shopDomain,
		accessToken: store.accessToken,
	});
}

/** Surface the first GraphQL error message, or the given fallback. */
function firstErrorMessage(errors: unknown, fallback: string): string {
	if (Array.isArray(errors)) {
		const first = errors[0] as { message?: string } | undefined;
		if (typeof first?.message === "string") return first.message;
	}
	return fallback;
}

/** Shopify's response shapes for the fulfillment lookup and creation. */
interface FulfillmentOrderLineItemNode {
	id?: string;
	remainingQuantity?: number;
}

interface FulfillmentOrderNode {
	id?: string;
	status?: string;
	lineItems?: {
		edges?: { node?: FulfillmentOrderLineItemNode }[];
	};
}

interface FulfillmentOrdersData {
	order?: { fulfillmentOrders?: { edges?: { node?: FulfillmentOrderNode }[] } };
}

interface FulfillmentCreateData {
	fulfillmentCreateV2?: {
		fulfillment?: { id?: string };
		userErrors?: { message: string }[];
	};
}

/** Read the order's open fulfillment orders, then create the fulfillment. */
async function createFulfillmentInShopify(
	client: AdminApiClient,
	shopifyOrderId: string,
	item: FulfillmentItemInput,
): Promise<string> {
	const order = await client.request<FulfillmentOrdersData>(
		`query FulfillmentOrders($id: ID!) {
			order(id: $id) {
				fulfillmentOrders(first: 10) {
					edges {
						node {
							id
							status
							lineItems(first: 20) {
								edges {
									node {
										id
										remainingQuantity
									}
								}
							}
						}
					}
				}
			}
		}`,
		{ variables: { id: `gid://shopify/Order/${shopifyOrderId}` } },
	);
	if (order.errors) {
		throw new Error(
			firstErrorMessage(order.errors, "Fulfillment order lookup failed."),
		);
	}

	const openFulfillmentOrders = (
		order.data?.order?.fulfillmentOrders?.edges ?? []
	)
		.map((edge) => edge.node)
		.filter(
			(node) =>
				node?.id && (node.status === "OPEN" || node.status === "IN_PROGRESS"),
		)
		.map((node) => ({
			fulfillmentOrderId: node?.id as string,
			fulfillmentOrderLineItems: (node?.lineItems?.edges ?? [])
				.map((edge) => edge.node)
				.filter((line) => line?.id && (line.remainingQuantity ?? 0) > 0)
				.map((line) => ({
					id: line?.id as string,
					quantity: line?.remainingQuantity ?? 0,
				})),
		}))
		.filter((group) => group.fulfillmentOrderLineItems.length > 0);

	if (openFulfillmentOrders.length === 0) {
		throw new Error("The order has no open fulfillment orders to fulfill.");
	}

	const created = await client.request<FulfillmentCreateData>(
		`mutation FulfillCreate($fulfillment: FulfillmentV2Input!) {
			fulfillmentCreateV2(fulfillment: $fulfillment) {
				fulfillment { id }
				userErrors { field message }
			}
		}`,
		{
			variables: {
				fulfillment: {
					lineItemsByFulfillmentOrder: openFulfillmentOrders,
					trackingInfo: {
						company: item.trackingCompany,
						number: item.trackingNumber,
						url: item.trackingUrl ?? null,
					},
				},
			},
		},
	);
	const userErrors = created.data?.fulfillmentCreateV2?.userErrors ?? [];
	if (userErrors.length > 0) {
		throw new Error(userErrors.map((e) => e.message).join("; "));
	}
	const fulfillmentId = created.data?.fulfillmentCreateV2?.fulfillment?.id;
	if (!fulfillmentId) {
		throw new Error("Shopify accepted the fulfillment but returned no id.");
	}
	return fulfillmentId;
}
