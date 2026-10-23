/**
 * Jobs domain tests.
 *
 * Builds an isolated SQLite database from the real migration, seeds the minimum
 * reference data, and exercises the ticket lifecycle through the resolver
 * surface so both authorization and the domain state machine are covered.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asc, eq } from "drizzle-orm";
import { type AppConfig, loadConfig } from "../config";
import { createDatabase, type DatabaseHandle } from "../db";
import { ROLE_CODES, type RoleCode } from "../db/enums";
import { DEFAULT_MIGRATIONS_FOLDER } from "../db/migrate";
import type { TaskCompletionRequestRow } from "../db/schema";
import {
	attachments,
	departments,
	kpiPointRules,
	kpiScoreEvents,
	roles,
	taskCompletionRequests,
	user,
	userRoles,
} from "../db/schema";
import { createContext, type ViewerContext } from "../graphql/context";
import { jobsMutation, jobsQuery } from "../graphql/resolvers/jobs";

const PREFERRED_TMP =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";

let tempDir: string;
let db: DatabaseHandle;
const config: AppConfig = loadConfig({ NODE_ENV: "test" });
const authStub = {} as never;

interface TaskShape {
	id: string;
	state: string;
	taskCode: string;
	priority: string;
	extendedDeadline: Date | null;
	isExtensionRequested: boolean;
}

interface TaskRequestShape {
	id: string;
	status: string;
	requestType: string;
}

/** Apply the versioned migration SQL to this connection. */
function applyMigrations(handle: DatabaseHandle): void {
	const files = readdirSync(DEFAULT_MIGRATIONS_FOLDER)
		.filter((file) => file.endsWith(".sql"))
		.sort();
	for (const file of files) {
		handle.$client.exec(
			readFileSync(join(DEFAULT_MIGRATIONS_FOLDER, file), "utf8"),
		);
	}
}

async function seed(handle: DatabaseHandle): Promise<void> {
	await handle.insert(departments).values([
		{
			id: "dept-a",
			code: "A",
			name: "Department A",
			departmentType: "DEPARTMENT",
			autoForkingEnabled: false,
		},
		{
			id: "dept-b",
			code: "B",
			name: "Department B",
			departmentType: "DEPARTMENT",
			autoForkingEnabled: false,
		},
		{
			id: "dept-fork",
			code: "F",
			name: "Department Fork",
			departmentType: "DEPARTMENT",
			autoForkingEnabled: true,
		},
	]);
	await handle
		.insert(roles)
		.values(
			ROLE_CODES.map((code) => ({ id: `role-${code}`, code, name: code })),
		);
	await handle.insert(user).values([
		{
			id: "u-tl",
			name: "Tech Lead",
			email: "tl@example.com",
			userCode: "TL",
			departmentId: "dept-a",
			isActive: true,
		},
		{
			id: "u-dh",
			name: "Dept Head",
			email: "dh@example.com",
			userCode: "DH",
			departmentId: "dept-a",
			isActive: true,
		},
		{
			id: "u-e1",
			name: "Employee One",
			email: "e1@example.com",
			userCode: "E1",
			departmentId: "dept-a",
			isActive: true,
		},
		{
			id: "u-e2",
			name: "Employee Two",
			email: "e2@example.com",
			userCode: "E2",
			departmentId: "dept-a",
			isActive: true,
		},
		{
			id: "u-hr",
			name: "HR Manager",
			email: "hr@example.com",
			userCode: "HR",
			departmentId: "dept-b",
			isActive: true,
		},
		{
			id: "u-f1",
			name: "Fork One",
			email: "f1@example.com",
			userCode: "F1",
			departmentId: "dept-fork",
			isActive: true,
		},
		{
			id: "u-f2",
			name: "Fork Two",
			email: "f2@example.com",
			userCode: "F2",
			departmentId: "dept-fork",
			isActive: true,
		},
	]);
	await handle.insert(userRoles).values([
		{ id: crypto.randomUUID(), userId: "u-tl", roleId: "role-TECH_LEAD" },
		{ id: crypto.randomUUID(), userId: "u-dh", roleId: "role-DEPT_HEAD" },
		{ id: crypto.randomUUID(), userId: "u-e1", roleId: "role-EMPLOYEE" },
		{ id: crypto.randomUUID(), userId: "u-e2", roleId: "role-EMPLOYEE" },
		{ id: crypto.randomUUID(), userId: "u-hr", roleId: "role-HR_MANAGER" },
		{ id: crypto.randomUUID(), userId: "u-f1", roleId: "role-EMPLOYEE" },
		{ id: crypto.randomUUID(), userId: "u-f2", roleId: "role-EMPLOYEE" },
	]);
	await handle.insert(kpiPointRules).values([
		{ code: "KPI_ON_TIME_TICKET", event: "On-time ticket", points: 10 },
		{ code: "KPI_ON_TIME_URGENT", event: "On-time urgent ticket", points: 20 },
		{
			code: "KPI_FIRST_TIME_APPROVAL",
			event: "First-time approval",
			points: 5,
		},
		{ code: "KPI_OVERDUE_TICKET", event: "Overdue ticket", points: -15 },
		{ code: "KPI_RETURNED_TICKET", event: "Returned ticket", points: -5 },
		{ code: "KPI_EXTENSION_REQUEST", event: "Extension request", points: -2 },
		{ code: "KPI_PERFECT_ATTENDANCE", event: "Perfect attendance", points: 50 },
		{ code: "KPI_UNAPPROVED_LEAVE", event: "Unapproved leave", points: -10 },
	]);
}

