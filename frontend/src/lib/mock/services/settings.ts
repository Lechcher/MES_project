/**
 * services/settings.ts — Settings & IAM mock service.
 *
 * User create/update/reset-password/deactivate, departments, role-permission
 * updates, app settings, webhook update, and the append-only system audit log
 * with filters. Mirrors API_CONTACT_SPECIFICATION.md §6.4.
 */

import type {
  User,
  Department,
  Role,
  Permission,
  SystemAuditLog,
  AppSetting,
  TelegramWebhookConfig,
  RoleCode,
} from "../types";
import {
  users,
  userById,
  userByCode,
  departments,
  deptByCode,
  roles,
  roleByCode,
  permissions,
  permByCode,
  permSetByRole,
  grants,
  systemAuditLogs,
  systemAuditLogsById,
  appSettings,
  appSettingsById,
  telegramWebhookConfig,
  id,
  iso,
  now,
} from "../db";

function requireActor(actor: User | null, allowed: RoleCode[]): User {
  if (!actor) throw new Error("UNAUTHENTICATED");
  if (!actor.roles.some((r) => allowed.includes(r.code as RoleCode))) {
    throw new Error("FORBIDDEN");
  }
  return actor;
}

function audit(
  actor: User | null,
  action: string,
  resourceType: string,
  resourceId: string | null,
  oldData: unknown,
  newData: unknown,
) {
  const entry: SystemAuditLog = {
    id: id(),
    user: actor ?? null,
    action,
    resourceType,
    resourceId,
    oldData: oldData as any,
    newData: newData as any,
    ipAddress: null,
    userAgent: null,
    createdAt: iso(now()),
  };
  systemAuditLogs.push(entry);
  systemAuditLogsById[entry.id] = entry;
  return entry;
}

/*──────────────────────────── users ──────────────────────────────────────────*/

export function listUsers(
  actor: User | null,
  filter: {
    departmentId?: string;
    roleCode?: RoleCode;
    isActive?: boolean;
    search?: string;
    offset?: number;
    limit?: number;
  } = {},
) {
  actor = requireActor(actor, ["SUPER_ADMIN", "TECH_LEAD", "HR_MANAGER"]);
  const { offset = 0, limit = 20 } = filter;
  let result = [...users].filter((u) => u.isActive !== false);
  if (filter.departmentId)
    result = result.filter((u) => u.department?.id === filter.departmentId);
  if (filter.roleCode)
    result = result.filter((u) => u.roles.some((r) => r.code === filter.roleCode));
  if (filter.isActive !== undefined)
    result = result.filter((u) => u.isActive === filter.isActive);
  if (filter.search) {
    const q = filter.search.toLowerCase();
    result = result.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.userCode.toLowerCase().includes(q),
    );
  }
  // scope: HR COMPANY_WIDE; SA/TL ALL (already all users)
  const scope = actor.roles[0]?.code;
  if (scope === "HR_MANAGER") {
    // HR sees company-wide (already all) — no further restriction
  }
  result.sort((a, b) => a.fullName.localeCompare(b.fullName));
  const page = result.slice(offset, offset + limit);
  return {
    nodes: page,
    pageInfo: { offset, limit, totalCount: result.length, hasNextPage: offset + page.length < result.length },
  };
}

export function getUser(actor: User | null, id: string): User | null {
  const u = userById[id];
  if (!u) return null;
  actor = requireActor(actor, ["SUPER_ADMIN", "TECH_LEAD", "HR_MANAGER", "DEPT_HEAD"]);
  const scope = actor.roles[0]?.code;
  if (scope === "EMPLOYEE" && u.id !== actor.id) return null;
  if (scope === "DEPT_HEAD" && u.department?.id !== actor.department?.id) return null;
  return u;
}

export function createUser(
  actor: User | null,
  input: {
    userCode: string;
    fullName: string;
    email: string;
    password: string;
    departmentId?: string;
    roleCodes: RoleCode[];
  },
): User {
  actor = requireActor(actor, ["SUPER_ADMIN", "HR_MANAGER"]);
  if (userByCode[input.userCode]) throw new Error("CONFLICT: userCode already exists");
  if (Object.values(userByCode).some((u) => u.email === input.email)) {
    throw new Error("CONFLICT: email already exists");
  }
  const department = input.departmentId
    ? departments.find((d) => d.id === input.departmentId) || null
    : null;
  const userRoles = input.roleCodes.map((c) => roleByCode[c]).filter(Boolean);
  const user: User = {
    id: id(),
    userCode: input.userCode,
    fullName: input.fullName,
    email: input.email,
    department,
    isActive: true,
    roles: userRoles,
    createdAt: iso(now()),
    updatedAt: iso(now()),
  };
  users.push(user);
  userById[user.id] = user;
  userByCode[user.userCode] = user;
  audit(actor, "USER_CREATE", "USER", user.id, null, { userCode: user.userCode, fullName: user.fullName });
  return user;
}

