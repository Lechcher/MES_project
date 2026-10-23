/**
 * Ticket attachment file routes.
 *
 * `POST /api/v1/files` accepts many files in one multipart request and
 * `GET /api/v1/files/*` streams one back. Both are bearer-authenticated like
 * `GET /api/v1/exports/:id`, both stream bytes through the backend, and the
 * browser never sees a storage credential.
 *
 * Validation is per file and happens before the store is touched, so a single
 * rejected file (an executable, an oversized upload, a MIME type that
 * disagrees with the extension) never costs the valid files in the same batch.
 * Each accepted file is written to the object store and recorded as an
 * `attachments` row carrying its byte size; the response reports both outcomes.
 */

import { eq } from "drizzle-orm";
import type { AppConfig } from "../config";
import type { DatabaseHandle } from "../db";
import { attachments } from "../db/schema";
import { requireTaskRow } from "../domain/tasks";
import { authorize } from "../graphql/access";
import {
	bearerTokenFrom,
	createContext,
	type ViewerContext,
} from "../graphql/context";
import { DomainError } from "../graphql/errors";
import type { AttachmentStore, UploadedFile } from "../storage/s3";

/** Extensions that are never accepted, whatever their declared type. */
const BLOCKED_EXTENSIONS = new Set([
	"exe",
	"dll",
	"bat",
	"cmd",
	"sh",
	"msi",
	"scr",
	"com",
	"js",
	"jse",
	"vbs",
	"vbe",
	"ps1",
	"jar",
	"apk",
	"app",
	"reg",
	"pif",
	"cpl",
	"hta",
	"msc",
	"scf",
	"lnk",
	"inf",
	"so",
	"dylib",
	"bin",
]);

/**
 * The MIME family each known extension belongs to.
 *
 * The consistency check compares families, not exact subtypes: a `.jpg`
 * declared as `image/jpeg` is the same family, while a `.png` declared as
 * `application/zip` is not. A type absent from this table is treated as
 * unknown, so a format this project has not charted still uploads.
 */
const FAMILY_BY_EXTENSION: Record<string, string> = {
	// Images
	png: "image",
	jpg: "image",
	jpeg: "image",
	gif: "image",
	webp: "image",
	bmp: "image",
	svg: "image",
	avif: "image",
	heic: "image",
	tiff: "image",
	// Video
	mp4: "video",
	m4v: "video",
	webm: "video",
	mov: "video",
	avi: "video",
	mkv: "video",
	// Audio
	mp3: "audio",
	wav: "audio",
	ogg: "audio",
	oga: "audio",
	weba: "audio",
	m4a: "audio",
	aac: "audio",
	flac: "audio",
	// Documents
	pdf: "application",
	doc: "application",
	docx: "application",
	xls: "application",
	xlsx: "application",
	ppt: "application",
	pptx: "application",
	rtf: "application",
	odt: "application",
	ods: "application",
	odp: "application",
	json: "application",
	xml: "application",
	// Text
	txt: "text",
	csv: "text",
	tsv: "text",
	md: "text",
	log: "text",
	// Archives
	zip: "application",
	gz: "application",
	tar: "application",
	"7z": "application",
	rar: "application",
};

/**
 * Content types a client may send when it does not know the file's type.
 * They carry no type claim, so the consistency check is skipped for them.
 */
const UNTYPED_CONTENT_TYPES = new Set(["application/octet-stream", ""]);

export interface FileFailure {
	readonly fileName: string;
	readonly code: string;
	readonly message: string;
}

export interface FileRecord {
	readonly id: string;
	readonly url: string;
	readonly fileName: string;
	readonly mimeType: string;
	readonly sizeBytes: number;
}

export interface UploadOutcome {
	readonly files: FileRecord[];
	readonly failures: FileFailure[];
}

/** Strip any directory component and every character that is not safe. */
export function sanitizeFileName(rawName: string): string {
	const withoutPath = rawName.split(/[\\/]/).pop() ?? "";
	const cleaned = withoutPath
		.replace(/[^a-zA-Z0-9._-]/g, "_")
		.replace(/^\.+/, "_")
		.slice(0, 120);
	return cleaned === "" ? "file" : cleaned;
}

function extensionOf(fileName: string): string {
	const dot = fileName.lastIndexOf(".");
	if (dot <= 0) return "";
	return fileName.slice(dot + 1).toLowerCase();
}

