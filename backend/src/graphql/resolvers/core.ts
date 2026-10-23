/**
 * Shared core resolver surface (`API_CONTACT_SPECIFICATION.md` §7.1).
 *
 * Exposes the ticket-state and leave-code registries, nullable-safe for any
 * authenticated role, ordered by their configured `sortOrder`. Registries are
 * read-only, so the mutation map is empty.
 */

import { asc } from "drizzle-orm";
import { leaveCodes, ticketStates } from "../../db/schema";
import { authorize } from "../access";
import type { ViewerContext } from "../context";
import { toLeaveCodeInfo, toTicketState } from "../shapes";

type Resolver = (
	parent: unknown,
	args: any,
	contextValue: any,
	info: unknown,
) => unknown;

export const coreQuery: Record<string, Resolver> = {
	ticketStates: async (_parent, _args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "ticketStates");
		const rows = await ctx.db
			.select()
			.from(ticketStates)
			.orderBy(asc(ticketStates.sortOrder));
		return rows.map(toTicketState);
	},

	leaveCodes: async (_parent, _args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		authorize(ctx, "leaveCodes");
		const rows = await ctx.db
			.select()
			.from(leaveCodes)
			.orderBy(asc(leaveCodes.sortOrder));
		return rows.map(toLeaveCodeInfo);
	},
};

export const coreMutation: Record<string, Resolver> = {};
