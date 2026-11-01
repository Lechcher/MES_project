/**
 * The AI surface: `/ask` and `/model`.
 *
 * `/ask` runs the read-only agent (`../ai/agent.ts`) as the linked viewer.
 * `/model` lists the cached catalog from the configured OpenAI-compatible
 * endpoint and switches the caller's model — persisted in
 * `telegram_user_prefs`, so the choice survives restarts without changing
 * anyone else's default.
 *
 * Registered behind the guard: `ctx.viewerContext` is always present here.
 */

import type { Composer } from "grammy";
import type { AppConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import { askAgent } from "../ai/agent";
import {
	CATALOG_MAX_AGE_MS,
	catalogAgeMs,
	isKnownModel,
	loadModelCatalog,
	refreshModelCatalog,
} from "../ai/catalog";
import type { BotContext } from "../bot-context";
import { clipToLimit } from "../render";
import { resolveBotSettings, setUserModel } from "../settings";

export interface AskCommandDependencies {
	db: DatabaseHandle;
	config: AppConfig;
}

export function registerAskCommands(
	composer: Composer<BotContext>,
	{ db, config }: AskCommandDependencies,
): void {
	composer.command("ask", async (ctx) => {
		const viewer = ctx.viewer;
		if (!viewer) return;
		const question = (ctx.match ?? "").toString().trim();
		if (question === "") {
			await ctx.reply(
				"Usage: /ask <question> — e.g. /ask which tickets are overdue this week?",
			);
			return;
		}

		const settings = await resolveBotSettings(db, config);
		const outcome = await askAgent(
			{ db, config },
			{
				viewer,
				question,
				settings: {
					aiBaseUrl: settings.aiBaseUrl,
					aiApiKey: settings.aiApiKey,
				},
			},
		);

		switch (outcome.kind) {
			case "answered":
				await ctx.reply(clipToLimit(outcome.text));
				return;
			case "budget-exhausted":
				await ctx.reply(
					`⛔ You have used all ${outcome.limit} AI questions in this 30-day window. Try again after it rolls over, or ask an administrator.`,
				);
				return;
			case "unavailable":
				await ctx.reply(`⚠️ ${outcome.reason}`);
				return;
		}
	});

	composer.command("model", async (ctx) => {
		const viewer = ctx.viewer;
		if (!viewer) return;
		const requested = (ctx.match ?? "").toString().trim();

		if (requested === "") {
			const age = await catalogAgeMs(db);
			const catalog = await loadModelCatalog(db);
			if (catalog.length === 0) {
				await ctx.reply(
					"No models are cached yet. Ask an administrator to configure the AI endpoint, then try /model refresh.",
				);
				return;
			}
			const stale = age !== null && age > CATALOG_MAX_AGE_MS;
			const lines = catalog.map((row) => `• ${row.modelId}`);
			await ctx.reply(
				[
					"AI endpoints offer:",
					...lines,
					"",
					"Switch with: /model <id>",
					stale
						? "\n⚠️ This list is over a day old — /model refresh to update."
						: "",
				]
					.filter((line) => line !== "")
					.join("\n"),
			);
			return;
		}

		if (requested === "refresh") {
			const settings = await resolveBotSettings(db, config);
			if (!settings.aiBaseUrl) {
				await ctx.reply(
					"AI search is not configured, so there is no catalog to refresh.",
				);
				return;
			}
			try {
				const entries = await refreshModelCatalog(db, settings);
				await ctx.reply(
					`Catalog refreshed: ${entries.length} model(s) available. /model lists them.`,
				);
			} catch {
				await ctx.reply(
					"⚠️ Could not reach the endpoint's catalog route. The previous list is kept.",
				);
			}
			return;
		}

		// A model id must come from the endpoint's catalog — an arbitrary
		// string would only fail later, at call time, with a confusing error.
		const cache = await loadModelCatalog(db);
		const known = cache.length === 0 || (await isKnownModel(db, requested));
		if (!known) {
			await ctx.reply(
				`❓ "${requested}" is not in the current catalog. /model lists what the endpoint offers (or /model refresh to update it).`,
			);
			return;
		}

		await setUserModel(db, viewer.id, requested);
		await ctx.reply(`✅ Model set to ${requested} for your questions.`);
	});
}
