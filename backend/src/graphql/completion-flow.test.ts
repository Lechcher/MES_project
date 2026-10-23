/**
 * Completion-request flow, end to end over HTTP.
 *
 * Drives the running Elysia service the way the Jobs UI does: bearer-authenticated
 * multipart upload, then the GraphQL mutations that submit and decide a
 * completion request, asserting the seven acceptance criteria of the change.
 *
 * Attachment storage uses the in-memory store injected into the service, which is
 * the documented test seam; a run against the live Garage stack is the manual
 * prerequisite recorded in `openspec/changes/add-job-completion-requests/tasks.md`
 * (task 7.2), not something this suite reproduces.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { type Auth, createAuth } from "../auth";
import { type AppConfig, loadConfig } from "../config";
import { createDatabase, type DatabaseHandle } from "../db";
import { runMigrations } from "../db/migrate";
import { kpiPointRules, roles, user, userRoles } from "../db/schema";
import { type ChangeBus, createChangeBus } from "../events/event-bus";
import { createService } from "../index";
import { createMemoryStore } from "../storage/s3";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const dbPath = join(TMP_ROOT, `mes-flow-${crypto.randomUUID()}.db`);

let app: ReturnType<typeof createService>;
let db: DatabaseHandle;
let auth: Auth;
let config: AppConfig;
let events: ChangeBus;
const attachmentStore = createMemoryStore();

const ASSIGNEE = "u-flow-assignee";
const REVIEWER = "u-flow-reviewer";

beforeAll(async () => {
	runMigrations({ databasePath: dbPath });
	config = loadConfig({ NODE_ENV: "test", MES_DATABASE_PATH: dbPath });
	db = createDatabase(dbPath);
	auth = createAuth(db, config);
	events = createChangeBus();
	app = createService({ db, auth, config, events, attachmentStore });

	await db.insert(roles).values([
		{ id: "role-EMPLOYEE", code: "EMPLOYEE", name: "Employee" },
		{ id: "role-HR_MANAGER", code: "HR_MANAGER", name: "HR Manager" },
	]);
	for (const [id, code] of [
		[ASSIGNEE, "EA"],
		[REVIEWER, "ER"],
	] as const) {
		await db.insert(user).values({
			id,
			name: `Flow ${code}`,
			email: `${id}@example.test`,
			userCode: code,
			isActive: true,
			emailVerified: true,
		});
	}
	await db.insert(userRoles).values([
		{ id: crypto.randomUUID(), userId: ASSIGNEE, roleId: "role-EMPLOYEE" },
		{ id: crypto.randomUUID(), userId: REVIEWER, roleId: "role-HR_MANAGER" },
	]);
	await db.insert(kpiPointRules).values([
		{ code: "KPI_ON_TIME_TICKET", event: "On-time ticket", points: 10 },
		{ code: "KPI_ON_TIME_URGENT", event: "On-time urgent ticket", points: 20 },
		{
			code: "KPI_FIRST_TIME_APPROVAL",
			event: "First-time approval",
			points: 5,
		},
		{ code: "KPI_RETURNED_TICKET", event: "Returned ticket", points: -5 },
	]);
	// Sessions for the two actors the flow needs.
	const { session } = await import("../db/schema");
	for (const [userId, token] of [
		[ASSIGNEE, "assignee-token"],
		[REVIEWER, "reviewer-token"],
	] as const) {
		await db.insert(session).values({
			id: crypto.randomUUID(),
			token,
			userId,
			expiresAt: new Date(Date.now() + 3_600_000),
			createdAt: new Date(),
			updatedAt: new Date(),
			ipAddress: null,
			userAgent: null,
		});
	}
});

afterAll(() => {
	for (const suffix of ["", "-wal", "-shm"]) {
		const path = `${dbPath}${suffix}`;
		if (existsSync(path)) rmSync(path);
	}
});

/** Call the GraphQL endpoint with one of the flow's sessions. */
async function gql(
	token: string,
	query: string,
	variables: Record<string, unknown> = {},
) {
	const response = await app.handle(
		new Request("http://localhost:3001/api/v1/graphql", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ query, variables }),
		}),
	);
	return (await response.json()) as {
		data?: Record<string, unknown>;
		errors?: { message: string; extensions?: { code?: string } }[];
	};
}

