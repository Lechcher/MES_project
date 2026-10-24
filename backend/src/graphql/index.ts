/**
 * GraphQL execution.
 *
 * A single versioned endpoint (`POST /api/v1/graphql`) with the standard
 * GraphQL-over-HTTP JSON envelope. The viewer is resolved from the bearer token
 * before execution; protected operations then enforce access themselves.
 */

import {
	type ExecutionResult,
	execute,
	GraphQLError,
	parse,
	validate,
} from "graphql";
import { sentrySpan } from "../lib/sentry";
import { type Auth, createAuth, resolveSession } from "../auth";
import type { AppConfig } from "../config";
import type { DatabaseHandle } from "../db";
import type { ChangeBus } from "../events/event-bus";
import { publishMutationAreas } from "./change-areas";
import {
	bearerTokenFrom,
	createContext,
	graphqlContextValue,
	type ViewerContext,
} from "./context";
import { DomainError, toGraphQLError } from "./errors";
import { makeExecutableSchema } from "./make-schema";

export interface GraphQLRequestInput {
	query: unknown;
	variables?: unknown;
	operationName?: unknown;
}

export interface ExecuteOptions {
	db: DatabaseHandle;
	config: AppConfig;
	request: Request;
	auth: Auth;
	/**
	 * Optional change bus. When present, a successful mutation publishes the
	 * areas it invalidated so open SSE streams can tell clients to refetch.
	 */
	events?: ChangeBus;
}

export const schema = makeExecutableSchema();

function asString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

export async function executeGraphQL(
	input: GraphQLRequestInput,
	options: ExecuteOptions,
): Promise<ExecutionResult> {
	const source = asString(input.query);
	if (source === null) {
		return {
			errors: [
				new GraphQLError(
					"The `query` field is required and must be a string.",
					{
						extensions: { code: "VALIDATION_FAILED" },
					},
				),
			],
		};
	}

	const variables =
		input.variables && typeof input.variables === "object"
			? (input.variables as Record<string, unknown>)
			: {};
	const operationName = asString(input.operationName) ?? undefined;

	const token = bearerTokenFrom(options.request);
	const resolved = token ? await resolveSession(options.db, token) : null;

	const ctx: ViewerContext = createContext({
		db: options.db,
		config: options.config,
		request: {
			ipAddress:
				options.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
				null,
			userAgent: options.request.headers.get("user-agent"),
		},
		viewer: resolved?.viewer ?? null,
		session: resolved?.session ?? null,
	});

	let document: ReturnType<typeof parse>;
	try {
		document = parse(source);
	} catch (error) {
		return { errors: [error as GraphQLError] };
	}

	const validationErrors = validate(schema, document);
	if (validationErrors.length > 0) {
		// A document the schema cannot satisfy is a client input problem.
		return {
			errors: validationErrors.map((error) =>
				error.extensions?.code
					? error
					: new GraphQLError(error.message, {
							nodes: error.nodes,
							source: error.source,
							positions: error.positions,
							extensions: { code: "VALIDATION_FAILED" },
						}),
			),
		};
	}

	try {
		const executed = await sentrySpan("graphql.execute", async () => {
			return execute({
				schema,
				document,
				contextValue: graphqlContextValue(ctx, options.auth),
				variableValues: variables,
				operationName,
			});
		});
		const result = normalizeErrorCodes(executed);
		// A successful mutation announces the areas it invalidated; queries,
		// parse/validation failures, and failed mutations stay silent.
		publishMutationAreas(result, {
			document,
			operationName,
			bus: options.events,
		});
		return result;
	} catch (error) {
		return { errors: [toGraphQLError(error)] };
	}
}

/**
 * Guarantee every error carries a stable `extensions.code`.
 *
 * Domain failures already map to a catalog code; anything else (a driver error,
 * an unexpected throw) is reported as `INTERNAL` so clients never have to infer
 * a code from a bare message.
 */
function normalizeErrorCodes(result: ExecutionResult): ExecutionResult {
	if (!result.errors?.length) return result;

	return {
		...result,
		errors: result.errors.map((error) => {
			if (error.extensions?.code) return error;

			// A domain failure thrown inside a resolver is wrapped by GraphQL.js,
			// which drops its code. Re-attach it from the original error.
			const original = error.originalError;
			if (original instanceof DomainError) return original.toGraphQLError();

			// A failure with no response path happened before field resolution —
			// a document or variable-input problem rather than a runtime fault.
			const code = error.path === undefined ? "VALIDATION_FAILED" : "INTERNAL";
			return new GraphQLError(error.message, {
				nodes: error.nodes,
				source: error.source,
				positions: error.positions,
				path: error.path,
				originalError: error.originalError ?? error,
				extensions: { ...error.extensions, code },
			});
		}),
	};
}

/** Build the auth instance used by both the resolver surface and the endpoint. */
export function createAuthFor(db: DatabaseHandle, config: AppConfig): Auth {
	return createAuth(db, config);
}
