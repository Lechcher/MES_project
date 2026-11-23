/**
 * Shopify commerce resolver surface.
 *
 * Thin by design: each resolver authorizes the operation (every one of them,
 * server-side, via `authorize`), delegates to a domain service in
 * `../../domain/shoptify/*`, and returns the persisted shape. Business rules,
 * ingestion, and cross-store sync live in the domain.
 */

import { eq, inArray } from "drizzle-orm";
import {
	shoptifyFulfillments,
	shoptifyStores,
	shoptifyVariants,
} from "../../db/schema";
import { recordAuditEvent } from "../../domain/audit";
import { notify as notifyPlatform } from "../../domain/notifications";
import {
	deleteRule,
	listRules,
	saveRule,
} from "../../domain/shoptify/automation";
import { listProducts, updateVariant } from "../../domain/shoptify/catalog";
import {
	listCustomers,
	setCustomerFlags,
} from "../../domain/shoptify/customers";
import {
	exportShoptifyOrders,
	exportShoptifyProducts,
} from "../../domain/shoptify/exports";
import {
	listPayouts,
	recordPayout,
	setOrderExpenses,
} from "../../domain/shoptify/finance";
import {
	bulkFulfill,
	getOrder,
	listOrders,
	updateOrderFlags,
} from "../../domain/shoptify/orders";
import {
	toFulfillment,
	toStore,
	toVariant,
} from "../../domain/shoptify/shapes";
import {
	beginOAuth,
	connectManualToken,
} from "../../domain/shoptify/store-connect";
import { authorize } from "../access";
import type { ViewerContext } from "../context";
import { clampPageArgs } from "../page-size";

type Resolver = (
	parent: unknown,
	args: any,
	contextValue: any,
	info: unknown,
) => unknown;

export const shoptifyQuery: Record<string, Resolver> = {
	shoptifyStores: async (_parent, _args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "shoptifyStores");
		const rows = await ctx.db
			.select()
			.from(shoptifyStores)
			.orderBy(shoptifyStores.name);
		return rows.map(toStore);
	},

	shoptifyOrders: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "shoptifyOrders");
		const page = clampPageArgs(args);
		const { rows, totalCount } = await listOrders(
			ctx.db,
			normalizeOrderFilter(args.filter),
			page,
		);
		return {
			nodes: rows,
			pageInfo: {
				offset: page.offset,
				limit: page.limit,
				totalCount,
				hasNextPage: page.offset + rows.length < totalCount,
			},
		};
	},

	shoptifyOrder: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "shoptifyOrder");
		return getOrder(ctx.db, String(args.id));
	},

	shoptifyProducts: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "shoptifyProducts");
		const page = clampPageArgs(args);
		const { rows, totalCount } = await listProducts(
			ctx.db,
			normalizeProductFilter(args.filter),
			page,
		);
		return {
			nodes: rows,
			pageInfo: {
				offset: page.offset,
				limit: page.limit,
				totalCount,
				hasNextPage: page.offset + rows.length < totalCount,
			},
		};
	},

	shoptifyCustomers: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "shoptifyCustomers");
		const page = clampPageArgs(args);
		const { rows, totalCount } = await listCustomers(
			ctx.db,
			normalizeCustomerFilter(args.filter),
			page,
		);
		return {
			nodes: rows,
			pageInfo: {
				offset: page.offset,
				limit: page.limit,
				totalCount,
				hasNextPage: page.offset + rows.length < totalCount,
			},
		};
	},

	shoptifyPayouts: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "shoptifyPayouts");
		const page = clampPageArgs(args);
		const { rows, totalCount } = await listPayouts(
			ctx.db,
			args.storeId ? String(args.storeId) : null,
			page,
		);
		return {
			nodes: rows,
			pageInfo: {
				offset: page.offset,
				limit: page.limit,
				totalCount,
				hasNextPage: page.offset + rows.length < totalCount,
			},
		};
	},

	shoptifyAutomationRules: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "shoptifyAutomationRules");
		return listRules(ctx.db, args.storeId ? String(args.storeId) : null);
	},
};

