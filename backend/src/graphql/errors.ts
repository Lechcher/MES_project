/**
 * Stable API error codes and constructors.
 *
 * Every failure surfaced to a client carries a `message` and a stable
 * machine-readable `extensions.code` from the contract's error catalog.
 */

import { GraphQLError } from "graphql";

export const ERROR_CODES = {
	UNAUTHENTICATED: "UNAUTHENTICATED",
	FORBIDDEN: "FORBIDDEN",
	NOT_FOUND: "NOT_FOUND",
	VALIDATION_FAILED: "VALIDATION_FAILED",
	CONFLICT: "CONFLICT",
	STATE_TRANSITION_INVALID: "STATE_TRANSITION_INVALID",
	RULE_VIOLATION: "RULE_VIOLATION",
	RATE_LIMITED: "RATE_LIMITED",
	INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

function build(
	code: ErrorCode,
	message: string,
	details?: Record<string, unknown>,
): GraphQLError {
	return new GraphQLError(message, {
		extensions: details === undefined ? { code } : { code, details },
	});
}

/** A domain failure that maps onto one catalog code. Thrown by domain services. */
export class DomainError extends Error {
	constructor(
		readonly code: ErrorCode,
		message: string,
		readonly details?: Record<string, unknown>,
	) {
		super(message);
		this.name = "DomainError";
	}

	toGraphQLError(): GraphQLError {
		return build(this.code, this.message, this.details);
	}
}

export const errors = {
	unauthenticated(message = "Authentication is required."): GraphQLError {
		return build(ERROR_CODES.UNAUTHENTICATED, message);
	},
	forbidden(message: string, details?: Record<string, unknown>): GraphQLError {
		return build(ERROR_CODES.FORBIDDEN, message, details);
	},
	notFound(message: string): GraphQLError {
		return build(ERROR_CODES.NOT_FOUND, message);
	},
	validation(message: string, details?: Record<string, unknown>): GraphQLError {
		return build(ERROR_CODES.VALIDATION_FAILED, message, details);
	},
	conflict(message: string): GraphQLError {
		return build(ERROR_CODES.CONFLICT, message);
	},
	stateTransition(message: string): GraphQLError {
		return build(ERROR_CODES.STATE_TRANSITION_INVALID, message);
	},
	ruleViolation(message: string): GraphQLError {
		return build(ERROR_CODES.RULE_VIOLATION, message);
	},
	rateLimited(message: string): GraphQLError {
		return build(ERROR_CODES.RATE_LIMITED, message);
	},
	internal(message: string): GraphQLError {
		return build(ERROR_CODES.INTERNAL, message);
	},
};

/** Re-throw domain errors as GraphQL errors, wrapping anything unknown as INTERNAL. */
export function toGraphQLError(error: unknown): GraphQLError {
	if (error instanceof GraphQLError) return error;
	if (error instanceof DomainError) return error.toGraphQLError();
	const message = error instanceof Error ? error.message : String(error);
	return errors.internal(message);
}
