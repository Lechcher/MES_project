/**
 * Dashboard and profile command tests.
 *
 * The dashboard is the newest read surface on the bot, so the guard is the
 * point: every count goes through the same `authorize()` gate and the same
 * domain function as the web surface, a refused read omits its row rather
 * than failing the command, and the command menu follows the viewer's roles.
 * `/profile` reports the viewer's own record and link facts — nothing else.
 *
 * Pattern follows features.test.ts: a captured registrar stands in for
 * grammY, and the commands bind the real domain functions against a real
 * temporary database.
 */

import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { eq } from "drizzle-orm";
import type { AppConfig } from "../../config";
import { loadConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import type { RoleCode } from "../../db/enums";
import {
	departments,
	notifications,
	roles,
	tasks,
	telegramLinks,
	userRoles as userRolesTable,
	user as userTable,
} from "../../db/schema";
import { createTestDatabase, type TestDatabase } from "../../db/test-db";
import {
	createContext,
	type Viewer,
	type ViewerContext,
} from "../../graphql/context";
import type { BotContext } from "../bot-context";
import { registerDashboardCommands } from "./dashboard";
import { registerProfileCommands } from "./profile";

let testDb: TestDatabase;

let db: DatabaseHandle;
let config: AppConfig;
let departmentId: string;

/** The captured handlers, keyed by command name. */
let handlers: Map<string, (ctx: BotContext) => Promise<void>>;

beforeAll(async () => {
	testDb = await createTestDatabase();
	db = testDb.db;
	config = loadConfig({
		NODE_ENV: "test",
		MES_DATABASE_URL: testDb.connectionString,
	});
	departmentId = crypto.randomUUID();
	await db.insert(departments).values({
		id: departmentId,
		code: "HQ",
		name: "Headquarters",
	});
});

afterAll(async () => {
	await testDb.close();
});

afterEach(async () => {
	await db.delete(notifications);
	await db.delete(tasks);
	await db.delete(telegramLinks);
	await db.delete(userTable);
});

function composer() {
	handlers = new Map();
	return {
		command: (name: string, handler: (ctx: BotContext) => Promise<void>) => {
			handlers.set(name, handler);
		},
		on: () => {},
	};
}

function capture() {
	return { db, config };
}

function fakeContext(who: Viewer): { ctx: BotContext; replies: string[] } {
	const replies: string[] = [];
	const viewerCtx: ViewerContext = createContext({
		db,
		config,
		request: { ipAddress: null, userAgent: "telegram-bot" },
		viewer: who,
	});
	const ctx = {
		viewer: who,
		viewerContext: viewerCtx,
		chat: { id: "chat-1" },
		from: { id: 4242, username: "tester" },
		reply: async (text: string) => {
			replies.push(text);
		},
	} as unknown as BotContext;
	return { ctx, replies };
}

function viewer(id: string, roleCodes: RoleCode[]): Viewer {
	return {
		id,
		userCode: `U-${id}`,
		fullName: `User ${id}`,
		email: `${id}@mes.local`,
		departmentId,
		isActive: true,
		roleCodes,
	};
}

async function seedUser(id: string, roleCodes: RoleCode[]): Promise<Viewer> {
	await db.insert(userTable).values({
		id,
		name: `User ${id}`,
		email: `${id}@mes.local`,
		emailVerified: true,
		userCode: `U-${id}`,
		departmentId,
	});
	for (const code of roleCodes) {
		const [role] = await db
			.select()
			.from(roles)
			.where(eq(roles.code, code))
			.limit(1);
		if (role) {
			await db.insert(userRolesTable).values({
				id: crypto.randomUUID(),
				userId: id,
				roleId: role.id,
			});
		}
	}
	return viewer(id, roleCodes);
}

async function runCommand(name: string, who: Viewer) {
	const { ctx, replies } = fakeContext(who);
	await handlers.get(name)?.(ctx);
	return replies;
}

describe("dashboard", () => {
	test("the registrar captures /dashboard", () => {
		registerDashboardCommands(composer() as never, capture());
		expect(handlers.has("dashboard")).toBe(true);
	});

	test("renders identity, counts, and the role-appropriate menu", async () => {
		registerDashboardCommands(composer() as never, capture());
		const who = await seedUser("dash-1", ["SUPER_ADMIN"]);
		await db.insert(tasks).values({
			id: crypto.randomUUID(),
			taskCode: "T-1",
			title: "One",
			state: "REQ",
			priority: "HIGH",
			assignedTo: who.id,
			createdBy: who.id,
		});
		await db.insert(notifications).values({
			id: crypto.randomUUID(),
			template: "TASK_APPROVED",
			status: "SENT",
		});
		const replies = await runCommand("dashboard", who);
		const text = replies.join("\n");
		expect(text).toContain("User dash-1");
		expect(text).toContain("U-dash-1");
		expect(text).toContain("Headquarters");
		expect(text).toContain("open tickets assigned to you: 1");
		expect(text).toContain("notifications: 1");
		expect(text).toContain("/newticket");
	});

	test("a role without ticket creation sees no /newticket", async () => {
		registerDashboardCommands(composer() as never, capture());
		const who = await seedUser("dash-2", ["EMPLOYEE"]);
		const text = (await runCommand("dashboard", who)).join("\n");
		expect(text).not.toContain("/newticket");
		expect(text).toContain("/dashboard");
	});

	test("another user's tickets never enter the count", async () => {
		registerDashboardCommands(composer() as never, capture());
		const who = await seedUser("dash-3", ["EMPLOYEE"]);
		const other = await seedUser("dash-4", ["EMPLOYEE"]);
		await db.insert(tasks).values({
			id: crypto.randomUUID(),
			taskCode: "T-2",
			title: "Not theirs",
			state: "REQ",
			priority: "LOW",
			assignedTo: other.id,
			createdBy: other.id,
		});
		const text = (await runCommand("dashboard", who)).join("\n");
		expect(text).toContain("open tickets assigned to you: 0");
	});

	test("an unauthorized read omits its row instead of erroring", async () => {
		registerDashboardCommands(composer() as never, capture());
		const who = await seedUser("dash-5", ["EMPLOYEE"]);
		await db.insert(notifications).values({
			id: crypto.randomUUID(),
			template: "TASK_APPROVED",
			status: "SENT",
		});
		await db.insert(tasks).values({
			id: crypto.randomUUID(),
			taskCode: "T-3",
			title: "Mine",
			state: "REQ",
			priority: "LOW",
			assignedTo: who.id,
			createdBy: who.id,
		});
		const replies = await runCommand("dashboard", who);
		const text = replies.join("\n");
		expect(replies).toHaveLength(1);
		expect(text).toContain("notifications: —");
	});
});

describe("profile", () => {
	test("the registrar captures /profile", () => {
		registerProfileCommands(composer() as never, capture());
		expect(handlers.has("profile")).toBe(true);
	});

	test("reports the account and the link, no other user's data", async () => {
		registerProfileCommands(composer() as never, capture());
		const who = await seedUser("prof-1", ["DEPT_HEAD", "EMPLOYEE"]);
		await db.insert(telegramLinks).values({
			id: crypto.randomUUID(),
			userId: who.id,
			telegramUserId: "4242",
			telegramChatId: "4242",
			telegramUsername: "tester",
			isActive: true,
		});
		const replies = await runCommand("profile", who);
		const text = replies.join("\n");
		expect(text).toContain("User prof-1");
		expect(text).toContain("U-prof-1");
		expect(text).toContain("prof-1@mes.local");
		expect(text).toContain("Headquarters");
		expect(text).toContain("DEPT_HEAD");
		expect(text).toContain("EMPLOYEE");
		expect(text).toContain("@tester");
	});

	test("a viewer without a link still gets their account", async () => {
		registerProfileCommands(composer() as never, capture());
		const who = await seedUser("prof-2", ["EMPLOYEE"]);
		const text = (await runCommand("profile", who)).join("\n");
		expect(text).toContain("User prof-2");
		expect(text).toContain("linked since: —");
	});

	test("escapes the viewer's own values", async () => {
		registerProfileCommands(composer() as never, capture());
		const who = await seedUser("prof-3", ["EMPLOYEE"]);
		const text = (await runCommand("profile", who)).join("\n");
		expect(text).not.toMatch(/<b>User/);
	});
});