export const shoptifyMutation: Record<string, Resolver> = {
	shoptifyBeginOAuth: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "shoptifyBeginOAuth");
		const result = await beginOAuth(
			{ db: ctx.db, config: ctx.config },
			String(args.shopDomain),
		);
		return { redirectUrl: result.redirectUrl };
	},

	shoptifyConnectStore: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "shoptifyConnectStore");
		const { storeId } = await connectManualToken(
			{ db: ctx.db, config: ctx.config },
			{
				shopDomain: String(args.input.shopDomain),
				accessToken: String(args.input.accessToken),
			},
		);
		// The credential itself never enters the audit payload.
		await recordAuditEvent(ctx, {
			action: "shoptify.store.connect",
			moduleCode: "shoptify",
			resourceType: "shoptify_store",
			resourceId: storeId,
			newData: { shopDomain: String(args.input.shopDomain) },
		});
		const [store] = await ctx.db
			.select()
			.from(shoptifyStores)
			.where(eq(shoptifyStores.shopDomain, String(args.input.shopDomain)));
		return toStore(store);
	},

	shoptifyDeactivateStore: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "shoptifyDeactivateStore");
		const [store] = await ctx.db
			.select()
			.from(shoptifyStores)
			.where(eq(shoptifyStores.id, String(args.storeId)));
		if (!store) {
			return null;
		}
		await ctx.db
			.update(shoptifyStores)
			.set({ isActive: false, updatedAt: new Date() })
			.where(eq(shoptifyStores.id, store.id));
		await recordAuditEvent(ctx, {
			action: "shoptify.store.deactivate",
			moduleCode: "shoptify",
			resourceType: "shoptify_store",
			resourceId: store.id,
			oldData: { shopDomain: store.shopDomain, isActive: store.isActive },
		});
		const [updated] = await ctx.db
			.select()
			.from(shoptifyStores)
			.where(eq(shoptifyStores.id, store.id));
		return updated ? toStore(updated) : null;
	},

	shoptifyUpdateOrderFlags: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "shoptifyUpdateOrderFlags");
		return updateOrderFlags(ctx, normalizeFlagsInput(args.input));
	},

	shoptifyBulkFulfill: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "shoptifyBulkFulfill");
		const items = (args.input?.items ?? []).map((item: any) => ({
			orderId: String(item.orderId),
			trackingCompany: String(item.trackingCompany),
			trackingNumber: String(item.trackingNumber),
			trackingUrl: item.trackingUrl ? String(item.trackingUrl) : null,
		}));
		const outcome = await bulkFulfill(
			{
				db: ctx.db,
				config: ctx.config,
			},
			items,
		);
		for (const orderId of outcome.succeeded) {
			await recordAuditEvent(ctx, {
				action: "shoptify.fulfillment.create",
				moduleCode: "shoptify",
				resourceType: "shoptify_order",
				resourceId: orderId,
				newData: {
					trackingNumbers: items
						.filter((item: { orderId: string }) => item.orderId === orderId)
						.map((item: { trackingNumber: string }) => item.trackingNumber),
				},
			});
		}
		const fulfillmentRows =
			outcome.succeeded.length > 0
				? await ctx.db
						.select()
						.from(shoptifyFulfillments)
						.where(inArray(shoptifyFulfillments.orderId, outcome.succeeded))
				: [];
		return {
			succeeded: fulfillmentRows.map(toFulfillment),
			failed: outcome.failed.map((failure) => ({
				orderId: failure.orderId,
				message: failure.message,
			})),
		};
	},

	shoptifyUpdateVariant: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "shoptifyUpdateVariant");
		const result = await updateVariant(
			{ db: ctx.db, config: ctx.config, ctx },
			normalizeVariantInput(args.input),
		);
		if (result.lowStock.length > 0) {
			await notifyPlatform(ctx, {
				template: "SHOPTIFY_LOW_STOCK",
				payload: { variantIds: result.lowStock },
				relatedType: "shoptify_variant",
				relatedId: String(args.input.variantId),
			});
		}
		const [row] = await ctx.db
			.select()
			.from(shoptifyVariants)
			.where(eq(shoptifyVariants.id, result.updated[0] ?? ""));
		return row ? toVariant(row) : null;
	},

	shoptifySyncInventory: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "shoptifySyncInventory");
		// Sync is a read-back: the local row is the newest truth and the next
		// Shopify push catches the store up.
		const [row] = await ctx.db
			.select()
			.from(shoptifyVariants)
			.where(eq(shoptifyVariants.id, String(args.variantId)));
		return row ? toVariant(row) : null;
	},

	shoptifySetCustomerFlags: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "shoptifySetCustomerFlags");
		return setCustomerFlags(ctx, {
			customerId: String(args.input.customerId),
			isBlacklisted:
				args.input.isBlacklisted === undefined
					? undefined
					: Boolean(args.input.isBlacklisted),
			isHighRisk:
				args.input.isHighRisk === undefined
					? undefined
					: Boolean(args.input.isHighRisk),
			notes:
				args.input.notes === undefined
					? undefined
					: (args.input.notes as string | null),
		});
	},

	shoptifySetOrderExpenses: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "shoptifySetOrderExpenses");
		return setOrderExpenses(ctx, {
			orderId: String(args.input.orderId),
			revenue: Number(args.input.revenue),
			cogs: Number(args.input.cogs ?? 0),
			shipping: Number(args.input.shipping ?? 0),
			gatewayFee: Number(args.input.gatewayFee ?? 0),
			adSpend: Number(args.input.adSpend ?? 0),
		});
	},

	shoptifyRecordPayout: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "shoptifyRecordPayout");
		return recordPayout(ctx, {
			storeId: String(args.input.storeId),
			shopifyPayoutId: String(args.input.shopifyPayoutId),
			amount: Number(args.input.amount),
			currency: String(args.input.currency),
			status: args.input.status ? String(args.input.status) : undefined,
			payoutDate: args.input.payoutDate
				? new Date(String(args.input.payoutDate))
				: null,
		});
	},

	shoptifySaveRule: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "shoptifySaveRule");
		return saveRule(ctx, {
			id: args.input.id ? String(args.input.id) : null,
			name: String(args.input.name),
			storeId: args.input.storeId ? String(args.input.storeId) : null,
			triggerEvent: String(args.input.triggerEvent) as never,
			conditions: args.input.conditions ?? null,
			actions: args.input.actions ?? null,
			isActive:
				args.input.isActive === undefined
					? undefined
					: Boolean(args.input.isActive),
		});
	},

	shoptifyDeleteRule: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "shoptifyDeleteRule");
		return deleteRule(ctx, String(args.ruleId));
	},

	shoptifyExportOrders: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "shoptifyExportOrders");
		return exportShoptifyOrders(ctx, {
			filter: normalizeOrderFilter(args.filter),
			format: args.format,
		});
	},

	shoptifyExportProducts: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "shoptifyExportProducts");
		return exportShoptifyProducts(ctx, {
			filter: normalizeProductFilter(args.filter),
			format: args.format,
		});
	},
};

