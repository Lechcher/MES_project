/**
 * Bot settings resolution tests.
 *
 * Pin the precedence ladder the design defines — per-user preference →
 * website setting → environment variable → built-in default — plus the
 * properties the security of this surface rests on: link codes are
 * single-use, expire, hash at rest, and a revoked link behaves exactly like
 * no link at all.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { loadConfig } from "../config";
import { createDatabase, type DatabaseHandle } from "../db";
import { runMigrations } from "../db/migrate";
import { telegramWebhookConfig, user } from "../db/schema";
import type { Viewer } from "../graphql/context";
import {
	consumeLinkCode,
	generateLinkCode,
	hashLinkCode,
	linkCodeExpiry,
	listLinks,
	maskSecret,
	resolveAiModel,
	resolveBotSettings,
	resolveLinkedViewer,
	revokeLink,
	setUserModel,
	upsertLink,
} from "./settings";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const createdPaths: string[] = [];

afterAll(() => {
	for (const path of createdPaths) {
		for (const suffix of ["", "-wal", "-shm"]) {
			if (existsSync(`${path}${suffix}`)) rmSync(`${path}${suffix}`);
		}
	}
});

function freshDatabase(name: string): DatabaseHandle {
	const path = join(
		TMP_ROOT,
		`mes-tg-settings-${name}-${crypto.randomUUID()}.db`,
	);
	createdPaths.push(path);
	runMigrations({ databasePath: path });
	return createDatabase(path);
}

function viewer(id: string): Viewer {
	return {
		id,
		userCode: `U-${id}`,
		fullName: `User ${id}`,
		email: `${id}@mes.local`,
		departmentId: null,
		isActive: true,
		roleCodes: ["EMPLOYEE"],
	};
}

async function seedUser(db: DatabaseHandle, id: string): Promise<void> {
	await db.insert(user).values({
		id,
		name: `User ${id}`,
		email: `${id}@mes.local`,
		emailVerified: true,
		userCode: `U-${id}`,
	});
}

describe("resolveBotSettings", () => {
	test("stays disabled and tokenless with nothing configured", async () => {
		const db = freshDatabase("defaults");
		const settings = await resolveBotSettings(
			db,
			loadConfig({ NODE_ENV: "test" }),
		);
		expect(settings.enabled).toBe(false);
		expect(settings.botToken).toBeNull();
		expect(settings.aiBaseUrl).toBeNull();
		expect(settings.pushAlertsEnabled).toBe(false);
	});

	test("bootstraps from the environment alone", async () => {
		const db = freshDatabase("env");
		const settings = await resolveBotSettings(
			db,
			loadConfig({
				NODE_ENV: "test",
				TELEGRAM_BOT_ENABLED: "true",
				TELEGRAM_BOT_TOKEN: "111:env-token",
				TELEGRAM_AI_BASE_URL: "https://env.example.com/v1",
				TELEGRAM_AI_API_KEY: "sk-env",
				TELEGRAM_AI_MODEL: "env-model",
			}),
		);
		expect(settings.enabled).toBe(true);
		expect(settings.botToken).toBe("111:env-token");
		expect(settings.aiBaseUrl).toBe("https://env.example.com/v1");
		expect(settings.aiApiKey).toBe("sk-env");
		expect(settings.aiDefaultModel).toBe("env-model");
	});

	test("website values override the environment", async () => {
		const db = freshDatabase("website");
		// The row is created on first read; then saved with website values.
		await resolveBotSettings(
			db,
			loadConfig({
				NODE_ENV: "test",
				TELEGRAM_BOT_ENABLED: "false",
				TELEGRAM_BOT_TOKEN: "env-token",
				TELEGRAM_AI_BASE_URL: "https://env.example.com/v1",
				TELEGRAM_AI_MODEL: "env-model",
			}),
		);
		const { telegramBotSettings } = await import("../db/schema");
		const rowId = (
			await resolveBotSettings(db, loadConfig({ NODE_ENV: "test" }))
		).settingsRowId;
		await db
			.update(telegramBotSettings)
			.set({
				isEnabled: true,
				botToken: "222:website-token",
				aiBaseUrl: "https://website.example.com/v1",
				aiDefaultModel: "website-model",
				pushAlertsEnabled: true,
			})
			.where(eq(telegramBotSettings.id, rowId));

		const settings = await resolveBotSettings(
			db,
			loadConfig({
				NODE_ENV: "test",
				TELEGRAM_BOT_ENABLED: "false",
				TELEGRAM_BOT_TOKEN: "env-token",
				TELEGRAM_AI_BASE_URL: "https://env.example.com/v1",
				TELEGRAM_AI_MODEL: "env-model",
			}),
		);
		expect(settings.enabled).toBe(true);
		expect(settings.botToken).toBe("222:website-token");
		expect(settings.aiBaseUrl).toBe("https://website.example.com/v1");
		expect(settings.aiDefaultModel).toBe("website-model");
		expect(settings.pushAlertsEnabled).toBe(true);
	});

	test("falls back to the outbound webhook's token when neither side sets one", async () => {
		const db = freshDatabase("webhook-fallback");
		await db.insert(telegramWebhookConfig).values({
			id: crypto.randomUUID(),
			botToken: "333:webhook-token",
			isEnabled: false,
		});
		const settings = await resolveBotSettings(
			db,
			loadConfig({ NODE_ENV: "test" }),
		);
		expect(settings.botToken).toBe("333:webhook-token");
	});

	test("the environment re-applies once the website value is cleared", async () => {
		const db = freshDatabase("cleared");
		const envConfig = loadConfig({
			NODE_ENV: "test",
			TELEGRAM_BOT_TOKEN: "env-token",
			TELEGRAM_AI_BASE_URL: "https://env.example.com/v1",
		});
		const first = await resolveBotSettings(db, envConfig);
		const { telegramBotSettings } = await import("../db/schema");
		await db
			.update(telegramBotSettings)
			.set({ botToken: "", aiBaseUrl: "" })
			.where(eq(telegramBotSettings.id, first.settingsRowId));
		const settings = await resolveBotSettings(db, envConfig);
		expect(settings.botToken).toBe("env-token");
		expect(settings.aiBaseUrl).toBe("https://env.example.com/v1");
	});
});

describe("maskSecret", () => {
	test("returns null for empty values", () => {
		expect(maskSecret(null)).toBeNull();
		expect(maskSecret(undefined)).toBeNull();
		expect(maskSecret("")).toBeNull();
	});

	test("keeps only the last four characters", () => {
		expect(maskSecret("sk-super-secret-key")).toBe("****-key");
		expect(maskSecret("1234567890")).toBe("****7890");
	});

	test("masks short values entirely", () => {
		expect(maskSecret("abc")).toBe("****");
		expect(maskSecret("abcd")).toBe("****");
	});
});

describe("resolveAiModel", () => {
	test("prefers the per-user preference, then the website default, then the environment", async () => {
		const db = freshDatabase("model-ladder");
		await seedUser(db, "u1");
		const who = viewer("u1");

		expect(
			await resolveAiModel(db, loadConfig({ NODE_ENV: "test" }), who),
		).toBeNull();

		const envConfig = loadConfig({
			NODE_ENV: "test",
			TELEGRAM_AI_MODEL: "env-model",
		});
		expect(await resolveAiModel(db, envConfig, who)).toBe("env-model");

		await resolveBotSettings(db, envConfig);
		const { telegramBotSettings } = await import("../db/schema");
		const row = await resolveBotSettings(db, envConfig);
		await db
			.update(telegramBotSettings)
			.set({ aiDefaultModel: "website-model" })
			.where(eq(telegramBotSettings.id, row.settingsRowId));
		expect(await resolveAiModel(db, envConfig, who)).toBe("website-model");

		await setUserModel(db, "u1", "user-model");
		expect(await resolveAiModel(db, envConfig, who)).toBe("user-model");
	});

	test("persists across a simulated restart", async () => {
		const db = freshDatabase("model-persist");
		await seedUser(db, "u1");
		await setUserModel(db, "u1", "user-model");
		const who = viewer("u1");
		expect(
			await resolveAiModel(db, loadConfig({ NODE_ENV: "test" }), who),
		).toBe("user-model");
	});
});

describe("link codes", () => {
	test("a fresh code consumes once and links the identity", async () => {
		const db = freshDatabase("link-ok");
		await seedUser(db, "u1");
		const code = generateLinkCode();
		const { telegramLinkCodes } = await import("../db/schema");
		await db.insert(telegramLinkCodes).values({
			codeHash: await hashLinkCode(code),
			userId: "u1",
			expiresAt: linkCodeExpiry(loadConfig({ NODE_ENV: "test" })),
		});

		const consumed = await consumeLinkCode(
			db,
			code,
			"tg-1",
			"chat-1",
			"tester",
		);
		expect(consumed).toEqual({ userId: "u1" });
		// Second use of the same code is refused.
		expect(await consumeLinkCode(db, code, "tg-2", "chat-2")).toBeNull();
	});

	test("stores only the hash, never the plaintext", async () => {
		const db = freshDatabase("link-hash");
		await seedUser(db, "u1");
		const code = generateLinkCode();
		const { telegramLinkCodes } = await import("../db/schema");
		await db.insert(telegramLinkCodes).values({
			codeHash: await hashLinkCode(code),
			userId: "u1",
			expiresAt: linkCodeExpiry(loadConfig({ NODE_ENV: "test" })),
		});
		const rows = await db.select().from(telegramLinkCodes);
		expect(rows).toHaveLength(1);
		expect(Object.values(rows[0])).not.toContain(code);
	});

	test("an expired code is refused", async () => {
		const db = freshDatabase("link-expired");
		await seedUser(db, "u1");
		const { telegramLinkCodes } = await import("../db/schema");
		await db.insert(telegramLinkCodes).values({
			codeHash: await hashLinkCode("LINK-WXYZ2345"),
			userId: "u1",
			expiresAt: new Date(Date.now() - 60 * 1000),
		});
		expect(
			await consumeLinkCode(db, "LINK-WXYZ2345", "tg-1", "chat-1"),
		).toBeNull();
	});

	test("an unknown code is refused", async () => {
		const db = freshDatabase("link-unknown");
		expect(
			await consumeLinkCode(db, "LINK-QQQQ1111", "tg-1", "chat-1"),
		).toBeNull();
	});

	test("the expiry is read from configuration", () => {
		const config = loadConfig({
			NODE_ENV: "test",
			TELEGRAM_LINK_CODE_TTL_MINUTES: "5",
		});
		const expiresAt = linkCodeExpiry(config);
		expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 4 * 60 * 1000);
		expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000);
	});
});

describe("links", () => {
	test("resolve the linked viewer and chat", async () => {
		const db = freshDatabase("link-resolve");
		await seedUser(db, "u1");
		await upsertLink(db, {
			userId: "u1",
			telegramUserId: "tg-1",
			telegramChatId: "chat-1",
		});
		const resolved = await resolveLinkedViewer(db, "tg-1");
		expect(resolved?.viewer.id).toBe("u1");
		expect(resolved?.chatId).toBe("chat-1");
	});

	test("a revoked link resolves to null", async () => {
		const db = freshDatabase("link-revoke");
		await seedUser(db, "u1");
		await upsertLink(db, {
			userId: "u1",
			telegramUserId: "tg-1",
			telegramChatId: "chat-1",
		});
		const resolved = await resolveLinkedViewer(db, "tg-1");
		if (!resolved) throw new Error("expected a resolved link");
		await revokeLink(db, resolved.linkId);
		expect(await resolveLinkedViewer(db, "tg-1")).toBeNull();
	});

	test("a deactivated account resolves to null", async () => {
		const db = freshDatabase("link-inactive");
		await seedUser(db, "u1");
		await upsertLink(db, {
			userId: "u1",
			telegramUserId: "tg-1",
			telegramChatId: "chat-1",
		});
		await db.update(user).set({ isActive: false }).where(eq(user.id, "u1"));
		expect(await resolveLinkedViewer(db, "tg-1")).toBeNull();
	});

	test("re-linking a revoked identity reactivates it", async () => {
		const db = freshDatabase("link-relink");
		await seedUser(db, "u1");
		await seedUser(db, "u2");
		await upsertLink(db, {
			userId: "u1",
			telegramUserId: "tg-1",
			telegramChatId: "chat-1",
		});
		const first = await resolveLinkedViewer(db, "tg-1");
		if (!first) throw new Error("expected a resolved link");
		await revokeLink(db, first.linkId);

		await upsertLink(db, {
			userId: "u2",
			telegramUserId: "tg-1",
			telegramChatId: "chat-2",
		});
		const relinked = await resolveLinkedViewer(db, "tg-1");
		expect(relinked?.viewer.id).toBe("u2");
		expect(relinked?.chatId).toBe("chat-2");
		expect(await listLinks(db)).toHaveLength(1);
	});
});
