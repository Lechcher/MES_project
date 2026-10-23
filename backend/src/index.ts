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
 * Configuration is validated at startup so a misconfigured service fails fast
 * with an actionable message.
 */

import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { type Auth, createAuth } from "./auth";
import { type AppConfig, assertConfig, loadConfig } from "./config";
import { createDatabase, type DatabaseHandle } from "./db";
import { runMigrations } from "./db/migrate";
import { exportArtifacts } from "./db/schema";
import { type ChangeBus, createChangeBus } from "./events/event-bus";
import { createEventStreamResponse } from "./events/stream";
import {
	downloadAttachment,
	type FileRouteDependencies,
	uploadAttachments,
} from "./files/attachments";
import { executeGraphQL } from "./graphql";
import { type AttachmentStore, createS3Store } from "./storage/s3";

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
	 * Object storage for ticket attachments. Injected so tests can supply the
	 * in-memory store; omitted means it is built from the configured storage.
	 */
	attachmentStore?: AttachmentStore | null;
}

export function createService(deps: ServiceDependencies) {
	const { db, auth, config, events } = deps;

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
	};

	return new Elysia({ name: "mes-backend" })
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
				const outcome = await uploadAttachments(fileDeps, request, form);
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
			const outcome = await downloadAttachment(
				fileDeps,
				request,
				decodeURIComponent(key),
				new URLSearchParams(pairs),
			);
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
		.onAfterHandle(({ set }) => {
			if (set.status === undefined) set.status = 200;
		});
}

export function bootstrap(): {
	app: ReturnType<typeof createService>;
	deps: ServiceDependencies;
} {
	const config = loadConfig();
	assertConfig(config);

	runMigrations({ databasePath: config.databasePath });

	const db = createDatabase(config.databasePath);
	const auth = createAuth(db, config);
	const events = createChangeBus();

	return {
		app: createService({ db, auth, config, events }),
		deps: { db, auth, config, events },
	};
}

if (import.meta.main) {
	const { app, deps } = bootstrap();
	app.listen(deps.config.port);
	console.log(
		`MES backend listening on http://localhost:${deps.config.port} (${deps.config.env})`,
	);
}
