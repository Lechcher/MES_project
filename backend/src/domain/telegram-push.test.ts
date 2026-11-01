/**
 * The Telegram delivery channel of the notification engine.
 *
 * The engine's contract is unchanged — record, deliver best-effort, never roll
 * back the domain change — and these tests pin the *new* channel's share of
 * it: a push alert reaches linked chats when enabled, a disabled channel is
 * recorded as the reason (not a success), and a failing chat is isolated from
 * the ones that succeeded.
 */

import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config";
import { createDatabase, type DatabaseHandle } from "../db";
import { runMigrations } from "../db/migrate";
import { notifications, telegramBotSettings, user } from "../db/schema";
import { createContext, type ViewerContext } from "../graphql/context";
import { setTelegramSender } from "../telegram/sender";
import { dispatchNotification } from "./notifications";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const dbPath = join(TMP_ROOT, `mes-tg-push-${crypto.randomUUID()}.db`);

let db: DatabaseHandle;
/** Test environment: outbound delivery is refused by the env gate. */
let ctx: ViewerContext;
/** Development environment: outbound delivery is allowed, so the channels run. */
let outboundCtx: ViewerContext;

beforeAll(() => {
	runMigrations({ databasePath: dbPath });
	db = createDatabase(dbPath);
	ctx = createContext({
		db,
		config: loadConfig({ NODE_ENV: "test", MES_DATABASE_PATH: dbPath }),
		request: { ipAddress: null, userAgent: "bun-test" },
	});
	outboundCtx = createContext({
		db,
		config: loadConfig({
			NODE_ENV: "development",
			BETTER_AUTH_SECRET: "a-development-secret-for-tests",
			BETTER_AUTH_URL: "http://localhost:3001",
			MES_DATABASE_PATH: dbPath,
		}),
		request: { ipAddress: null, userAgent: "bun-test" },
	});
});

afterAll(() => {
	for (const suffix of ["", "-wal", "-shm"]) {
		if (existsSync(`${dbPath}${suffix}`)) rmSync(`${dbPath}${suffix}`);
	}
});

afterEach(async () => {
	// Restore a clean sender registry, push flag, links and users between
	// tests: the unique indexes on telegram identity and user id would
	// otherwise make each test's seed collide with the previous one.
	setTelegramSender(null);
	const { telegramLinkCodes, telegramLinks } = await import("../db/schema");
	await db.delete(telegramLinkCodes);
	await db.delete(telegramLinks);
	await db.delete(telegramBotSettings);
	await db.delete(notifications);
	await db.delete(user);
});

async function pushEnabled(value: boolean): Promise<void> {
	await db.insert(telegramBotSettings).values({
		id: crypto.randomUUID(),
		isEnabled: false,
		pushAlertsEnabled: value,
	});
}

async function link(chatId: string, userId: string): Promise<void> {
	await db.insert(user).values({
		id: userId,
		name: `User ${userId}`,
		email: `${userId}@mes.local`,
		emailVerified: true,
		userCode: `U-${userId}`,
	});
	await import("../db/schema").then(({ telegramLinks }) =>
		db.insert(telegramLinks).values({
			id: crypto.randomUUID(),
			telegramUserId: `tg-${chatId}`,
			telegramChatId: chatId,
			userId,
			isActive: true,
		}),
	);
}

async function lastNotification() {
	const [row] = await db.select().from(notifications);
	return row;
}

describe("Telegram push channel", () => {
	test("delivers to every linked chat and records SENT", async () => {
		const sent: string[] = [];
		setTelegramSender(async (chatId) => {
			sent.push(chatId);
		});
		await pushEnabled(true);
		await link("chat-a", "user-a");
		await link("chat-b", "user-b");

		const { status } = await dispatchNotification(outboundCtx, {
			template: "TASK_APPROVED",
			payload: { taskCode: "T-9000" },
		});

		expect(status).toBe("SENT");
		const row = await lastNotification();
		expect(row.status).toBe("SENT");
		expect(row.sentAt).not.toBeNull();
		expect(sent.sort()).toEqual(["chat-a", "chat-b"]);
	});

	test("a disabled push channel records the reason, not a success", async () => {
		await pushEnabled(false);
		await link("chat-a", "user-a");

		const { status } = await dispatchNotification(outboundCtx, {
			template: "TASK_APPROVED",
		});

		expect(status).toBe("FAILED");
		const row = await lastNotification();
		expect(row.errorMessage).toContain("not enabled or not configured");
		expect(row.sentAt).toBeNull();
	});

	test("a failing chat is isolated from the ones that succeeded", async () => {
		setTelegramSender(async (chatId) => {
			if (chatId === "chat-bad") throw new Error("blocked by user");
		});
		await pushEnabled(true);
		await link("chat-ok", "user-ok");
		await link("chat-bad", "user-bad");

		const { status } = await dispatchNotification(outboundCtx, {
			template: "TASK_RETURNED",
		});

		// One chat accepted, so the channel delivered; the failure is recorded.
		expect(status).toBe("SENT");
		const row = await lastNotification();
		expect(row.status).toBe("SENT");
		expect(row.errorMessage).toContain("chat-bad: blocked by user");
	});

	test("an unstarted bot (no sender) never delivers", async () => {
		setTelegramSender(null);
		await pushEnabled(true);
		await link("chat-a", "user-a");

		const { status } = await dispatchNotification(outboundCtx, {
			template: "TASK_APPROVED",
		});

		expect(status).toBe("FAILED");
		expect((await lastNotification()).errorMessage).toContain("not active");
	});

	test("push alone delivers when no webhook is configured", async () => {
		setTelegramSender(async () => undefined);
		await pushEnabled(true);
		// No telegram_webhook_config row at all.
		await link("chat-solo", "user-solo");

		const { status } = await dispatchNotification(outboundCtx, {
			template: "LEAVE_APPROVED",
		});

		expect(status).toBe("SENT");
	});

	test("the test environment still refuses to call out", async () => {
		setTelegramSender(async () => undefined);
		await pushEnabled(true);
		await link("chat-a", "user-a");

		// NODE_ENV=test disables outbound delivery for both channels.
		const { status } = await dispatchNotification(ctx, {
			template: "TASK_APPROVED",
		});
		expect(status).toBe("FAILED");
		expect((await lastNotification()).errorMessage).toContain(
			"disabled in this environment",
		);
	});
});
