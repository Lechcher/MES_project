/**
 * MES backend service.
 *
 * Elysia entry point exposing:
 *   GET  /health                  — liveness/readiness for the service
 *   POST /api/v1/graphql          — the versioned GraphQL contract
 *   GET  /api/v1/exports/:id      — authenticated download of a generated artifact
 *   POST /api/v1/files            — authenticated bulk attachment upload
 *   GET  /api/v1/files/*          — authenticated streaming attachment download
 *   GET  /api/v1/events           — authenticated SSE stream of change events
 *   ALL  /api/auth/*              — Better Auth's own endpoints
 *
 * When the inbound Telegram bot is enabled (environment or website setting),
 * this same process also drives it by long polling — see
 * `src/telegram/bot.ts`. Polling failures are contained: they are logged and
 * never surface on the API surface.
 *
 * Configuration is validated at startup so a misconfigured service fails fast
 * with an actionable message.
 */

import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { Kind, parse } from "graphql";
import { type Auth, createAuth } from "./auth";
import {
	type AppConfig,
	assertConfig,
	ConfigurationError,
	loadConfig,
	type MailEndpoint,
} from "./config";
import { closeDatabase, createDatabase, type DatabaseHandle } from "./db";
import { pruneExpiredSessions } from "./db/maintenance";
import { runMigrations } from "./db/migrate";
import { exportArtifacts } from "./db/schema";
import { createShoptifyRoutes } from "./domain/shoptify/oauth.routes";
import { wireShoptifySubscriptions } from "./domain/shoptify/subscriptions";
import {
	createShoptifyEventBus,
	type ShoptifyEventBus,
} from "./domain/shoptify/webhooks";
import { type ChangeBus, createChangeBus } from "./events/event-bus";
import {
	createEventStreamResponse,
	SERVER_IDLE_TIMEOUT_SECONDS,
} from "./events/stream";
import {
	downloadAttachment,
	type FileRouteDependencies,
	uploadAttachments,
} from "./files/attachments";
import { executeGraphQL } from "./graphql";
import {
	initSentry,
	sentryCaptureStoreFailure,
	sentryOnError,
	sentryOnRequest,
	sentrySpan,
} from "./lib/sentry";
import {
	createFileSink,
	createLogger,
	createSilentLogger,
	describeFailure,
	type Logger,
} from "./logging";
import { createCredentialScrubber } from "./mail";
import { type AttachmentStore, createS3Store } from "./storage/s3";
import { startTelegramBot } from "./telegram/bot";

export interface ServiceDependencies {
	db: DatabaseHandle;
	auth: Auth;
	config: AppConfig;
	/**
	 * The change bus mutations publish to and the SSE stream relays. One
	 * instance per service, so the GraphQL layer and the stream see the same
	 * publications.
	 */
	events: ChangeBus;
	/**
	 * The Shopify module's typed webhook bus. One instance per service, shared
	 * by the webhook receiver and the domains that subscribe; omitted builds a
	 * local one (tests, unconfigured deployments).
	 */
	shoptifyEvents?: ShoptifyEventBus;
	/**
	 * Object storage for ticket attachments. Injected so tests can supply the
	 * in-memory store; omitted means it is built from the configured storage.
	 */
	attachmentStore?: AttachmentStore | null;
	/**
	 * Records the run's lifecycle, unhandled failures, GraphQL failures, and
	 * mail delivery outcomes — to the terminal and the log file alike.
	 *
	 * Optional, and silent by default: a service built without one (the
	 * automated suite, and any other direct construction) records nothing
	 * rather than writing into a real directory. Only `bootstrap()` — the
	 * production entry — builds the real one from configuration.
	 */
	logging?: Logger;
}

