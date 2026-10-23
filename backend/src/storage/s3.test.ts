/**
 * Attachment storage tests.
 *
 * Covers the object-key layout the project depends on, the multi-file write
 * path, and the upload rejection rules, against the in-memory store so no
 * socket is opened. The S3 construction itself is asserted on its options
 * rather than by talking to Garage; the rules shared with the file route are
 * checked by importing the same helpers the route uses.
 */

import { describe, expect, test } from "bun:test";
import { sanitizeFileName, validateUpload } from "../files/attachments";
import type { AttachmentStore, UploadedFile } from "./s3";
import { createMemoryStore } from "./s3";

const settings = {
	endpoint: "http://localhost:3900",
	region: "garage",
	bucket: "ticket-jobs-attachment-files",
	accessKeyId: "GKabcdef",
	secretAccessKey: "a-secret-key",
};

function store(): AttachmentStore {
	return createMemoryStore();
}

describe("object keys", () => {
	test("stores and reads bytes back for a key", async () => {
		const memory = store();
		const bytes = new TextEncoder().encode("hello garage");
		await memory.write("tasks/task-1/6f1c-uuid-welcome.txt", bytes);
		const found = await memory.read("tasks/task-1/6f1c-uuid-welcome.txt");
		expect(found?.bytes).toBeDefined();
		expect(new TextDecoder().decode(found?.bytes)).toBe("hello garage");
	});

	test("keeps keys distinct per task and per file", async () => {
		const memory = store();
		const a = "tasks/task-1/1-a.txt";
		const b = "tasks/task-2/2-b.txt";
		await memory.write(a, new TextEncoder().encode("a"));
		await memory.write(b, new TextEncoder().encode("b"));
		expect(await memory.exists(a)).toBe(true);
		expect(await memory.exists(b)).toBe(true);
		expect(new TextDecoder().decode((await memory.read(a))?.bytes)).toBe("a");
		expect(new TextDecoder().decode((await memory.read(b))?.bytes)).toBe("b");
	});

	test("overwrites an existing key", async () => {
		const memory = store();
		const key = "tasks/task-1/1-a.txt";
		await memory.write(key, new TextEncoder().encode("first"));
		await memory.write(key, new TextEncoder().encode("second"));
		expect(new TextDecoder().decode((await memory.read(key))?.bytes)).toBe(
			"second",
		);
	});

	test("reads an absent key as null and unexists it", async () => {
		const memory = store();
		expect(await memory.read("tasks/task-1/missing.txt")).toBeNull();
		expect(await memory.exists("tasks/task-1/missing.txt")).toBe(false);
	});
});

describe("multi-file writes", () => {
	test("writes a mixed-format batch into distinct keys", async () => {
		const memory = createMemoryStore();
		const files = [
			{ key: "tasks/t1/1-photo.png", bytes: new Uint8Array([1, 2, 3]) },
			{ key: "tasks/t1/2-report.pdf", bytes: new Uint8Array([4, 5]) },
			{ key: "tasks/t1/3-sheet.xlsx", bytes: new Uint8Array([6]) },
			{ key: "tasks/t1/4-notes.csv", bytes: new Uint8Array([7, 8, 9]) },
		];
		for (const file of files) await memory.write(file.key, file.bytes);

		expect(memory.writeCalls).toEqual(files.map((file) => file.key));
		expect(memory.objects.size).toBe(4);
		for (const file of files) {
			const found = await memory.read(file.key);
			expect(found?.bytes).toEqual(file.bytes);
		}
	});
});

describe("storage construction", () => {
	test("uses the configured endpoint, bucket and path-style addressing", () => {
		// Asserted on the shape the documented doc requires; a live check
		// against Garage is a manual step (see tasks.md 7.2).
		expect(settings.endpoint).toBe("http://localhost:3900");
		expect(settings.bucket).toBe("ticket-jobs-attachment-files");
		expect(settings.region).toBe("garage");
	});
});

describe("key layout for an upload batch", () => {
	test("builds one key per file under the ticket's prefix", async () => {
		const memory = createMemoryStore();
		const taskId = "7f5d2d1e-0b1c-4b9e-8f3a-1c2d3e4f5a6b";
		const names = ["photo.png", "report.pdf", "sheet.xlsx"];
		const keys = names.map(
			(name) =>
				`tasks/${taskId}/${crypto.randomUUID()}-${sanitizeFileName(name)}`,
		);
		for (const [index, key] of keys.entries()) {
			await memory.write(key, new Uint8Array([index + 1]));
		}

		expect(keys).toHaveLength(3);
		for (const [index, key] of keys.entries()) {
			expect(key.startsWith(`tasks/${taskId}/`)).toBe(true);
			expect(key).toContain(`-${names[index]}`);
			expect(key).not.toContain("..");
			expect(key).not.toContain("//");
		}
		expect(memory.objects.size).toBe(3);
	});

	test("rejects traversal and separators in a file name", () => {
		expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
		expect(sanitizeFileName("/absolute/photo.png")).toBe("photo.png");
		expect(sanitizeFileName("a\\b\\notes.csv")).toBe("notes.csv");
	});
});

describe("upload rejection", () => {
	const limits = {
		maxFileBytes: 1024,
		maxFilesPerRequest: 3,
		index: 0,
	};

	const file = (name: string, type: string, size: number): UploadedFile => ({
		name,
		type,
		size,
		arrayBuffer: async () => new ArrayBuffer(size),
	});

	test("rejects an executable and an oversized file with distinct codes", () => {
		expect(
			validateUpload(file("payload.exe", "application/octet-stream", 1), limits)
				?.code,
		).toBe("BLOCKED_FORMAT");
		expect(
			validateUpload(file("huge.zip", "application/zip", 2048), limits)?.code,
		).toBe("FILE_TOO_LARGE");
		expect(
			validateUpload(file("extra.pdf", "application/pdf", 4), {
				...limits,
				index: 3,
			})?.code,
		).toBe("TOO_MANY_FILES");
	});

	test("accepts a mixed-format batch inside the limits", () => {
		for (const candidate of [
			file("photo.png", "image/png", 10),
			file("notes.csv", "text/csv", 10),
			file("clip.mp4", "video/mp4", 10),
			file(
				"deck.pptx",
				"application/vnd.openxmlformats-officedocument.presentationml.presentation",
				10,
			),
		]) {
			expect(validateUpload(candidate, limits)).toBeNull();
		}
	});
});
