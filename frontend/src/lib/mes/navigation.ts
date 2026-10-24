/**
 * Role-aware app navigation for the shell.
 *
 * Mirrors the documented Layer-1 app access matrix
 * (`API_CONTACT_SPECIFICATION.md` §4.5) so the dashboard launcher and the top
 * navigation render exactly the apps a role may open. The API stays the
 * authority for data access; this module only decides what the shell offers.
 */

import type { MesViewer } from "./session";

export const MES_ROLE_CODES = [
  "SUPER_ADMIN",
  "TECH_LEAD",
  "HR_MANAGER",
  "DEPT_HEAD",
  "EMPLOYEE",
] as const;

export type MesRoleCode = (typeof MES_ROLE_CODES)[number];

export const MES_MODULE_CODES = [
  "jobs",
  "planning",
  "performance",
  "settings",
  "audit-log",
] as const;

export type MesModuleCode = (typeof MES_MODULE_CODES)[number];

/** A role may reach an app at a data scope, at the user directory only, or not at all. */
export type MesAppAccess =
  | "ALL"
  | "COMPANY_WIDE"
  | "DEPARTMENT_ONLY"
  | "PERSONAL"
  | "USER_DIRECTORY_ONLY"
  | "HIDDEN";

/** Layer-1 app access matrix (`API_CONTACT_SPECIFICATION.md` §4.5). */
export const MES_APP_ACCESS: Record<
  MesModuleCode,
  Record<MesRoleCode, MesAppAccess>
> = {
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

export interface MesAppDescriptor {
  code: MesModuleCode;
  /** Full name shown on the dashboard launcher. */
  name: string;
  /** Short label shown in the top navigation. */
  shortLabel: string;
  href: string;
  description: string;
}

/** Apps in launcher order; consumers filter this by the viewer's role. */
export const MES_APPS: MesAppDescriptor[] = [
  {
    code: "jobs",
    name: "Jobs & Projects",
    shortLabel: "Jobs",
    href: "/jobs",
    description: "Ticket lifecycle, progress, and acceptance.",
  },
  {
    code: "planning",
    name: "Planning & Attendance",
    shortLabel: "Planning",
    href: "/planning",
    description: "Matrix work calendar, attendance, and leave.",
  },
  {
    code: "performance",
    name: "Performance & Audit",
    shortLabel: "Performance",
    href: "/performance",
    description: "Personal KPI dashboard and audit tables.",
  },
  {
    code: "settings",
    name: "Settings & IAM",
    shortLabel: "Settings",
    href: "/settings",
    description: "IAM, RBAC, and system configuration.",
  },
  {
    code: "audit-log",
    name: "Audit Log",
    shortLabel: "Audit Log",
    href: "/audit-log",
    description: "Immutable system activity and per-module summaries.",
  },
];

function isRoleCode(value: string): value is MesRoleCode {
  return (MES_ROLE_CODES as readonly string[]).includes(value);
}

/** The viewer's primary role code, or `null` before sign-in. */
export function primaryRoleCode(viewer: MesViewer | null): MesRoleCode | null {
  const code = viewer?.roles[0]?.code;
  return code && isRoleCode(code) ? code : null;
}

export function appAccessFor(
  viewer: MesViewer | null,
  app: MesModuleCode,
): MesAppAccess {
  const role = primaryRoleCode(viewer);
  if (!role) return "HIDDEN";
  return MES_APP_ACCESS[app][role];
}

export function canViewApp(
  viewer: MesViewer | null,
  app: MesModuleCode,
): boolean {
  return appAccessFor(viewer, app) !== "HIDDEN";
}

/** Launcher description, specialised for HR's user-directory-only Settings. */
export function appDescriptionFor(
  viewer: MesViewer | null,
  app: MesAppDescriptor,
): string {
  if (
    app.code === "settings" &&
    appAccessFor(viewer, "settings") === "USER_DIRECTORY_ONLY"
  ) {
    return "User Directory only.";
  }
  return app.description;
}

/** The apps the viewer may open, in launcher order. */
export function visibleApps(viewer: MesViewer | null): MesAppDescriptor[] {
  return MES_APPS.filter((app) => canViewApp(viewer, app.code));
}
