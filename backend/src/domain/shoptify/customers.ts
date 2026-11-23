/**
 * Customers domain: cross-store aggregation and risk flags.
 *
 * One person, one profile: profiles are keyed by contact identifiers
 * (email first, phone as fallback) so orders from two stores for the same
 * customer land on one row. Aggregates (order count, total spend) are
 * recomputed from the order rows on demand — they are cheap for the volumes
 * this module handles and never drift.
 */

import { and, eq, or, sql } from "drizzle-orm";
import type { DatabaseHandle } from "../../db";
import { shoptifyCustomers, shoptifyOrders } from "../../db/schema";
import type { ViewerContext } from "../../graphql/context";
import { DomainError } from "../../graphql/errors";
import { recordAuditEvent } from "../audit";
import { toCustomer } from "./shapes";

/** Filter shape shared by the GraphQL input and the domain. */
export interface CustomerFilter {
	isBlacklisted?: boolean;
	isHighRisk?: boolean;
	search?: string;
}

/**
 * Fold one ingested order into its customer profile.
 *
 * Upserts the profile by contact identifier, then recomputes the aggregates
 * from all of the customer's orders. Called from the order listener so every
 * ingested order refreshes the profile.
 */
export async function refreshCustomerForOrder(
	db: DatabaseHandle,
	input: {
		email?: string | null;
		phone?: string | null;
		orderTotal: number;
	},
): Promise<{ customerId: string; created: boolean }> {
	const email = input.email?.trim() ?? "";
	const phone = input.phone?.trim() ?? "";
	if (email === "" && phone === "") {
		// Guest checkouts with no contact identifiers stay out of profiles.
		return { customerId: "", created: false };
	}

	const conditions = [];
	if (email !== "") conditions.push(eq(shoptifyCustomers.email, email));
	if (phone !== "") conditions.push(eq(shoptifyCustomers.phone, phone));
	const [existing] = await db
		.select()
		.from(shoptifyCustomers)
		.where(and(...conditions))
		.limit(1);

	let customerId: string;
	let created = false;
	if (existing) {
		customerId = existing.id;
	} else {
		customerId = crypto.randomUUID();
		created = true;
		await db.insert(shoptifyCustomers).values({
			id: customerId,
			email: email === "" ? null : email,
			phone: phone === "" ? null : phone,
		});
	}

	await recomputeCustomerTotals(db, customerId);
	return { customerId, created };
}

/** Recompute one profile's order count and total spend from its orders. */
export async function recomputeCustomerTotals(
	db: DatabaseHandle,
	customerId: string,
): Promise<void> {
	const [customer] = await db
		.select()
		.from(shoptifyCustomers)
		.where(eq(shoptifyCustomers.id, customerId))
		.limit(1);
	if (!customer) return;

	const match = [];
	if (customer.email)
		match.push(eq(shoptifyOrders.customerEmail, customer.email));
	if (customer.phone)
		match.push(eq(shoptifyOrders.customerPhone, customer.phone));
	if (match.length === 0) return;

	const [totals] = await db
		.select({
			count: sql<number>`count(*)`,
			spent: sql<number>`coalesce(sum(${shoptifyOrders.totalPrice}), 0)`,
		})
		.from(shoptifyOrders)
		.where(or(...match));

	await db
		.update(shoptifyCustomers)
		.set({
			totalOrdersCount: Number(totals?.count ?? 0),
			totalSpent: Number(totals?.spent ?? 0),
			updatedAt: new Date(),
		})
		.where(eq(shoptifyCustomers.id, customerId));
}

export async function listCustomers(
	db: DatabaseHandle,
	filter: CustomerFilter,
	page: { offset: number; limit: number },
): Promise<{ rows: ReturnType<typeof toCustomer>[]; totalCount: number }> {
	const conditions = [];
	if (filter.isBlacklisted !== undefined)
		conditions.push(eq(shoptifyCustomers.isBlacklisted, filter.isBlacklisted));
	if (filter.isHighRisk !== undefined)
		conditions.push(eq(shoptifyCustomers.isHighRisk, filter.isHighRisk));
	if (filter.search) {
		const like = `%${filter.search}%`;
		// `ilike`: PostgreSQL's LIKE is case-sensitive, and the search the
		// SQLite build served matched case-insensitively.
		conditions.push(
			sql`(${shoptifyCustomers.email} ilike ${like} or ${shoptifyCustomers.phone} ilike ${like})`,
		);
	}

	const where = conditions.length > 0 ? and(...conditions) : undefined;
	const rows = await db
		.select()
		.from(shoptifyCustomers)
		.where(where)
		.orderBy(sql`coalesce(${shoptifyCustomers.totalSpent}, 0) desc`)
		.limit(page.limit)
		.offset(page.offset);

	const [countRow] = await db
		.select({ count: sql<number>`count(*)` })
		.from(shoptifyCustomers)
		.where(where);

	return {
		rows: rows.map(toCustomer),
		totalCount: Number(countRow?.count ?? 0),
	};
}

export interface CustomerFlagInput {
	customerId: string;
	isBlacklisted?: boolean;
	isHighRisk?: boolean;
	notes?: string | null;
}

/** Set blacklist/high-risk flags and notes; audited per change. */
export async function setCustomerFlags(
	ctx: ViewerContext,
	input: CustomerFlagInput,
): Promise<ReturnType<typeof toCustomer>> {
	const [existing] = await ctx.db
		.select()
		.from(shoptifyCustomers)
		.where(eq(shoptifyCustomers.id, input.customerId))
		.limit(1);
	if (!existing) {
		throw new DomainError("NOT_FOUND", "Customer not found.");
	}

	const changes: Record<string, unknown> = {};
	if (input.isBlacklisted !== undefined)
		changes.isBlacklisted = input.isBlacklisted;
	if (input.isHighRisk !== undefined) changes.isHighRisk = input.isHighRisk;
	if (input.notes !== undefined) changes.notes = input.notes;

	if (Object.keys(changes).length > 0) {
		await ctx.db
			.update(shoptifyCustomers)
			.set({ ...changes, updatedAt: new Date() })
			.where(eq(shoptifyCustomers.id, input.customerId));
		await recordAuditEvent(ctx, {
			action: "shoptify.customer.flags",
			moduleCode: "shoptify",
			resourceType: "shoptify_customer",
			resourceId: input.customerId,
			oldData: {
				isBlacklisted: existing.isBlacklisted,
				isHighRisk: existing.isHighRisk,
				notes: existing.notes,
			},
			newData: changes,
		});
	}

	const [updated] = await ctx.db
		.select()
		.from(shoptifyCustomers)
		.where(eq(shoptifyCustomers.id, input.customerId))
		.limit(1);
	if (!updated) throw new DomainError("NOT_FOUND", "Customer not found.");
	return toCustomer(updated);
}