function makeCtx(spec: {
	id: string;
	roleCodes: RoleCode[];
	departmentId: string | null;
}): ViewerContext {
	return createContext({
		db,
		config,
		request: { ipAddress: "127.0.0.1", userAgent: "bun-test" },
		viewer: {
			id: spec.id,
			userCode: spec.id,
			fullName: spec.id,
			email: `${spec.id}@example.com`,
			departmentId: spec.departmentId,
			isActive: true,
			roleCodes: spec.roleCodes,
		},
	});
}

type AnyResolver = (
	parent: unknown,
	args: any,
	contextValue: any,
	info: unknown,
) => unknown;

function run(
	resolver: AnyResolver,
	ctx: ViewerContext,
	args: Record<string, unknown>,
): Promise<unknown> {
	return Promise.resolve(resolver(null, args, { ctx, auth: authStub }, null));
}

async function captureError(
	run_: () => Promise<unknown> | unknown,
): Promise<unknown> {
	try {
		await run_();
	} catch (error) {
		return error;
	}
	throw new Error("Expected the operation to fail, but it succeeded.");
}

/** Read the machine-readable code whether the failure is a Domain or GraphQL error. */
function codeOf(error: unknown): unknown {
	if (error && typeof error === "object") {
		const candidate = error as {
			code?: unknown;
			extensions?: { code?: unknown };
		};
		return candidate.extensions?.code ?? candidate.code;
	}
	return undefined;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const futureEnd = (days = 3) =>
	new Date(Date.now() + days * DAY_MS).toISOString();

let techLead: ViewerContext;
let employeeOne: ViewerContext;
let employeeTwo: ViewerContext;

async function createTaskFor(
	ctx: ViewerContext,
	overrides: Record<string, unknown> = {},
): Promise<TaskShape> {
	const task = await run(jobsMutation.createTask, ctx, {
		input: {
			title: "Routine inspection",
			taskType: "DAILY",
			priority: "MEDIUM",
			departmentId: "dept-a",
			endDate: futureEnd(),
			...overrides,
		},
	});
	return task as TaskShape;
}

beforeAll(async () => {
	const root = existsSync(PREFERRED_TMP) ? PREFERRED_TMP : tmpdir();
	mkdirSync(root, { recursive: true });
	tempDir = mkdtempSync(join(root, "mes-jobs-"));
	db = createDatabase(join(tempDir, "test.db"));
	applyMigrations(db);
	await seed(db);

	techLead = makeCtx({
		id: "u-tl",
		roleCodes: ["TECH_LEAD"],
		departmentId: "dept-a",
	});
	employeeOne = makeCtx({
		id: "u-e1",
		roleCodes: ["EMPLOYEE"],
		departmentId: "dept-a",
	});
	employeeTwo = makeCtx({
		id: "u-e2",
		roleCodes: ["EMPLOYEE"],
		departmentId: "dept-a",
	});
});

afterAll(() => {
	try {
		db?.$client.close();
	} finally {
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	}
});

describe("ticket state machine", () => {
	test("accepts REQ -> ACT -> PEN -> APP", async () => {
		const created = await createTaskFor(techLead, { assignedToId: "u-e1" });
		expect(created.state).toBe("REQ");

		const accepted = (await run(jobsMutation.acceptTask, employeeOne, {
			taskId: created.id,
		})) as TaskShape;
		expect(accepted.state).toBe("ACT");

		const submitted = (await run(jobsMutation.submitTaskReport, employeeOne, {
			input: { taskId: created.id },
		})) as TaskShape;
		expect(submitted.state).toBe("PEN");

		const approved = (await run(jobsMutation.approveTask, techLead, {
			taskId: created.id,
		})) as TaskShape;
		expect(approved.state).toBe("APP");
	});

	test("rejects an invalid transition with STATE_TRANSITION_INVALID", async () => {
		const created = await createTaskFor(techLead, { assignedToId: "u-e1" });
		await run(jobsMutation.acceptTask, employeeOne, { taskId: created.id });

		const error = await captureError(() =>
			run(jobsMutation.approveTask, techLead, { taskId: created.id }),
		);
		expect(codeOf(error)).toBe("STATE_TRANSITION_INVALID");
	});

	test("rejects accepting a task that is already terminal", async () => {
		const created = await createTaskFor(techLead, { assignedToId: "u-e1" });
		await run(jobsMutation.acceptTask, employeeOne, { taskId: created.id });
		await run(jobsMutation.submitTaskReport, employeeOne, {
			input: { taskId: created.id },
		});
		await run(jobsMutation.approveTask, techLead, { taskId: created.id });

		const error = await captureError(() =>
			run(jobsMutation.acceptTask, employeeOne, { taskId: created.id }),
		);
		expect(codeOf(error)).toBe("STATE_TRANSITION_INVALID");
	});
});

describe("cancellation", () => {
	test("rejects cancellation without a reason with RULE_VIOLATION", async () => {
		const created = await createTaskFor(techLead, { assignedToId: "u-e1" });
		const error = await captureError(() =>
			run(jobsMutation.cancelTask, techLead, {
				input: { taskId: created.id, reason: "   " },
			}),
		);
		expect(codeOf(error)).toBe("RULE_VIOLATION");
	});

	test("lets an EMPLOYEE cancel their own ticket with a reason", async () => {
		const created = await createTaskFor(techLead, { assignedToId: "u-e1" });
		const cancelled = (await run(jobsMutation.cancelTask, employeeOne, {
			input: { taskId: created.id, reason: "Work is no longer required." },
		})) as TaskShape;
		expect(cancelled.state).toBe("CAN");
	});
});

describe("authorization and scope", () => {
	test("denies createTask to an EMPLOYEE with FORBIDDEN", async () => {
		const error = await captureError(() =>
			run(jobsMutation.createTask, employeeOne, {
				input: {
					title: "Not allowed",
					taskType: "DAILY",
					priority: "LOW",
					departmentId: "dept-a",
				},
			}),
		);
		expect(codeOf(error)).toBe("FORBIDDEN");
	});

	test("hides another employee's task from an EMPLOYEE with NOT_FOUND", async () => {
		const created = await createTaskFor(techLead, { assignedToId: "u-e2" });

		const error = await captureError(() =>
			run(jobsQuery.task, employeeOne, { id: created.id }),
		);
		expect(codeOf(error)).toBe("NOT_FOUND");

		const own = (await run(jobsQuery.task, employeeTwo, {
			id: created.id,
		})) as TaskShape;
		expect(own.id).toBe(created.id);
	});
});

describe("extension requests", () => {
	test("an approved extension moves the effective deadline", async () => {
		const originalEnd = new Date(Date.now() + 2 * DAY_MS);
		const created = await createTaskFor(techLead, {
			assignedToId: "u-e1",
			endDate: originalEnd.toISOString(),
		});

		const requestedDeadline = new Date(Date.now() + 6 * DAY_MS);
		const request = (await run(jobsMutation.requestExtension, employeeOne, {
			input: {
				taskId: created.id,
				requestedDeadline: requestedDeadline.toISOString(),
				reason: "Dependency slipped.",
			},
		})) as TaskRequestShape;
		expect(request.status).toBe("PENDING");
		expect(request.requestType).toBe("EXTENSION");

		const reviewed = (await run(jobsMutation.reviewTaskRequest, techLead, {
			input: {
				requestId: request.id,
				decision: "APPROVED",
				reviewComment: "Approved.",
			},
		})) as TaskRequestShape;
		expect(reviewed.status).toBe("APPROVED");

		const refreshed = (await run(jobsQuery.task, employeeOne, {
			id: created.id,
		})) as TaskShape;
		expect(refreshed.extendedDeadline?.getTime()).toBe(
			requestedDeadline.getTime(),
		);
		expect(refreshed.isExtensionRequested).toBe(false);
	});

	test("a rejected extension keeps the original deadline", async () => {
		const originalEnd = new Date(Date.now() + 2 * DAY_MS);
		const created = await createTaskFor(techLead, {
			assignedToId: "u-e1",
			endDate: originalEnd.toISOString(),
		});

		const request = (await run(jobsMutation.requestExtension, employeeOne, {
			input: {
				taskId: created.id,
				requestedDeadline: new Date(Date.now() + 9 * DAY_MS).toISOString(),
				reason: "Extra time please.",
			},
		})) as TaskRequestShape;

		const reviewed = (await run(jobsMutation.reviewTaskRequest, techLead, {
			input: {
				requestId: request.id,
				decision: "REJECTED",
				reviewComment: "Deadline stands.",
			},
		})) as TaskRequestShape;
		expect(reviewed.status).toBe("REJECTED");

		const refreshed = (await run(jobsQuery.task, employeeOne, {
			id: created.id,
		})) as TaskShape;
		expect(refreshed.extendedDeadline).toBeNull();
		expect(refreshed.isExtensionRequested).toBe(false);
	});
});

describe("overdue handling", () => {
	test("requires an approved explanation before an OVERDUE ticket moves to PEN", async () => {
		const created = await createTaskFor(techLead, {
			assignedToId: "u-e1",
			endDate: new Date(Date.now() - DAY_MS).toISOString(),
		});

		const blocked = await captureError(() =>
			run(jobsMutation.submitTaskReport, employeeOne, {
				input: { taskId: created.id },
			}),
		);
		expect(codeOf(blocked)).toBe("STATE_TRANSITION_INVALID");

		const overdue = (await run(jobsQuery.task, employeeOne, {
			id: created.id,
		})) as TaskShape;
		expect(overdue.state).toBe("OVERDUE");

		const explanation = (await run(
			jobsMutation.explainLateSubmission,
			employeeOne,
			{ input: { taskId: created.id, reason: "Monitoring outage." } },
		)) as TaskRequestShape;
		expect(explanation.requestType).toBe("LATE_EXPLANATION");

		const stillBlocked = await captureError(() =>
			run(jobsMutation.submitTaskReport, employeeOne, {
				input: { taskId: created.id },
			}),
		);
		expect(codeOf(stillBlocked)).toBe("STATE_TRANSITION_INVALID");

		await run(jobsMutation.reviewTaskRequest, techLead, {
			input: { requestId: explanation.id, decision: "APPROVED" },
		});

		const submitted = (await run(jobsMutation.submitTaskReport, employeeOne, {
			input: { taskId: created.id },
		})) as TaskShape;
		expect(submitted.state).toBe("PEN");
	});
});

describe("auto-forking", () => {
	test("replicates a new ticket to the other department members", async () => {
		await createTaskFor(techLead, {
			title: "Forked inspection",
			departmentId: "dept-fork",
			assignedToId: "u-f1",
		});

		const page = (await run(jobsQuery.tasks, techLead, {
			filter: { departmentId: "dept-fork", search: "Forked inspection" },
			limit: 50,
		})) as { nodes: TaskShape[]; pageInfo: { totalCount: number } };

		expect(page.pageInfo.totalCount).toBe(2);
		const assignees = page.nodes
			.map((node) => (node as unknown as { assignedToId: string }).assignedToId)
			.sort();
		expect(assignees).toEqual(["u-f1", "u-f2"]);
	});
});

describe("planning schedule", () => {
	const deptHead = () =>
		makeCtx({ id: "u-dh", roleCodes: ["DEPT_HEAD"], departmentId: "dept-a" });
	const hr = () =>
		makeCtx({ id: "u-hr", roleCodes: ["HR_MANAGER"], departmentId: "dept-b" });
	const at = (iso: string) => new Date(iso).toISOString();
	const range = (from: string, to: string) => ({
		input: { fromDate: at(from), toDate: at(to) },
	});
	const ids = async (ctx: ViewerContext, from: string, to: string) =>
		(
			(await run(jobsQuery.scheduledTasks, ctx, range(from, to))) as TaskShape[]
		).map((task) => task.id);

	test("returns tasks overlapping the range and drops deleted ones", async () => {
		const spanning = await createTaskFor(techLead, {
			title: "Spanning",
			taskType: "MULTI_DAY",
			assignedToId: "u-e1",
			startDate: at("2030-10-30T00:00:00Z"),
			endDate: at("2030-11-03T00:00:00Z"),
		});
		const outside = await createTaskFor(techLead, {
			assignedToId: "u-e1",
			startDate: at("2030-12-01T00:00:00Z"),
			endDate: at("2030-12-01T10:00:00Z"),
		});
		let found = await ids(
			techLead,
			"2030-11-01T00:00:00Z",
			"2030-11-08T00:00:00Z",
		);
		expect(found).toContain(spanning.id);
		expect(found).not.toContain(outside.id);

		expect(
			await run(jobsMutation.deleteTask, techLead, { taskId: spanning.id }),
		).toBe(true);
		found = await ids(techLead, "2030-11-01T00:00:00Z", "2030-11-08T00:00:00Z");
		expect(found).not.toContain(spanning.id);
	});

	test("employees see only their own scheduled tasks", async () => {
		const mine = await createTaskFor(techLead, {
			assignedToId: "u-e1",
			startDate: at("2031-01-05T08:00:00Z"),
			endDate: at("2031-01-05T17:00:00Z"),
		});
		const theirs = await createTaskFor(techLead, {
			assignedToId: "u-e2",
			startDate: at("2031-01-05T08:00:00Z"),
			endDate: at("2031-01-05T17:00:00Z"),
		});
		const found = await ids(
			employeeOne,
			"2031-01-05T00:00:00Z",
			"2031-01-06T00:00:00Z",
		);
		expect(found).toContain(mine.id);
		expect(found).not.toContain(theirs.id);
	});

	test("updateTask moves dates and rejects end before start", async () => {
		const task = await createTaskFor(techLead, {
			assignedToId: "u-e1",
			startDate: at("2031-02-02T08:00:00Z"),
			endDate: at("2031-02-02T17:00:00Z"),
		});
		const moved = (await run(jobsMutation.updateTask, hr(), {
			input: {
				taskId: task.id,
				startDate: at("2031-02-04T08:00:00Z"),
				endDate: at("2031-02-04T17:00:00Z"),
			},
		})) as TaskShape & { startDate: Date; title: string };
		expect(new Date(moved.startDate).toISOString()).toBe(
			at("2031-02-04T08:00:00Z"),
		);
		expect(moved.title).toBe("Routine inspection");

		const error = await captureError(() =>
			run(jobsMutation.updateTask, techLead, {
				input: {
					taskId: task.id,
					startDate: at("2031-02-05T08:00:00Z"),
					endDate: at("2031-02-04T08:00:00Z"),
				},
			}),
		);
		expect(codeOf(error)).toBe("VALIDATION_FAILED");
	});

	test("a department head cannot move a task outside their department", async () => {
		const task = await createTaskFor(techLead, { assignedToId: "u-e1" });
		const error = await captureError(() =>
			run(jobsMutation.updateTask, deptHead(), {
				input: { taskId: task.id, assignedToId: "u-hr" },
			}),
		);
		expect(codeOf(error)).toBe("FORBIDDEN");
		const reassigned = (await run(jobsMutation.updateTask, deptHead(), {
			input: { taskId: task.id, assignedToId: "u-e2" },
		})) as TaskShape & { assignedTo: { id: string } | string | null };
		expect(reassigned.id).toBe(task.id);
	});

	test("employees cannot edit, delete, or duplicate", async () => {
		const task = await createTaskFor(techLead, { assignedToId: "u-e1" });
		for (const [resolver, args] of [
			[jobsMutation.deleteTask, { taskId: task.id }],
			[jobsMutation.updateTask, { input: { taskId: task.id, title: "x" } }],
			[jobsMutation.duplicateTask, { input: { taskId: task.id } }],
		] as const) {
			const error = await captureError(() =>
				run(resolver, employeeOne, args as Record<string, unknown>),
			);
			expect(codeOf(error)).toBe("FORBIDDEN");
		}
	});

	test("duplicateTask copies as a new REQ ticket and keeps the duration", async () => {
		const source = await createTaskFor(techLead, {
			title: "Copy me",
			taskType: "MULTI_DAY",
			priority: "HIGH",
			assignedToId: "u-e1",
			startDate: at("2031-03-02T08:00:00Z"),
			endDate: at("2031-03-04T17:00:00Z"),
		});
		await run(jobsMutation.acceptTask, employeeOne, { taskId: source.id });
		const copy = (await run(jobsMutation.duplicateTask, techLead, {
			input: { taskId: source.id, startDate: at("2031-03-09T08:00:00Z") },
		})) as TaskShape & {
			title: string;
			endDate: Date;
			progressPercentage: number;
		};
		expect(copy.id).not.toBe(source.id);
		expect(copy.taskCode).not.toBe(source.taskCode);
		expect(copy.state).toBe("REQ");
		expect(copy.priority).toBe("HIGH");
		expect(copy.title).toBe("Copy me");
		expect(copy.progressPercentage).toBe(0);
		expect(new Date(copy.endDate).toISOString()).toBe(
			at("2031-03-11T17:00:00Z"),
		);
	});
});

/* ------------------------------------------------------------------ */
/* Completion requests                                                */
/* ------------------------------------------------------------------ */

interface ProgressShape extends TaskShape {
	plannedStageCount: number | null;
	progressPercentage: number;
}

interface CompletionShape {
	id: string;
	state: string;
	scope: string;
	title: string;
	declaredProgress: number | null;
	plannedStageCount: number | null;
	reviewComment: string | null;
	reviewedById: string | null;
}

/** Create a `MULTI_DAY` ticket assigned to `u-e1` and accept it into `ACT`. */
async function activeMultiDayTask(
	overrides: Record<string, unknown> = {},
): Promise<TaskShape> {
	const created = await createTaskFor(techLead, {
		taskType: "MULTI_DAY",
		assignedToId: "u-e1",
		...overrides,
	});
	return (await run(jobsMutation.acceptTask, employeeOne, {
		taskId: created.id,
	})) as TaskShape;
}

async function attachUpload(
	ctx: ViewerContext,
	ownerId: string,
): Promise<string> {
	const id = crypto.randomUUID();
	await db.insert(attachments).values({
		id,
		ownerType: "TASK",
		ownerId,
		url: `tasks/${ownerId}/${id}-photo.png`,
		fileName: "photo.png",
		mimeType: "image/png",
		sizeBytes: 2048,
		uploadedBy: ctx.viewer?.id ?? null,
	});
	return id;
}

/** The ticket's journey, oldest first, as the domain stored it. */
async function journeyRows(
	taskId: string,
): Promise<TaskCompletionRequestRow[]> {
	return db
		.select()
		.from(taskCompletionRequests)
		.where(eq(taskCompletionRequests.taskId, taskId))
		.orderBy(asc(taskCompletionRequests.createdAt));
}

async function kpiRuleCounts(userId: string) {
	const rows = await db
		.select()
		.from(kpiScoreEvents)
		.where(eq(kpiScoreEvents.userId, userId));
	return {
		returned: rows.filter((row) => row.ruleCode === "KPI_RETURNED_TICKET")
			.length,
		onTime: rows.filter((row) => row.ruleCode === "KPI_ON_TIME_TICKET").length,
		firstTime: rows.filter((row) => row.ruleCode === "KPI_FIRST_TIME_APPROVAL")
			.length,
	};
}

describe("completion request submission", () => {
	test("submitting moves ACT -> PEN and records a PEN journey entry", async () => {
		const task = await activeMultiDayTask();
		const request = (await run(
			jobsMutation.submitTaskCompletionRequest,
			employeeOne,
			{
				input: { taskId: task.id, scope: "FULL_JOB", title: "Delivered" },
			},
		)) as CompletionShape;

		expect(request.state).toBe("PEN");
		expect(request.scope).toBe("FULL_JOB");

		const journey = await journeyRows(task.id);
		expect(journey).toHaveLength(1);
		expect(journey[0]?.state).toBe("PEN");
		expect(journey[0]?.title).toBe("Delivered");

		const stored = (await run(jobsQuery.task, techLead, {
			id: task.id,
		})) as TaskShape;
		expect(stored.state).toBe("PEN");
	});

	test("an empty title fails with VALIDATION_FAILED", async () => {
		const task = await activeMultiDayTask();
		const error = await captureError(() =>
			run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
				input: { taskId: task.id, scope: "FULL_JOB", title: "   " },
			}),
		);
		expect(codeOf(error)).toBe("VALIDATION_FAILED");
		expect(await journeyRows(task.id)).toHaveLength(0);
	});

	test("a second pending request is refused with STATE_TRANSITION_INVALID", async () => {
		const task = await activeMultiDayTask();
		await run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
			input: { taskId: task.id, scope: "MILESTONE", title: "Stage one" },
		});

		const error = await captureError(() =>
			run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
				input: { taskId: task.id, scope: "MILESTONE", title: "Stage two" },
			}),
		);
		expect(codeOf(error)).toBe("STATE_TRANSITION_INVALID");
		expect(await journeyRows(task.id)).toHaveLength(1);
	});

	test("MILESTONE is restricted to MULTI_DAY tickets", async () => {
		const created = await createTaskFor(techLead, {
			taskType: "DAILY",
			assignedToId: "u-e1",
		});
		await run(jobsMutation.acceptTask, employeeOne, { taskId: created.id });

		const error = await captureError(() =>
			run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
				input: { taskId: created.id, scope: "MILESTONE", title: "Stage" },
			}),
		);
		expect(codeOf(error)).toBe("VALIDATION_FAILED");
	});

	test("a stage plan and a declared estimate are stored on the ticket", async () => {
		const task = await activeMultiDayTask();
		await run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
			input: {
				taskId: task.id,
				scope: "MILESTONE",
				title: "Outline",
				declaredProgress: 25,
				plannedStageCount: 4,
			},
		});

		const stored = (await run(jobsQuery.task, techLead, {
			id: task.id,
		})) as ProgressShape;
		expect(stored.plannedStageCount).toBe(4);

		const [entry] = await journeyRows(task.id);
		expect(entry?.declaredProgress).toBe(25);

		// A later request may widen the plan, and the stored value follows it.
		await run(jobsMutation.reviewTaskCompletionRequest, techLead, {
			input: {
				requestId: (await journeyRows(task.id))[0]?.id,
				decision: "APPROVED",
			},
		});
		await run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
			input: {
				taskId: task.id,
				scope: "MILESTONE",
				title: "Draft",
				declaredProgress: 50,
				plannedStageCount: 6,
			},
		});
		const updated = (await run(jobsQuery.task, techLead, {
			id: task.id,
		})) as ProgressShape;
		expect(updated.plannedStageCount).toBe(6);
	});

	test("declaredProgress must exceed the ticket's current progress", async () => {
		const task = await activeMultiDayTask();
		const error = await captureError(() =>
			run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
				input: {
					taskId: task.id,
					scope: "MILESTONE",
					title: "Outline",
					declaredProgress: 0,
				},
			}),
		);
		expect(codeOf(error)).toBe("VALIDATION_FAILED");
	});

	test("submitting from a terminal state fails with STATE_TRANSITION_INVALID", async () => {
		const task = await activeMultiDayTask();
		await run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
			input: { taskId: task.id, scope: "FULL_JOB", title: "Done" },
		});
		await run(jobsMutation.reviewTaskCompletionRequest, techLead, {
			input: {
				requestId: (await journeyRows(task.id))[0]?.id,
				decision: "APPROVED",
			},
		});

		const error = await captureError(() =>
			run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
				input: { taskId: task.id, scope: "FULL_JOB", title: "Again" },
			}),
		);
		expect(codeOf(error)).toBe("STATE_TRANSITION_INVALID");
	});

	test("evidence attachments are re-parented to the request", async () => {
		const task = await activeMultiDayTask();
		const attachmentId = await attachUpload(employeeOne, task.id);

		await run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
			input: {
				taskId: task.id,
				scope: "FULL_JOB",
				title: "Delivered",
				attachmentIds: [attachmentId],
			},
		});

		const [entry] = await journeyRows(task.id);
		const rows = await db.select().from(attachments);
		const stored = rows.find((row) => row.id === attachmentId);
		expect(stored?.ownerType).toBe("TASK_COMPLETION_REQUEST");
		expect(stored?.ownerId).toBe(entry?.id);
	});
});