export function createService(deps: ServiceDependencies) {
	const { db, auth, config, events } = deps;
	const logger = deps.logging ?? createSilentLogger();

	initSentry();

	const corsHeaders = {
		"access-control-allow-origin": config.webOrigin,
		"access-control-allow-methods": "GET,POST,OPTIONS",
		"access-control-allow-headers": "content-type,authorization",
		"access-control-allow-credentials": "true",
	};

	const fileDeps: FileRouteDependencies = {
		db,
		config,
		auth: {
			resolveSession: (database, token) =>
				import("./auth").then(({ resolveSession }) =>
					resolveSession(database, token),
				) as Promise<never>,
		},
		store:
			deps.attachmentStore !== undefined
				? deps.attachmentStore
				: config.storage
					? createS3Store(config.storage)
					: null,
		// A refused store write is reported to the caller per file, but the
		// store's own error — the only evidence of *why* — used to be discarded
		// here, so a failing deployment looked exactly like a healthy one. The
		// record is scrubbed before it reaches either sink.
		logStoreFailure: (record) => {
			console.error(
				`[mes] attachment store refused a write: task=${record.taskId} key=${record.key} file=${record.fileName} ${record.errorName}: ${record.message}`,
			);
			sentryCaptureStoreFailure(record);
		},
	};

	return (
		new Elysia({ name: "mes-backend" })
			.onRequest(({ request, set }) => {
				if (request.method === "OPTIONS") {
					set.status = 204;
					for (const [key, value] of Object.entries(corsHeaders)) {
						set.headers[key] = value;
					}
					// Short-circuit the preflight: returning a response stops routing,
					// otherwise the unmatched OPTIONS request falls through to a 404.
					return new Response(null, { status: 204, headers: corsHeaders });
				}
			})
			.onRequest(sentryOnRequest)
			// Lifecycle and failure hooks are registered before the routes they
			// apply to: Elysia applies a hook only to routes registered after it.
			.onStart(() => {
				// What is listening, and on which configuration — without the
				// configuration itself, whose secret and credentials must never
				// reach a log.
				logger.info(describeStartup(config));
			})
			.onStop(() => {
				logger.info("service stopped");
			})
			// What reaches the error hook was never handled: the route threw, or
			// no route matched. That is exactly the failure that would otherwise
			// leave no trace, so it is recorded with its stack. The context is
			// destructured rather than passed whole, because Elysia's static
			// analysis reads a whole-context pass as a body reference and would
			// then parse the request body ahead of the route that reads it itself.
			.onError(({ error, request }) => {
				logger.error(
					`unhandled failure: ${describeFailure(error)} ` +
						`(${request.method} ${request.url})`,
				);
			})
			// The versioned endpoint reports failures in the body with a 200
			// rather than throwing, so the status is read as the route set it —
			// before any normalisation would flatten it to 200.
			.onAfterHandle(({ request, set, responseValue }) => {
				recordGraphQLFailure(logger, request, set.status, responseValue);
			})
			.get("/health", () => ({
				status: "ok",
				service: "mes-backend",
				env: config.env,
				time: new Date().toISOString(),
			}))
			.post("/api/v1/graphql", async ({ request, set }) => {
				for (const [key, value] of Object.entries(corsHeaders)) {
					set.headers[key] = value;
				}
				set.headers["content-type"] = "application/json";

				let body: unknown;
				try {
					body = await request.json();
				} catch {
					set.status = 400;
					// The after-response hook records the failure from the body,
					// and this request's operation is unrecoverable — name it so.
					graphqlOperations.set(request, "(unparsed body)");
					return {
						data: null,
						errors: [
							{
								message: "Request body must be JSON.",
								extensions: { code: "VALIDATION_FAILED" },
							},
						],
					};
				}

				const payload = (body ?? {}) as Record<string, unknown>;
				const result = await executeGraphQL(
					{
						query: payload.query,
						variables: payload.variables,
						operationName: payload.operationName,
					},
					{ db, config, request, auth, events },
				);

				set.status = 200;
				if (result.errors?.length) {
					// Recorded now because the hook reads it back off the request:
					// by then the body has been read and the operation is gone.
					graphqlOperations.set(request, operationNameOf(payload));
				}
				return {
					data: result.data ?? null,
					...(result.errors ? { errors: result.errors } : {}),
				};
			})
			.get("/api/v1/exports/:id", async ({ params, request, set }) => {
				for (const [key, value] of Object.entries(corsHeaders)) {
					set.headers[key] = value;
				}

				const token = request.headers
					.get("authorization")
					?.replace(/^Bearer\s+/i, "")
					.trim();
				const { resolveSession } = await import("./auth");
				if (!token || !(await resolveSession(db, token))) {
					set.status = 401;
					return { error: "Authentication is required." };
				}

				const [artifact] = await db
					.select()
					.from(exportArtifacts)
					.where(eq(exportArtifacts.id, params.id))
					.limit(1);

				if (!artifact) {
					set.status = 404;
					return { error: "Export artifact not found." };
				}

				try {
					const bytes = await readFile(artifact.storagePath);
					set.headers["content-type"] = artifact.mimeType;
					set.headers["content-disposition"] =
						`attachment; filename="${artifact.fileName}"`;
					return bytes;
				} catch {
					set.status = 410;
					return { error: "Export artifact is no longer available." };
				}
			})
			.post(
				"/api/v1/files",
				async ({ body, request, set }) => {
					for (const [key, value] of Object.entries(corsHeaders)) {
						set.headers[key] = value;
					}

					const form = (body ?? {}) as {
						taskId?: unknown;
						files?: unknown;
					};
					const outcome = await sentrySpan("files.upload", async () => {
						return uploadAttachments(fileDeps, request, form);
					});
					set.status = outcome.status;
					set.headers["content-type"] = "application/json";
					return JSON.stringify(outcome.body);
				},
				{
					// A typed multipart body so Elysia parses the form: many files in
					// one request beside the ticket they belong to.
					body: t.Object({
						taskId: t.String(),
						files: t.Files(),
					}),
				},
			)
			.get("/api/v1/files/*", async ({ params, request, set, query }) => {
				for (const [key, value] of Object.entries(corsHeaders)) {
					set.headers[key] = value;
				}

				const key = String(params["*"] ?? "");
				const pairs: [string, string][] = [];
				for (const [name, value] of Object.entries(
					query as Record<string, unknown>,
				)) {
					if (value !== undefined) pairs.push([name, String(value)]);
				}
				const outcome = await sentrySpan("files.download", async () => {
					return downloadAttachment(
						fileDeps,
						request,
						decodeURIComponent(key),
						new URLSearchParams(pairs),
					);
				});
				set.status = outcome.status;
				for (const [name, value] of Object.entries(outcome.headers)) {
					set.headers[name] = value;
				}
				if (typeof outcome.body !== "string") return outcome.body;
				return outcome.body;
			})
			.get("/api/v1/events", async ({ request, set }) => {
				for (const [key, value] of Object.entries(corsHeaders)) {
					set.headers[key] = value;
				}

				const token = request.headers
					.get("authorization")
					?.replace(/^Bearer\s+/i, "")
					.trim();
				const { resolveSession } = await import("./auth");
				if (!token || !(await resolveSession(db, token))) {
					set.status = 401;
					return { error: "Authentication is required." };
				}

				// The stream response carries its own SSE headers; CORS entries are
				// merged onto it so the browser sees one coherent header set.
				const response = createEventStreamResponse({
					bus: events,
					signal: request.signal,
				});
				for (const [key, value] of Object.entries(corsHeaders)) {
					response.headers.set(key, value);
				}
				return response;
			})
			.all("/api/auth/*", ({ request }) => auth.handler(request))
			// Shopify module raw HTTP surface: the webhook receiver and the
			// OAuth callback. Both read the request themselves — the receiver
			// needs the raw body (HMAC over unparsed bytes), so no framework
			// body schema is declared for it. GraphQL stays the only other
			// surface for this module. Registered after the lifecycle hooks
			// above so they apply to these routes too.
			.use(
				createShoptifyRoutes({
					db,
					config,
					events: deps.shoptifyEvents ?? createShoptifyEventBus(),
				}),
			)
			.onError(sentryOnError)
			.onAfterHandle(({ set }) => {
				if (set.status === undefined) set.status = 200;
			})
	);
}

