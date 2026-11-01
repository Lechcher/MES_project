/**
 * Outbound Telegram delivery.
 *
 * The notification engine (best-effort, failure-isolated, never rolls back
 * the domain change) gains Telegram as a delivery target. The engine lives in
 * `domain/notifications.ts` and must not depend on the bot's runtime, so the
 * sender is registered here at bot start and stays `null` everywhere else —
 * tests register a recording sender, and an unstarted bot simply never
 * delivers (no throw, no silent success).
 */

import { and, eq } from "drizzle-orm";
import type { DatabaseHandle } from "../db";
import { telegramLinks } from "../db/schema";

/** The one function the running bot provides: send text to a chat id. */
export type TelegramSender = (
	chatId: string,
	text: string,
) => Promise<unknown> | unknown;

let sender: TelegramSender | null = null;

/** Register the live sender (called by `startTelegramBot`). */
export function setTelegramSender(next: TelegramSender | null): void {
	sender = next;
}

/** True when a live sender can deliver right now. */
export function telegramSenderReady(): boolean {
	return sender !== null;
}

/**
 * Deliver one message to every linked, push-enabled chat.
 *
 * The bot's global push-alert toggle decides whether this channel is
 * attempted at all; each active link gets the message. Failures are reported
 * per chat and never propagate — the caller records the outcome on the
 * notification row, exactly like the webhook path.
 */
export async function deliverTelegramPush(
	db: DatabaseHandle,
	text: string,
): Promise<{ delivered: boolean; reasons: string[] }> {
	if (!sender) {
		return { delivered: false, reasons: ["Telegram push is not active."] };
	}

	const links = await db
		.select()
		.from(telegramLinks)
		.where(and(eq(telegramLinks.isActive, true)));
	if (links.length === 0) {
		return { delivered: false, reasons: ["No linked Telegram accounts."] };
	}

	const reasons: string[] = [];
	let delivered = false;
	for (const link of links) {
		try {
			await sender(link.telegramChatId, text);
			delivered = true;
		} catch (error) {
			reasons.push(
				`${link.telegramChatId}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	return { delivered, reasons };
}
