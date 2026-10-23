/**
 * Telegram notification engine.
 *
 * Documented workflow events become notification records whose delivery outcome
 * is recorded separately from the domain change. A missing or disabled
 * configuration, a disabled environment, and a failing destination must each be
 * recorded as a failure — never as a successful delivery.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { type AppConfig, loadConfig } from "../config";
import { createDatabase, type DatabaseHandle } from "../db";
import { runMigrations } from "../db/migrate";
import { notifications, telegramWebhookConfig } from "../db/schema";
import { createContext, type ViewerContext } from "../graphql/context";
import { dispatchNotification, notify } from "./notifications";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const dbPath = join(TMP_ROOT, `mes-notify-${crypto.randomUUID()}.db`);

let db: DatabaseHandle;
let testConfig: AppConfig;
let outboundConfig: AppConfig;

function context(config: AppConfig): ViewerContext {
	return createContext({
		db,
		config,
		request: { ipAddress: "203.0.113.7", userAgent: "bun-test" },
	});
}

async function setWebhook(values: {
	webhookUrl: string | null;
	isEnabled: boolean;
}): Promise<void> {
	await db.delete(telegramWebhookConfig);
	await db.insert(telegramWebhookConfig).values({
		id: crypto.randomUUID(),
		botToken: "bot-token",
		alertGroupChatId: "-1001234567890",
		webhookUrl: values.webhookUrl,
		isEnabled: values.isEnabled,
	});
	// The engine reads the config per dispatch, so no cache to invalidate.
}

async function readNotification(id: string) {
	const [row] = await db
		.select()
		.from(notifications)
		.where(eq(notifications.id, id));
	return row;
}

beforeAll(() => {
	runMigrations({ databasePath: dbPath });
	testConfig = loadConfig({ NODE_ENV: "test", MES_DATABASE_PATH: dbPath });
	// `development` keeps outbound delivery enabled, with an explicit secret.
	outboundConfig = loadConfig({
		NODE_ENV: "development",
		BETTER_AUTH_SECRET: "a-development-secret-for-tests",
		BETTER_AUTH_URL: "http://localhost:3001",
		MES_DATABASE_PATH: dbPath,
	});
	db = createDatabase(dbPath);
});

afterAll(() => {
	for (const suffix of ["", "-wal", "-shm"]) {
		const path = `${dbPath}${suffix}`;
		if (existsSync(path)) rmSync(path);
	}
});

describe("unconfigured and disabled delivery", () => {
	test("records FAILED when no webhook is configured", async () => {
		await setWebhook({ webhookUrl: null, isEnabled: false });

		const { id, status } = await dispatchNotification(context(outboundConfig), {
			template: "TASK_APPROVED",
			relatedType: "TASK",
			relatedId: crypto.randomUUID(),
			payload: { taskCode: "T-1000" },
		});

		expect(status).toBe("FAILED");
		const row = await readNotification(id);
		expect(row.status).toBe("FAILED");
		expect(row.errorMessage).toContain("not enabled or not configured");
		expect(row.attempts).toBe(1);
		expect(row.sentAt).toBeNull();
	});

	test("records FAILED when the configuration is disabled", async () => {
		await setWebhook({
			webhookUrl: "http://127.0.0.1:1/unused",
			isEnabled: false,
		});

		const { id, status } = await dispatchNotification(context(outboundConfig), {
			template: "LEAVE_APPROVED",
		});

		expect(status).toBe("FAILED");
		expect((await readNotification(id)).errorMessage).toContain("not enabled");
	});

	test("records FAILED when the environment disables outbound delivery", async () => {
		// Enabled configuration, but the test environment must not call out.
		await setWebhook({
			webhookUrl: "http://127.0.0.1:1/unused",
			isEnabled: true,
		});

		const { id, status } = await dispatchNotification(context(testConfig), {
			template: "TASK_CANCELLED",
		});

		expect(status).toBe("FAILED");
		const row = await readNotification(id);
		expect(row.errorMessage).toContain("disabled in this environment");
		expect(row.status).not.toBe("SENT");
	});
});

describe("delivery against a destination", () => {
	test("records SENT only when the destination accepts the request", async () => {
		const received: unknown[] = [];
		const server = Bun.serve({
			port: 0,
			async fetch(request) {
				received.push(await request.json());
				return new Response("ok", { status: 200 });
			},
		});

		try {
			await setWebhook({
				webhookUrl: `http://127.0.0.1:${server.port}/hook`,
				isEnabled: true,
			});

			const relatedId = crypto.randomUUID();
			const { id, status } = await dispatchNotification(
				context(outboundConfig),
				{
					template: "TASK_APPROVED",
					relatedType: "TASK",
					relatedId,
					payload: { taskCode: "T-2000" },
				},
			);

			expect(status).toBe("SENT");
			const row = await readNotification(id);
			expect(row.status).toBe("SENT");
			expect(row.sentAt).not.toBeNull();
			expect(row.errorMessage).toBeNull();
			expect(row.template).toBe("TASK_APPROVED");
			expect(row.channel).toBe("TELEGRAM");
			expect(row.recipient).toBe("-1001234567890");
			expect(row.relatedType).toBe("TASK");
			expect(row.relatedId).toBe(relatedId);
			expect(received).toHaveLength(1);
			expect(received[0]).toMatchObject({ taskCode: "T-2000" });
		} finally {
			server.stop(true);
		}
	});

	test("records FAILED and the reason when the destination rejects", async () => {
		const server = Bun.serve({
			port: 0,
			fetch() {
				return new Response("nope", { status: 500 });
			},
		});

		try {
			await setWebhook({
				webhookUrl: `http://127.0.0.1:${server.port}/hook`,
				isEnabled: true,
			});

			const { id, status } = await dispatchNotification(
				context(outboundConfig),
				{ template: "TASK_RETURNED" },
			);

			expect(status).toBe("FAILED");
			const row = await readNotification(id);
			expect(row.status).toBe("FAILED");
			expect(row.errorMessage).toContain("500");
			expect(row.sentAt).toBeNull();
		} finally {
			server.stop(true);
		}
	});

	test("records FAILED when the destination is unreachable", async () => {
		// Port 1 is reserved and refuses connections.
		await setWebhook({
			webhookUrl: "http://127.0.0.1:1/hook",
			isEnabled: true,
		});

		const { id, status } = await dispatchNotification(context(outboundConfig), {
			template: "EXTENSION_REQUESTED",
		});

		expect(status).toBe("FAILED");
		const row = await readNotification(id);
		expect(row.status).toBe("FAILED");
		expect(row.errorMessage?.length ?? 0).toBeGreaterThan(0);
	});
});

describe("best-effort dispatch", () => {
	test("notify never throws, even when delivery fails", async () => {
		await setWebhook({
			webhookUrl: "http://127.0.0.1:1/hook",
			isEnabled: true,
		});

		const before = (await db.select().from(notifications)).length;
		await notify(context(outboundConfig), { template: "TASK_ACCEPTED" });

		expect((await db.select().from(notifications)).length).toBe(before + 1);
	});
});

describe("completion-request notification templates", () => {
	const COMPLETION_TEMPLATES = [
		"TASK_COMPLETION_REQUESTED",
		"TASK_COMPLETION_APPROVED",
		"TASK_COMPLETION_REJECTED",
	] as const;

	test("records a notification with the task and actor payload", async () => {
		await setWebhook({ webhookUrl: null, isEnabled: false });
		const taskId = crypto.randomUUID();
		const actorId = crypto.randomUUID();

		for (const template of COMPLETION_TEMPLATES) {
			const { id } = await dispatchNotification(context(outboundConfig), {
				template,
				relatedType: "Task",
				relatedId: taskId,
				payload: { taskId, taskCode: "T-3000", actorId },
			});
			const row = await readNotification(id);
			expect(row.template).toBe(template);
			expect(row.relatedType).toBe("Task");
			expect(row.relatedId).toBe(taskId);
			expect(JSON.parse(row.payload ?? "{}")).toMatchObject({
				taskId,
				taskCode: "T-3000",
				actorId,
			});
		}
	});

	test("notify records a pending one for each template", async () => {
		await setWebhook({
			webhookUrl: "http://127.0.0.1:1/hook",
			isEnabled: true,
		});
		const before = (await db.select().from(notifications)).length;
		for (const template of COMPLETION_TEMPLATES) {
			await notify(context(outboundConfig), { template });
		}
		expect((await db.select().from(notifications)).length).toBe(before + 3);
	});
});

describe("notification log", () => {
	test("keeps every attempt, in creation order", async () => {
		await setWebhook({ webhookUrl: null, isEnabled: false });
		await dispatchNotification(context(outboundConfig), {
			template: "LEAVE_REGISTERED",
		});
		await dispatchNotification(context(outboundConfig), {
			template: "PENALTY_LEAVE_ASSIGNED",
		});

		const rows = await db.select().from(notifications);
		expect(rows.length).toBeGreaterThanOrEqual(2);
		const ordered = [...rows].sort(
			(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
		);
		expect(ordered.map((r) => r.createdAt.getTime())).toEqual(
			rows.map((r) => r.createdAt.getTime()).sort((a, b) => a - b),
		);
	});
});
