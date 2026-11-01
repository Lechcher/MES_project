/**
 * Bot bootstrap.
 *
 * Mounts the middleware chain onto a grammY Bot: pre-login commands first,
 * then the authentication guard, then the feature surface, then the AI
 * surface, then the text fallbacks. The bot runs by long polling, so no
 * public URL is involved; `stop()` drains gracefully.
 *
 * `startTelegramBot` resolves the bot's settings *at start time* — the token
 * may come from the environment, the website, or the outbound webhook's
 * configuration, and only the path that decides has to know that. A
 * disabled bot (or one without a token) logs one line and returns null, so
 * the API service is untouched. A polling failure is contained the same way:
 * logged, never fatal.
 */

import { Bot } from "grammy";
import type { AppConfig } from "../config";
import type { DatabaseHandle } from "../db";
import type { BotContext } from "./bot-context";
import { registerAskCommands } from "./commands/ask";
import { registerFeatureCommands } from "./commands/features";
import { registerLoginCommands } from "./commands/login";
import { authMiddleware } from "./guard";
import { setTelegramSender } from "./sender";
import { resolveBotSettings } from "./settings";

export interface BotDependencies {
	db: DatabaseHandle;
	config: AppConfig;
}

/** A running bot: the instance plus its lifecycle controls. */
export interface BotHandle {
	bot: Bot<BotContext>;
	stop(): Promise<void>;
}

/** Mount every command and middleware onto a constructed bot. */
export function configureBot(
	bot: Bot<BotContext>,
	{ db, config }: BotDependencies,
): void {
	// Pre-login surface: declared before the guard so an unlinked chat can
	// reach exactly these four commands and nothing else.
	registerLoginCommands(bot, { db, config });

	// The guard resolves the linked viewer (or refuses the chat entirely).
	bot.use(authMiddleware({ db, config }));

	// Feature surface: /notifications /lookup /newticket /audit /status.
	registerFeatureCommands(bot, { db, config });

	// AI surface: /ask and /model. (The /newticket draft continuation is
	// registered inside the feature surface, so it wins over these fallbacks.)
	registerAskCommands(bot, { db, config });

	// Unknown commands and stray text must not fail silently.
	bot.on("message:text", async (ctx) => {
		if (ctx.message?.text?.startsWith("/")) {
			await ctx.reply("Unknown command. Send /help for the list.");
			return;
		}
		await ctx.reply("Send /help, or /ask <question> to search the system.");
	});

	// A throwing handler must never kill the polling loop: catch, report,
	// keep the bot alive.
	bot.catch(async (error) => {
		console.error(
			`[mes] telegram bot error: ${error.error instanceof Error ? error.error.message : String(error.error)}`,
		);
		try {
			await error.ctx.reply(
				"⚠️ Something went wrong handling that. Please try again.",
			);
		} catch {
			// The chat itself may be unreachable; nothing more to do.
		}
	});
}

/**
 * Start the bot if — and only if — it is enabled with a resolvable token.
 *
 * Returns the running handle, or null when the bot is disabled, has no token,
 * or could not start (the reason is logged in each case).
 */
export async function startTelegramBot(
	deps: BotDependencies,
): Promise<BotHandle | null> {
	const settings = await resolveBotSettings(deps.db, deps.config);

	if (!settings.enabled) {
		console.log(
			"[mes] telegram bot disabled (no environment or website enable)",
		);
		return null;
	}
	if (!settings.botToken) {
		console.log(
			"[mes] telegram bot enabled but no token resolved — set TELEGRAM_BOT_TOKEN or configure it in Settings → Telegram",
		);
		return null;
	}

	const bot = new Bot<BotContext>(settings.botToken);
	configureBot(bot, deps);

	// The running bot is also the notification engine's Telegram channel:
	// domain events with push alerts enabled reach linked chats through this
	// sender. Registered before polling starts, so a delivery attempted right
	// after boot has a sender.
	setTelegramSender((chatId, text) => bot.api.sendMessage(chatId, text));

	try {
		await bot.start({
			// Watch-mode restarts overlap a getUpdates window; grammY's own
			// 409 handling recovers, so this only trims the wait.
			onStart: (info) => {
				console.log(
					`[mes] telegram bot @${info.username} started (long polling)`,
				);
			},
		});
	} catch (error) {
		setTelegramSender(null);
		console.error(
			`[mes] telegram bot failed to start: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}

	return {
		bot,
		async stop() {
			// A stopped bot must not keep answering deliveries.
			setTelegramSender(null);
			await bot.stop();
		},
	};
}