describe("completion request review", () => {
	test("a FULL_JOB approval completes the ticket with no 100% gate", async () => {
		const task = await activeMultiDayTask({ priority: "HIGH" });
		const kpiBefore = await kpiRuleCounts("u-e1");
		await run(jobsMutation.logTaskProgress, employeeOne, {
			input: { taskId: task.id, newPercentage: 40 },
		});
		await run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
			input: { taskId: task.id, scope: "FULL_JOB", title: "Delivered" },
		});
		const [entry] = await journeyRows(task.id);

		await run(jobsMutation.reviewTaskCompletionRequest, techLead, {
			input: { requestId: entry?.id, decision: "APPROVED" },
		});

		const stored = (await run(jobsQuery.task, techLead, {
			id: task.id,
		})) as TaskShape;
		expect(stored.state).toBe("APP");

		const journey = await journeyRows(task.id);
		expect(journey[0]?.state).toBe("APP");
		expect(journey[0]?.decidedBy).toBe("u-tl");

		const kpi = await kpiRuleCounts("u-e1");
		expect(kpi.onTime).toBe(kpiBefore.onTime + 1);
		expect(kpi.firstTime).toBe(kpiBefore.firstTime + 1);
	});

	test("a MILESTONE approval keeps the ticket PEN and recomputes progress", async () => {
		const task = await activeMultiDayTask();
		await run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
			input: {
				taskId: task.id,
				scope: "MILESTONE",
				title: "Outline",
				plannedStageCount: 4,
			},
		});
		const [first] = await journeyRows(task.id);

		await run(jobsMutation.reviewTaskCompletionRequest, techLead, {
			input: { requestId: first?.id, decision: "APPROVED" },
		});

		const afterFirst = (await run(jobsQuery.task, techLead, {
			id: task.id,
		})) as ProgressShape;
		expect(afterFirst.state).toBe("PEN");
		expect(afterFirst.progressPercentage).toBe(25);

		// The next stage is a further journey entry, and the ratio follows it.
		await run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
			input: { taskId: task.id, scope: "MILESTONE", title: "Draft" },
		});
		const journey = await journeyRows(task.id);
		expect(journey.map((entry) => [entry.title, entry.state])).toEqual([
			["Outline", "APP"],
			["Draft", "PEN"],
		]);

		await run(jobsMutation.reviewTaskCompletionRequest, techLead, {
			input: { requestId: journey[1]?.id, decision: "APPROVED" },
		});
		const afterSecond = (await run(jobsQuery.task, techLead, {
			id: task.id,
		})) as ProgressShape;
		expect(afterSecond.progressPercentage).toBe(50);

		await run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
			input: { taskId: task.id, scope: "MILESTONE", title: "Testing" },
		});
		await run(jobsMutation.reviewTaskCompletionRequest, techLead, {
			input: {
				requestId: (await journeyRows(task.id))[2]?.id,
				decision: "APPROVED",
			},
		});
		await run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
			input: { taskId: task.id, scope: "MILESTONE", title: "Acceptance" },
		});
		await run(jobsMutation.reviewTaskCompletionRequest, techLead, {
			input: {
				requestId: (await journeyRows(task.id))[3]?.id,
				decision: "APPROVED",
			},
		});
		const settled = (await run(jobsQuery.task, techLead, {
			id: task.id,
		})) as ProgressShape;
		expect(settled.progressPercentage).toBe(100);
		expect(settled.state).toBe("PEN");
	});

	test("progress falls back to the declared estimate without a plan", async () => {
		const task = await activeMultiDayTask();
		await run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
			input: {
				taskId: task.id,
				scope: "MILESTONE",
				title: "Outline",
				declaredProgress: 40,
			},
		});
		await run(jobsMutation.reviewTaskCompletionRequest, techLead, {
			input: {
				requestId: (await journeyRows(task.id))[0]?.id,
				decision: "APPROVED",
			},
		});

		const stored = (await run(jobsQuery.task, techLead, {
			id: task.id,
		})) as ProgressShape;
		expect(stored.progressPercentage).toBe(40);

		// A later stage without a plan keeps the higher of the two estimates.
		await run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
			input: {
				taskId: task.id,
				scope: "MILESTONE",
				title: "Draft",
				declaredProgress: 60,
			},
		});
		await run(jobsMutation.reviewTaskCompletionRequest, techLead, {
			input: {
				requestId: (await journeyRows(task.id))[1]?.id,
				decision: "APPROVED",
			},
		});
		const after = (await run(jobsQuery.task, techLead, {
			id: task.id,
		})) as ProgressShape;
		expect(after.progressPercentage).toBe(60);
	});

	test("a recomputation never lowers recorded progress", async () => {
		const task = await activeMultiDayTask();
		await run(jobsMutation.logTaskProgress, employeeOne, {
			input: { taskId: task.id, newPercentage: 70, logComment: "Ahead" },
		});
		await run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
			input: {
				taskId: task.id,
				scope: "MILESTONE",
				title: "Outline",
				plannedStageCount: 8,
			},
		});
		await run(jobsMutation.reviewTaskCompletionRequest, techLead, {
			input: {
				requestId: (await journeyRows(task.id))[0]?.id,
				decision: "APPROVED",
			},
		});

		const stored = (await run(jobsQuery.task, techLead, {
			id: task.id,
		})) as ProgressShape;
		expect(stored.progressPercentage).toBe(70);
	});

	test("a rejection returns the ticket and keeps the reason and files", async () => {
		const task = await activeMultiDayTask();
		const kpiBefore = await kpiRuleCounts("u-e1");
		const attachmentId = await attachUpload(techLead, task.id);
		await run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
			input: { taskId: task.id, scope: "FULL_JOB", title: "Delivered" },
		});
		const [entry] = await journeyRows(task.id);

		await run(jobsMutation.reviewTaskCompletionRequest, techLead, {
			input: {
				requestId: entry?.id,
				decision: "REJECTED",
				reviewComment: "The export still shows last month.",
				attachmentIds: [attachmentId],
			},
		});

		const stored = (await run(jobsQuery.task, techLead, {
			id: task.id,
		})) as TaskShape;
		expect(stored.state).toBe("REJ");

		const journey = await journeyRows(task.id);
		expect(journey[0]?.state).toBe("REJ");
		expect(journey[0]?.decisionReason).toBe(
			"The export still shows last month.",
		);

		const rows = await db.select().from(attachments);
		const decision = rows.find((row) => row.id === attachmentId);
		expect(decision?.ownerType).toBe("TASK_COMPLETION_DECISION");
		expect(decision?.ownerId).toBe(entry?.id);

		const kpi = await kpiRuleCounts("u-e1");
		expect(kpi.returned).toBe(kpiBefore.returned + 1);
	});

	test("a rejection without a reason fails with RULE_VIOLATION", async () => {
		const task = await activeMultiDayTask();
		await run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
			input: { taskId: task.id, scope: "FULL_JOB", title: "Delivered" },
		});
		const [entry] = await journeyRows(task.id);

		const error = await captureError(() =>
			run(jobsMutation.reviewTaskCompletionRequest, techLead, {
				input: { requestId: entry?.id, decision: "REJECTED" },
			}),
		);
		expect(codeOf(error)).toBe("RULE_VIOLATION");
		expect((await journeyRows(task.id))[0]?.state).toBe("PEN");
	});

	test("reviewing an already decided entry fails with STATE_TRANSITION_INVALID", async () => {
		const task = await activeMultiDayTask();
		await run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
			input: { taskId: task.id, scope: "FULL_JOB", title: "Delivered" },
		});
		const [entry] = await journeyRows(task.id);
		await run(jobsMutation.reviewTaskCompletionRequest, techLead, {
			input: { requestId: entry?.id, decision: "REJECTED", reviewComment: "x" },
		});

		const error = await captureError(() =>
			run(jobsMutation.reviewTaskCompletionRequest, techLead, {
				input: { requestId: entry?.id, decision: "APPROVED" },
			}),
		);
		expect(codeOf(error)).toBe("STATE_TRANSITION_INVALID");
	});

	test("an EMPLOYEE cannot review a completion request", async () => {
		const task = await activeMultiDayTask();
		await run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
			input: { taskId: task.id, scope: "FULL_JOB", title: "Delivered" },
		});
		const [entry] = await journeyRows(task.id);

		const error = await captureError(() =>
			run(jobsMutation.reviewTaskCompletionRequest, employeeOne, {
				input: { requestId: entry?.id, decision: "APPROVED" },
			}),
		);
		expect(codeOf(error)).toBe("FORBIDDEN");
		expect((await journeyRows(task.id))[0]?.state).toBe("PEN");
	});

	test("an out-of-scope reviewer is denied with NOT_FOUND", async () => {
		const created = await createTaskFor(techLead, {
			taskType: "MULTI_DAY",
			assignedToId: "u-e2",
		});
		await run(jobsMutation.acceptTask, employeeTwo, { taskId: created.id });
		const outsider = makeCtx({
			id: "u-outside",
			roleCodes: ["DEPT_HEAD"],
			departmentId: "dept-b",
		});
		await run(jobsMutation.submitTaskCompletionRequest, employeeTwo, {
			input: { taskId: created.id, scope: "FULL_JOB", title: "Delivered" },
		});
		const [entry] = await journeyRows(created.id);

		const error = await captureError(() =>
			run(jobsMutation.reviewTaskCompletionRequest, outsider, {
				input: { requestId: entry?.id, decision: "APPROVED" },
			}),
		);
		expect(codeOf(error)).toBe("NOT_FOUND");
	});

	test("resubmission reopens a rejected ticket and keeps both entries", async () => {
		const task = await activeMultiDayTask();
		await run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
			input: { taskId: task.id, scope: "MILESTONE", title: "Outline" },
		});
		const [first] = await journeyRows(task.id);
		await run(jobsMutation.reviewTaskCompletionRequest, techLead, {
			input: {
				requestId: first?.id,
				decision: "REJECTED",
				reviewComment: "Redo the layout.",
			},
		});

		await run(jobsMutation.submitTaskCompletionRequest, employeeOne, {
			input: { taskId: task.id, scope: "MILESTONE", title: "Outline, v2" },
		});

		const journey = await journeyRows(task.id);
		expect(journey.map((entry) => [entry.title, entry.state])).toEqual([
			["Outline", "REJ"],
			["Outline, v2", "PEN"],
		]);
		const stored = (await run(jobsQuery.task, techLead, {
			id: task.id,
		})) as TaskShape;
		expect(stored.state).toBe("PEN");
	});
});
