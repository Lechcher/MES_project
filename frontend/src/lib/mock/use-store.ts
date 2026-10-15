"use client";

import { useSyncExternalStore } from "react";
import { getServerVersion, getVersion, subscribe } from "./db";

/**
 * Subscribe a component to the mock store so it re-renders after any mutation.
 * The returned number changes on every mutation; reading it (even ignoring the
 * value) is what registers the subscription.
 */
export function useMockVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getServerVersion);
}