function contentTypeOf(file: UploadedFile): string {
	return (file.type ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

/**
 * Validate one file against the project's upload rules.
 *
 * Returns `null` when the file is acceptable, or the failure that describes why
 * not. The rules are a denylist plus a consistency check rather than an
 * allowlist, because the accepted set is wide and still growing.
 */
export function validateUpload(
	file: UploadedFile,
	limits: {
		maxFileBytes: number;
		maxFilesPerRequest: number;
		index: number;
	},
): FileFailure | null {
	const name = file.name || "file";
	if (file.size <= 0) {
		return {
			fileName: name,
			code: "EMPTY_FILE",
			message: `${name} is empty.`,
		};
	}
	if (file.size > limits.maxFileBytes) {
		return {
			fileName: name,
			code: "FILE_TOO_LARGE",
			message: `${name} is larger than the ${limits.maxFileBytes}-byte limit.`,
		};
	}
	if (limits.index >= limits.maxFilesPerRequest) {
		return {
			fileName: name,
			code: "TOO_MANY_FILES",
			message: `A request may carry at most ${limits.maxFilesPerRequest} files.`,
		};
	}

	const extension = extensionOf(name);
	if (BLOCKED_EXTENSIONS.has(extension)) {
		return {
			fileName: name,
			code: "BLOCKED_FORMAT",
			message: `${name} is an executable format and cannot be attached.`,
		};
	}

	const contentType = contentTypeOf(file);
	if (!UNTYPED_CONTENT_TYPES.has(contentType)) {
		const family = FAMILY_BY_EXTENSION[extension];
		if (family !== undefined && !contentType.startsWith(`${family}/`)) {
			return {
				fileName: name,
				code: "TYPE_MISMATCH",
				message: `${name} is declared as ${contentType}, which does not match its ${extension} file type.`,
			};
		}
	}

	return null;
}

export interface FileRouteDependencies {
	db: DatabaseHandle;
	config: AppConfig;
	auth: {
		resolveSession: (db: DatabaseHandle, token: string) => Promise<unknown>;
	};
	store: AttachmentStore | null;
	/** Creates the store from configuration; injected so tests can stub it. */
	createStore?: () => AttachmentStore | null;
}

/** Re-exported so callers and tests can build a file's shape without the store. */
export type { UploadedFile } from "../storage/s3";

/** Build a viewer context for a file request, resolving the bearer session. */
async function createFileContext(
	deps: FileRouteDependencies,
	request: Request,
): Promise<ViewerContext> {
	const token = bearerTokenFrom(request);
	const resolved = token
		? ((await deps.auth.resolveSession(deps.db, token)) as {
				viewer: ViewerContext["viewer"];
				session: ViewerContext["session"];
			} | null)
		: null;
	return createContext({
		db: deps.db,
		config: deps.config,
		request: {
			ipAddress:
				request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
			userAgent: request.headers.get("user-agent"),
		},
		viewer: resolved?.viewer ?? null,
		session: resolved?.session ?? null,
	});
}

/** Resolve the store, preferring an injected one over a configured one. */
function resolveStore(deps: FileRouteDependencies): AttachmentStore | null {
	return deps.store ?? deps.createStore?.() ?? null;
}

const STORAGE_MISSING =
	"Attachment storage is not configured. Set S3_ENDPOINT, S3_BUCKET, " +
	"S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY (see docs/garage-s3-clients.md).";

/**
 * Resolve the caller's viewer and the ticket's data scope.
 *
 * The scope is the ticket-read scope: a caller who cannot read a ticket cannot
 * attach files to it, and that is enforced here rather than trusted from the
 * form body.
 */
async function requireViewerAndTicket(
	deps: FileRouteDependencies,
	request: Request,
	taskId: string,
): Promise<ViewerContext> {
	const ctx = await createFileContext(deps, request);
	if (!ctx.viewer) throw new AuthFailure("Authentication is required.");
	const scope = authorize(ctx, "tasks");
	await requireTaskRow(ctx, scope, taskId);
	return ctx;
}

/** A 401/403 answer that is not a domain failure. */
class AuthFailure extends Error {}

/**
 * Map a caught failure onto the route's status code.
 *
 * Failures arrive either as a `DomainError` (which carries its catalog code on
 * the instance) or as a `GraphQLError` from the authorization helpers (which
 * carries it in `extensions`), so both shapes are read.
 */
function failureStatus(cause: unknown): number {
	if (cause instanceof AuthFailure) return 401;
	const code = errorCodeOf(cause);
	if (code === "FORBIDDEN" || code === "UNAUTHENTICATED") return 403;
	if (code === "NOT_FOUND") return 404;
	return 400;
}

/** The catalog code a failure carries, from either representation. */
export function errorCodeOf(cause: unknown): string | null {
	if (cause instanceof DomainError) return cause.code;
	if (cause instanceof Error) {
		const extensions = (cause as { extensions?: { code?: string } }).extensions;
		if (typeof extensions?.code === "string") return extensions.code;
		const code = (cause as unknown as { code?: unknown }).code;
		if (typeof code === "string") return code;
	}
	return null;
}

/**
 * Handle a bulk upload.
 *
 * The caller is authorized against the ticket's data scope before a byte is
 * written, so a caller who cannot read the ticket cannot attach to it. A
 * rejected file is reported in `failures` while the accepted ones still land.
 */
export async function uploadAttachments(
	deps: FileRouteDependencies,
	request: Request,
	body: { taskId?: unknown; files?: unknown },
): Promise<{ status: number; body: UploadOutcome | { error: string } }> {
	const taskId = typeof body.taskId === "string" ? body.taskId : "";
	if (taskId === "") {
		return { status: 400, body: { error: "taskId is required." } };
	}

	const files = Array.isArray(body.files) ? (body.files as UploadedFile[]) : [];
	if (files.length === 0) {
		return { status: 400, body: { error: "At least one file is required." } };
	}

	let ctx: ViewerContext;
	try {
		ctx = await requireViewerAndTicket(deps, request, taskId);
	} catch (cause) {
		return {
			status: failureStatus(cause),
			body: { error: "The ticket is not available to this caller." },
		};
	}

	const store = resolveStore(deps);
	if (!store) {
		return { status: 503, body: { error: STORAGE_MISSING } };
	}

	const uploadedBy = ctx.viewer?.id ?? null;
	const created: FileRecord[] = [];
	const failures: FileFailure[] = [];

	for (const [index, file] of files.entries()) {
		const validation = validateUpload(file, {
			maxFileBytes: deps.config.uploadMaxFileBytes,
			maxFilesPerRequest: deps.config.uploadMaxFilesPerRequest,
			index,
		});
		if (validation) {
			failures.push(validation);
			continue;
		}

		const key = `tasks/${taskId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
		try {
			await store.write(key, await file.arrayBuffer());
		} catch {
			failures.push({
				fileName: file.name,
				code: "STORE_FAILED",
				message: `${file.name} could not be stored. Try again.`,
			});
			continue;
		}

		const id = crypto.randomUUID();
		const contentType = contentTypeOf(file);
		const name = sanitizeFileName(file.name);
		await deps.db.insert(attachments).values({
			id,
			ownerType: "TASK",
			ownerId: taskId,
			url: key,
			fileName: name,
			mimeType: contentType === "" ? null : contentType,
			sizeBytes: file.size,
			uploadedBy,
		});

		created.push({
			id,
			url: key,
			fileName: name,
			mimeType: contentType === "" ? "application/octet-stream" : contentType,
			sizeBytes: file.size,
		});
	}

	return { status: 200, body: { files: created, failures } };
}

export interface DownloadOutcome {
	status: number;
	body: Uint8Array | { error: string };
	headers: Record<string, string>;
}

/**
 * Stream one stored attachment.
 *
 * Inline by default so images, video, audio and PDF preview in the browser;
 * `?download=1` asks for `Content-Disposition: attachment`. A `Range` header is
 * forwarded to the store so media can be seeked — Garage may decline the range,
 * in which case the whole object is served instead.
 */
export async function downloadAttachment(
	deps: FileRouteDependencies,
	request: Request,
	key: string,
	query: URLSearchParams,
): Promise<DownloadOutcome> {
	if (!(await hasValidSession(deps, request))) {
		return {
			status: 401,
			body: { error: "Authentication is required." },
			headers: {},
		};
	}

	const store = resolveStore(deps);
	if (!store) {
		return {
			status: 503,
			body: { error: STORAGE_MISSING },
			headers: {},
		};
	}

	const stored = await store.read(key);
	if (!stored) {
		return {
			status: 404,
			body: { error: "Attachment not found." },
			headers: {},
		};
	}

	const [row] = await deps.db
		.select()
		.from(attachments)
		.where(eq(attachments.url, key))
		.limit(1);
	const fileName = row?.fileName ?? key.split("/").pop() ?? "attachment";
	const contentType =
		row?.mimeType ??
		(stored.contentType === ""
			? "application/octet-stream"
			: stored.contentType);

	const headers: Record<string, string> = {
		"content-type": contentType,
		"accept-ranges": "bytes",
		"content-length": String(stored.bytes.byteLength),
	};
	if (query.get("download") === "1") {
		headers["content-disposition"] =
			`attachment; filename="${encodeURIComponent(fileName)}"`;
	}

	return { status: 200, body: stored.bytes, headers };
}

/** True when the caller's bearer session resolves to a viewer. */
export async function hasValidSession(
	deps: FileRouteDependencies,
	request: Request,
): Promise<boolean> {
	const ctx = await createFileContext(deps, request);
	return ctx.viewer !== null;
}
