/**
 * File route tests.
 *
 * Exercises the upload and download handlers against the in-memory store and a
 * real SQLite database built from the project migration, so authorization,
 * validation and the recorded rows are all covered without a network.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { type AppConfig, loadConfig } from "../config";
import { createDatabase, type DatabaseHandle } from "../db";
import { ROLE_CODES } from "../db/enums";
import { runMigrations } from "../db/migrate";
import { attachments, departments, roles, user, userRoles } from "../db/schema";
import { createContext, type ViewerContext } from "../graphql/context";
import { createMemoryStore } from "../storage/s3";
import type { FileRouteDependencies, UploadedFile } from "./attachments";
import {
	downloadAttachment,
	sanitizeFileName,
	uploadAttachments,
	validateUpload,
} from "./attachments";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";

const dbPath = join(TMP_ROOT, `mes-files-${crypto.randomUUID()}.db`);
const config: AppConfig = loadConfig({ NODE_ENV: "test" });
const STORE = createMemoryStore();

let db: DatabaseHandle;

function fakeFile(name: string, type: string, size: number): UploadedFile {
	const bytes = new Uint8Array(size);
	return {
		name,
		type,
		size,
		arrayBuffer: async () => bytes.buffer as ArrayBuffer,
	};
}

let employeeCtx: ViewerContext;

function deps(
	overrides: Partial<FileRouteDependencies> = {},
): FileRouteDependencies {
	return {
		db,
		config,
		auth: {
			resolveSession: async (_database, token) =>
				token === "employee-token"
					? { viewer: employeeCtx.viewer, session: employeeCtx.session }
					: token === "other-token"
						? {
								viewer: {
									id: "u-other",
									userCode: "OT",
									fullName: "Outsider",
									email: "other@example.com",
									departmentId: "dept-a",
									isActive: true,
									roleCodes: ["EMPLOYEE" as const],
								},
								session: null,
							}
						: null,
		},
		store: STORE,
		...overrides,
	};
}

function request(token?: string): Request {
	return new Request("http://localhost:3001/api/v1/files", {
		method: "POST",
		headers: token ? { authorization: `Bearer ${token}` } : {},
	});
}

beforeAll(async () => {
	runMigrations({ databasePath: dbPath });
	db = createDatabase(dbPath);

	await db.insert(departments).values({
		id: "dept-a",
		code: "A",
		name: "Department A",
		departmentType: "DEPARTMENT",
		autoForkingEnabled: false,
	});
	await db
		.insert(roles)
		.values(
			ROLE_CODES.map((code) => ({ id: `role-${code}`, code, name: code })),
		);
	await db.insert(user).values({
		id: "u-e1",
		name: "Employee One",
		email: "e1@example.com",
		userCode: "E1",
		departmentId: "dept-a",
		isActive: true,
	});
	await db.insert(userRoles).values({
		id: "ur-e1",
		userId: "u-e1",
		roleId: "role-EMPLOYEE",
	});
	db.$client.exec(
		`INSERT INTO tasks (id, task_code, title, task_type, state, created_by, assigned_to, department_id, progress_percentage)
		 VALUES ('task-1', 'T202510-0001', 'Wireframe the dashboard', 'MULTI_DAY', 'ACT', 'u-e1', 'u-e1', 'dept-a', 40)`,
	);

	employeeCtx = createContext({
		db,
		config,
		request: { ipAddress: null, userAgent: null },
		viewer: {
			id: "u-e1",
			userCode: "E1",
			fullName: "Employee One",
			email: "e1@example.com",
			departmentId: "dept-a",
			isActive: true,
			roleCodes: ["EMPLOYEE"],
		},
	});
});

afterAll(() => {
	for (const suffix of ["", "-wal", "-shm"]) {
		try {
			rmSync(`${dbPath}${suffix}`, { force: true });
		} catch {
			/* best effort cleanup */
		}
	}
});

describe("file names", () => {
	test("strips directory components", () => {
		expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
		expect(sanitizeFileName("a/b/c/photo.png")).toBe("photo.png");
	});

	test("replaces unsafe characters", () => {
		expect(sanitizeFileName("my report (final).pdf")).toBe(
			"my_report__final_.pdf",
		);
	});

	test("never begins with a dot", () => {
		expect(sanitizeFileName(".htaccess")).toBe("_htaccess");
		expect(sanitizeFileName("..")).toBe("_");
	});

	test("falls back to a placeholder", () => {
		expect(sanitizeFileName("")).toBe("file");
		expect(sanitizeFileName("/")).toBe("file");
	});
});

