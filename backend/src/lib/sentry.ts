/**
 * Sentry SDK integration for the Bun/Elysia backend.
 *
 * Initializes Sentry error tracking with environment-specific DSN,
 * traces sampling, request context capture, and sensitive data filtering.
 * Provides Elysia hooks that capture unhandled errors with request context
 * and wraps async operations in Sentry spans for performance monitoring.
 */

import * as Sentry from "@sentry/node";

const SENTRY_DSN = process.env.SENTRY_DSN;
const SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT ?? "development";
const TRACES_SAMPLE_RATE = Number(
	process.env.SENTRY_TRACES_SAMPLE_RATE ??
		(process.env.NODE_ENV === "production" ? 0.01 : 1.0),
);

/**
 * Initialize Sentry for the backend.
 *
 * Should be called once at application startup, before creating the Elysia
 * instance. Safe to call multiple times; subsequent calls are no-ops.
 */
export function initSentry(): void {
	if (!SENTRY_DSN) {
		return;
	}

	Sentry.init({
		dsn: SENTRY_DSN,
		environment: SENTRY_ENVIRONMENT,
		tracesSampleRate: TRACES_SAMPLE_RATE,
		enabled: true,

		// Filter sensitive data before sending to Sentry
		beforeSend(event) {
			if (event.request?.headers) {
				const headers = event.request.headers as Record<string, string>;
				if (headers.authorization) {
					headers.authorization = "[Filtered]";
				}
				if (headers.cookie) {
					headers.cookie = "[Filtered]";
				}
			}

			const sensitiveKeys = [
				"password",
				"token",
				"secret",
				"key",
				"credential",
				"connection_string",
				"database_url",
			];
			const scrub = (obj: unknown): unknown => {
				if (Array.isArray(obj)) return obj.map(scrub);
				if (obj && typeof obj === "object") {
					const result: Record<string, unknown> = {};
					for (const [key, value] of Object.entries(obj)) {
						const isSensitive = sensitiveKeys.some((k) =>
							key.toLowerCase().includes(k),
						);
						result[key] = isSensitive ? "[Filtered]" : scrub(value);
					}
					return result;
				}
				return obj;
			};

			if (event.extra) {
				event.extra = scrub(event.extra) as Record<string, unknown>;
			}

			return event;
		},
	});
}

/** Minimal shape of the Elysia request context we actually read. */
interface SentryRequestContext {
	request: {
		method: string;
		url: string;
		headers: { entries(): Iterable<[string, string]> };
	};
}

/** Minimal shape of the Elysia error handler context we actually read. */
interface SentryErrorContext {
	error: unknown;
	request: { method: string; url: string; headers: Headers };
	set: { status?: number | string };
	code?: number | string;
}

export async function sentryOnRequest(context: SentryRequestContext) {
	if (!SENTRY_DSN) return;

	const { request } = context;

	Sentry.addBreadcrumb({
		category: "http",
		message: `${request.method} ${request.url}`,
		level: "info",
	});

	Sentry.setContext("request", {
		method: request.method,
		url: request.url,
		headers: Object.fromEntries(request.headers.entries()),
	});
}

export async function sentryOnError(context: SentryErrorContext) {
	const { error, request, set, code } = context;

	if (!SENTRY_DSN) return;

	Sentry.captureException(error, {
		level: "error",
		contexts: {
			request: {
				method: request.method,
				url: request.url,
				headers: Object.fromEntries(request.headers.entries()),
				status_code: code ?? Number(set.status) ?? 500,
			},
		},
		fingerprint: [
			"backend",
			(error as Error)?.constructor?.name ?? "Error",
			String(code ?? set.status ?? "unknown"),
		],
	});
}

/**
 * Wrap an async function in a Sentry span for performance monitoring.
 *
 * Usage:
 *   const outcome = await sentrySpan("files.upload", async () => {
 *     return await uploadAttachments(...);
 *   });
 */
export function sentrySpan<T>(name: string, operation: () => T): T {
	if (!SENTRY_DSN) return operation();

	return Sentry.startSpan({ name, op: "function" }, () => {
		return operation();
	});
}

/** The scrubbed store-failure account the file routes record. */
export interface StoreFailureContext {
	readonly taskId: string;
	readonly key: string;
	readonly fileName: string;
	readonly errorName: string;
	readonly message: string;
}

/**
 * Report a refused object-store write.
 *
 * A per-file store refusal is a normal outcome for the caller, so it is not
 * thrown — but it happens during a request whose span sees success, which is why
 * a failing storage deployment used to leave no trace at all.
 *
 * The event is built from the caller's scrubbed fields rather than by capturing
 * the store's error object: that object's property graph may carry request-scoped
 * detail, and a store refusal is only useful to an operator if the credential
 * and signature material cannot ride along.
 */
export function sentryCaptureStoreFailure(record: StoreFailureContext): void {
	if (!SENTRY_DSN) return;

	const error = new Error(record.message, { cause: undefined });
	error.name = record.errorName;

	Sentry.captureException(error, {
		level: "error",
		contexts: {
			attachment_store: {
				task_id: record.taskId,
				object_key: record.key,
				file_name: record.fileName,
				error_name: record.errorName,
			},
		},
		fingerprint: ["backend", "attachment-store", record.errorName],
	});
}
