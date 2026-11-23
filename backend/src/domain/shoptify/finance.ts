/**
 * Finance domain: payouts, per-order cost components, and net profit.
 *
 * Net profit per order is `revenue - cogs - shipping - gateway_fee - ad_spend`
 * (all integer minor units); payout rows track the Shopify Payments
 * lifecycle (`SCHEDULED` → `IN_TRANSIT` → `PAID`/`FAILED`). Aggregates are
 * computed from the expense rows by store and period so they can never drift
 * from the components.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import type { DatabaseHandle } from "../../db";
import { SHOPTIFY_PAYOUT_STATUSES } from "../../db/enums";
import {
	shoptifyOrderExpenses,
	shoptifyOrders,
	shoptifyPayouts,
	shoptifyStores,
} from "../../db/schema";
import type { ViewerContext } from "../../graphql/context";
import { DomainError } from "../../graphql/errors";
import { recordAuditEvent } from "../audit";
import { toOrder, toPayout } from "./shapes";

/* ------------------------------------------------------------------ */
/* Expenses and net profit                                             */
/* ------------------------------------------------------------------ */

export interface OrderExpensesInput {
	orderId: string;
	revenue: number;
	cogs?: number;
	shipping?: number;
	gatewayFee?: number;
	adSpend?: number;
}

/**
 * Record (or correct) one order's cost components and net profit.
 *
 * Upsert per order: the dashboard submits the latest numbers, not additions.
 * Net profit is computed here — the stored value is the contract for readers.
 */
export async function setOrderExpenses(
	ctx: ViewerContext,
	input: OrderExpensesInput,
): Promise<ReturnType<typeof toOrder>> {
	const [order] = await ctx.db
		.select()
		.from(shoptifyOrders)
		.where(eq(shoptifyOrders.id, input.orderId))
		.limit(1);
	if (!order) {
		throw new DomainError("NOT_FOUND", "Order not found.");
	}

	const values = {
		revenue: input.revenue,
		cogs: input.cogs ?? 0,
		shipping: input.shipping ?? 0,
		gatewayFee: input.gatewayFee ?? 0,
		adSpend: input.adSpend ?? 0,
	};
	const netProfit =
		values.revenue -
		values.cogs -
		values.shipping -
		values.gatewayFee -
		values.adSpend;

	await ctx.db
		.insert(shoptifyOrderExpenses)
		.values({
			id: crypto.randomUUID(),
			orderId: input.orderId,
			...values,
			netProfit,
		})
		.onConflictDoUpdate({
			target: shoptifyOrderExpenses.orderId,
			set: { ...values, netProfit, updatedAt: new Date() },
		});

	await recordAuditEvent(ctx, {
		action: "shoptify.order.expenses",
		moduleCode: "shoptify",
		resourceType: "shoptify_order",
		resourceId: input.orderId,
		newData: { ...values, netProfit },
	});

	const [expense] = await ctx.db
		.select()
		.from(shoptifyOrderExpenses)
		.where(eq(shoptifyOrderExpenses.orderId, input.orderId));
	return toOrder(order, { expense });
}

export interface FinanceSummary {
	revenue: number;
	cogs: number;
	shipping: number;
	gatewayFee: number;
	adSpend: number;
	netProfit: number;
	orderCount: number;
	payoutsByStatus: Record<string, { count: number; amount: number }>;
}

