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

import { Bot, GrammyError } from "grammy";
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

/** How many start attempts (initial plus retries) are made before giving up. */
export const POLL_MAX_ATTEMPTS = 5;

/** The first retry delay; each subsequent attempt doubles it, capped below. */
const POLL_BACKOFF_MS = 2000;
const POLL_BACKOFF_CAP_MS = 30000;

/**
 * True when a start failure is Telegram's 409 "another getUpdates is active".
 *
 * Only this error is transient: a watch-mode restart can overlap the previous
 * instance's polling window, and retrying on a fresh instance recovers. Every
 * other failure (401 unauthorized, a network error) is terminal — the
 * supervisor stops and clears the sender.
 */
export function isTelegramConflict(error: unknown): boolean {
	return error instanceof GrammyError && error.error_code === 409;
}

/** Injectable seams for the polling supervisor, so tests can drive it. */
export interface PollSupervisionOptions {
	/** Build a bot instance; defaults to a fresh grammY `Bot`. */
	createBot?: (token: string) => Bot<BotContext>;
	/** Wait between retries; defaults to a real exponential backoff. */
	wait?: (delayMs: number) => Promise<void>;
}

/** The default retry wait: exponential backoff, capped. */
async function defaultWait(delayMs: number): Promise<void> {
	await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Start the bot if — and only if — it is enabled with a resolvable token.
 *
 * Returns the running handle, or null when the bot is disabled or has no token.
 * Polling runs in the background: a healthy poll only ends when the bot dies,
 * so the handle returns without awaiting it. A 409 conflict (a superseded
 * instance still holding `getUpdates`) is retried on a fresh instance with a
 * bounded backoff; any other start failure, or exhausting the attempts, logs
 * one line and clears the sender — the API service is never taken down.
 */
export async function startTelegramBot(
	deps: BotDependencies,
	options: PollSupervisionOptions = {},
): Promise<BotHandle | null> {
	const createBot =
		options.createBot ?? ((token: string) => new Bot<BotContext>(token));
	const wait = options.wait ?? defaultWait;

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

	const token = settings.botToken;
	const state = { current: null as Bot<BotContext> | null, stopped: false };

	// Run polling in the background and supervise retries. Each iteration
	// builds a fresh instance — the running instance is also the notification
	// engine's Telegram channel, so the sender is re-registered per instance.
	const supervise = async (): Promise<void> => {
		let attempt = 0;
		while (!state.stopped) {
			const bot = createBot(token);
			state.current = bot;
			configureBot(bot, deps);
			setTelegramSender((chatId, text) => bot.api.sendMessage(chatId, text));
			attempt += 1;
			try {
				await bot.start({
					onStart: (info) => {
						console.log(
							`[mes] telegram bot @${info.username} started (long polling)`,
						);
					},
				});
				// Polling ended without an error (the bot was stopped).
				return;
			} catch (error) {
				if (state.stopped) return;
				if (isTelegramConflict(error) && attempt < POLL_MAX_ATTEMPTS) {
					// A superseded instance holds getUpdates: back off and retry
					// on a fresh one. The failed instance never polled, so there
					// is nothing to stop.
					await wait(
						Math.min(POLL_BACKOFF_MS * 2 ** (attempt - 1), POLL_BACKOFF_CAP_MS),
					);
					if (state.stopped) return;
					continue;
				}
				setTelegramSender(null);
				console.error(
					`[mes] telegram bot failed to start: ${error instanceof Error ? error.message : String(error)}`,
				);
				return;
			}
		}
	};

	void supervise().catch((error) => {
		setTelegramSender(null);
		console.error(
			`[mes] telegram bot supervisor error: ${error instanceof Error ? error.message : String(error)}`,
		);
	});

	return {
		get bot() {
			return state.current as Bot<BotContext>;
		},
		async stop() {
			// A stopped bot must not keep answering deliveries, and the
			// supervisor must not start a fresh instance mid-shutdown.
			state.stopped = true;
			setTelegramSender(null);
			const bot = state.current;
			if (bot) await bot.stop();
		},
	};
}
