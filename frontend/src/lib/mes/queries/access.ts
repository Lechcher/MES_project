/**
 * Role and scope helpers derived from `API_CONTACT_SPECIFICATION.md` §4.
 *
 * The viewer's roles come from `useViewer()`; these helpers map a role code to
 * the Layer-1 app access, the Layer-2 actions, and the data scope the screens
 * must render. Screens hide what a role may not see rather than disabling it.
 */

import type { RoleCode } from "./types";

export const ROLE_CODES: RoleCode[] = [
  "SUPER_ADMIN",
  "TECH_LEAD",
  "HR_MANAGER",
  "DEPT_HEAD",
  "EMPLOYEE",
];

export type DataScope = "ALL" | "COMPANY_WIDE" | "DEPARTMENT_ONLY" | "PERSONAL";

export const DATA_SCOPE_BY_ROLE: Record<RoleCode, DataScope> = {
  SUPER_ADMIN: "ALL",
  TECH_LEAD: "ALL",
  HR_MANAGER: "COMPANY_WIDE",
  DEPT_HEAD: "DEPARTMENT_ONLY",
  EMPLOYEE: "PERSONAL",
};

export function dataScopeFor(role: RoleCode | null): DataScope {
  return role ? DATA_SCOPE_BY_ROLE[role] : "PERSONAL";
}

/** Roles that may both approve (`APP`) and return (`REJ`) a `PEN` ticket. */
const APPROVER_ROLES: RoleCode[] = [
  "SUPER_ADMIN",
  "TECH_LEAD",
  "HR_MANAGER",
  "DEPT_HEAD",
];

/** Roles that may cancel any in-scope ticket. */
const CANCELLER_ROLES: RoleCode[] = APPROVER_ROLES;

/** Roles that may create a ticket. */
const CREATOR_ROLES: RoleCode[] = APPROVER_ROLES;

/** Roles that may see Audit Tables 1 and 2 and the company ranking chart. */
const COMPANY_AUDIT_ROLES: RoleCode[] = [
  "SUPER_ADMIN",
  "TECH_LEAD",
  "HR_MANAGER",
];

function has(roles: RoleCode[], role: RoleCode | null): boolean {
  return role !== null && roles.includes(role);
}

/* ────────────────────────────── Jobs ────────────────────────────── */

export function canCreateTicket(role: RoleCode | null): boolean {
  return has(CREATOR_ROLES, role);
}

export function canApproveOrReturn(role: RoleCode | null): boolean {
  return has(APPROVER_ROLES, role);
}

/**
 * Cancel is offered to the approver roles and to an `EMPLOYEE` for their own
 * ticket only (API contract; see design decision 9).
 */
export function canCancelTicket(
  role: RoleCode | null,
  isOwnTicket: boolean,
): boolean {
  if (has(CANCELLER_ROLES, role)) return true;
  return role === "EMPLOYEE" && isOwnTicket;
}

/* ──────────────────────────── Planning ──────────────────────────── */

export function canSeeApprovalBoard(role: RoleCode | null): boolean {
  return role !== null && role !== "EMPLOYEE";
}

/**
 * Schedule writes (create, edit, move, duplicate, delete, import). Company-wide
 * planners write anywhere; a `DEPT_HEAD` only within their own department.
 * Pass the task's (or target row's) department to check a specific write.
 */
export function canWriteSchedule(
  role: RoleCode | null,
  viewerDepartmentId?: string | null,
  targetDepartmentId?: string | null,
): boolean {
  if (role === "DEPT_HEAD") {
    return (
      targetDepartmentId === undefined ||
      (Boolean(viewerDepartmentId) && targetDepartmentId === viewerDepartmentId)
    );
  }
  return has(APPROVER_ROLES, role);
}

/** `UAL`/`USL` penalty assignment is restricted to `SUPER_ADMIN` and `HR_MANAGER`. */
export function canAssignPenaltyLeave(role: RoleCode | null): boolean {
  return role === "SUPER_ADMIN" || role === "HR_MANAGER";
}

/** The company-wide calendar (with a department filter) vs a scoped calendar. */
export function seesCompanyCalendar(role: RoleCode | null): boolean {
  const scope = dataScopeFor(role);
  return scope === "ALL" || scope === "COMPANY_WIDE";
}

/* ─────────────────────────── Performance ────────────────────────── */

export function canSeeCompanyAudit(role: RoleCode | null): boolean {
  return has(COMPANY_AUDIT_ROLES, role);
}

export function canSeeDepartmentAudit(role: RoleCode | null): boolean {
  return has([...COMPANY_AUDIT_ROLES, "DEPT_HEAD"], role);
}

/* ──────────────────────────── Settings ──────────────────────────── */

export type SettingsMenu = "users" | "org" | "rbac" | "telegram" | "audit";

export const SETTINGS_MENU_LABELS: Record<SettingsMenu, string> = {
  users: "User Directory",
  org: "Org Structure",
  rbac: "RBAC",
  telegram: "Telegram Webhook",
  audit: "System Audit Logs",
};

/** Settings menus the role may access, in display order. */
export function settingsMenusFor(role: RoleCode | null): SettingsMenu[] {
  if (role === "SUPER_ADMIN" || role === "TECH_LEAD") {
    return ["users", "org", "rbac", "telegram", "audit"];
  }
  if (role === "HR_MANAGER") return ["users"];
  return [];
}

export function canViewSettingsApp(role: RoleCode | null): boolean {
  return settingsMenusFor(role).length > 0;
}

/* ──────────────────────────── Audit Log ─────────────────────────── */

export function canViewAuditLogApp(role: RoleCode | null): boolean {
  return role === "SUPER_ADMIN" || role === "TECH_LEAD";
}

/* ───────────────────────── Technical-role gate ───────────────────── */

/**
 * Roles whose work is technical administration.
 *
 * These are exactly the roles that reach the technical surfaces (Org
 * Structure, RBAC, System Audit Logs, the Audit Log app) — the places where
 * codes remain the record's content. Every other role reads the
 * natural-language view (see the `frontend/display-labels` capability).
 */
const TECHNICAL_ROLES: RoleCode[] = ["TECH_LEAD", "SUPER_ADMIN"];

export function isTechnicalViewer(role: RoleCode | null): boolean {
  return has(TECHNICAL_ROLES, role);
}

export const AUDIT_LOG_MODULES = [
  { code: "jobs", name: "Jobs & Projects" },
  { code: "planning", name: "Planning & Attendance" },
  { code: "performance", name: "Performance & Audit" },
  { code: "settings", name: "Settings & IAM" },
  { code: "audit-log", name: "Audit Log" },
] as const;
