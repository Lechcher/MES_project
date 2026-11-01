/**
 * Bot settings resolution.
 *
 * Every bot setting answers through this one module, so the precedence ladder
 * has a single definition: **per-user preference → website setting →
 * environment variable → built-in default**. The environment bootstraps a
 * fresh deployment (`.env.example` documents each variable), anything saved in
 * Settings → Telegram on the website overrides it, and a per-user choice (the
 * AI model) overrides the global value without changing it for anyone else.
 *
 * Secrets (bot token, AI API key) are only ever resolved here and masked
 * everywhere else; this module never logs a resolved value.
 */

import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { AppConfig } from "../config";
import type { DatabaseHandle } from "../db";
import type { RoleCode } from "../db/enums";
import {
	telegramBotSettings,
	telegramLinkCodes,
	telegramLinks,
	telegramUserPrefs,
} from "../db/schema";
import type { Viewer } from "../graphql/context";

/** The fully resolved runtime configuration the bot runs on. */
export interface ResolvedBotSettings {
	/** False keeps the bot inert: no polling, no token use. */
	enabled: boolean;
	/** Bot token, or null when neither environment nor website provides one. */
	botToken: string | null;
	/** The singleton website row (created on first read, as the webhook row is). */
	settingsRowId: string;
	/** Whether the website row currently enables push alerts. */
	pushAlertsEnabled: boolean;
	/** OpenAI-compatible endpoint base URL, or null when unconfigured. */
	aiBaseUrl: string | null;
	/** API key for that endpoint, or null when it needs none. */
	aiApiKey: string | null;
	/** Default model id for `/ask`; null means no default is configured yet. */
	aiDefaultModel: string | null;
}

/** Mask a secret for any surface other than the settings editor. */
export function maskSecret(value: string | null | undefined): string | null {
	if (value === null || value === undefined || value === "") return null;
	if (value.length <= 4) return "****";
	return `****${value.slice(-4)}`;
}

/**
 * Read the singleton website settings row, creating it (disabled, empty) on
 * first use — the same read-or-create the outbound webhook row performs, so
 * both Telegram configurations live in one predictable place.
 */
export async function loadBotSettingsRow(db: DatabaseHandle) {
	const [existing] = await db.select().from(telegramBotSettings).limit(1);
	if (existing) return existing;

	const id = crypto.randomUUID();
	await db.insert(telegramBotSettings).values({ id });
	const [created] = await db
		.select()
		.from(telegramBotSettings)
		.where(eq(telegramBotSettings.id, id))
		.limit(1);
	return created;
}

/**
 * Resolve the effective bot settings.
 *
 * The token prefers the website value, then the environment value, then the
 * token the outbound webhook configuration already carries (so a deployment
 * that configured Telegram before this change needs no re-entry). The
 * enable flag is the OR of the two switches — either side can turn the bot
 * on, and only the side that enabled it can turn it off again.
 */
export async function resolveBotSettings(
	db: DatabaseHandle,
	config: AppConfig,
): Promise<ResolvedBotSettings> {
	const row = await loadBotSettingsRow(db);

	const { telegramWebhookConfig } = await import("../db/schema");
	const [webhook] = await db.select().from(telegramWebhookConfig).limit(1);

	const botToken =
		row.botToken?.trim() ||
		config.telegramBotToken ||
		webhook?.botToken?.trim() ||
		null;

	return {
		enabled: row.isEnabled || config.telegramBotEnabled,
		botToken,
		settingsRowId: row.id,
		pushAlertsEnabled: row.pushAlertsEnabled,
		aiBaseUrl: row.aiBaseUrl?.trim() || config.telegramAiBaseUrl || null,
		aiApiKey: row.aiApiKey?.trim() || config.telegramAiApiKey || null,
		aiDefaultModel:
			row.aiDefaultModel?.trim() || config.telegramAiDefaultModel || null,
	};
}

/**
 * Per-user model preference overrides the global default.
 *
 * Stored per user so one operator pointing the bot at a bigger model changes
 * nothing for anyone else (spec: "Per-user model preference overrides the
 * global default").
 */
export async function resolveAiModel(
	db: DatabaseHandle,
	config: AppConfig,
	viewer: Viewer | null,
): Promise<string | null> {
	if (viewer) {
		const [pref] = await db
			.select()
			.from(telegramUserPrefs)
			.where(eq(telegramUserPrefs.userId, viewer.id))
			.limit(1);
		if (pref?.selectedModel?.trim()) return pref.selectedModel.trim();
	}

	const row = await loadBotSettingsRow(db);
	return (
		row.aiDefaultModel?.trim() || config.telegramAiDefaultModel?.trim() || null
	);
}

/** Persist one user's model choice. */
export async function setUserModel(
	db: DatabaseHandle,
	userId: string,
	model: string,
): Promise<void> {
	await db
		.insert(telegramUserPrefs)
		.values({ userId, selectedModel: model, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: telegramUserPrefs.userId,
			set: { selectedModel: model, updatedAt: new Date() },
		});
}

/* ------------------------------------------------------------------ */
/* Links (the bot session)                                             */
/* ------------------------------------------------------------------ */

