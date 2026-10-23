/**
 * Attachment object storage.
 *
 * Ticket attachments live in the Garage S3 bucket documented in
 * `docs/garage-s3-clients.md`. `Bun.S3Client` is built into the runtime, so no
 * storage dependency is added.
 *
 * The module is deliberately narrow: a `AttachmentStore` port with the three
 * operations this project needs, one S3 implementation of it, and an in-memory
 * fake so tests never open a socket. Path-style addressing is required —
 * virtual-hosted style needs wildcard DNS this deployment does not have.
 */

import { S3Client } from "bun";
import type { StorageSettings } from "../config";

export interface StoredObject {
	readonly key: string;
	readonly bytes: Uint8Array;
	readonly contentType: string;
}

/**
 * The storage operations the file routes and their tests depend on.
 *
 * `read` returns `null` when the key is absent, so a caller can distinguish a
 * missing object from a broken store without a second existence check.
 */
export interface AttachmentStore {
	write(key: string, body: Blob | Uint8Array | ArrayBuffer): Promise<void>;
	read(key: string): Promise<StoredObject | null>;
	exists(key: string): Promise<boolean>;
}

/** Serializable subset of an upload's file, used by the routes. */
export interface UploadedFile {
	readonly name: string;
	readonly type: string;
	readonly size: number;
	readonly arrayBuffer: () => Promise<ArrayBuffer>;
}

/** Build the S3-backed store from validated configuration. */
export function createS3Store(settings: StorageSettings): AttachmentStore {
	const client = new S3Client({
		endpoint: settings.endpoint,
		region: settings.region || "garage",
		bucket: settings.bucket,
		accessKeyId: settings.accessKeyId,
		secretAccessKey: settings.secretAccessKey,
		// Path-style (`http://host:3900/<bucket>/<key>`); see the doc's note.
		virtualHostedStyle: false,
	});

	return {
		write: async (key, body) => {
			const blob =
				body instanceof Uint8Array
					? new Blob([body])
					: body instanceof ArrayBuffer
						? new Blob([body])
						: body;
			const contentType =
				blob instanceof Blob && blob.type !== ""
					? blob.type
					: "application/octet-stream";
			await client.write(key, blob, { type: contentType });
		},
		read: async (key) => {
			const file = client.file(key);
			if (!(await file.exists())) return null;
			const bytes = new Uint8Array(await file.arrayBuffer());
			return { key, bytes, contentType: file.type ?? "" };
		},
		exists: async (key) => {
			const file = client.file(key);
			return file.exists();
		},
	};
}

/**
 * In-memory store for tests and local runs.
 *
 * It keeps the exact contract of the S3 implementation — including the content
 * type a write declared — so a test that passes against this object proves the
 * same behavior against the real store.
 */
export function createMemoryStore(
	initial?: Map<string, { bytes: Uint8Array; contentType: string }>,
): AttachmentStore & {
	readonly objects: Map<string, { bytes: Uint8Array; contentType: string }>;
	readonly writeCalls: string[];
} {
	const objects = new Map(initial ?? []);
	const writeCalls: string[] = [];

	return {
		objects,
		writeCalls,
		write: async (key, body) => {
			writeCalls.push(key);
			const bytes =
				body instanceof Uint8Array
					? body
					: new Uint8Array(
							body instanceof ArrayBuffer ? body : await body.arrayBuffer(),
						);
			const contentType =
				body instanceof Blob && body.type !== ""
					? body.type
					: "application/octet-stream";
			objects.set(key, { bytes, contentType });
		},
		read: async (key) => {
			const found = objects.get(key);
			if (!found) return null;
			return {
				key,
				bytes: new Uint8Array(found.bytes),
				contentType: found.contentType,
			};
		},
		exists: async (key) => objects.has(key),
	};
}
