/**
 * Typed GraphQL client for the authenticated MES API.
 *
 * The browser never holds the session token: requests go to the same-origin
 * route handler at `/api/mes/graphql`, which attaches the `Authorization`
 * header from an httpOnly cookie and forwards to `POST /api/v1/graphql`.
 */

import { type GraphQLErrorShape, MesApiError } from "./errors";

export const MES_GRAPHQL_ENDPOINT = "/api/mes/graphql";

interface GraphQLEnvelope<T> {
  data?: T | null;
  errors?: GraphQLErrorShape[];
}

export interface GraphQLRequestOptions {
  variables?: Record<string, unknown>;
  operationName?: string;
  signal?: AbortSignal;
}

/**
 * Execute a GraphQL operation.
 *
 * Resolves with `data` when the operation succeeds. Throws `MesApiError` when
 * the API returns errors — including partial failures, so callers never render
 * a half-populated screen as if it were complete.
 */
export async function graphqlRequest<T>(
  query: string,
  options: GraphQLRequestOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(MES_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        query,
        variables: options.variables ?? {},
        operationName: options.operationName,
      }),
      signal: options.signal,
    });
  } catch (error) {
    throw new MesApiError("Unable to reach the MES API.", {
      code: "INTERNAL",
      cause: error,
    });
  }

  if (response.status === 401) {
    throw new MesApiError("Your session has expired.", {
      code: "UNAUTHENTICATED",
    });
  }

  let envelope: GraphQLEnvelope<T>;
  try {
    envelope = (await response.json()) as GraphQLEnvelope<T>;
  } catch (error) {
    throw new MesApiError(
      `The MES API returned a malformed response (${response.status}).`,
      { code: "INTERNAL", cause: error },
    );
  }

  const firstError = envelope.errors?.[0];
  if (firstError) {
    throw new MesApiError(firstError.message, {
      code: firstError.extensions?.code,
      details: firstError.extensions?.details,
      errors: envelope.errors,
    });
  }

  if (!response.ok) {
    throw new MesApiError(`The MES API returned ${response.status}.`, {
      code: "INTERNAL",
    });
  }

  if (envelope.data === undefined || envelope.data === null) {
    throw new MesApiError("The MES API returned no data.", {
      code: "INTERNAL",
    });
  }

  return envelope.data;
}
