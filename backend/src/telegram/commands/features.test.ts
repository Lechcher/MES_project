/**
 * Feature command tests.
 *
 * The guards are the point: each command must refuse before it reads anything
 * when the linked viewer's roles forbid it, and render the domain's own data
 * when they permit it. The commands bind the real domain functions against a
 * real (temporary) database, so these are integration tests of the guard +
 * read path, with a captured registrar standing in for grammY.
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
import { eq } from "drizzle-orm";
import { loadConfig } from "../../config";
import { createDatabase, type DatabaseHandle } from "../../db";
import { runMigrations } from "../../db/migrate";
import {
	departments,
	notifications,
	roles,
	systemAuditLogs,
	tasks,
	userRoles,
	user as userTable,
} from "../../db/schema";
import type { RoleCode } from "../../db/enums";
import {
	createContext,
	type Viewer,
	type ViewerContext,
} from "../../graphql/context";
import type { BotContext } from "../bot-context";
import { registerFeatureCommands } from "./features";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const dbPath = join(TMP_ROOT, `mes-tg-features-${crypto.randomUUID()}.db`);

let db: DatabaseHandle;
let config: ReturnType<typeof loadConfig>;
let departmentId: string;

/** The captured handlers, keyed by command name. */
let handlers: Map<string, (ctx: BotContext) => Promise<void>>;

function capture() {
	handlers = new Map();
	return {
		db,
		config,
	};
}

function composer() {
	return {
		command: (name: string, handler: (ctx: BotContext) => Promise<void>) => {
			handlers.set(name, handler);
		},
		on: () => {},
	};
}

afterAll(() => {
	for (const suffix of ["", "-wal", "-shm"]) {
		if (existsSync(`${dbPath}${suffix}`)) rmSync(`${dbPath}${suffix}`);
	}
});

afterEach(async () => {
	// Links and drafts live in the command modules; the DB rows are reset.
	await db.delete(notifications);
	await db.delete(systemAuditLogs);
	await db.delete(tasks);
});

function fakeContext(viewer: Viewer): {
	ctx: BotContext;
	replies: string[];
} {
	const replies: string[] = [];
	const viewerCtx: ViewerContext = createContext({
		db,
		config,
		request: { ipAddress: null, userAgent: "telegram-bot" },
		viewer,
	});
	const ctx = {
		viewer,
		viewerContext: viewerCtx,
		chat: { id: "chat-1" },
		from: { id: 1 },
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
		const [role] = await db.select().from(roles).where(eqRole(code)).limit(1);
		if (role) {
			await db.insert(userRoles).values({
				id: crypto.randomUUID(),
				userId: id,
				roleId: role.id,
			});
		}
	}
	return viewer(id, roleCodes);
}

function eqRole(code: string) {
	return eq(roles.code, code);
}

async function runCommand(name: string, who: Viewer, match = "") {
	const { ctx, replies } = fakeContext(who);
	(ctx as unknown as { match: string }).match = match;
	await handlers.get(name)?.(ctx);
	return replies;
}