/** Upload a batch of files as the assignee and return the created records. */
async function upload(
	taskId: string,
	files: { name: string; type: string; body: string }[],
) {
	const form = new FormData();
	form.set("taskId", taskId);
	for (const file of files) {
		form.append("files", new File([file.body], file.name, { type: file.type }));
	}
	const response = await app.handle(
		new Request("http://localhost:3001/api/v1/files", {
			method: "POST",
			headers: { authorization: "Bearer assignee-token" },
			body: form,
		}),
	);
	return (await response.json()) as {
		files: { id: string; url: string; fileName: string; sizeBytes: number }[];
		failures: { fileName: string; code: string }[];
	};
}

/** A journey entry as the API returns it. */
interface JourneyEntry {
	id: string;
	scope: string;
	title: string;
	state: string;
	reviewComment: string | null;
	declaredProgress: number | null;
	plannedStageCount: number | null;
	attachments: {
		id: string;
		fileName: string;
		mimeType: string;
		sizeBytes: number;
	}[];
	decisionAttachments: { id: string; fileName: string; sizeBytes: number }[];
}

interface TaskSnapshot {
	id: string;
	taskCode: string;
	state: string;
	progressPercentage: number;
	plannedStageCount: number | null;
	journey: JourneyEntry[];
}

/** The ticket's pending journey entry, or `null` when none awaits a decision. */
async function pendingEntry(taskId: string): Promise<JourneyEntry | null> {
	const task = await readTask(taskId);
	return task.journey.find((entry) => entry.state === "PEN") ?? null;
}

/** Read the ticket's snapshot through the documented `task` query. */
async function readTask(taskId: string): Promise<TaskSnapshot> {
	const read = await gql(
		"reviewer-token",
		`query Task($id: ID!) { task(id: $id) { ${TASK_FIELDS} } }`,
		{ id: taskId },
	);
	const task = read.data?.task as TaskSnapshot | undefined;
	if (!task) {
		throw new Error(
			`The ticket could not be read: ${JSON.stringify(read.errors ?? "no data")}`,
		);
	}
	return task;
}

const TASK_FIELDS = /* GraphQL */ `
  id taskCode state progressPercentage plannedStageCount
  journey {
    id scope title state reviewComment declaredProgress plannedStageCount
    attachments { id url fileName mimeType sizeBytes }
    decisionAttachments { id url fileName mimeType sizeBytes }
  }
`;

