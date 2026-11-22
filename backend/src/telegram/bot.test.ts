/**
 * Bot start-supervision tests.
 *
 * The failure this file exists for: a `--watch` restart overlaps one
 * `getUpdates` window, Telegram rejects the new instance's start with a 409,
 * and the old code treated that as terminal — leaving the service silently
 * bot-less. These tests pin the retry contract: conflicts retry on a fresh
 * instance with a bounded backoff, everything else stays terminal, and the
 * handle comes back without waiting for polling (which only ends when the bot
 * dies).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Bot, GrammyError } from "grammy";
import type { AppConfig } from "../config";
import { loadConfig } from "../config";
import type { DatabaseHandle } from "../db";
import { createTestDatabase, type TestDatabase } from "../db/test-db";
import {
	type BotHandle,
	isTelegramConflict,
	POLL_MAX_ATTEMPTS,
	startTelegramBot,
} from "./bot";
import type { BotContext } from "./bot-context";
import { telegramSenderReady } from "./sender";

let testDb: TestDatabase;

/** The 409 Telegram returns when another instance still holds getUpdates. */
function conflictError(): GrammyError {
	return new GrammyError(
		"Call to 'getUpdates' failed!",
		{
			ok: false,
			error_code: 409,
			description: "Conflict: terminated by other getUpdates request",
		},
		"getUpdates",
		{},
	);
}

function apiError(code: number): GrammyError {
	return new GrammyError(
		"Call to 'getMe' failed!",
		{ ok: false, error_code: code, description: "Unauthorized" },
		"getMe",
		{},
	);
}

/** A grammY-shaped stub: a composer for `configureBot`, plus start/stop/api. */
interface FakeBot {
	startCalls: number;
	stopCalls: number;
	start: (options?: {
		onStart?: (info: { username: string }) => void;
	}) => Promise<void>;
	stop: () => Promise<void>;
	api: { sendMessage: (chatId: string, text: string) => Promise<void> };
	command: () => void;
	use: () => void;
	on: () => void;
	catch: () => void;
}

/**
 * Build fakes from per-attempt behaviors: a function that may throw, or
 * `"poll"` to start polling (a promise that never resolves, like the real
 * `bot.start()` while healthy).
 */
function fakeBots(scripts: Array<"poll" | Error>): {
	created: FakeBot[];
	createBot: (token: string) => Bot<BotContext>;
} {
	const created: FakeBot[] = [];
	const createBot = (): Bot<BotContext> => {
		const index = created.length;
		const script = scripts[index];
		const bot: FakeBot = {
			startCalls: 0,
			stopCalls: 0,
			start: async (options) => {
				bot.startCalls += 1;
				if (script === "poll") {
					options?.onStart?.({ username: "test-bot" });
					return new Promise<void>(() => {});
				}
				if (script instanceof Error) throw script;
				// Script exhausted: park like a healthy poll.
				options?.onStart?.({ username: "test-bot" });
				return new Promise<void>(() => {});
			},
			stop: async () => {
				bot.stopCalls += 1;
			},
			api: { sendMessage: async () => {} },
			command: () => {},
			use: () => {},
			on: () => {},
			catch: () => {},
		};
		created.push(bot);
		return bot as unknown as Bot<BotContext>;
	};
	return { created, createBot };
}

const instantWait = async () => {};

let db: DatabaseHandle;

beforeAll(async () => {
	testDb = await createTestDatabase();
	db = testDb.db;
});

afterAll(async () => {
	await testDb.close();
});

function setup(): AppConfig {
	return loadConfig({
		...process.env,
		NODE_ENV: "test",
		TELEGRAM_BOT_ENABLED: "true",
		TELEGRAM_BOT_TOKEN: "test-token",
	});
}