/**
 * The GraphQL operation of a request, keyed by that request.
 *
 * The endpoint returns its failures in the body rather than throwing, so the
 * after-response hook is what records them — and by then the request body has
 * been read. The route records the operation here so the hook can name the
 * operation that failed.
 */
const graphqlOperations = new WeakMap<Request, string>();

/**
 * Record a GraphQL request that returned errors.
 *
 * Each entry's stable `extensions.code` is recorded beside the operation it
 * came from, so a client-visible failure can be traced to what the service
 * did. Only the versioned endpoint's failures are recorded here.
 */
function recordGraphQLFailure(
	logger: Logger,
	request: Request,
	status: number | string | undefined,
	responseValue: unknown,
): void {
	if (new URL(request.url).pathname !== "/api/v1/graphql") return;

	if (typeof responseValue !== "object" || responseValue === null) return;

	const errors = (responseValue as { errors?: unknown }).errors;
	if (!Array.isArray(errors) || errors.length === 0) return;

	const codes = errors
		.map((error) => {
			const code = (error as { extensions?: { code?: unknown } }).extensions
				?.code;
			return typeof code === "string" ? code : "UNKNOWN";
		})
		.join(",");
	const operation = graphqlOperations.get(request) ?? "(unknown)";
	logger.error(
		`graphql request failed: operation=${operation} ` +
			`status=${String(status)} codes=${codes}`,
	);
}

/**
 * Name the operation a GraphQL request carries.
 *
 * The client's `operationName` when it sent one; otherwise the first operation
 * definition's name, so an anonymous document is reported as such. The parse
 * is exact and happens only for a request that failed.
 */