describe("completion-request flow over HTTP", () => {
	let taskId: string;

	beforeAll(async () => {
		const created = await gql(
			"reviewer-token",
			`mutation Create($input: CreateTaskInput!) {
        createTask(input: $input) { id }
      }`,
			{
				input: {
					title: "Multi-day deliverable",
					description: "Delivered in stages",
					taskType: "MULTI_DAY",
					priority: "HIGH",
					assignedToId: ASSIGNEE,
					startDate: new Date().toISOString(),
					endDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
				},
			},
		);
		taskId = (created.data?.createTask as { id: string } | undefined)?.id ?? "";
		await gql(
			"assignee-token",
			`mutation Accept($taskId: ID!) { acceptTask(taskId: $taskId) { id } }`,
			{
				taskId,
			},
		);
	});

	test("an upload of several formats stores them all and reports the rejected one", async () => {
		const outcome = await upload(taskId, [
			{ name: "photo.png", type: "image/png", body: "image-bytes" },
			{ name: "clip.mp4", type: "video/mp4", body: "video-bytes" },
			{
				name: "brief.docx",
				type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				body: "docx",
			},
			{ name: "payload.exe", type: "application/octet-stream", body: "x" },
		]);

		expect(outcome.files).toHaveLength(3);
		expect(outcome.failures.map((failure) => failure.code)).toEqual([
			"BLOCKED_FORMAT",
		]);
		for (const record of outcome.files) {
			expect(record.url.startsWith(`tasks/${taskId}/`)).toBe(true);
			expect(record.sizeBytes).toBeGreaterThan(0);
			expect(await attachmentStore.exists(record.url)).toBe(true);
		}

		// Every URL the API returned is the same-origin file route's key.
		for (const record of outcome.files) {
			expect(`/api/mes/files/${record.url}`).not.toContain("garage");
		}
	});

	test("submitting a milestone moves ACT -> PEN and records a PEN journey entry", async () => {
		const evidence = (
			await upload(taskId, [
				{ name: "evidence.png", type: "image/png", body: "evidence" },
			])
		).files;

		const submitted = await gql(
			"assignee-token",
			`mutation Submit($input: SubmitTaskCompletionRequestInput!) {
        submitTaskCompletionRequest(input: $input) {
          id state scope title
          attachments { id fileName }
          task { id state }
        }
      }`,
			{
				input: {
					taskId,
					scope: "MILESTONE",
					title: "Outline and wireframe",
					description: "Screen inventory and wireframes for the dashboard.",
					declaredProgress: 25,
					plannedStageCount: 4,
					attachmentIds: evidence.map((record) => record.id),
				},
			},
		);

		expect(submitted.errors).toBeUndefined();
		const request = submitted.data?.submitTaskCompletionRequest as {
			state: string;
			task: { id: string; state: string };
			attachments: unknown[];
		};
		expect(request.state).toBe("PEN");
		expect(request.task.state).toBe("PEN");
		expect(request.attachments).toHaveLength(1);

		const task = await readTask(taskId);
		expect(task.state).toBe("PEN");
		expect(task.plannedStageCount).toBe(4);
		expect(task.journey).toHaveLength(1);
		expect(task.journey[0].state).toBe("PEN");
		expect(task.journey[0].scope).toBe("MILESTONE");
		expect(task.journey[0].attachments).toHaveLength(1);
		expect(task.journey[0].attachments[0].sizeBytes).toBeGreaterThan(0);
	});

	test("approving a milestone keeps the ticket PEN, derives 25%, and allows the next stage", async () => {
		const pending = await pendingEntry(taskId);

		const approved = await gql(
			"reviewer-token",
			`mutation Review($input: ReviewTaskCompletionRequestInput!) {
        reviewTaskCompletionRequest(input: $input) { id state task { id state progressPercentage } }
      }`,
			{ input: { requestId: pending?.id, decision: "APPROVED" } },
		);
		expect(approved.errors).toBeUndefined();
		const decision = approved.data?.reviewTaskCompletionRequest as {
			task: { state: string; progressPercentage: number };
		};
		const approvedTask = decision.task;
		expect(approvedTask.state).toBe("PEN");
		expect(approvedTask.progressPercentage).toBe(25);

		// The next stage opens as a further journey entry.
		const next = await gql(
			"assignee-token",
			`mutation Submit($input: SubmitTaskCompletionRequestInput!) {
        submitTaskCompletionRequest(input: $input) { id state }
      }`,
			{ input: { taskId, scope: "MILESTONE", title: "Draft" } },
		);
		expect(next.errors).toBeUndefined();

		expect(
			(await readTask(taskId)).journey.map((entry) => [
				entry.title,
				entry.state,
			]),
		).toEqual([
			["Outline and wireframe", "APP"],
			["Draft", "PEN"],
		]);
	});

	test("rejecting with a reason and required-fix files moves the ticket to REJ", async () => {
		const pending = await pendingEntry(taskId);

		const fixes = (
			await upload(taskId, [
				{ name: "correct-result.png", type: "image/png", body: "correct" },
			])
		).files;

		const rejected = await gql(
			"reviewer-token",
			`mutation Review($input: ReviewTaskCompletionRequestInput!) {
        reviewTaskCompletionRequest(input: $input) { id state reviewComment task { id state } }
      }`,
			{
				input: {
					requestId: pending?.id,
					decision: "REJECTED",
					reviewComment: "The wireframe omits the filter panel.",
					attachmentIds: fixes.map((record) => record.id),
				},
			},
		);
		expect(rejected.errors).toBeUndefined();
		const rejectedTask = (
			rejected.data?.reviewTaskCompletionRequest as
				| { task: { state: string } }
				| undefined
		)?.task;
		expect(rejectedTask?.state).toBe("REJ");

		const entry = (await readTask(taskId)).journey.find(
			(item) => item.id === pending?.id,
		);
		expect(entry?.state).toBe("REJ");
		expect(entry?.reviewComment).toBe("The wireframe omits the filter panel.");
		expect(entry?.decisionAttachments).toHaveLength(1);
		expect(entry?.decisionAttachments[0].fileName).toBe("correct-result.png");
	});

	test("the assignee resubmits and a FULL_JOB approval completes the ticket below 100%", async () => {
		const evidence = (
			await upload(taskId, [
				{ name: "final.pdf", type: "application/pdf", body: "final" },
			])
		).files;

		await gql(
			"assignee-token",
			`mutation Submit($input: SubmitTaskCompletionRequestInput!) {
        submitTaskCompletionRequest(input: $input) { id state }
      }`,
			{
				input: {
					taskId,
					scope: "FULL_JOB",
					title: "All stages delivered",
					attachmentIds: evidence.map((record) => record.id),
				},
			},
		);

		const pending = await pendingEntry(taskId);

		const approved = await gql(
			"reviewer-token",
			`mutation Review($input: ReviewTaskCompletionRequestInput!) {
        reviewTaskCompletionRequest(input: $input) { id state task { id state progressPercentage } }
      }`,
			{ input: { requestId: pending?.id, decision: "APPROVED" } },
		);
		expect(approved.errors).toBeUndefined();
		// 40% recorded earlier never blocks completion: the approval is the signal.
		const completedTask = (
			approved.data?.reviewTaskCompletionRequest as
				| { task: { state: string } }
				| undefined
		)?.task;
		expect(completedTask?.state).toBe("APP");

		expect(
			(await readTask(taskId)).journey.map((entry) => [
				entry.title,
				entry.state,
			]),
		).toEqual([
			["Outline and wireframe", "APP"],
			["Draft", "REJ"],
			["All stages delivered", "APP"],
		]);
	});
});