export function updateUser(
  actor: User | null,
  input: {
    id: string;
    fullName?: string;
    email?: string;
    departmentId?: string;
    roleCodes?: RoleCode[];
    isActive?: boolean;
  },
): User {
  actor = requireActor(actor, ["SUPER_ADMIN", "HR_MANAGER"]);
  const user = userById[input.id];
  if (!user) throw new Error("NOT_FOUND");
  const old = { ...user };
  if (input.fullName !== undefined) user.fullName = input.fullName;
  if (input.email !== undefined) user.email = input.email;
  if (input.departmentId !== undefined)
    user.department = departments.find((d) => d.id === input.departmentId) || null;
  if (input.roleCodes !== undefined)
    user.roles = input.roleCodes.map((c) => roleByCode[c]).filter(Boolean);
  if (input.isActive !== undefined) user.isActive = input.isActive;
  user.updatedAt = iso(now());
  audit(actor, "USER_UPDATE", "USER", user.id, old, {
    fullName: user.fullName,
    email: user.email,
    isActive: user.isActive,
  });
  return user;
}

export function resetUserPassword(actor: User | null, userId: string, newPassword: string): boolean {
  actor = requireActor(actor, ["SUPER_ADMIN", "HR_MANAGER"]);
  const user = userById[userId];
  if (!user) throw new Error("NOT_FOUND");
  audit(actor, "RESET_PASSWORD", "USER", userId, null, { reset: true });
  return true;
}

export function deactivateUser(actor: User | null, userId: string): User {
  actor = requireActor(actor, ["SUPER_ADMIN", "HR_MANAGER"]);
  const user = userById[userId];
  if (!user) throw new Error("NOT_FOUND");
  user.isActive = false;
  user.updatedAt = iso(now());
  audit(actor, "DEACTIVATE", "USER", userId, null, { isActive: false });
  return user;
}

/*──────────────────────────── departments ────────────────────────────────────*/