describe("isTelegramConflict", () => {
	test("a 409 GrammyError is a conflict", () => {
		expect(isTelegramConflict(conflictError())).toBe(true);
	});

	test("any other API error is not a conflict", () => {
		expect(isTelegramConflict(apiError(401))).toBe(false);
		expect(isTelegramConflict(apiError(429))).toBe(false);
	});

	test("a non-GrammyError is not a conflict", () => {
		expect(isTelegramConflict(new Error("boom"))).toBe(false);
		expect(isTelegramConflict("409: Conflict")).toBe(false);
		expect(isTelegramConflict(undefined)).toBe(false);
	});
});

describe("startTelegramBot", () => {
	test("returns the handle without awaiting polling", async () => {
		const { createBot, created } = fakeBots(["poll"]);
		const handle: BotHandle | null = await startTelegramBot(
			{ db, config: setup() },
			{ createBot, wait: instantWait },
		);
		expect(handle).not.toBeNull();
		expect(handle?.bot).toBe(created[0] as unknown as Bot<BotContext>);
		expect(created[0].startCalls).toBe(1);
		await handle?.stop();
		expect(created[0].stopCalls).toBe(1);
	});

	test("a conflicting start is retried on a fresh instance and succeeds", async () => {
		const { createBot, created } = fakeBots([conflictError(), "poll"]);
		const handle = await startTelegramBot(
			{ db, config: setup() },
			{ createBot, wait: instantWait },
		);
		expect(handle).not.toBeNull();
		// Let the background supervisor run its retry.
		await Promise.resolve();
		await Promise.resolve();
		expect(created.length).toBe(2);
		expect(handle?.bot).toBe(created[1] as unknown as Bot<BotContext>);
		expect(created[0].stopCalls).toBe(0); // never started: no stop needed
		await handle?.stop();
		expect(created[1].stopCalls).toBe(1);
		expect(telegramSenderReady()).toBe(false);
	});

	test("a non-conflict start failure is terminal after one attempt", async () => {
		const { createBot, created } = fakeBots([apiError(401)]);
		const handle = await startTelegramBot(
			{ db, config: setup() },
			{ createBot, wait: instantWait },
		);
		await Promise.resolve();
		await Promise.resolve();
		expect(created.length).toBe(1);
		// The handle is still returned (the API service keeps running), but the
		// sender is cleared — a dead bot must not claim it can deliver.
		expect(handle).not.toBeNull();
		expect(telegramSenderReady()).toBe(false);
	});

	test("persistent conflicts give up at the attempt ceiling", async () => {
		const scripts = Array.from({ length: POLL_MAX_ATTEMPTS }, () =>
			conflictError(),
		);
		const { createBot, created } = fakeBots(scripts);
		const handle = await startTelegramBot(
			{ db, config: setup() },
			{ createBot, wait: instantWait },
		);
		for (let i = 0; i < POLL_MAX_ATTEMPTS + 2; i++) {
			await Promise.resolve();
			await Promise.resolve();
		}
		expect(created.length).toBe(POLL_MAX_ATTEMPTS);
		expect(telegramSenderReady()).toBe(false);
		expect(handle).not.toBeNull();
	});

	test("stop() during a retry delay prevents another attempt", async () => {
		const { createBot, created } = fakeBots([conflictError(), "poll", "poll"]);
		// The wait never resolves, so the supervisor sits in its delay.
		const never = () => new Promise<void>(() => {});
		const handle = await startTelegramBot(
			{ db, config: setup() },
			{ createBot, wait: never },
		);
		expect(created.length).toBe(1);
		await handle?.stop();
		for (let i = 0; i < 4; i++) await Promise.resolve();
		expect(created.length).toBe(1);
		expect(telegramSenderReady()).toBe(false);
	});

	test("a disabled bot returns null and starts nothing", async () => {
		const { createBot, created } = fakeBots([]);
		const handle = await startTelegramBot(
			{
				db,
				config: loadConfig({
					...process.env,
					NODE_ENV: "test",
					TELEGRAM_BOT_ENABLED: "false",
				}),
			},
			{ createBot, wait: instantWait },
		);
		expect(handle).toBeNull();
		expect(created.length).toBe(0);
	});
});