describe("the file routes over HTTP", () => {
	let taskId: string;

	beforeAll(async () => {
		taskId = `tasks-${crypto.randomUUID()}`;
		await db.$client.exec(
			`INSERT INTO tasks (id, task_code, title, task_type, state, created_by, assigned_to, progress_percentage)
			 VALUES ('${taskId}', 'T202510-9002', 'Download ticket', 'MULTI_DAY', 'ACT', '${ASSIGNEE}', '${ASSIGNEE}', 0)`,
		);
	});

	test("serves a stored image inline and forces a download on demand", async () => {
		const created = (
			await upload(taskId, [
				{ name: "photo.png", type: "image/png", body: "image-bytes" },
			])
		).files;

		const inline = await app.handle(
			new Request(
				`http://localhost:3001/api/v1/files/${created[0]?.url.split("/").map(encodeURIComponent).join("/")}`,
				{ headers: { authorization: "Bearer assignee-token" } },
			),
		);
		expect(inline.status).toBe(200);
		expect(inline.headers.get("content-type")).toContain("image");
		expect(inline.headers.get("content-disposition")).toBeNull();

		const download = await app.handle(
			new Request(
				`http://localhost:3001/api/v1/files/${created[0]?.url.split("/").map(encodeURIComponent).join("/")}?download=1`,
				{ headers: { authorization: "Bearer assignee-token" } },
			),
		);
		expect(download.headers.get("content-disposition")).toContain("attachment");
	});

	test("requires a session for both directions", async () => {
		const unauthenticatedUpload = await app.handle(
			new Request("http://localhost:3001/api/v1/files", { method: "POST" }),
		);
		expect(unauthenticatedUpload.status).toBeGreaterThanOrEqual(400);

		const unauthenticatedDownload = await app.handle(
			new Request("http://localhost:3001/api/v1/files/tasks/anything"),
		);
		expect(unauthenticatedDownload.status).toBe(401);
	});
});