export function listDepartments(actor: User | null): Department[] {
  actor = requireActor(actor, ["SUPER_ADMIN", "TECH_LEAD", "HR_MANAGER", "DEPT_HEAD"]);
  const scope = actor.roles[0]?.code;
  let result = departments.filter((d) => d.isActive);
  if (scope === "DEPT_HEAD") {
    result = result.filter((d) => d.id === actor.department?.id);
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export function createDepartment(
  actor: User | null,
  input: {
    code: string;
    name: string;
    departmentType: "DEPARTMENT" | "DIVISION";
    parentId?: string;
    managerId?: string;
    autoForkingEnabled?: boolean;
  },
): Department {
  actor = requireActor(actor, ["SUPER_ADMIN", "TECH_LEAD"]);
  if (deptByCode[input.code]) throw new Error("CONFLICT: department code already exists");
  const parent = input.parentId ? departments.find((d) => d.id === input.parentId) || null : null;
  const manager = input.managerId ? userById[input.managerId] || null : null;
  const dept: Department = {
    id: id(),
    code: input.code,
    name: input.name,
    departmentType: input.departmentType,
    parent,
    manager,
    autoForkingEnabled: input.autoForkingEnabled ?? true,
    isActive: true,
    createdAt: iso(now()),
    updatedAt: iso(now()),
  };
  departments.push(dept);
  deptByCode[dept.code] = dept;
  audit(actor, "CREATE_DEPARTMENT", "DEPARTMENT", dept.id, null, { code: dept.code, name: dept.name });
  return dept;
}

export function updateDepartment(
  actor: User | null,
  input: {
    id: string;
    name?: string;
    parentId?: string;
    managerId?: string;
    autoForkingEnabled?: boolean;
    isActive?: boolean;
  },
): Department {
  actor = requireActor(actor, ["SUPER_ADMIN", "TECH_LEAD"]);
  const dept = departments.find((d) => d.id === input.id);
  if (!dept) throw new Error("NOT_FOUND");
  const old = { ...dept };
  if (input.name !== undefined) dept.name = input.name;
  if (input.parentId !== undefined)
    dept.parent = departments.find((d) => d.id === input.parentId) || null;
  if (input.managerId !== undefined)
    dept.manager = userById[input.managerId] || null;
  if (input.autoForkingEnabled !== undefined)
    dept.autoForkingEnabled = input.autoForkingEnabled;
  if (input.isActive !== undefined) dept.isActive = input.isActive;
  dept.updatedAt = iso(now());
  audit(actor, "UPDATE_DEPARTMENT", "DEPARTMENT", dept.id, old, {
    name: dept.name,
    autoForkingEnabled: dept.autoForkingEnabled,
  });
  return dept;
}

/*──────────────────────────── RBAC ───────────────────────────────────────────*/

export function listRoles(actor: User | null): Role[] {
  actor = requireActor(actor, ["SUPER_ADMIN", "TECH_LEAD"]);
  return roles;
}

export function listPermissions(actor: User | null): Permission[] {
  actor = requireActor(actor, ["SUPER_ADMIN", "TECH_LEAD"]);
  return permissions;
}

export function updateRolePermissions(
  actor: User | null,
  input: { roleId: string; permissionCodes: string[] },
): Role {
  actor = requireActor(actor, ["SUPER_ADMIN", "TECH_LEAD"]);
  const role = roles.find((r) => r.id === input.roleId);
  if (!role) throw new Error("NOT_FOUND");
  const oldPerms = role.permissions.map((p) => p.code);
  role.permissions = input.permissionCodes.map((c) => permByCode[c]).filter(Boolean);
  permSetByRole[role.code as RoleCode] = new Set(input.permissionCodes);
  audit(actor, "UPDATE_RBAC", "ROLE", role.id, oldPerms, role.permissions.map((p) => p.code));
  return role;
}

/*──────────────────────────── app settings & webhook ─────────────────────────*/

export function listAppSettings(actor: User | null, moduleCode?: string): AppSetting[] {
  actor = requireActor(actor, ["SUPER_ADMIN", "TECH_LEAD"]);
  let result = appSettings;
  if (moduleCode) result = result.filter((s) => s.moduleCode === moduleCode);
  return result;
}

export function updateAppSetting(
  actor: User | null,
  input: { moduleCode: string; key: string; value: unknown; isSecret?: boolean },
): AppSetting {
  actor = requireActor(actor, ["SUPER_ADMIN", "TECH_LEAD"]);
  const existing = appSettings.find((s) => s.moduleCode === input.moduleCode && s.key === input.key);
  const old = existing ? { ...existing } : null;
  if (existing) {
    existing.value = input.value;
    if (input.isSecret !== undefined) existing.isSecret = input.isSecret;
    existing.updatedAt = iso(now());
    audit(actor, "UPDATE_APP_SETTING", "APP_SETTING", existing.id, old, existing);
    return existing;
  }
  const setting: AppSetting = {
    id: id(),
    moduleCode: input.moduleCode,
    key: input.key,
    value: input.value,
    isSecret: input.isSecret ?? false,
    description: null,
    createdAt: iso(now()),
    updatedAt: iso(now()),
  };
  appSettings.push(setting);
  appSettingsById[setting.id] = setting;
  audit(actor, "CREATE_APP_SETTING", "APP_SETTING", setting.id, null, setting);
  return setting;
}

export function getTelegramWebhookConfig(actor: User | null): TelegramWebhookConfig {
  actor = requireActor(actor, ["SUPER_ADMIN", "TECH_LEAD"]);
  return telegramWebhookConfig;
}

export function updateTelegramWebhookConfig(
  actor: User | null,
  input: {
    botToken?: string;
    alertGroupChatId?: string;
    webhookUrl?: string;
    isEnabled?: boolean;
  },
): TelegramWebhookConfig {
  actor = requireActor(actor, ["SUPER_ADMIN", "TECH_LEAD"]);
  const old = { ...telegramWebhookConfig };
  if (input.botToken !== undefined) telegramWebhookConfig.botToken = input.botToken;
  if (input.alertGroupChatId !== undefined)
    telegramWebhookConfig.alertGroupChatId = input.alertGroupChatId;
  if (input.webhookUrl !== undefined) telegramWebhookConfig.webhookUrl = input.webhookUrl;
  if (input.isEnabled !== undefined) telegramWebhookConfig.isEnabled = input.isEnabled;
  audit(actor, "UPDATE_WEBHOOK", "WEBHOOK_CONFIG", "telegram", old, telegramWebhookConfig);
  return telegramWebhookConfig;
}

/*──────────────────────────── system audit log ───────────────────────────────*/

export function listSystemAuditLogs(
  actor: User | null,
  filter: {
    userId?: string;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    fromDate?: string;
    toDate?: string;
    offset?: number;
    limit?: number;
  } = {},
) {
  actor = requireActor(actor, ["SUPER_ADMIN", "TECH_LEAD"]);
  const { offset = 0, limit = 20 } = filter;
  let result = [...systemAuditLogs].sort(
    (a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""),
  );
  if (filter.userId) result = result.filter((l) => l.user?.id === filter.userId);
  if (filter.action) result = result.filter((l) => l.action === filter.action);
  if (filter.resourceType)
    result = result.filter((l) => l.resourceType === filter.resourceType);
  if (filter.fromDate) {
    const fromDate = filter.fromDate;
    result = result.filter((l) => l.createdAt >= fromDate);
  }
  if (filter.toDate) {
    const toDate = filter.toDate;
    result = result.filter((l) => l.createdAt <= toDate);
  }
  const page = result.slice(offset, offset + limit);
  return {
    nodes: page,
    pageInfo: { offset, limit, totalCount: result.length, hasNextPage: offset + page.length < result.length },
  };
}

export { grants, permSetByRole, roleByCode, permByCode };
