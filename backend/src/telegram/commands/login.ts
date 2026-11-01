/**
 * Pre-login commands.
 *
 * `/start`, `/help` explain the surface; `/link` and `/login` authenticate
 * (link code preferred, credentials as the fallback); `/logout` ends the bot
 * session. These are the only commands reachable before the guard middleware
 * in `bot.ts` — everything else is declared behind it.
 */

import type { Composer } from "grammy";
import { verifyCredentials } from "../../auth";
import type { AppConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import type { BotContext } from "../bot-context";
import { escapeHtml, renderLoginPrompt } from "../render";
import {
	consumeLinkCode,
	resolveLinkedViewer,
	revokeLink,
	upsertLink,
} from "../settings";

export interface LoginCommandDependencies {
	db: DatabaseHandle;
	config: AppConfig;
}

/** The generic credential failure — identical for unknown or wrong. */
const INVALID_CREDENTIALS =
	"❌ Sign-in failed. Check your email/user code and password, and try again.";

export function registerLoginCommands(
	composer: Composer<BotContext>,
	{ db }: LoginCommandDependencies,
): void {
	composer.command("start", async (ctx) => {
		const linked = await resolveLinkedViewer(db, String(ctx.from?.id ?? ""));
		if (linked) {
			await ctx.reply(
				`👋 Welcome back, ${escapeHtml(linked.viewer.fullName)}. Send /help to see what you can do.`,
				{ parse_mode: "HTML" },
			);
			return;
		}
		await ctx.reply(renderLoginPrompt(), { parse_mode: "HTML" });
	});

	composer.command("help", async (ctx) => {
		await ctx.reply(renderLoginPrompt(), { parse_mode: "HTML" });
	});

	composer.command("link", async (ctx) => {
		const code = (ctx.match ?? "").toString().trim().toUpperCase();
		if (code === "") {
			await ctx.reply(
				"Usage: <code>/link LINK-XXXX</code> — generate the code in Settings → Telegram on the website.",
				{ parse_mode: "HTML" },
			);
			return;
		}

		const telegramUserId = String(ctx.from?.id ?? "");
		const telegramChatId = String(ctx.chat?.id ?? "");
		const consumed = await consumeLinkCode(
			db,
			code,
			telegramUserId,
			telegramChatId,
			ctx.from?.username ?? null,
		);

		if (!consumed) {
			await ctx.reply(
				"❌ That link code is invalid, expired, or already used. Generate a new one in Settings → Telegram.",
			);
			return;
		}

		const { loadViewer } = await import("../../auth");
		const viewer = await loadViewer(db, consumed.userId);
		await ctx.reply(
			viewer
				? `✅ Linked. Welcome, ${escapeHtml(viewer.fullName)}! Send /help to see what you can do.`
				: "✅ Linked, but this account is no longer active. Contact an administrator.",
			{ parse_mode: "HTML" },
		);
	});

	composer.on("message:text", async (ctx) => {
		const text = ctx.message?.text ?? "";
		if (!text.startsWith("/login")) return;
		if (
			String(ctx.from?.id ?? "") &&
			(await resolveLinkedViewer(db, String(ctx.from.id)))
		) {
			await ctx.reply(
				"You are already signed in. Use /logout to switch accounts.",
			);
			return;
		}

		const parts = text.slice("/login".length).trim().split(/\s+/);
		const [identifier, password] = parts;
		if (!identifier || !password) {
			await ctx.reply(
				"Usage: <code>/login email@mes.local your-password</code> (the link code is preferred).",
				{ parse_mode: "HTML" },
			);
			return;
		}

		// Delete the credential message where Telegram allows it, before any
		// processing that could fail and leave it in the history.
		try {
			await ctx.deleteMessage();
		} catch {
			// No delete rights (or the message is too old): proceed anyway —
			// the credentials are never stored by us either way.
		}

		const viewer = await verifyCredentials(db, identifier, password);
		if (!viewer) {
			await ctx.reply(INVALID_CREDENTIALS);
			return;
		}

		await upsertLink(db, {
			userId: viewer.id,
			telegramUserId: String(ctx.from?.id ?? ""),
			telegramChatId: String(ctx.chat?.id ?? ""),
			telegramUsername: ctx.from?.username ?? null,
		});
		await ctx.reply(
			`✅ Signed in as ${escapeHtml(viewer.fullName)}. Send /help to see what you can do.`,
			{ parse_mode: "HTML" },
		);
	});

	composer.command("logout", async (ctx) => {
		const resolved = await resolveLinkedViewer(db, String(ctx.from?.id ?? ""));
		if (!resolved) {
			await ctx.reply("You are not signed in on this bot.");
			return;
		}
		await revokeLink(db, resolved.linkId);
		await ctx.reply("👋 Signed out. This chat can no longer reach the system.");
	});
}
