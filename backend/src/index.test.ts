/**
 * Service end-to-end.
 *
 * Exercises the running Elysia application over HTTP: the health check, the
 * versioned GraphQL endpoint, CORS, the authenticated export download route,
 * the attachment file routes, and the SSE change-event stream.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { type Auth, createAuth } from "./auth";
import { type AppConfig, loadConfig } from "./config";
import { createDatabase, type DatabaseHandle } from "./db";
import { runMigrations } from "./db/migrate";
import { exportArtifacts, roles, session, tasks, user } from "./db/schema";
import { type ChangeBus, createChangeBus } from "./events/event-bus";
import { createService } from "./index";
import { createMemoryStore } from "./storage/s3";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const dbPath = join(TMP_ROOT, `mes-service-${crypto.randomUUID()}.db`);

let app: ReturnType<typeof createService>;
let db: DatabaseHandle;
let auth: Auth;
let config: AppConfig;
let events: ChangeBus;
/** In-memory object store injected into the service for the file routes. */
const attachmentStore = createMemoryStore();

function post(
	path: string,
	body: string,
	headers: Record<string, string> = {},
) {
	return app.handle(
		new Request(`http://localhost:3001${path}`, {
			method: "POST",
			headers: { "content-type": "application/json", ...headers },
			body,
		}),
	);
}

beforeAll(async () => {
	runMigrations({ databasePath: dbPath });
	config = loadConfig({
		NODE_ENV: "test",
		MES_DATABASE_PATH: dbPath,
		MES_WEB_ORIGIN: "http://localhost:3000",
	});
	db = createDatabase(dbPath);
	await db
		.insert(roles)
		.values([{ id: "role-EMPLOYEE", code: "EMPLOYEE", name: "Employee" }]);
	auth = createAuth(db, config);
	events = createChangeBus();
	app = createService({ db, auth, config, events, attachmentStore });
});

afterAll(() => {
	for (const suffix of ["", "-wal", "-shm"]) {
		const path = `${dbPath}${suffix}`;
		if (existsSync(path)) rmSync(path);
	}
});

describe("health check", () => {
	test("reports the service as up", async () => {
		const response = await app.handle(
			new Request("http://localhost:3001/health"),
		);
		expect(response.status).toBe(200);

		const body = (await response.json()) as {
			status: string;
			service: string;
			env: string;
		};
		expect(body.status).toBe("ok");
		expect(body.service).toBe("mes-backend");
		expect(body.env).toBe("test");
	});
});

describe("CORS", () => {
	test("answers a preflight with the configured origin", async () => {
		const response = await app.handle(
			new Request("http://localhost:3001/api/v1/graphql", {
				method: "OPTIONS",
			}),
		);
		expect(response.status).toBe(204);
		expect(response.headers.get("access-control-allow-origin")).toBe(
			"http://localhost:3000",
		);
		expect(response.headers.get("access-control-allow-methods")).toContain(
			"POST",
		);
	});
});