function operationNameOf(payload: Record<string, unknown>): string {
	const sent = payload.operationName;
	if (typeof sent === "string" && sent.trim() !== "") return sent.trim();

	const query = payload.query;
	if (typeof query !== "string") return "(anonymous)";

	try {
		const document = parse(query);
		const operation = document.definitions.find(
			(definition) => definition.kind === Kind.OPERATION_DEFINITION,
		);
		const name = (operation as { name?: { value?: string } } | undefined)?.name
			?.value;
		return name && name !== "" ? name : "(anonymous)";
	} catch {
		return "(unparseable)";
	}
}

/**
 * The line that opens a run: what is listening, on which configuration.
 *
 * Port and environment, plus the locations the run depends on. The database
 * URL and the mail URL carry credentials, so only their locations appear —
 * never the URLs themselves, and never the auth secret.
 */
function describeStartup(config: AppConfig): string {
	return [
		`service listening on port ${config.port}`,
		`env=${config.env}`,
		`database=${describeLocation(config.databaseUrl)}`,
		`logDir=${config.logDir}`,
		`mail=${describeMailEndpoint(config.mailEndpoint)}`,
	].join(" ");
}

/** `postgres://user:password@host:5432/mes` is recorded as `host:5432/mes`. */
function describeLocation(url: string): string {
	try {
		const parsed = new URL(url);
		return `${parsed.host}${parsed.pathname}`;
	} catch {
		return "(unparsed)";
	}
}

function describeMailEndpoint(endpoint: MailEndpoint | null): string {
	if (!endpoint) return "unconfigured";
	const auth = endpoint.hasCredentials ? "authenticated" : "no credentials";
	return `${endpoint.host}:${endpoint.port} (${auth})`;
}

export async function bootstrap(): Promise<{
	app: ReturnType<typeof createService>;
	deps: ServiceDependencies;
}> {
	const config = loadConfig();
	assertConfig(config);

	// Built, and its directory created, before the service starts: an
	// unusable log directory must fail the run at startup rather than at the
	// first recorded event.
	const logging = createRunLogger(config);

	await runMigrations({ databaseUrl: config.databaseUrl });

	const db = createDatabase(config.databaseUrl);
	const auth = createAuth(db, config, { logging });
	const events = createChangeBus();
	// Verified Shopify webhooks fan out to the commerce domains (ingest →
	// customers → automation). One instance per service, like the change bus.
	const shoptifyEvents = createShoptifyEventBus();
	wireShoptifySubscriptions(shoptifyEvents, db, config);

	return {
		app: createService({ db, auth, config, events, shoptifyEvents, logging }),
		deps: { db, auth, config, events, shoptifyEvents, logging },
	};
}

/**
 * Build the service's logger from the resolved configuration.
 *
 * Every recorded line is redacted inside the logger, so a credential cannot
 * reach a sink even if a call site passes a raw string; the mail path already
 * passes an outcome that carries none.
 */
function createRunLogger(config: AppConfig): Logger {
	const file = createFileSink({
		directory: config.logDir,
		fileName: config.logFileName,
		maxBytes: config.logMaxBytes,
		keepFiles: config.logKeepFiles,
	});

	try {
		file.prepare();
	} catch (cause) {
		const reason = cause instanceof Error ? cause.message : String(cause);
		throw new ConfigurationError(
			`MES_LOG_DIR (${config.logDir}) is not usable: ${reason}`,
			["MES_LOG_DIR"],
		);
	}

	// A scrubber for an empty URL masks every character, so it is only built
	// when an endpoint is configured.
	const redact = config.mailEndpoint
		? createCredentialScrubber(config.mailEndpoint.url)
		: undefined;

	return createLogger({
		level: config.logLevel,
		terminal: (line, level) => {
			if (level === "error") console.error(line);
			else console.log(line);
		},
		file: (line) => file.write(line),
		...(redact ? { redact } : {}),
	});
}

if (import.meta.main) {
	const { app, deps } = await bootstrap();
	// Keep the high-churn session table bounded; runs on startup, not per request.
	await pruneExpiredSessions(deps.db);
	// The idle timeout must comfortably exceed the SSE heartbeat interval, or
	// Bun closes change-free streams mid-life (see events/stream.ts).
	// The startup line is recorded by the service's own start hook.
	app.listen({
		port: deps.config.port,
		idleTimeout: SERVER_IDLE_TIMEOUT_SECONDS,
	});
	// Inert unless enabled (environment or website) with a resolvable token:
	// the API serves identically either way, and a polling failure is logged
	// here instead of taking the service down.
	const bot = await startTelegramBot(deps);
	process.once("beforeExit", () => {
		// Drain the pool before the process exits so the container stops
		// cleanly and the database releases the connections immediately.
		void closeDatabase(deps.db);
		if (bot) void bot.stop();
	});
}
