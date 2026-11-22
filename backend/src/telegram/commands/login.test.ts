/**
 * Login surface tests.
 *
 * The pre-login surface is where a chat becomes a session, so its outcomes are
 * the contract: a successful link signs in *and* confirms with the dashboard,
 * `/help` shapes itself to whether the chat is signed in, `/logout`
 * revokes and says what happened (naming the account and the way back), and
 * a bare `/ask` welcomes instead of demanding syntax. Unlinked chats keep the
 * login prompt everywhere.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { AppConfig } from "../../config";
import { loadConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import { telegramLinks, user as userTable } from "../../db/schema";
import { createTestDatabase, type TestDatabase } from "../../db/test-db";
import type { BotContext } from "../bot-context";
import { registerAskCommands } from "./ask";
import { registerLoginCommands } from "./login";

let testDb: TestDatabase;

let db: DatabaseHandle;
let config: AppConfig;
let handlers: Map<string, (ctx: BotContext) => Promise<void>>;

function composer() {
	handlers = new Map();
	return {
		command: (name: string, handler: (ctx: BotContext) => Promise<void>) => {
			handlers.set(name, handler);
		},
		on: () => {},
	};
}

function fakeContext(who: { id: number; username?: string }): {
	ctx: BotContext;
	replies: string[];
} {
	const replies: string[] = [];
	const ctx = {
		viewer: null,
		viewerContext: null,
		chat: { id: String(who.id) },
		from: { id: who.id, username: who.username ?? null },
		match: "",
		message: { text: "" },
		reply: async (text: string) => {
			replies.push(text);
			return {};
		},
	} as unknown as BotContext;
	return { ctx, replies };
}

beforeAll(async () => {
	testDb = await createTestDatabase();
	db = testDb.db;
	config = loadConfig({
		NODE_ENV: "test",
		MES_DATABASE_URL: testDb.connectionString,
		TELEGRAM_BOT_ENABLED: "true",
		TELEGRAM_AI_MONTHLY_QUOTA: "5",
	});
	registerLoginCommands(composer() as never, { db, config });
});

afterAll(async () => {
	await testDb.close();
});

async function runCommand(
	name: string,
	who: { id: number; username?: string },
) {
	const { ctx, replies } = fakeContext(who);
	await handlers.get(name)?.(ctx);
	return replies;
}

describe("/help", () => {
	test("an unlinked chat gets the login prompt", async () => {
		const replies = await runCommand("help", { id: 9001 });
		expect(replies.join("\n")).toContain("/link");
		expect(replies.join("\n")).not.toContain("you are signed in");
	});

	test("a linked chat gets the signed-in menu", async () => {
		await db.insert(userTable).values({
			id: "help-user",
			name: "Help User",
			email: "help@mes.local",
			emailVerified: true,
			userCode: "U-HELP",
		});
		await db.insert(telegramLinks).values({
			id: crypto.randomUUID(),
			userId: "help-user",
			telegramUserId: "9002",
			telegramChatId: "9002",
			isActive: true,
		});
		const replies = await runCommand("help", { id: 9002 });
		const text = replies.join("\n");
		expect(text).toContain("you are signed in");
		expect(text).toContain("/dashboard");
		expect(text).toContain("/profile");
		expect(text).toContain("/logout");
	});
});

describe("/logout", () => {
	test("names the account and the way back, and revokes the link", async () => {
		await db.insert(userTable).values({
			id: "logout-user",
			name: "Logout User",
			email: "logout@mes.local",
			emailVerified: true,
			userCode: "U-LOGOUT",
		});
		const linkId = crypto.randomUUID();
		await db.insert(telegramLinks).values({
			id: linkId,
			userId: "logout-user",
			telegramUserId: "9003",
			telegramChatId: "9003",
			isActive: true,
		});
		const replies = await runCommand("logout", { id: 9003 });
		const text = replies.join("\n");
		expect(text).toContain("Logout User");
		expect(text).toContain("U-LOGOUT");
		expect(text).toContain("/link");
		const [link] = await db.select().from(telegramLinks).where(eqId(linkId));
		expect(link.isActive).toBe(false);
	});

	test("an unlinked chat is told it is not signed in", async () => {
		const replies = await runCommand("logout", { id: 9004 });
		expect(replies.join("\n")).toContain("not signed in");
	});
});

describe("bare /ask", () => {
	test("welcomes, and runs no agent call", async () => {
		const askHandlers = new Map<string, (ctx: BotContext) => Promise<void>>();
		const askComposer = {
			command: (name: string, handler: (ctx: BotContext) => Promise<void>) => {
				askHandlers.set(name, handler);
			},
			on: () => {},
		};
		registerAskCommands(askComposer as never, {
			db,
			config: loadConfig({
				NODE_ENV: "test",
				MES_DATABASE_URL: testDb.connectionString,
				TELEGRAM_AI_MONTHLY_QUOTA: "5",
			}),
		});
		const { ctx, replies } = fakeContext({ id: 9005 });
		(ctx as unknown as { match: string }).match = "";
		(ctx as unknown as { viewer: unknown }).viewer = {
			id: "ask-user",
			userCode: "U-ASK",
			fullName: "Ask User",
			email: "ask@mes.local",
			departmentId: null,
			isActive: true,
			roleCodes: ["EMPLOYEE"],
		};
		await askHandlers.get("ask")?.(ctx);
		const text = replies.join("\n");
		expect(text).toContain("Welcome");
		expect(text).toContain("read-only");
	});
});

function eqId(id: string) {
	return eq(telegramLinks.id, id);
}