describe("GraphQL endpoint", () => {
	test("executes a query over HTTP", async () => {
		const response = await post(
			"/api/v1/graphql",
			JSON.stringify({ query: "{ viewer { user { id } } }" }),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("application/json");

		const body = (await response.json()) as { data: { viewer: unknown } };
		expect(body.data.viewer).toBeNull();
	});

	test("reports partial failures in the errors array", async () => {
		const response = await post(
			"/api/v1/graphql",
			JSON.stringify({ query: "{ notAField }" }),
		);
		const body = (await response.json()) as {
			data: unknown;
			errors: { extensions?: { code?: string } }[];
		};
		expect(body.errors?.length).toBeGreaterThan(0);
		expect(body.errors[0]?.extensions?.code).toBe("VALIDATION_FAILED");
	});

	test("rejects a non-JSON body", async () => {
		const response = await post("/api/v1/graphql", "not json");
		expect(response.status).toBe(400);
		const body = (await response.json()) as {
			errors: { extensions?: { code?: string } }[];
		};
		expect(body.errors[0]?.extensions?.code).toBe("VALIDATION_FAILED");
	});

	test("rejects a body with no query", async () => {
		const response = await post(
			"/api/v1/graphql",
			JSON.stringify({ variables: {} }),
		);
		const body = (await response.json()) as {
			errors: { extensions?: { code?: string } }[];
		};
		expect(body.errors[0]?.extensions?.code).toBe("VALIDATION_FAILED");
	});

	test("requires a session for protected operations", async () => {
		const response = await post(
			"/api/v1/graphql",
			JSON.stringify({ query: "{ ticketStates { code } }" }),
		);
		const body = (await response.json()) as {
			errors: { extensions?: { code?: string } }[];
		};
		expect(body.errors[0]?.extensions?.code).toBe("UNAUTHENTICATED");
	});
});

describe("attachment file routes", () => {
	let taskId: string;

	beforeAll(async () => {
		const userId = crypto.randomUUID();
		const { userRoles } = await import("./db/schema");
		await db.insert(user).values({
			id: userId,
			name: "Attachment Uploader",
			email: `uploader-${userId}@example.test`,
			userCode: `UP-${userId.slice(0, 6)}`,
			isActive: true,
			emailVerified: true,
		});
		await db.insert(userRoles).values({
			id: crypto.randomUUID(),
			userId,
			roleId: "role-EMPLOYEE",
		});
		await db.insert(session).values({
			id: crypto.randomUUID(),
			token: "upload-token",
			userId,
			expiresAt: new Date(Date.now() + 60_000),
			createdAt: new Date(),
			updatedAt: new Date(),
			ipAddress: null,
			userAgent: null,
		});
		taskId = "7f5d2d1e-0b1c-4b9e-8f3a-1c2d3e4f5a6b";
		await db.insert(tasks).values({
			id: taskId,
			taskCode: "T202510-9001",
			title: "Upload ticket",
			description: null,
			projectId: null,
			taskType: "MULTI_DAY",
			priority: "MEDIUM",
			state: "ACT",
			createdBy: userId,
			assignedTo: userId,
			departmentId: null,
			startDate: null,
			endDate: null,
			extendedDeadline: null,
			progressPercentage: 10,
			isUrgentHourly: false,
			isExtensionRequested: false,
			isOverdue: false,
			isLateSubmission: false,
			approvedBy: null,
			approvedAt: null,
			reviewedBy: null,
			reviewedAt: null,
			deletedAt: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	});

	function multipart(files: { name: string; type: string; body: string }[]) {
		const form = new FormData();
		form.set("taskId", taskId);
		for (const file of files) {
			form.append(
				"files",
				new File([file.body], file.name, { type: file.type }),
			);
		}
		return new Request("http://localhost:3001/api/v1/files", {
			method: "POST",
			headers: { authorization: "Bearer upload-token" },
			body: form,
		});
	}

	test("stores many files of different formats in one request", async () => {
		const response = await app.handle(
			multipart([
				{ name: "photo.png", type: "image/png", body: "image-bytes" },
				{ name: "clip.mp4", type: "video/mp4", body: "video-bytes" },
				{ name: "notes.csv", type: "text/csv", body: "a,b\n1,2" },
				{
					name: "deck.pptx",
					type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
					body: "deck",
				},
				{ name: "archive.zip", type: "application/zip", body: "zip" },
			]),
		);
		expect(response.status).toBe(200);

		const body = (await response.json()) as {
			files: { id: string; url: string; sizeBytes: number }[];
			failures: { code: string }[];
		};
		expect(body.files).toHaveLength(5);
		expect(body.failures).toHaveLength(0);
		for (const record of body.files) {
			expect(record.url.startsWith(`tasks/${taskId}/`)).toBe(true);
			expect(record.sizeBytes).toBeGreaterThan(0);
			expect(await attachmentStore.exists(record.url)).toBe(true);
		}
	});

	test("keeps the valid files when one file in the batch is rejected", async () => {
		const response = await app.handle(
			multipart([
				{ name: "good.png", type: "image/png", body: "image-bytes" },
				{ name: "payload.exe", type: "application/octet-stream", body: "x" },
				{ name: "empty.txt", type: "text/plain", body: "" },
				{ name: "better.pdf", type: "application/pdf", body: "z" },
			]),
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			files: { url: string; sizeBytes: number }[];
			failures: { code: string }[];
		};

		expect(body.files).toHaveLength(2);
		expect(body.failures.map((failure) => failure.code)).toEqual([
			"BLOCKED_FORMAT",
			"EMPTY_FILE",
		]);
		for (const record of body.files) {
			expect(await attachmentStore.exists(record.url)).toBe(true);
		}
	});

	test("rejects an upload without a session", async () => {
		const form = new FormData();
		form.set("taskId", taskId);
		form.append(
			"files",
			new File(["bytes"], "photo.png", { type: "image/png" }),
		);
		const response = await app.handle(
			new Request("http://localhost:3001/api/v1/files", {
				method: "POST",
				body: form,
			}),
		);
		expect(response.status).toBe(401);
	});

	test("streams a stored attachment inline and on demand as a download", async () => {
		const upload = await app.handle(
			multipart([
				{ name: "photo.png", type: "image/png", body: "image-bytes" },
			]),
		);
		const created = (await upload.json()) as {
			files: { url: string }[];
		};
		const key = created.files[0]?.url;
		expect(key).toBeDefined();

		const inline = await app.handle(
			new Request(
				`http://localhost:3001/api/v1/files/${encodeURIComponent(key ?? "")}`,
				{
					headers: { authorization: "Bearer upload-token" },
				},
			),
		);
		expect(inline.status).toBe(200);
		expect(inline.headers.get("content-type")).toBe("image/png");
		expect(inline.headers.get("content-disposition")).toBeNull();
		expect(inline.headers.get("accept-ranges")).toBe("bytes");
		expect(await inline.text()).toBe("image-bytes");

		const download = await app.handle(
			new Request(
				`http://localhost:3001/api/v1/files/${encodeURIComponent(key ?? "")}?download=1`,
				{ headers: { authorization: "Bearer upload-token" } },
			),
		);
		expect(download.status).toBe(200);
		expect(download.headers.get("content-disposition")).toContain("attachment");
	});

	test("requires a session to download", async () => {
		const response = await app.handle(
			new Request("http://localhost:3001/api/v1/files/tasks/anything"),
		);
		expect(response.status).toBe(401);
	});

	test("reports an unknown key as missing", async () => {
		const response = await app.handle(
			new Request(
				"http://localhost:3001/api/v1/files/tasks/task-1/nothing.png",
				{ headers: { authorization: "Bearer upload-token" } },
			),
		);
		expect(response.status).toBe(404);
	});
});

describe("export download route", () => {
	test("requires authentication", async () => {
		const response = await app.handle(
			new Request("http://localhost:3001/api/v1/exports/anything"),
		);
		expect(response.status).toBe(401);
	});

	test("returns 404 for an unknown artifact when authenticated", async () => {
		const token = `export-token-${crypto.randomUUID()}`;
		const { session, user: userTable } = await import("./db/schema");
		const userId = crypto.randomUUID();

		await db.insert(userTable).values({
			id: userId,
			name: "Export Reader",
			email: `export-${userId}@example.test`,
			userCode: `EX-${userId.slice(0, 6)}`,
			isActive: true,
			emailVerified: true,
		});
		await db.insert(session).values({
			id: crypto.randomUUID(),
			token,
			userId,
			expiresAt: new Date(Date.now() + 60_000),
			createdAt: new Date(),
			updatedAt: new Date(),
			ipAddress: null,
			userAgent: null,
		});

		const response = await app.handle(
			new Request("http://localhost:3001/api/v1/exports/unknown-id", {
				headers: { authorization: `Bearer ${token}` },
			}),
		);
		expect(response.status).toBe(404);
	});

	test("serves a recorded artifact to its authenticated owner", async () => {
		const { promises: fs } = await import("node:fs");
		const directory = join(TMP_ROOT, `mes-exports-${crypto.randomUUID()}`);
		const filePath = join(directory, "report.csv");
		await fs.mkdir(directory, { recursive: true });
		await fs.writeFile(filePath, "code,state\nT-1,ACT\n");

		const artifactId = crypto.randomUUID();
		await db.insert(exportArtifacts).values({
			id: artifactId,
			userId: null,
			fileName: "report.csv",
			mimeType: "text/csv",
			format: "CSV",
			storagePath: filePath,
			byteSize: 18,
		});

		const token = `serve-token-${crypto.randomUUID()}`;
		const { session, user: userTable } = await import("./db/schema");
		const userId = crypto.randomUUID();
		await db.insert(userTable).values({
			id: userId,
			name: "Artifact Reader",
			email: `artifact-${userId}@example.test`,
			userCode: `AR-${userId.slice(0, 6)}`,
			isActive: true,
			emailVerified: true,
		});
		await db.insert(session).values({
			id: crypto.randomUUID(),
			token,
			userId,
			expiresAt: new Date(Date.now() + 60_000),
			createdAt: new Date(),
			updatedAt: new Date(),
			ipAddress: null,
			userAgent: null,
		});

		const response = await app.handle(
			new Request(`http://localhost:3001/api/v1/exports/${artifactId}`, {
				headers: { authorization: `Bearer ${token}` },
			}),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/csv");
		expect(response.headers.get("content-disposition")).toContain("report.csv");
		expect(await response.text()).toContain("T-1,ACT");

		rmSync(directory, { recursive: true, force: true });
	});
});

/**
 * Insert a user with a live session and return its bearer token.
 * Pass a role code to make the viewer able to invoke role-gated operations.
 */
async function authenticatedToken(roleCode?: string): Promise<string> {
	const token = `events-token-${crypto.randomUUID()}`;
	const {
		roles: rolesTable,
		session,
		user: userTable,
		userRoles,
	} = await import("./db/schema");
	const userId = crypto.randomUUID();
	await db.insert(userTable).values({
		id: userId,
		name: "Stream Reader",
		email: `stream-${userId}@example.test`,
		userCode: `ST-${userId.slice(0, 6)}`,
		isActive: true,
		emailVerified: true,
	});
	if (roleCode) {
		const [existing] = await db
			.select()
			.from(rolesTable)
			.where(eq(rolesTable.code, roleCode));
		const roleId = existing?.id ?? crypto.randomUUID();
		if (!existing) {
			await db.insert(rolesTable).values({
				id: roleId,
				code: roleCode as never,
				name: roleCode,
				description: null,
			});
		}
		await db.insert(userRoles).values({
			id: crypto.randomUUID(),
			userId,
			roleId,
		});
	}
	await db.insert(session).values({
		id: crypto.randomUUID(),
		token,
		userId,
		expiresAt: new Date(Date.now() + 60_000),
		createdAt: new Date(),
		updatedAt: new Date(),
		ipAddress: null,
		userAgent: null,
	});
	return token;
}

/** Read one SSE frame off an open stream as text. */
async function readFrame(
	reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string> {
	const { value } = await reader.read();
	expect(value).toBeDefined();
	return new TextDecoder().decode(value);
}

/**
 * The stream is exercised over a real HTTP listener, not `app.handle`: the
 * browser opens a long-lived connection and reads frames as they are pushed,
 * which is the only path that proves frames actually flow incrementally
 * instead of arriving as one buffered blob.
 */
describe("change-event stream", () => {
	const listener: {
		server?: { port?: number; stop(force?: boolean): void };
	} = {};
	let baseUrl: string;

	beforeAll(() => {
		// An ephemeral port, so a busy machine cannot collide with another run.
		// Elysia's listen hands the running server to its callback.
		app.listen({ port: 0, hostname: "127.0.0.1" }, (server) => {
			listener.server = server;
		});
		const port = listener.server?.port;
		if (port === undefined) throw new Error("listener did not start");
		baseUrl = `http://127.0.0.1:${port}`;
	});

	afterAll(() => {
		listener.server?.stop(true);
	});

	function openEventStream(token: string | null): Promise<Response> {
		return fetch(`${baseUrl}/api/v1/events`, {
			headers: token ? { authorization: `Bearer ${token}` } : {},
		});
	}

	test("requires authentication", async () => {
		const response = await openEventStream(null);
		expect(response.status).toBe(401);
	});

	test("opens an event stream that carries bus publications", async () => {
		const token = await authenticatedToken();
		const response = await openEventStream(token);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/event-stream");
		expect(response.headers.get("cache-control")).toContain("no-transform");

		const reader = response.body?.getReader();
		if (!reader) throw new Error("missing stream body");
		expect(await readFrame(reader)).toContain("event: connected");

		// The stream handler and the GraphQL layer share the service's bus, so
		// publishing here is what a mutation would do after committing.
		events.publish("tickets");
		const frame = await readFrame(reader);
		expect(frame).toContain("event: change");
		expect(frame).toContain('data: {"area":"tickets"}');

		await reader.cancel();
	});

	test("a successful mutation publishes its area to open streams", async () => {
		const token = await authenticatedToken("SUPER_ADMIN");
		const stream = await openEventStream(token);
		const reader = stream.body?.getReader();
		if (!reader) throw new Error("missing stream body");
		await readFrame(reader); // connected frame

		const mutation = await fetch(`${baseUrl}/api/v1/graphql`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				query: /* GraphQL */ `
          mutation RegisterLeave($input: RegisterLeaveInput!) {
            registerLeave(input: $input) {
              id
              leaveCode
            }
          }
        `,
				variables: {
					input: {
						leaveCode: "AL",
						startDate: "2026-03-02T00:00:00.000Z",
						endDate: "2026-03-03T00:00:00.000Z",
						reason: "Family matter",
					},
				},
			}),
		});
		const body = (await mutation.json()) as {
			data: { registerLeave: { id: string } | null } | null;
			errors?: { extensions?: { code?: string } }[];
		};
		expect(body.errors).toBeUndefined();
		expect(body.data?.registerLeave?.id).toBeDefined();

		const frame = await readFrame(reader);
		expect(frame).toContain("event: change");
		expect(frame).toContain('data: {"area":"leave"}');

		await reader.cancel();
	});

	test("a rejected mutation publishes nothing", async () => {
		// A stream is open, but the mutation itself runs without a session and
		// fails: nothing changed, so no area event may be published.
		const token = await authenticatedToken("SUPER_ADMIN");
		const stream = await openEventStream(token);
		const reader = stream.body?.getReader();
		if (!reader) throw new Error("missing stream body");
		await readFrame(reader); // connected frame

		const rejected = await fetch(`${baseUrl}/api/v1/graphql`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				query: /* GraphQL */ `
          mutation {
            registerLeave(input: { leaveCode: AL, startDate: "2026-03-02T00:00:00.000Z", endDate: "2026-03-03T00:00:00.000Z", reason: "No session" }) {
              id
            }
          }
        `,
			}),
		});
		const body = (await rejected.json()) as {
			errors?: { extensions?: { code?: string } }[];
		};
		expect(body.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");

		const outcome = await Promise.race([
			reader.read(),
			Bun.sleep(200).then(() => "quiet" as const),
		]);
		expect(outcome).toBe("quiet");

		await reader.cancel();
	});
});
