/**
 * AI command tests.
 *
 * `/ask` and `/model` are the bot's AI surface. The properties worth pinning
 * without a live endpoint: an unconfigured endpoint fails with a plain
 * "unavailable" message (never a fabricated answer), an exhausted budget
 * refuses with the limit, and a model switch must come from the endpoint's
 * catalog — except when no catalog could be fetched at all, where refusing
 * would lock the bot out while the endpoint is down. The happy path with a
 * real endpoint is covered by the documented manual smoke test.
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
import { loadConfig } from "../../config";
import { createDatabase, type DatabaseHandle } from "../../db";
import type { RoleCode } from "../../db/enums";
import { runMigrations } from "../../db/migrate";
import {
	telegramAiModels,
	telegramAiUsage,
	user as userTable,
} from "../../db/schema";
import {
	createContext,
	type Viewer,
	type ViewerContext,
} from "../../graphql/context";
import type { BotContext } from "../bot-context";
import { registerAskCommands } from "./ask";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const dbPath = join(TMP_ROOT, `mes-tg-ask-${crypto.randomUUID()}.db`);

let db: DatabaseHandle;
let handlers: Map<string, (ctx: BotContext) => Promise<void>>;

function composer() {
	return {
		command: (name: string, handler: (ctx: BotContext) => Promise<void>) => {
			handlers.set(name, handler);
		},
		on: () => {},
	};
}

beforeAll(() => {
	runMigrations({ databasePath: dbPath });
	db = createDatabase(dbPath);
	handlers = new Map();
	registerAskCommands(composer() as never, {
		db,
		config: loadConfig({
			NODE_ENV: "test",
			MES_DATABASE_PATH: dbPath,
			TELEGRAM_AI_MONTHLY_QUOTA: "1",
		}),
	});
});

afterAll(() => {
	for (const suffix of ["", "-wal", "-shm"]) {
		if (existsSync(`${dbPath}${suffix}`)) rmSync(`${dbPath}${suffix}`);
	}
});

afterEach(async () => {
	await db.delete(telegramAiUsage);
	await db.delete(telegramAiModels);
	await db.delete(userTable);
});

function fakeContext(
	who: Viewer,
	match = "",
): {
	ctx: BotContext;
	replies: string[];
} {
	const replies: string[] = [];
	const viewerCtx: ViewerContext = createContext({
		db,
		config: loadConfig({ NODE_ENV: "test", MES_DATABASE_PATH: dbPath }),
		request: { ipAddress: null, userAgent: "telegram-bot" },
		viewer: who,
	});
	const ctx = {
		viewer: who,
		viewerContext: viewerCtx,
		chat: { id: "chat-1" },
		from: { id: 1 },
		match,
		reply: async (text: string) => {
			replies.push(text);
		},
	} as unknown as BotContext;
	return { ctx, replies };
}

async function seedUser(id: string): Promise<Viewer> {
	await db.insert(userTable).values({
		id,
		name: `User ${id}`,
		email: `${id}@mes.local`,
		emailVerified: true,
		userCode: `U-${id}`,
	});
	return {
		id,
		userCode: `U-${id}`,
		fullName: `User ${id}`,
		email: `${id}@mes.local`,
		departmentId: null,
		isActive: true,
		roleCodes: ["EMPLOYEE"] as RoleCode[],
	};
}

async function run(name: string, who: Viewer, match = "") {
	const { ctx, replies } = fakeContext(who, match);
	await handlers.get(name)?.(ctx);
	return replies.join("\n");
}

describe("/ask", () => {
	test("reports AI search as unavailable when no endpoint is configured", async () => {
		const who = await seedUser("u-ask-1");
		const reply = await run("ask", who, "how many tickets are overdue?");
		expect(reply).toContain("AI search is not configured");
	});

	test("asks for a question when none is given", async () => {
		const who = await seedUser("u-ask-2");
		const reply = await run("ask", who, "");
		expect(reply).toContain("Usage: /ask");
	});

	test("refuses with the limit once the budget is exhausted", async () => {
		const who = await seedUser("u-ask-3");
		// The command's config ceiling is one query; mark it spent.
		await db.insert(telegramAiUsage).values({
			userId: "u-ask-3",
			windowStart: new Date(),
			queryCount: 1,
		});
		const reply = await run("ask", who, "anything");
		expect(reply).toContain("used all 1 AI questions");
	});
});

describe("/model", () => {
	test("reports an empty catalog plainly", async () => {
		const who = await seedUser("u-model-1");
		const reply = await run("model", who, "");
		expect(reply).toContain("No models are cached yet");
	});

	test("lists the cached catalog", async () => {
		await db.insert(telegramAiModels).values({
			modelId: "gpt-4o-mini",
			displayName: "gpt-4o-mini",
			fetchedAt: new Date(),
		});
		const who = await seedUser("u-model-2");
		const reply = await run("model", who, "");
		expect(reply).toContain("gpt-4o-mini");
		expect(reply).toContain("/model <id>");
	});

	test("refuses a model the endpoint does not offer", async () => {
		await db.insert(telegramAiModels).values({
			modelId: "gpt-4o-mini",
			displayName: "gpt-4o-mini",
			fetchedAt: new Date(),
		});
		const who = await seedUser("u-model-3");
		const reply = await run("model", who, "not-a-model");
		expect(reply).toContain("not in the current catalog");
	});

	test("sets a model the endpoint offers", async () => {
		await db.insert(telegramAiModels).values({
			modelId: "gpt-4o",
			displayName: "gpt-4o",
			fetchedAt: new Date(),
		});
		const who = await seedUser("u-model-4");
		const reply = await run("model", who, "gpt-4o");
		expect(reply).toContain("Model set to gpt-4o");

		const { resolveAiModel } = await import("../settings");
		expect(
			await resolveAiModel(db, loadConfig({ NODE_ENV: "test" }), who),
		).toBe("gpt-4o");
	});

	test("accepts a model when no catalog could be fetched at all", async () => {
		const who = await seedUser("u-model-5");
		const reply = await run("model", who, "fallback-model");
		expect(reply).toContain("Model set to fallback-model");
	});
});