/** Aggregate the period for one store (or all stores when `storeId` is null). */
export async function financeSummary(
	db: DatabaseHandle,
	input: { storeId?: string | null; period?: string | null },
): Promise<FinanceSummary> {
	const conditions = [];
	if (input.storeId) conditions.push(eq(shoptifyOrders.storeId, input.storeId));
	if (input.period) {
		// `YYYY-MM` on the row's createdAt, in local time.
		const start = new Date(`${input.period}-01T00:00:00.000Z`);
		const end = new Date(start);
		end.setUTCMonth(end.getUTCMonth() + 1);
		conditions.push(
			sql`${shoptifyOrderExpenses.createdAt} >= ${start}`,
			sql`${shoptifyOrderExpenses.createdAt} < ${end}`,
		);
	}

	const where = conditions.length > 0 ? and(...conditions) : undefined;
	const [totals] = await db
		.select({
			revenue: sql<number>`coalesce(sum(${shoptifyOrderExpenses.revenue}), 0)`,
			cogs: sql<number>`coalesce(sum(${shoptifyOrderExpenses.cogs}), 0)`,
			shipping: sql<number>`coalesce(sum(${shoptifyOrderExpenses.shipping}), 0)`,
			gatewayFee: sql<number>`coalesce(sum(${shoptifyOrderExpenses.gatewayFee}), 0)`,
			adSpend: sql<number>`coalesce(sum(${shoptifyOrderExpenses.adSpend}), 0)`,
			netProfit: sql<number>`coalesce(sum(${shoptifyOrderExpenses.netProfit}), 0)`,
			orderCount: sql<number>`count(*)`,
		})
		.from(shoptifyOrderExpenses)
		.leftJoin(
			shoptifyOrders,
			eq(shoptifyOrderExpenses.orderId, shoptifyOrders.id),
		)
		.where(where);

	const payoutRows = await db
		.select({
			status: shoptifyPayouts.status,
			count: sql<number>`count(*)`,
			amount: sql<number>`coalesce(sum(${shoptifyPayouts.amount}), 0)`,
		})
		.from(shoptifyPayouts)
		.where(
			input.storeId ? eq(shoptifyPayouts.storeId, input.storeId) : undefined,
		)
		.groupBy(shoptifyPayouts.status);

	const payoutsByStatus: Record<string, { count: number; amount: number }> = {};
	for (const row of payoutRows) {
		payoutsByStatus[row.status] = {
			count: Number(row.count),
			amount: Number(row.amount),
		};
	}

	return {
		revenue: Number(totals?.revenue ?? 0),
		cogs: Number(totals?.cogs ?? 0),
		shipping: Number(totals?.shipping ?? 0),
		gatewayFee: Number(totals?.gatewayFee ?? 0),
		adSpend: Number(totals?.adSpend ?? 0),
		netProfit: Number(totals?.netProfit ?? 0),
		orderCount: Number(totals?.orderCount ?? 0),
		payoutsByStatus,
	};
}

/* ------------------------------------------------------------------ */
/* Payouts                                                             */
/* ------------------------------------------------------------------ */

export interface PayoutInput {
	storeId: string;
	shopifyPayoutId: string;
	amount: number;
	currency: string;
	status?: string;
	payoutDate?: Date | null;
}

/** Record or update a payout; the status flows through the lifecycle. */
export async function recordPayout(
	ctx: ViewerContext,
	input: PayoutInput,
): Promise<ReturnType<typeof toPayout>> {
	if (!SHOPTIFY_PAYOUT_STATUSES.includes(input.status as never)) {
		throw new DomainError(
			"VALIDATION_FAILED",
			`Unknown payout status: ${String(input.status)}`,
		);
	}

	await ctx.db
		.insert(shoptifyPayouts)
		.values({
			id: crypto.randomUUID(),
			storeId: input.storeId,
			shopifyPayoutId: input.shopifyPayoutId,
			amount: input.amount,
			currency: input.currency,
			status: input.status ?? "SCHEDULED",
			payoutDate: input.payoutDate ?? null,
		})
		.onConflictDoUpdate({
			target: [shoptifyPayouts.storeId, shoptifyPayouts.shopifyPayoutId],
			set: {
				amount: input.amount,
				status: input.status ?? "SCHEDULED",
				payoutDate: input.payoutDate ?? null,
				updatedAt: new Date(),
			},
		});

	const [store] = await ctx.db
		.select()
		.from(shoptifyStores)
		.where(eq(shoptifyStores.id, input.storeId))
		.limit(1);

	const [payout] = await ctx.db
		.select()
		.from(shoptifyPayouts)
		.where(
			and(
				eq(shoptifyPayouts.storeId, input.storeId),
				eq(shoptifyPayouts.shopifyPayoutId, input.shopifyPayoutId),
			),
		);
	return toPayout(payout, { storeName: store?.name ?? null });
}

export async function listPayouts(
	db: DatabaseHandle,
	storeId: string | null,
	page: { offset: number; limit: number },
): Promise<{ rows: ReturnType<typeof toPayout>[]; totalCount: number }> {
	const where = storeId ? eq(shoptifyPayouts.storeId, storeId) : undefined;
	const rows = await db
		.select()
		.from(shoptifyPayouts)
		.where(where)
		.orderBy(desc(shoptifyPayouts.payoutDate))
		.limit(page.limit)
		.offset(page.offset);

	const [countRow] = await db
		.select({ count: sql<number>`count(*)` })
		.from(shoptifyPayouts)
		.where(where);

	return {
		rows: rows.map((row) => toPayout(row)),
		totalCount: Number(countRow?.count ?? 0),
	};
}
