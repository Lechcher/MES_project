/**
 * Permission + scope helpers.
 *
 * Both layers of the documented authorization model read from the same seeded
 * role/permission grants (mirroring the future backend):
 * - Layer 1 (app access) — {@link APP_ACCESS} / {@link canViewApp}.
 * - Layer 2 (view/action access) — {@link can} against a permission code.
 */

import type { ModuleCode, RoleCode, Scope, User } from "./types";

/** Data scope applied to list reads, per the access matrix. */
export const DATA_SCOPE_BY_ROLE: Record<RoleCode, Scope> = {
  SUPER_ADMIN: "ALL",
  TECH_LEAD: "ALL",
  HR_MANAGER: "COMPANY_WIDE",
  DEPT_HEAD: "DEPARTMENT_ONLY",
  EMPLOYEE: "PERSONAL",
};

/** A role may reach an app at a scope, at the user directory only, or not at all. */
export type AppAccess = Scope | "USER_DIRECTORY_ONLY" | "HIDDEN";

/** Layer-1 app access matrix (`API_CONTACT_SPECIFICATION.md` §4.5). */
export const APP_ACCESS: Record<ModuleCode, Record<RoleCode, AppAccess>> = {
  jobs: {
    SUPER_ADMIN: "ALL",
    TECH_LEAD: "ALL",
    HR_MANAGER: "COMPANY_WIDE",
    DEPT_HEAD: "DEPARTMENT_ONLY",
    EMPLOYEE: "PERSONAL",
  },
  planning: {
    SUPER_ADMIN: "ALL",
    TECH_LEAD: "ALL",
    HR_MANAGER: "COMPANY_WIDE",
    DEPT_HEAD: "DEPARTMENT_ONLY",
    EMPLOYEE: "PERSONAL",
  },
  performance: {
    SUPER_ADMIN: "ALL",
    TECH_LEAD: "ALL",
    HR_MANAGER: "COMPANY_WIDE",
    DEPT_HEAD: "DEPARTMENT_ONLY",
    EMPLOYEE: "PERSONAL",
  },
  settings: {
    SUPER_ADMIN: "ALL",
    TECH_LEAD: "ALL",
    HR_MANAGER: "USER_DIRECTORY_ONLY",
    DEPT_HEAD: "HIDDEN",
    EMPLOYEE: "HIDDEN",
  },
  "audit-log": {
    SUPER_ADMIN: "ALL",
    TECH_LEAD: "ALL",
    HR_MANAGER: "HIDDEN",
    DEPT_HEAD: "HIDDEN",
    EMPLOYEE: "HIDDEN",
  },
};

export function primaryRole(viewer: User | null): RoleCode | null {
  return viewer?.roles[0]?.code ?? null;
}

export function appAccessFor(viewer: User | null, app: ModuleCode): AppAccess {
  const role = primaryRole(viewer);
  if (!role) return "HIDDEN";
  return APP_ACCESS[app][role];
}

export function canViewApp(viewer: User | null, app: ModuleCode): boolean {
  return appAccessFor(viewer, app) !== "HIDDEN";
}

export function dataScopeFor(viewer: User | null): Scope {
  const role = primaryRole(viewer);
  return role ? DATA_SCOPE_BY_ROLE[role] : "PERSONAL";
}

/** Every permission code granted to any of the viewer's roles. */
export function viewerPermissionCodes(viewer: User | null): string[] {
  if (!viewer) return [];
  const codes = new Set<string>();
  for (const role of viewer.roles) {
    for (const permission of role.permissions) codes.add(permission.code);
  }
  return [...codes];
}

/** True when the viewer holds `permissionCode` via any of their roles. */
export function can(viewer: User | null, permissionCode: string): boolean {
  if (!viewer) return false;
  return viewer.roles.some((role) =>
    role.permissions.some((permission) => permission.code === permissionCode),
  );
}

/** True when the viewer holds at least one of the given permission codes. */
export function canAny(viewer: User | null, codes: string[]): boolean {
  return codes.some((code) => can(viewer, code));
}

type AppCode = Extract<
  ModuleCode,
  "jobs" | "planning" | "performance" | "settings" | "audit-log"
>;

/** The apps a role may open, in launcher order. The Audit Log app is out of scope. */
export const LAUNCHER_APPS: { code: AppCode; name: string; href: string }[] = [
  { code: "jobs", name: "Jobs & Projects", href: "/jobs" },
  { code: "planning", name: "Planning & Attendance", href: "/planning" },
  { code: "performance", name: "Performance & Audit", href: "/performance" },
  { code: "settings", name: "Settings & IAM", href: "/settings" },
];

/** Launcher entries the viewer may open. */
export function visibleLauncherApps(
  viewer: User | null,
): typeof LAUNCHER_APPS {
  return LAUNCHER_APPS.filter((app) => canViewApp(viewer, app.code));
}
