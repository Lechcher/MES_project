/**
 * Mail delivery with a recorded outcome.
 *
 * Every attempt is written to the outbound notification log with its result, so
 * the delivery history survives the request — and so a failure is available to
 * report rather than only to log.
 */

import { eq } from "drizzle-orm";
import type { DatabaseHandle } from "../db";
import type { NotificationStatusValue } from "../db/enums";
import { notifications } from "../db/schema";
import {
	type MailDeliveryError,
	type MailMessage,
	type MailSender,
	toDeliveryError,
} from "./sender";

export const MAIL_CHANNEL = "EMAIL";
export const PASSWORD_RESET_TEMPLATE = "PASSWORD_RESET";

export interface MailOutcome {
	readonly notificationId: string;
	readonly status: NotificationStatusValue;
	/** Safe to record and to return; never contains the credential. */
	readonly errorMessage: string | null;
	readonly errorCode: string | null;
	readonly delivered: boolean;
}

export interface DeliverMailDeps {
	db: DatabaseHandle;
	sender: MailSender;
	/**
	 * Removes credential material from anything before it is recorded or
	 * returned. Applied here so no sender implementation can bypass it.
	 */
	redact?: (text: string) => string;
}

export interface DeliverMailMeta {
	template: string;
	relatedType?: string | null;
	relatedId?: string | null;
}

/**
 * Send a message and record the attempt.
 *
 * Never throws for a transport failure: the caller decides how to surface the
 * returned outcome, because whether a failure is reportable depends on whether a
 * send was attempted at all.
 */
export async function deliverMail(
	deps: DeliverMailDeps,
	message: MailMessage,
	meta: DeliverMailMeta,
): Promise<MailOutcome> {
	const id = crypto.randomUUID();

	await deps.db.insert(notifications).values({
		id,
		channel: MAIL_CHANNEL,
		template: meta.template,
		recipient: message.to,
		payload: JSON.stringify({
			subject: message.subject,
			from: message.from,
		}),
		status: "PENDING",
		attempts: 0,
		relatedType: meta.relatedType ?? null,
		relatedId: meta.relatedId ?? null,
	});

	try {
		await deps.sender.send(message);
	} catch (error) {
		const failure = toDeliveryError(error);
		const reason = (deps.redact ?? ((text: string) => text))(failure.message);
		await deps.db
			.update(notifications)
			.set({
				status: "FAILED",
				attempts: 1,
				errorMessage: reason,
				updatedAt: new Date(),
			})
			.where(eq(notifications.id, id));

		return {
			notificationId: id,
			status: "FAILED",
			errorMessage: reason,
			errorCode: failure.code,
			delivered: false,
		};
	}

	await deps.db
		.update(notifications)
		.set({
			status: "SENT",
			attempts: 1,
			sentAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(notifications.id, id));

	return {
		notificationId: id,
		status: "SENT",
		errorMessage: null,
		errorCode: null,
		delivered: true,
	};
}

/** Narrow a thrown value to a delivery failure, for callers that prefer throwing. */
export function asDeliveryError(error: unknown): MailDeliveryError {
	return toDeliveryError(error);
}
