/**
 * Append-only system audit trail.
 *
 * Every administrative or state-changing action records who did it, to which
 * resource, the before/after values, when, from where, and which module it
 * belongs to. No operation edits or deletes a recorded event.
 */

import { eq } from "drizzle-orm";
import type { ModuleCode } from "../db/enums";
import { systemAuditLogs } from "../db/schema";
import type { ViewerContext } from "../graphql/context";

export interface AuditEventInput {
	action: string;
	moduleCode: ModuleCode | null;
	resourceType: string;
	resourceId?: string | null;
	oldData?: unknown;
	newData?: unknown;
	/** Overrides the acting user (for system-attributed events). */
	userId?: string | null;
}

function toJsonText(value: unknown): string | null {
	if (value === undefined || value === null) return null;
	if (typeof value === "string") return value;
	return JSON.stringify(value);
}

export async function recordAuditEvent(
	ctx: ViewerContext,
	input: AuditEventInput,
): Promise<void> {
	await ctx.db.insert(systemAuditLogs).values({
		id: crypto.randomUUID(),
		userId: input.userId ?? ctx.viewer?.id ?? null,
		action: input.action,
		moduleCode: input.moduleCode,
		resourceType: input.resourceType,
		resourceId: input.resourceId ?? null,
		oldData: toJsonText(input.oldData),
		newData: toJsonText(input.newData),
		ipAddress: ctx.request.ipAddress,
		userAgent: ctx.request.userAgent,
	});
}

/** Load a single audit event (used by the read-only Audit Log app). */
export async function findAuditEvent(ctx: ViewerContext, id: string) {
	const [row] = await ctx.db
		.select()
		.from(systemAuditLogs)
		.where(eq(systemAuditLogs.id, id))
		.limit(1);
	return row ?? null;
}
