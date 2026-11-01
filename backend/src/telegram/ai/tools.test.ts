/**
 * Agent tool authorization tests.
 *
 * The tools are the agent's *only* bridge to data, so the property under
 * test is the one the whole design rests on: every tool runs with the linked
 * viewer's `ViewerContext` and enforces the same authorization and department
 * scoping the web surface enforces. An employee searching tickets sees only
 * their own; a management-only tool refuses an employee outright; and the
 * tool surface contains no write and no raw-SQL escape hatch.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { loadConfig } from "../../config";
import { createDatabase, type DatabaseHandle } from "../../db";
import { runMigrations } from "../../db/migrate";
import {
	departments,
	roles,
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
import { buildTools } from "./tools";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const dbPath = join(TMP_ROOT, `mes-tg-tools-${crypto.randomUUID()}.db`);

let db: DatabaseHandle;
let config: ReturnType<typeof loadConfig>;

function viewerContext(who: Viewer): ViewerContext {
	return createContext({
		db,
		config,
		request: { ipAddress: null, userAgent: "telegram-bot" },
		viewer: who,
	});
}

async function seedRole(code: RoleCode): Promise<string> {
	const id = crypto.randomUUID();
	await db.insert(roles).values({ id, code, name: code });
	return id;
}

async function seedUser(
	id: string,
	roleCodes: RoleCode[],
	departmentId: string | null,
): Promise<Viewer> {
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
		await db.insert(userRoles).values({
			id: crypto.randomUUID(),
			userId: id,
			roleId: role.id,
		});
	}
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

function viewer(
	id: string,
	roleCodes: RoleCode[],
	departmentId: string | null,
): Viewer {
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

beforeAll(async () => {
	runMigrations({ databasePath: dbPath });
	config = loadConfig({ NODE_ENV: "test", MES_DATABASE_PATH: dbPath });
	db = createDatabase(dbPath);

	for (const code of [
		"SUPER_ADMIN",
		"TECH_LEAD",
		"HR_MANAGER",
		"DEPT_HEAD",
		"EMPLOYEE",
	] as RoleCode[]) {
		await seedRole(code);
	}
	const [deptA] = await db
		.insert(departments)
		.values({ id: "dept-a", code: "DA", name: "Department A" })
		.returning();
	void deptA;
	await db.insert(departments).values({
		id: "dept-b",
		code: "DB",
		name: "Department B",
	});

	await seedUser("emp-a", ["EMPLOYEE"], "dept-a");
	await seedUser("emp-b", ["EMPLOYEE"], "dept-b");
	await seedUser("hr-1", ["HR_MANAGER"], "dept-a");
	await seedUser("tech-1", ["TECH_LEAD"], "dept-a");

	// Two tickets, one per department.
	await db.insert(tasks).values({
		id: crypto.randomUUID(),
		taskCode: "T-A-001",
		title: "Department A's ticket",
		taskType: "DAILY",
		priority: "MEDIUM",
		state: "REQ",
		createdBy: "hr-1",
		assignedTo: "emp-a",
		departmentId: "dept-a",
		progressPercentage: 0,
	});
	await db.insert(tasks).values({
		id: crypto.randomUUID(),
		taskCode: "T-B-001",
		title: "Department B's ticket",
		taskType: "DAILY",
		priority: "MEDIUM",
		state: "REQ",
		createdBy: "hr-1",
		assignedTo: "emp-b",
		departmentId: "dept-b",
		progressPercentage: 0,
	});
});

afterAll(() => {
	for (const suffix of ["", "-wal", "-shm"]) {
		if (existsSync(`${dbPath}${suffix}`)) rmSync(`${dbPath}${suffix}`);
	}
});

/** Run one tool's execute with its (optional) input. */
async function runTool(
	who: Viewer,
	toolName: keyof ReturnType<typeof buildTools>,
	input: Record<string, unknown> = {},
): Promise<{ output: unknown; error: unknown }> {
	const tools = buildTools(viewerContext(who));
	const entry = tools[toolName] as unknown as {
		execute: (input: Record<string, unknown>) => Promise<unknown>;
	};
	try {
		return { output: await entry.execute(input), error: null };
	} catch (error) {
		return { output: null, error };
	}
}

describe("agent tool surface", () => {
	test("the tool set is read-only and fixed", () => {
		const tools = buildTools(
			viewerContext(viewer("tech-1", ["TECH_LEAD"], "dept-a")),
		);
		const names = Object.keys(tools).sort();
		expect(names).toEqual([
			"getProjectDetail",
			"listAttendance",
			"listAuditEvents",
			"listKpiEvents",
			"listKpiSummary",
			"listLeave",
			"listNotificationsTool",
			"searchProjects",
			"searchTasks",
		]);
		// No write tool and no generic query/SQL tool exists to call.
		expect(names).not.toContain("runSql");
		expect(names).not.toContain("queryDatabase");
	});
});

describe("tool scoping", () => {
	test("an employee's ticket search returns only their own department", async () => {
		const { output } = await runTool(
			viewer("emp-a", ["EMPLOYEE"], "dept-a"),
			"searchTasks",
			{},
		);
		const tickets = (output as { tickets: { code: string }[] }).tickets;
		expect(tickets.map((ticket) => ticket.code)).toEqual(["T-A-001"]);
	});

	test("a company-wide manager sees both departments", async () => {
		const { output } = await runTool(
			viewer("hr-1", ["HR_MANAGER"], "dept-a"),
			"searchTasks",
			{},
		);
		const tickets = (output as { tickets: { code: string }[] }).tickets;
		expect(tickets.map((ticket) => ticket.code).sort()).toEqual([
			"T-A-001",
			"T-B-001",
		]);
	});

	test("the audit tool refuses an employee with an authorization error", async () => {
		const { error } = await runTool(
			viewer("emp-a", ["EMPLOYEE"], "dept-a"),
			"listAuditEvents",
		);
		expect(error).not.toBeNull();
		expect(String(error)).toContain("auditLogs");
	});

	test("the audit tool answers a technical role", async () => {
		const { output, error } = await runTool(
			viewer("tech-1", ["TECH_LEAD"], "dept-a"),
			"listAuditEvents",
		);
		expect(error).toBeNull();
		expect(output).toMatchObject({ totalCount: expect.any(Number) });
	});

	test("the projects tool refuses an employee", async () => {
		const { error } = await runTool(
			viewer("emp-a", ["EMPLOYEE"], "dept-a"),
			"searchProjects",
		);
		expect(error).not.toBeNull();
	});

	test("the notification-log tool refuses an employee", async () => {
		const { error } = await runTool(
			viewer("emp-a", ["EMPLOYEE"], "dept-a"),
			"listNotificationsTool",
		);
		expect(error).not.toBeNull();
	});

	test("the KPI summary tool is personal by construction", async () => {
		// An employee's own (empty) month must not error, and must never
		// carry another user's data.
		const { output, error } = await runTool(
			viewer("emp-a", ["EMPLOYEE"], "dept-a"),
			"listKpiSummary",
			{ periodYear: 2026, periodMonth: 10 },
		);
		expect(error).toBeNull();
		expect(output).toBeDefined();
	});
});