describe("feature command guards", () => {
	test("the registrar captures every feature command", () => {
		registerFeatureCommands(composer() as never, capture());
		for (const name of [
			"notifications",
			"lookup",
			"tickets",
			"projects",
			"newticket",
			"audit",
			"status",
		]) {
			expect(handlers.has(name)).toBe(true);
		}
	});

	test("/notifications is refused before reading for a non-manager", async () => {
		await db.insert(notifications).values({
			id: crypto.randomUUID(),
			template: "TASK_APPROVED",
			status: "SENT",
		});
		const employee = await seedUser("emp-1", ["EMPLOYEE"]);
		const replies = await runCommand("notifications", employee);
		expect(replies.join(" ")).toContain("do not have access");
		// Refused *before* any row is surfaced.
		expect(replies.join(" ")).not.toContain("TASK_APPROVED");
	});

	test("/notifications lists the log newest-first for a manager", async () => {
		const hr = await seedUser("hr-1", ["HR_MANAGER"]);
		for (const template of ["TASK_APPROVED", "LEAVE_REGISTERED"]) {
			await db.insert(notifications).values({
				id: crypto.randomUUID(),
				template,
				status: "SENT",
			});
		}
		const replies = await runCommand("notifications", hr);
		expect(replies.join(" ")).toContain("Recent notifications");
		expect(replies.join(" ")).toContain("TASK_APPROVED");
	});

	test("/notifications reports an empty log plainly", async () => {
		const hr = await seedUser("hr-2", ["HR_MANAGER"]);
		const replies = await runCommand("notifications", hr);
		expect(replies.join(" ")).toContain("No notifications recorded yet");
	});

	test("/projects is refused for a non-approver", async () => {
		const employee = await seedUser("emp-2", ["EMPLOYEE"]);
		const replies = await runCommand("projects", employee, "any");
		expect(replies.join(" ")).toContain("do not have access to projects");
	});

	test("/tickets reports an empty list plainly for an employee", async () => {
		const employee = await seedUser("emp-3", ["EMPLOYEE"]);
		const replies = await runCommand("tickets", employee);
		expect(replies.join(" ")).toContain("No tickets match");
	});

	test("/audit is refused for a non-technical role", async () => {
		await db.insert(systemAuditLogs).values({
			id: crypto.randomUUID(),
			action: "task.create",
			resourceType: "task",
			moduleCode: "jobs",
		});
		const hr = await seedUser("hr-3", ["HR_MANAGER"]);
		const replies = await runCommand("audit", hr);
		expect(replies.join(" ")).toContain("do not have access to the audit log");
		expect(replies.join(" ")).not.toContain("task.create");
	});

	test("/audit lists entries for a technical role", async () => {
		await db.insert(systemAuditLogs).values({
			id: crypto.randomUUID(),
			action: "telegram_webhook.update",
			resourceType: "telegram_webhook_config",
			moduleCode: "settings",
		});
		const tech = await seedUser("tech-1", ["TECH_LEAD"]);
		const replies = await runCommand("audit", tech);
		expect(replies.join(" ")).toContain("telegram_webhook.update");
	});

	test("/status is refused for a non-technical role, and never leaks secrets", async () => {
		const hr = await seedUser("hr-4", ["HR_MANAGER"]);
		const refusals = await runCommand("status", hr);
		expect(refusals.join(" ")).toContain("limited to technical roles");

		const tech = await seedUser("tech-2", ["TECH_LEAD"]);
		const status = await runCommand("status", tech);
		expect(status.join(" ")).toContain("Server status");
		expect(status.join(" ")).toContain("none — all deliveries succeeded");
	});

	test("/newticket refuses a role that may not create tickets", async () => {
		const employee = await seedUser("emp-4", ["EMPLOYEE"]);
		const replies = await runCommand("newticket", employee);
		expect(replies.join(" ")).toContain(
			"limited to Department Heads, HR Managers, Super Admins, and Tech Leads",
		);
	});

	test("/newticket starts the guided flow for a permitted role", async () => {
		const deptHead = await seedUser("head-1", ["DEPT_HEAD"]);
		const replies = await runCommand("newticket", deptHead);
		expect(replies.join(" ")).toContain("New ticket. Send the title");
	});
});

describe("database seeds", () => {
	test("the seed places the department, roles, and users", async () => {
		expect(departmentId).toBeDefined();
		const allRoles = await db.select().from(roles);
		expect(allRoles.length).toBeGreaterThanOrEqual(5);
	});
});

async function bootstrapSeeds() {
	runMigrations({ databasePath: dbPath });
	config = loadConfig({ NODE_ENV: "test", MES_DATABASE_PATH: dbPath });
	db = createDatabase(dbPath);
	departmentId = crypto.randomUUID();
	await db.insert(departments).values({
		id: departmentId,
		code: "HQ",
		name: "Headquarters",
	});
	for (const code of [
		"SUPER_ADMIN",
		"TECH_LEAD",
		"HR_MANAGER",
		"DEPT_HEAD",
		"EMPLOYEE",
	] as RoleCode[]) {
		await db.insert(roles).values({
			id: crypto.randomUUID(),
			code,
			name: code,
		});
	}
}

beforeAll(bootstrapSeeds);
