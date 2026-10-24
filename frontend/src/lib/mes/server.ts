/**
 * Server-side MES API access for the same-origin route handlers.
 *
 * The browser never holds the session token. Only the `app/api/mes/**` route
 * handlers import this module; they read the token from an httpOnly cookie and
 * attach it to the outbound backend request. That keeps the
 * `Authorization: Bearer <token>` credential on the server.
 */

export const MES_API_URL = (
  process.env.MES_API_URL ?? "http://localhost:3001"
).replace(/\/+$/, "");

export const MES_GRAPHQL_URL = `${MES_API_URL}/api/v1/graphql`;

/** The backend's SSE change-event stream, reached through the same proxy hop. */
export const MES_EVENTS_URL = `${MES_API_URL}/api/v1/events`;

/** Name of the httpOnly cookie that carries the backend session token. */
export const MES_SESSION_COOKIE = "mes_session";

export interface BackendGraphQLError {
  message: string;
  path?: (string | number)[];
  extensions?: { code?: string; details?: unknown };
}

interface GraphQLEnvelope<T> {
  data?: T | null;
  errors?: BackendGraphQLError[];
}

export interface BackendGraphQLResult<T> {
  /** True when the backend answered successfully with data and no errors. */
  ok: boolean;
  status: number;
  data: T | null;
  errors: BackendGraphQLError[];
  errorCode: string | null;
  errorMessage: string | null;
}

export interface GraphQLCall {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
  token?: string | null;
  signal?: AbortSignal;
}

/**
 * POST a GraphQL operation to the backend and return the raw response so a
 * proxy route can relay it verbatim. Network failures resolve to `null` rather
 * than throwing, so callers can choose an explicit HTTP status.
 */
export async function postToBackend(
  call: GraphQLCall,
): Promise<{ status: number; body: string; contentType: string } | null> {
  try {
    const response = await fetch(MES_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(call.token ? { authorization: `Bearer ${call.token}` } : {}),
      },
      body: JSON.stringify({
        query: call.query,
        variables: call.variables ?? {},
        operationName: call.operationName,
      }),
      cache: "no-store",
      signal: call.signal,
    });

    return {
      status: response.status,
      body: await response.text(),
      contentType: response.headers.get("content-type") ?? "application/json",
    };
  } catch {
    return null;
  }
}

/**
 * Execute a GraphQL operation and parse the JSON envelope into a typed result.
 * Password and session failures map onto the backend's stable error codes so
 * the session route can translate them into an HTTP status.
 */
export async function callBackendGraphQL<T>(
  call: GraphQLCall,
): Promise<BackendGraphQLResult<T>> {
  const raw = await postToBackend(call);
  if (raw === null) {
    return {
      ok: false,
      status: 502,
      data: null,
      errors: [],
      errorCode: "INTERNAL",
      errorMessage: "Unable to reach the MES API.",
    };
  }

  let envelope: GraphQLEnvelope<T> | null = null;
  try {
    envelope = JSON.parse(raw.body) as GraphQLEnvelope<T>;
  } catch {
    return {
      ok: false,
      status: raw.status,
      data: null,
      errors: [],
      errorCode: "INTERNAL",
      errorMessage: "The MES API returned a malformed response.",
    };
  }

  const errors = envelope?.errors ?? [];
  const first = errors[0];

  return {
    ok: raw.status >= 200 && raw.status < 300 && errors.length === 0,
    status: raw.status,
    data: envelope?.data ?? null,
    errors,
    errorCode: first?.extensions?.code ?? null,
    errorMessage: first?.message ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Operations used by the session route                               */
/* ------------------------------------------------------------------ */

export const MES_SERVER_VIEWER_QUERY = /* GraphQL */ `
  query Viewer {
    viewer {
      user {
        id
        userCode
        fullName
        email
        department {
          id
          code
          name
        }
        roles {
          code
          name
        }
      }
      session {
        id
        expiresAt
      }
    }
  }
`;

export const MES_LOGIN_MUTATION = /* GraphQL */ `
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      session {
        id
        token
        expiresAt
      }
      viewer {
        user {
          id
          userCode
          fullName
          email
          department {
            id
            code
            name
          }
          roles {
            code
            name
          }
        }
        session {
          id
          expiresAt
        }
      }
    }
  }
`;

export const MES_LOGOUT_MUTATION = /* GraphQL */ `
  mutation Logout {
    logout
  }
`;

/** The user shape returned by `viewer.user` and `login.viewer.user`. */
export interface MesViewerUser {
  id: string;
  userCode: string;
  fullName: string;
  email: string;
  department: { id: string; code: string; name: string } | null;
  roles: { code: string; name: string }[];
}

export interface MesLoginResult {
  login: {
    session: { id: string; token: string; expiresAt: string };
    viewer: { user: MesViewerUser };
  };
}

export interface MesViewerQueryResult {
  viewer: { user: MesViewerUser } | null;
}
