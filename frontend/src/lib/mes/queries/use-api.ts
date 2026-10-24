"use client";

/**
 * Query helpers layered on the fixed `useMesSession` hooks.
 *
 * `useApiQuery` wraps `useQuery` so a change to the variables re-runs the
 * operation. The fixed `useQuery` only re-runs when the query document, the
 * `enabled` flag, or its internal nonce change, so filtering and pagination
 * explicitly request a refetch when their variables change.
 *
 * `liveArea` passes straight through to `useQuery`'s live-channel subscription,
 * so a view opts into real-time updates with one option.
 */

import { useEffect, useRef } from "react";
import type { LiveArea } from "../live";
import { type QueryState, useQuery } from "../session";

export interface ApiQueryOptions {
  enabled?: boolean;
  liveArea?: LiveArea | null;
}

export function useApiQuery<T>(
  query: string | null,
  variables?: Record<string, unknown>,
  options: ApiQueryOptions = {},
): QueryState<T> {
  const { data, loading, error, refetch } = useQuery<T>(
    query,
    variables,
    options,
  );
  const key = JSON.stringify(variables ?? {});
  const seen = useRef<string | null>(null);

  useEffect(() => {
    if (seen.current === null) {
      seen.current = key;
      return;
    }
    if (seen.current === key) return;
    seen.current = key;
    refetch();
  }, [key, refetch]);

  return { data, loading, error, refetch };
}