/* ------------------------------------------------------------------ */
/* Input normalizers                                                    */
/* ------------------------------------------------------------------ */

function normalizeOrderFilter(filter: any) {
	if (!filter) return {};
	return {
		storeId: filter.storeId ? String(filter.storeId) : undefined,
		financialStatus: filter.financialStatus ?? undefined,
		fulfillmentStatus: filter.fulfillmentStatus ?? undefined,
		hasException:
			filter.hasException === undefined
				? undefined
				: Boolean(filter.hasException),
		createdAfter: filter.createdAfter
			? new Date(String(filter.createdAfter))
			: undefined,
		createdBefore: filter.createdBefore
			? new Date(String(filter.createdBefore))
			: undefined,
		search: filter.search ?? undefined,
	};
}

function normalizeProductFilter(filter: any) {
	if (!filter) return {};
	return {
		storeId: filter.storeId ? String(filter.storeId) : undefined,
		masterSku: filter.masterSku ?? undefined,
		lowStockOnly:
			filter.lowStockOnly === undefined
				? undefined
				: Boolean(filter.lowStockOnly),
	};
}

function normalizeCustomerFilter(filter: any) {
	if (!filter) return {};
	return {
		isBlacklisted:
			filter.isBlacklisted === undefined
				? undefined
				: Boolean(filter.isBlacklisted),
		isHighRisk:
			filter.isHighRisk === undefined ? undefined : Boolean(filter.isHighRisk),
		search: filter.search ?? undefined,
	};
}

function normalizeFlagsInput(input: any) {
	return {
		orderId: String(input.orderId),
		tags:
			input.tags === undefined ? undefined : (input.tags as string[] | null),
		note: input.note === undefined ? undefined : (input.note as string | null),
		hasException:
			input.hasException === undefined
				? undefined
				: Boolean(input.hasException),
		exceptionReason:
			input.exceptionReason === undefined ? undefined : input.exceptionReason,
	};
}

function normalizeVariantInput(input: any) {
	return {
		variantId: String(input.variantId),
		availableQuantity:
			input.availableQuantity === undefined
				? undefined
				: Number(input.availableQuantity),
		price: input.price === undefined ? undefined : Number(input.price),
		status: input.status ?? undefined,
	};
}