/**
 * Resolve the linked viewer for a Telegram user id, or null.
 *
 * Only an *active* link whose MES account is still active resolves here;
 * the viewer lookup rejects deactivated accounts, so revocation from the
 * website and account deactivation behave identically to no link at all.
 */
export async function resolveLinkedViewer(
	db: DatabaseHandle,
	telegramUserId: string,
): Promise<{ viewer: Viewer; linkId: string; chatId: string } | null> {
	const [link] = await db
		.select()
		.from(telegramLinks)
		.where(
			and(
				eq(telegramLinks.telegramUserId, telegramUserId),
				eq(telegramLinks.isActive, true),
			),
		)
		.limit(1);
	if (!link) return null;

	const { loadViewer } = await import("../auth");
	const viewer = await loadViewer(db, link.userId);
	if (!viewer) return null;

	return { viewer, linkId: link.id, chatId: link.telegramChatId };
}

/* ------------------------------------------------------------------ */
/* Link codes                                                          */
/* ------------------------------------------------------------------ */

/** Time-to-live of a link code, from configuration (minutes). */
export function linkCodeExpiry(config: AppConfig): Date {
	return new Date(Date.now() + config.telegramLinkCodeTtlMinutes * 60 * 1000);
}

/** The plaintext code a user sends to the bot. Never stored. */
export function generateLinkCode(): string {
	// Crockford-style alphabet: no I/L/O/0/1 ambiguity in a chat message.
	const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
	const bytes = crypto.getRandomValues(new Uint8Array(8));
	let code = "";
	for (const byte of bytes) code += alphabet[byte % alphabet.length];
	return `LINK-${code}`;
}

export async function hashLinkCode(code: string): Promise<string> {
	const normalized = code.trim().toUpperCase();
	// Synchronous SHA-256 via node:crypto: link codes are hashed at most once
	// per login attempt, and this keeps the module free of the SubtleCrypto
	// typing gap in the Bun types.
	return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Consume a link code for a Telegram identity.
 *
 * Single-use and expiry-enforced at lookup. Returns the linked user id, or
 * null for an unknown, expired, or already-consumed code — every failure
 * alike, so a code cannot be probed.
 */
export async function consumeLinkCode(
	db: DatabaseHandle,
	code: string,
	telegramUserId: string,
	telegramChatId: string,
	telegramUsername?: string | null,
): Promise<{ userId: string } | null> {
	const codeHash = await hashLinkCode(code);
	const [row] = await db
		.select()
		.from(telegramLinkCodes)
		.where(eq(telegramLinkCodes.codeHash, codeHash))
		.limit(1);
	if (!row) return null;
	if (row.consumedAt) return null;
	if (row.expiresAt.getTime() <= Date.now()) return null;

	// Mark consumed first: a second use of the same code must fail even if
	// the link write below were interrupted.
	await db
		.update(telegramLinkCodes)
		.set({ consumedAt: new Date() })
		.where(eq(telegramLinkCodes.codeHash, codeHash));

	await upsertLink(db, {
		userId: row.userId,
		telegramUserId,
		telegramChatId,
		telegramUsername: telegramUsername ?? null,
	});

	return { userId: row.userId };
}

/** Create or reactivate the link for a Telegram identity. */
export async function upsertLink(
	db: DatabaseHandle,
	input: {
		userId: string;
		telegramUserId: string;
		telegramChatId: string;
		telegramUsername?: string | null;
	},
): Promise<void> {
	const [existing] = await db
		.select()
		.from(telegramLinks)
		.where(eq(telegramLinks.telegramUserId, input.telegramUserId))
		.limit(1);

	if (existing) {
		// Re-linking a previously revoked identity revokes nothing else.
		await db
			.update(telegramLinks)
			.set({
				userId: input.userId,
				telegramChatId: input.telegramChatId,
				telegramUsername: input.telegramUsername ?? null,
				isActive: true,
				lastSeenAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(telegramLinks.id, existing.id));
		return;
	}

	await db.insert(telegramLinks).values({
		id: crypto.randomUUID(),
		userId: input.userId,
		telegramUserId: input.telegramUserId,
		telegramChatId: input.telegramChatId,
		telegramUsername: input.telegramUsername ?? null,
		isActive: true,
		lastSeenAt: new Date(),
	});
}

/** Revoke one Telegram identity's link (from the website or `/logout`). */
export async function revokeLink(
	db: DatabaseHandle,
	linkId: string,
): Promise<void> {
	await db
		.update(telegramLinks)
		.set({ isActive: false, updatedAt: new Date() })
		.where(eq(telegramLinks.id, linkId));
}

/** Every link row, newest first, for the website's account list. */
export async function listLinks(db: DatabaseHandle) {
	return db.select().from(telegramLinks).orderBy(desc(telegramLinks.createdAt));
}

/** Roles that may edit bot configuration on the website. */
export const BOT_SETTINGS_EDITOR_ROLES: readonly RoleCode[] = [
	"SUPER_ADMIN",
	"TECH_LEAD",
];

export function canEditBotSettings(roleCodes: readonly RoleCode[]): boolean {
	return BOT_SETTINGS_EDITOR_ROLES.some((role) => roleCodes.includes(role));
}
