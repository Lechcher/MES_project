/**
 * Telegram notification engine.
 *
 * Documented workflow events are turned into notification records that are
 * delivered through the saved webhook configuration. Delivery is attempted
 * after the domain change is committed, and the outcome is recorded separately
 * so an external outage can neither roll back the domain change nor be reported
 * as a successful delivery.
 */

import { eq } from "drizzle-orm";
import type { NotificationStatusValue } from "../db/enums";
import { notifications, telegramWebhookConfig } from "../db/schema";
import type { ViewerContext } from "../graphql/context";

export interface NotificationInput {
	template: string;
	recipient?: string | null;
	payload?: unknown;
	relatedType?: string | null;
	relatedId?: string | null;
}

export const NOTIFICATION_TEMPLATES = {
	TASK_ACCEPTED: "TASK_ACCEPTED",
	TASK_SUBMITTED: "TASK_SUBMITTED",
	TASK_APPROVED: "TASK_APPROVED",
	TASK_RETURNED: "TASK_RETURNED",
	TASK_CANCELLED: "TASK_CANCELLED",
	TASK_COMPLETION_REQUESTED: "TASK_COMPLETION_REQUESTED",
	TASK_COMPLETION_APPROVED: "TASK_COMPLETION_APPROVED",
	TASK_COMPLETION_REJECTED: "TASK_COMPLETION_REJECTED",
	EXTENSION_REQUESTED: "EXTENSION_REQUESTED",
	LATE_SUBMISSION_EXPLAINED: "LATE_SUBMISSION_EXPLAINED",
	LEAVE_REGISTERED: "LEAVE_REGISTERED",
	LEAVE_APPROVED: "LEAVE_APPROVED",
	LEAVE_REJECTED: "LEAVE_REJECTED",
	PENALTY_LEAVE_ASSIGNED: "PENALTY_LEAVE_ASSIGNED",
} as const;

export async function loadWebhookConfig(ctx: ViewerContext) {
	const [row] = await ctx.db.select().from(telegramWebhookConfig).limit(1);
	return row ?? null;
}

/**
 * Create a pending notification and attempt delivery.
 * Returns the recorded status: `SENT` only when the webhook accepted it.
 */
export async function dispatchNotification(
	ctx: ViewerContext,
	input: NotificationInput,
): Promise<{ id: string; status: NotificationStatusValue }> {
	const config = await loadWebhookConfig(ctx);
	const id = crypto.randomUUID();
	const payloadText =
		input.payload === undefined || input.payload === null
			? null
			: JSON.stringify(input.payload);

	const enabled = Boolean(config?.isEnabled && config?.webhookUrl);

	await ctx.db.insert(notifications).values({
		id,
		channel: "TELEGRAM",
		template: input.template,
		recipient: input.recipient ?? config?.alertGroupChatId ?? null,
		payload: payloadText,
		status: "PENDING",
		attempts: 0,
		relatedType: input.relatedType ?? null,
		relatedId: input.relatedId ?? null,
	});

	if (!enabled) {
		// Disabled configuration is not a failure: record the reason and stop.
		await ctx.db
			.update(notifications)
			.set({
				status: "FAILED",
				attempts: 1,
				errorMessage:
					"Telegram notifications are not enabled or not configured.",
				updatedAt: new Date(),
			})
			.where(eq(notifications.id, id));

		return { id, status: "FAILED" };
	}

	if (!ctx.config.allowOutboundNotifications) {
		await ctx.db
			.update(notifications)
			.set({
				status: "FAILED",
				attempts: 1,
				errorMessage:
					"Outbound notifications are disabled in this environment.",
				updatedAt: new Date(),
			})
			.where(eq(notifications.id, id));

		return { id, status: "FAILED" };
	}

	try {
		const response = await fetch(config?.webhookUrl ?? "", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: payloadText ?? JSON.stringify({ template: input.template, id }),
		});

		if (!response.ok) {
			throw new Error(`Telegram webhook responded ${response.status}`);
		}

		await ctx.db
			.update(notifications)
			.set({
				status: "SENT",
				attempts: 1,
				sentAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(notifications.id, id));

		return { id, status: "SENT" };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await ctx.db
			.update(notifications)
			.set({
				status: "FAILED",
				attempts: 1,
				errorMessage: message,
				updatedAt: new Date(),
			})
			.where(eq(notifications.id, id));

		return { id, status: "FAILED" };
	}
}

/**
 * Fire a notification for a domain event without letting delivery problems
 * escape into the caller's committed transaction.
 */
export async function notify(
	ctx: ViewerContext,
	input: NotificationInput,
): Promise<void> {
	try {
		await dispatchNotification(ctx, input);
	} catch {
		// Notification records are best-effort; the domain change already committed.
	}
}
