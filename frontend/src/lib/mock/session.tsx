/**
 * session.ts — viewer context provider and permission helper.
 *
 * Holds the current viewer (demo account) in React context. Sign-out clears it;
 * on reload the context initializes empty so the sign-in page shows again.
 * `can(viewer, permissionCode)` enforces the Layer-2 permission grants seeded
 * in db.ts, mirroring the future backend's authorization.
 */

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import type { User, Permission, RoleCode } from "./types";
import { DEMO_ACCOUNTS, permSetByRole, roleByCode } from "./db";

/*──────────────────────────── context ────────────────────────────────────────*/

interface SessionContextValue {
  viewer: User | null;
  setViewer: (user: User | null) => void;
  signOut: () => void;
  can: (permissionCode: string) => boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [viewer, setViewer] = useState<User | null>(null);

  const signOut = useCallback(() => {
    setViewer(null);
  }, []);

  const can = useCallback(
    (permissionCode: string): boolean => {
      if (!viewer) return false;
      return viewer.roles.some((role) => {
        const codes = permSetByRole[role.code as RoleCode];
        return Boolean(codes && codes.has(permissionCode));
      });
    },
    [viewer],
  );

  return (
    <SessionContext.Provider
      value={{ viewer, setViewer, signOut, can }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
}

/*──────────────────────────── helpers ────────────────────────────────────────*/

export function getDemoAccounts(): User[] {
  return DEMO_ACCOUNTS;
}

export function can(viewer: User | null, permissionCode: string): boolean {
  if (!viewer) return false;
  return viewer.roles.some((role) => {
    const codes = permSetByRole[role.code as RoleCode];
    return Boolean(codes && codes.has(permissionCode));
  });
}

export function scopeFor(moduleCode: string, viewer: User | null): string {
  if (!viewer) return "PERSONAL";
  const role = viewer.roles[0]?.code;
  switch (role) {
    case "SUPER_ADMIN":
      return "ALL";
    case "TECH_LEAD":
      return "ALL";
    case "HR_MANAGER":
      return moduleCode === "settings" ? "COMPANY_WIDE" : "COMPANY_WIDE";
    case "DEPT_HEAD":
      return "DEPARTMENT_ONLY";
    case "EMPLOYEE":
    default:
      return "PERSONAL";
  }
}
