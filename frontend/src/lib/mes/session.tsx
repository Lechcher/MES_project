"use client";

/**
 * Client-side data access: authenticated session plus query/mutation hooks.
 *
 * Screens read through `useQuery` and write through `useMutation`, so every app
 * surfaces loading, empty and error states uniformly, and a failed request is
 * shown as an actionable error rather than a silently empty screen.
 *
 * The session token itself is never exposed to the browser: `MesSessionProvider`
 * talks to the same-origin `/api/mes/session` route handler, which stores the
 * token in an httpOnly cookie.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { graphqlRequest } from "./client";
import { MesApiError, toMesApiError } from "./errors";
import { type LiveArea, useLiveController } from "./live";
import { subscribeLiveQuery } from "./live-subscription";

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

export const MES_SESSION_ENDPOINT = "/api/mes/session";

export interface MesViewer {
  id: string;
  userCode: string;
  fullName: string;
  email: string;
  department: { id: string; code: string; name: string } | null;
  roles: { code: string; name: string }[];
}

export const VIEWER_QUERY = /* GraphQL */ `
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

interface SessionState {
  viewer: MesViewer | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<MesViewer>;
  signOut(): Promise<void>;
  refresh(): Promise<MesViewer | null>;
}

const SessionContext = createContext<SessionState | null>(null);

async function sessionRequest<T>(
  method: "GET" | "POST" | "DELETE",
  body?: unknown,
): Promise<T | null> {
  const response = await fetch(MES_SESSION_ENDPOINT, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    credentials: "same-origin",
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401) return null;

  const payload = (await response.json().catch(() => ({}))) as {
    viewer?: T;
    error?: { message?: string; code?: string };
  };

  if (!response.ok) {
    throw new MesApiError(payload.error?.message ?? "Sign-in failed.", {
      code: payload.error?.code ?? "UNAUTHENTICATED",
    });
  }

  return (payload.viewer ?? null) as T | null;
}

export function MesSessionProvider({ children }: { children: ReactNode }) {
  const [viewer, setViewer] = useState<MesViewer | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const current = await sessionRequest<MesViewer>("GET");
    setViewer(current);
    return current;
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    sessionRequest<MesViewer>("GET")
      .then((current) => {
        if (active) setViewer(current);
      })
      .catch(() => {
        if (active) setViewer(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const next = await sessionRequest<MesViewer>("POST", { email, password });
      if (!next) {
        throw new MesApiError("Invalid email or password.", {
          code: "UNAUTHENTICATED",
        });
      }
      setViewer(next);
      return next;
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await sessionRequest<MesViewer>("DELETE");
    setViewer(null);
  }, []);

  const value = useMemo<SessionState>(
    () => ({ viewer, loading, signIn, signOut, refresh }),
    [viewer, loading, signIn, signOut, refresh],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useMesSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useMesSession must be used inside <MesSessionProvider>.");
  }
  return ctx;
}

export function useViewer(): MesViewer | null {
  return useMesSession().viewer;
}

/** The viewer's primary role code, or `null` before sign-in. */
export function useRoleCode(): string | null {
  const viewer = useViewer();
  return viewer?.roles[0]?.code ?? null;
}

/* ------------------------------------------------------------------ */
/* Queries and mutations                                               */
/* ------------------------------------------------------------------ */

export interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: MesApiError | null;
  refetch(): void;
}

export interface QueryOptions {
  enabled?: boolean;
  /**
   * Follow one domain area on the live change channel (see `./live`). When the
   * backend announces a change in that area — or the connection is
   * re-established — the query refetches through its existing refetch path.
   * Omit (or pass `null`) to keep the query on manual refresh only.
   */
  liveArea?: LiveArea | null;
}

/**
 * Run a GraphQL query and track its state.
 * Pass `null` as the query to skip execution (for example before sign-in).
 */
export function useQuery<T>(
  query: string | null,
  variables?: Record<string, unknown>,
  options: QueryOptions = {},
): QueryState<T> {
  const enabled = (options.enabled ?? true) && query !== null;
  const liveArea = options.liveArea ?? null;
  const live = useLiveController();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<MesApiError | null>(null);
  const [nonce, setNonce] = useState(0);
  // Compare variables by content, not object identity: an inline object literal
  // is a new reference on every render, but the serialized form is stable, so a
  // refetch happens only when the variables actually change.
  const serializedVariables = useMemo(
    () => JSON.stringify(variables ?? {}),
    [variables],
  );

  useEffect(() => {
    // `nonce` is the manual-refresh trigger: referencing it here documents that a
    // `refetch()` re-runs this effect even though the request itself is unchanged.
    void nonce;

    if (!enabled || !query) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    graphqlRequest<T>(query, {
      variables: JSON.parse(serializedVariables) as Record<string, unknown>,
      signal: controller.signal,
    })
      .then((result) => {
        setData(result);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const apiError = toMesApiError(cause);
        setError(apiError);
        setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [query, enabled, nonce, serializedVariables]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  // Live channel: a change in the subscribed area — or a reconnect catching up
  // on missed changes — refetches through the same nonce path above, so the
  // existing loading/error/abort semantics apply unchanged.
  useEffect(() => {
    if (!enabled) return;
    return subscribeLiveQuery({
      controller: live,
      area: liveArea,
      onChange: refetch,
    });
  }, [live, liveArea, enabled, refetch]);

  return { data, loading, error, refetch };
}

export interface MutationState<T> {
  data: T | null;
  loading: boolean;
  error: MesApiError | null;
  run(variables?: Record<string, unknown>): Promise<T>;
  reset(): void;
}

/** Run a GraphQL mutation on demand, surfacing its error for inline display. */
export function useMutation<T>(mutation: string): MutationState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<MesApiError | null>(null);

  const run = useCallback(
    async (variables?: Record<string, unknown>) => {
      setLoading(true);
      setError(null);
      try {
        const result = await graphqlRequest<T>(mutation, { variables });
        setData(result);
        return result;
      } catch (cause) {
        const apiError = toMesApiError(cause);
        setError(apiError);
        throw apiError;
      } finally {
        setLoading(false);
      }
    },
    [mutation],
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { data, loading, error, run, reset };
}
