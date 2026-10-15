"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { userById } from "./db";
import type { User } from "./types";
import { useMockVersion } from "./use-store";

/**
 * Viewer session held in React context and memory only.
 *
 * The session is deliberately ephemeral: it is never persisted, so a page
 * reload clears the viewer and returns to the sign-in page (per the app-shell
 * spec). The viewer is resolved from the store by id each render so account
 * edits are reflected.
 */
interface SessionValue {
  viewer: User | null;
  signIn: (user: User) => void;
  signOut: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  // Re-render the provider when the store changes so the viewer stays current.
  useMockVersion();
  const [viewerId, setViewerId] = useState<string | null>(null);
  const viewer = viewerId ? userById(viewerId) : null;

  const signIn = useCallback((user: User) => {
    setViewerId(user.id);
  }, []);
  const signOut = useCallback(() => {
    setViewerId(null);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ viewer, signIn, signOut }),
    [viewer, signIn, signOut],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}

export function useViewer(): User | null {
  return useSession().viewer;
}
