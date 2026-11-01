/**
 * The authentication guard.
 *
 * One middleware resolves the Telegram identity to the linked MES viewer and
 * stores both on the context. Commands that must work *before* login
 * (`/start`, `/help`, `/link`, `/login`) are declared before this middleware
 * is mounted in `bot.ts`; everything declared after it can treat
 * `ctx.viewerContext` as present — an unlinked chat is refused here with the
 * login instructions instead.
 */

import type { AppConfig } from "../config";
import type { DatabaseHandle } from "../db";
import { createContext } from "../graphql/context";
import type { BotContext } from "./bot-context";
import { renderLoginPrompt } from "./render";
import { resolveLinkedViewer } from "./settings";

export interface GuardDependencies {
	db: DatabaseHandle;
	config: AppConfig;
}

/** User-agent tag recorded on audit rows produced through the bot. */
export const BOT_USER_AGENT = "telegram-bot";

/**
 * Resolve the current update's Telegram identity onto the context.
 *
 * `ctx.from.id` is the identity Telegram itself authenticates — never a
 * display name or username from the message text. A link whose MES account
 * has since been deactivated resolves to null exactly like no link at all.
 */
export function authMiddleware({ db, config }: GuardDependencies) {
	return async (ctx: BotContext, next: () => Promise<void>): Promise<void> => {
		const telegramUserId = String(ctx.from?.id ?? "");
		const resolved = telegramUserId
			? await resolveLinkedViewer(db, telegramUserId)
			: null;

		if (resolved) {
			ctx.viewer = resolved.viewer;
			ctx.viewerContext = createContext({
				db,
				config,
				request: { ipAddress: null, userAgent: BOT_USER_AGENT },
				viewer: resolved.viewer,
			});
			return next();
		}

		ctx.viewer = null;
		ctx.viewerContext = null;
		const chatId = String(ctx.chat?.id ?? "");
		if (chatId !== "") {
			await ctx.reply(renderLoginPrompt(), { parse_mode: "HTML" });
		}
		// Deliberately no next(): the unauthenticated chat reaches nothing.
	};
}
