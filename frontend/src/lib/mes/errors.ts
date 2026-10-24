/**
 * GraphQL error surface.
 *
 * The API returns stable machine-readable codes in `extensions.code`; this
 * module turns the raw envelope into a typed error the UI can act on. Failures
 * are surfaced to the user — never silently replaced with fixture data.
 */

export interface GraphQLErrorExtension {
  code?: string;
  details?: unknown;
}

export interface GraphQLErrorShape {
  message: string;
  path?: (string | number)[];
  extensions?: GraphQLErrorExtension;
}

export const MES_ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "CONFLICT",
  "STATE_TRANSITION_INVALID",
  "RULE_VIOLATION",
  "RATE_LIMITED",
  "INTERNAL",
] as const;

export type MesErrorCode = (typeof MES_ERROR_CODES)[number];

export class MesApiError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly errors: GraphQLErrorShape[];

  constructor(
    message: string,
    options: {
      code?: string;
      details?: unknown;
      errors?: GraphQLErrorShape[];
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "MesApiError";
    this.code = options.code ?? "INTERNAL";
    this.details = options.details;
    this.errors = options.errors ?? [];
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }

  get isUnauthenticated(): boolean {
    return this.code === "UNAUTHENTICATED";
  }

  get isForbidden(): boolean {
    return this.code === "FORBIDDEN";
  }

  /** A message suitable for rendering in an inline error state. */
  get displayMessage(): string {
    switch (this.code) {
      case "UNAUTHENTICATED":
        return "Your session has expired. Please sign in again.";
      case "FORBIDDEN":
        return this.message || "You do not have access to this action.";
      case "NOT_FOUND":
        return "That record no longer exists or is outside your scope.";
      case "VALIDATION_FAILED":
        return this.message || "Please check the values you entered.";
      case "STATE_TRANSITION_INVALID":
        return (
          this.message || "That action is not allowed in the current state."
        );
      case "RULE_VIOLATION":
        return this.message || "A required rule was not satisfied.";
      case "CONFLICT":
        return this.message || "That change conflicts with the current data.";
      case "RATE_LIMITED":
        return "Too many requests. Please try again shortly.";
      default:
        return this.message || "Something went wrong. Please try again.";
    }
  }
}

/** Normalize an unknown thrown value into a `MesApiError`. */
export function toMesApiError(error: unknown): MesApiError {
  if (error instanceof MesApiError) return error;
  if (error instanceof Error) {
    return new MesApiError(error.message, { cause: error });
  }
  return new MesApiError(String(error));
}