describe("upload validation", () => {
	const limits = {
		maxFileBytes: config.uploadMaxFileBytes,
		maxFilesPerRequest: config.uploadMaxFilesPerRequest,
		index: 0,
	};

	test("accepts a wide mixed-format batch", () => {
		for (const file of [
			fakeFile("photo.png", "image/png", 10),
			fakeFile("report.pdf", "application/pdf", 10),
			fakeFile("clip.mp4", "video/mp4", 10),
			fakeFile("song.mp3", "audio/mpeg", 10),
			fakeFile("bundle.zip", "application/zip", 10),
			fakeFile("readme.md", "text/markdown", 10),
			fakeFile("notes.csv", "text/csv", 10),
			fakeFile("data.json", "application/json", 10),
			fakeFile("brief.doc", "application/msword", 10),
			fakeFile(
				"brief.docx",
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				10,
			),
		]) {
			expect(validateUpload(file, limits)).toBeNull();
		}
	});

	test("rejects executables and their relatives", () => {
		for (const name of [
			"payload.exe",
			"run.bat",
			"installer.msi",
			"lib.dll",
			"script.ps1",
		]) {
			expect(
				validateUpload(fakeFile(name, "application/octet-stream", 10), limits)
					?.code,
			).toBe("BLOCKED_FORMAT");
		}
	});

	test("rejects a MIME type that disagrees with the extension", () => {
		expect(
			validateUpload(fakeFile("photo.png", "application/zip", 10), limits)
				?.code,
		).toBe("TYPE_MISMATCH");
		expect(
			validateUpload(
				fakeFile("notes.csv", "application/vnd.ms-excel", 10),
				limits,
			)?.code,
		).toBe("TYPE_MISMATCH");
	});

	test("accepts an undeclared content type", () => {
		expect(
			validateUpload(
				fakeFile("photo.png", "application/octet-stream", 10),
				limits,
			),
		).toBeNull();
	});

	test("rejects an empty file", () => {
		expect(
			validateUpload(fakeFile("empty.txt", "text/plain", 0), limits)?.code,
		).toBe("EMPTY_FILE");
	});

	test("rejects a file over the per-file limit", () => {
		expect(
			validateUpload(
				fakeFile("big.zip", "application/zip", config.uploadMaxFileBytes + 1),
				limits,
			)?.code,
		).toBe("FILE_TOO_LARGE");
	});

	test("rejects a file past the per-request count limit", () => {
		expect(
			validateUpload(fakeFile("extra.pdf", "application/pdf", 10), {
				...limits,
				index: config.uploadMaxFilesPerRequest,
			})?.code,
		).toBe("TOO_MANY_FILES");
	});
});

describe("upload route", () => {
	test("rejects a request without a session before storing anything", async () => {
		const before = STORE.writeCalls.length;
		const outcome = await uploadAttachments(deps(), request(), {
			taskId: "task-1",
			files: [fakeFile("photo.png", "image/png", 4)],
		});
		expect(outcome.status).toBe(401);
		expect(STORE.writeCalls).toHaveLength(before);
	});

	test("stores a mixed-format batch and records one row per file", async () => {
		const outcome = await uploadAttachments(deps(), request("employee-token"), {
			taskId: "task-1",
			files: [
				fakeFile("photo.png", "image/png", 3),
				fakeFile("clip.mp4", "video/mp4", 4),
				fakeFile("notes.csv", "text/csv", 5),
			],
		});
		expect(outcome.status).toBe(200);
		const body = outcome.body as {
			files: {
				id: string;
				url: string;
				fileName: string;
				mimeType: string;
				sizeBytes: number;
			}[];
			failures: unknown[];
		};
		expect(body.files).toHaveLength(3);
		expect(body.failures).toHaveLength(0);

		for (const record of body.files) {
			expect(record.url).toMatch(
				/^tasks\/task-1\/[0-9a-f-]{36}-[A-Za-z0-9._-]+$/,
			);
			expect(record.url).not.toContain("..");
			expect(record.sizeBytes).toBeGreaterThan(0);
			expect(record.mimeType).not.toBe("");
		}

		const rows = await db.select().from(attachments);
		const stored = rows.filter((row) => row.ownerId === "task-1");
		expect(stored).toHaveLength(3);
		for (const row of stored) {
			expect(row.ownerType).toBe("TASK");
			expect(row.sizeBytes).toBeGreaterThan(0);
			expect(row.uploadedBy).toBe("u-e1");
		}
	});

	test("stores the valid files and reports the rejected ones individually", async () => {
		const before = STORE.objects.size;
		const outcome = await uploadAttachments(deps(), request("employee-token"), {
			taskId: "task-1",
			files: [
				fakeFile("good.png", "image/png", 3),
				fakeFile("payload.exe", "application/octet-stream", 3),
				fakeFile("bad-type.png", "application/zip", 3),
				fakeFile("empty.txt", "text/plain", 0),
				fakeFile("better.pdf", "application/pdf", 3),
			],
		});
		expect(outcome.status).toBe(200);
		const body = outcome.body as {
			files: unknown[];
			failures: { code: string }[];
		};
		expect(body.files).toHaveLength(2);
		expect(body.failures.map((failure) => failure.code)).toEqual([
			"BLOCKED_FORMAT",
			"TYPE_MISMATCH",
			"EMPTY_FILE",
		]);
		expect(STORE.objects.size).toBe(before + 2);
	});

	test("rejects a ticket the caller may not read", async () => {
		const outcome = await uploadAttachments(deps(), request("other-token"), {
			taskId: "task-1",
			files: [fakeFile("photo.png", "image/png", 3)],
		});
		expect(outcome.status).toBe(404);
	});

	test("requires a ticket id and at least one file", async () => {
		const missingTask = await uploadAttachments(
			deps(),
			request("employee-token"),
			{ files: [fakeFile("photo.png", "image/png", 3)] },
		);
		expect(missingTask.status).toBe(400);

		const noFiles = await uploadAttachments(deps(), request("employee-token"), {
			taskId: "task-1",
			files: [],
		});
		expect(noFiles.status).toBe(400);
	});

	test("reports an unconfigured store without writing", async () => {
		const outcome = await uploadAttachments(
			deps({ store: null }),
			request("employee-token"),
			{ taskId: "task-1", files: [fakeFile("photo.png", "image/png", 3)] },
		);
		expect(outcome.status).toBe(503);
		expect(outcome.body).toHaveProperty("error");
	});
});

