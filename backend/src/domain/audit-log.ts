/**
 * Audit Log app domain service (`API_CONTACT_SPECIFICATION.md` §6.5).
 *
 * A read-only view over the append-only `system_audit_logs` store: the
 * system-wide activity stream (newest first, filtered) and the per-module
 * activity summary derived from the `modules` registry. No operation here
 * edits or deletes a recorded event.
 */

import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	isNotNull,
	lte,
	sql,
} from "drizzle-orm";
import type { SystemAuditLogRow } from "../db/schema";
import { modules, systemAuditLogs } from "../db/schema";
import type { ViewerContext } from "../graphql/context";

export interface ModuleAuditFilterInput {
	moduleCode?: string | null;
	userId?: string | null;
	action?: string | null;
	resourceType?: string | null;
	resourceId?: string | null;
	fromDate?: Date | null;
	toDate?: Date | null;
}

export interface ModuleActivitySummary {
	moduleCode: string;
	moduleName: string;
	eventCount: number;
	lastActivityAt: Date | null;
}

export interface AuditPage {
	nodes: SystemAuditLogRow[];
	totalCount: number;
}

function buildConditions(filter: ModuleAuditFilterInput | null | undefined) {
	const conditions = [];
	if (filter?.moduleCode) {
		conditions.push(eq(systemAuditLogs.moduleCode, filter.moduleCode));
	}
	if (filter?.userId)
		conditions.push(eq(systemAuditLogs.userId, filter.userId));
	if (filter?.action)
		conditions.push(eq(systemAuditLogs.action, filter.action));
	if (filter?.resourceType) {
		conditions.push(eq(systemAuditLogs.resourceType, filter.resourceType));
	}
	if (filter?.resourceId) {
		conditions.push(eq(systemAuditLogs.resourceId, filter.resourceId));
	}
	if (filter?.fromDate) {
		conditions.push(gte(systemAuditLogs.createdAt, filter.fromDate));
	}
	if (filter?.toDate) {
		conditions.push(lte(systemAuditLogs.createdAt, filter.toDate));
	}
	return conditions;
}

/** Newest-first page of audit events matching the filter. */
export async function listAuditLogs(
	ctx: ViewerContext,
	input: {
		filter?: ModuleAuditFilterInput | null;
		offset: number;
		limit: number;
	},
): Promise<AuditPage> {
	const conditions = buildConditions(input.filter);
	const where = conditions.length > 0 ? and(...conditions) : undefined;

	const [{ value: totalCount }] = await ctx.db
		.select({ value: count() })
		.from(systemAuditLogs)
		.where(where);

	const nodes = await ctx.db
		.select()
		.from(systemAuditLogs)
		.where(where)
		.orderBy(desc(systemAuditLogs.createdAt))
		.limit(input.limit)
		.offset(input.offset);

	return { nodes, totalCount };
}

/**
 * Per-module activity summary for the filter period.
 *
 * One row per registered module (`moduleCode`/`moduleName` from the `modules`
 * registry). Events with no module are unattributed and are not represented in
 * the registry-backed summary.
 */
export async function moduleActivity(
	ctx: ViewerContext,
	filter?: ModuleAuditFilterInput | null,
): Promise<ModuleActivitySummary[]> {
	const registry = await ctx.db
		.select()
		.from(modules)
		.orderBy(asc(modules.sortOrder));

	const scoped = filter?.moduleCode
		? registry.filter((module) => module.code === filter.moduleCode)
		: registry;

	const conditions = buildConditions(filter);
	conditions.push(isNotNull(systemAuditLogs.moduleCode));
	const where = and(...conditions);

	const grouped = await ctx.db
		.select({
			moduleCode: systemAuditLogs.moduleCode,
			eventCount: count(),
			lastActivityAt: sql<number | null>`max(${systemAuditLogs.createdAt})`,
		})
		.from(systemAuditLogs)
		.where(where)
		.groupBy(systemAuditLogs.moduleCode);

	const byCode = new Map(
		grouped.map((row) => [
			row.moduleCode ?? "",
			{
				eventCount: Number(row.eventCount),
				lastActivityAt: row.lastActivityAt,
			},
		]),
	);

	return scoped.map((module) => {
		const summary = byCode.get(module.code);
		return {
			moduleCode: module.code,
			moduleName: module.name,
			eventCount: summary?.eventCount ?? 0,
			lastActivityAt:
				summary?.lastActivityAt != null
					? new Date(Number(summary.lastActivityAt))
					: null,
		};
	});
}