describe("download route", () => {
	test("serves a stored object inline", async () => {
		const key = "tasks/task-1/1-photo.png";
		await STORE.write(key, new Uint8Array([1, 2, 3]));
		db.$client.exec(
			`INSERT INTO attachments (id, owner_type, owner_id, url, file_name, mime_type, size_bytes, uploaded_by)
			 VALUES ('att-1', 'TASK', 'task-1', '${key}', 'photo.png', 'image/png', 3, 'u-e1')`,
		);
		const outcome = await downloadAttachment(
			deps(),
			new Request(`http://localhost:3001/api/v1/files/${key}`, {
				headers: { authorization: "Bearer employee-token" },
			}),
			key,
			new URLSearchParams(),
		);
		expect(outcome.status).toBe(200);
		expect(outcome.headers["content-type"]).toBe("image/png");
		expect(outcome.headers["content-length"]).toBe("3");
		expect(outcome.headers["accept-ranges"]).toBe("bytes");
		expect(outcome.headers["content-disposition"]).toBeUndefined();
		expect(outcome.body).toEqual(new Uint8Array([1, 2, 3]));
	});

	test("asks for a download when ?download=1", async () => {
		const key = "tasks/task-1/2-sheet.xlsx";
		await STORE.write(key, new Uint8Array([4, 5]));
		db.$client.exec(
			`INSERT INTO attachments (id, owner_type, owner_id, url, file_name, mime_type, size_bytes, uploaded_by)
			 VALUES ('att-2', 'TASK', 'task-1', '${key}', 'sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 2, 'u-e1')`,
		);
		const outcome = await downloadAttachment(
			deps(),
			new Request(`http://localhost:3001/api/v1/files/${key}?download=1`, {
				headers: { authorization: "Bearer employee-token" },
			}),
			key,
			new URLSearchParams({ download: "1" }),
		);
		expect(outcome.headers["content-disposition"]).toContain("attachment");
	});

	test("requires a session", async () => {
		const key = "tasks/task-1/3-photo.png";
		await STORE.write(key, new Uint8Array([6]));
		const outcome = await downloadAttachment(
			deps(),
			new Request(`http://localhost:3001/api/v1/files/${key}`),
			key,
			new URLSearchParams(),
		);
		expect(outcome.status).toBe(401);
	});

	test("reports an absent object as missing", async () => {
		const outcome = await downloadAttachment(
			deps(),
			new Request("http://localhost:3001/api/v1/files/tasks/task-1/nope.png", {
				headers: { authorization: "Bearer employee-token" },
			}),
			"tasks/task-1/nope.png",
			new URLSearchParams(),
		);
		expect(outcome.status).toBe(404);
	});
});
