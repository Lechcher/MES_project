/**
 * Settings & IAM mock service — user directory, org structure with Auto-forking,
 * RBAC, Telegram webhook configuration, and the read-only system audit trail.
 * Mirrors `API_CONTACT_SPECIFICATION.md` §6.4. Every write appends an audit entry.
 */

import { nextId, state } from "../db";
import { primaryRole } from "../permissions";
import type {
  AppSetting,
  AuditLogFilter,
  Connection,
  CreateDepartmentInput,
  CreateUserInput,
  Department,
  ModuleCode,
  Notification,
  Permission,
  Role,
  RoleCode,
  SystemAuditLog,
  TelegramWebhookConfig,
  UpdateDepartmentInput,
  UpdateRolePermissionsInput,
  UpdateTelegramWebhookConfigInput,
  UpdateUserInput,
  User,
  UserFilter,
} from "../types";
import { MockError } from "../types";
import {
  appendAudit,
  nowIso,
  paginate,
  requirePermission,
  requireRole,
  requireViewer,
  userInScope,
  visibleUsers,
} from "./shared";

/* -------------------------------------------------------------------------- */
/* User directory                                                             */
/* -------------------------------------------------------------------------- */

export function users(
  viewer: User | null,
  filter: UserFilter = {},
  offset = 0,
  limit = 20,
): Connection<User> {
  requireRole(
    viewer,
    ["SUPER_ADMIN", "TECH_LEAD", "HR_MANAGER"],
    "You do not have permission to view the user directory.",
  );
  let items = [...state.users];
  if (filter.departmentId)
    items = items.filter((u) => u.departmentId === filter.departmentId);
  if (filter.roleCode)
    items = items.filter((u) =>
      u.roles.some((r) => r.code === filter.roleCode),
    );
  if (filter.isActive !== undefined)
    items = items.filter((u) => u.isActive === filter.isActive);
  if (filter.search) {
    const q = filter.search.toLowerCase();
    items = items.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.userCode.toLowerCase().includes(q),
    );
  }
  items.sort((a, b) => a.fullName.localeCompare(b.fullName));
  return paginate(items, offset, limit);
}

export function user(viewer: User | null, id: string): User | null {
  const found = state.users.find((u) => u.id === id);
  if (!found || !userInScope(viewer, found)) return null;
  return found;
}

function resolveRoles(roleCodes: RoleCode[]): Role[] {
  return roleCodes
    .map((code) => state.roles.find((r) => r.code === code))
    .filter((r): r is Role => r !== undefined);
}

export function createUser(
  viewer: User | null,
  input: CreateUserInput,
): User {
  const actor = requirePermission(
    viewer,
    "settings.users.manage",
    "You do not have permission to create users.",
  );
  if (state.users.some((u) => u.userCode === input.userCode)) {
    throw new MockError("CONFLICT", `The user code ${input.userCode} already exists.`);
  }
  if (state.users.some((u) => u.email === input.email)) {
    throw new MockError("CONFLICT", `The email ${input.email} already exists.`);
  }
  const roles = resolveRoles(input.roleCodes);
  if (roles.length === 0) {
    throw new MockError("VALIDATION_FAILED", "At least one valid role is required.");
  }
  const created: User = {
    id: nextId("user"),
    userCode: input.userCode,
    fullName: input.fullName,
    email: input.email,
    departmentId: input.departmentId ?? null,
    department:
      state.departments.find((d) => d.id === input.departmentId) ?? null,
    isActive: true,
    roles,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  state.users.push(created);
  appendAudit(actor, {
    moduleCode: "settings",
    action: "USER_CREATE",
    resourceType: "USER",
    resourceId: created.id,
    newData: {
      userCode: created.userCode,
      email: created.email,
      roleCodes: input.roleCodes,
    },
  });
  return created;
}

export function updateUser(
  viewer: User | null,
  input: UpdateUserInput,
): User {
  const actor = requirePermission(
    viewer,
    "settings.users.manage",
    "You do not have permission to update users.",
  );
  const target = state.users.find((u) => u.id === input.id);
  if (!target) throw new MockError("NOT_FOUND", "The user was not found.");
  const old = {
    fullName: target.fullName,
    email: target.email,
    departmentId: target.departmentId,
    roleCodes: target.roles.map((r) => r.code),
    isActive: target.isActive,
  };
  if (input.fullName !== undefined) target.fullName = input.fullName;
  if (input.email !== undefined) target.email = input.email;
  if (input.departmentId !== undefined) {
    target.departmentId = input.departmentId;
    target.department =
      state.departments.find((d) => d.id === input.departmentId) ?? null;
  }
  if (input.isActive !== undefined) target.isActive = input.isActive;
  if (input.roleCodes !== undefined) {
    const roles = resolveRoles(input.roleCodes);
    if (roles.length > 0) target.roles = roles;
  }
  target.updatedAt = nowIso();
  appendAudit(actor, {
    moduleCode: "settings",
    action: "USER_UPDATE",
    resourceType: "USER",
    resourceId: target.id,
    oldData: old,
    newData: {
      fullName: target.fullName,
      email: target.email,
      departmentId: target.departmentId,
      roleCodes: target.roles.map((r) => r.code),
      isActive: target.isActive,
    },
  });
  return target;
}

export function resetUserPassword(
  viewer: User | null,
  userId: string,
  _newPassword: string,
): boolean {
  const actor = requirePermission(
    viewer,
    "settings.users.manage",
    "You do not have permission to reset passwords.",
  );
  const target = state.users.find((u) => u.id === userId);
  if (!target) throw new MockError("NOT_FOUND", "The user was not found.");
  appendAudit(actor, {
    moduleCode: "settings",
    action: "PASSWORD_RESET",
    resourceType: "USER",
    resourceId: target.id,
  });
  return true;
}

export function deactivateUser(viewer: User | null, userId: string): User {
  const actor = requirePermission(
    viewer,
    "settings.users.manage",
    "You do not have permission to deactivate users.",
  );
  const target = state.users.find((u) => u.id === userId);
  if (!target) throw new MockError("NOT_FOUND", "The user was not found.");
  target.isActive = false;
  target.updatedAt = nowIso();
  appendAudit(actor, {
    moduleCode: "settings",
    action: "USER_LOCK",
    resourceType: "USER",
    resourceId: target.id,
    oldData: { isActive: true },
    newData: { isActive: false },
  });
  return target;
}

/* -------------------------------------------------------------------------- */
/* Org structure                                                              */
/* -------------------------------------------------------------------------- */

export function departments(viewer: User | null): Department[] {
  const actor = requireRole(
    viewer,
    ["SUPER_ADMIN", "TECH_LEAD", "HR_MANAGER", "DEPT_HEAD"],
    "You do not have permission to view the org structure.",
  );
  if (primaryRole(actor) === "DEPT_HEAD") {
    return state.departments.filter((d) => d.id === actor.departmentId);
  }
  return [...state.departments];
}

export function createDepartment(
  viewer: User | null,
  input: CreateDepartmentInput,
): Department {
  const actor = requireRole(
    viewer,
    ["SUPER_ADMIN", "TECH_LEAD"],
    "You do not have permission to manage the org structure.",
  );
  if (state.departments.some((d) => d.code === input.code)) {
    throw new MockError("CONFLICT", `The department code ${input.code} already exists.`);
  }
  const created: Department = {
    id: nextId("dept"),
    code: input.code,
    name: input.name,
    departmentType: input.departmentType,
    parentId: input.parentId ?? null,
    parent: state.departments.find((d) => d.id === input.parentId) ?? null,
    managerId: input.managerId ?? null,
    manager: state.users.find((u) => u.id === input.managerId) ?? null,
    autoForkingEnabled: input.autoForkingEnabled ?? true,
    isActive: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  state.departments.push(created);
  appendAudit(actor, {
    moduleCode: "settings",
    action: "DEPARTMENT_CREATE",
    resourceType: "DEPARTMENT",
    resourceId: created.id,
    newData: { code: created.code, name: created.name },
  });
  return created;
}

export function updateDepartment(
  viewer: User | null,
  input: UpdateDepartmentInput,
): Department {
  const actor = requireRole(
    viewer,
    ["SUPER_ADMIN", "TECH_LEAD"],
    "You do not have permission to manage the org structure.",
  );
  const target = state.departments.find((d) => d.id === input.id);
  if (!target) throw new MockError("NOT_FOUND", "The department was not found.");
  const old = {
    name: target.name,
    parentId: target.parentId,
    managerId: target.managerId,
    autoForkingEnabled: target.autoForkingEnabled,
    isActive: target.isActive,
  };
  if (input.name !== undefined) target.name = input.name;
  if (input.parentId !== undefined) {
    target.parentId = input.parentId;
    target.parent = state.departments.find((d) => d.id === input.parentId) ?? null;
  }
  if (input.managerId !== undefined) {
    target.managerId = input.managerId;
    target.manager = state.users.find((u) => u.id === input.managerId) ?? null;
  }
  if (input.autoForkingEnabled !== undefined)
    target.autoForkingEnabled = input.autoForkingEnabled;
  if (input.isActive !== undefined) target.isActive = input.isActive;
  target.updatedAt = nowIso();
  appendAudit(actor, {
    moduleCode: "settings",
    action: "DEPARTMENT_UPDATE",
    resourceType: "DEPARTMENT",
    resourceId: target.id,
    oldData: old,
    newData: {
      name: target.name,
      parentId: target.parentId,
      managerId: target.managerId,
      autoForkingEnabled: target.autoForkingEnabled,
      isActive: target.isActive,
    },
  });
  return target;
}

/* -------------------------------------------------------------------------- */
/* RBAC                                                                       */
/* -------------------------------------------------------------------------- */

export function roles(viewer: User | null): Role[] {
  requirePermission(
    viewer,
    "settings.rbac.manage",
    "You do not have permission to view RBAC roles.",
  );
  return [...state.roles];
}

export function permissions(viewer: User | null): Permission[] {
  requirePermission(
    viewer,
    "settings.rbac.manage",
    "You do not have permission to view permissions.",
  );
  return [...state.permissions];
}

export function updateRolePermissions(
  viewer: User | null,
  input: UpdateRolePermissionsInput,
): Role {
  const actor = requirePermission(
    viewer,
    "settings.rbac.manage",
    "You do not have permission to manage RBAC authorization.",
  );
  const role = state.roles.find((r) => r.id === input.roleId);
  if (!role) throw new MockError("NOT_FOUND", "The role was not found.");
  const oldCodes = role.permissions.map((p) => p.code);
  const granted = state.permissions.filter((p) =>
    input.permissionCodes.includes(p.code),
  );
  role.permissions = granted;
  role.updatedAt = nowIso();

  // Rebuild the grant table for this role.
  state.rolePermissions = state.rolePermissions.filter(
    (g) => g.roleId !== role.id,
  );
  for (const permission of granted) {
    state.rolePermissions.push({
      roleId: role.id,
      permissionId: permission.id,
      grantedAt: nowIso(),
    });
  }

  appendAudit(actor, {
    moduleCode: "settings",
    action: "PERMISSION_CHANGE",
    resourceType: "PERMISSION",
    resourceId: role.id,
    oldData: { granted: oldCodes },
    newData: { granted: input.permissionCodes },
  });
  return role;
}

/* -------------------------------------------------------------------------- */
/* Audit trail (read-only, append-only)                                       */
/* -------------------------------------------------------------------------- */

export function systemAuditLogs(
  viewer: User | null,
  filter: AuditLogFilter = {},
  offset = 0,
  limit = 20,
): Connection<SystemAuditLog> {
  requireRole(
    viewer,
    ["SUPER_ADMIN", "TECH_LEAD"],
    "You do not have permission to view the system audit trail.",
  );
  let items = [...state.systemAuditLogs];
  if (filter.userId) items = items.filter((l) => l.user?.id === filter.userId);
  if (filter.action) items = items.filter((l) => l.action === filter.action);
  if (filter.resourceType)
    items = items.filter((l) => l.resourceType === filter.resourceType);
  if (filter.resourceId)
    items = items.filter((l) => l.resourceId === filter.resourceId);
  if (filter.fromDate)
    items = items.filter((l) => l.createdAt >= filter.fromDate!);
  if (filter.toDate) items = items.filter((l) => l.createdAt <= filter.toDate!);
  items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return paginate(items, offset, limit);
}

/* -------------------------------------------------------------------------- */
/* App settings + webhook                                                     */
/* -------------------------------------------------------------------------- */

export function appSettings(
  viewer: User | null,
  moduleCode?: ModuleCode,
): AppSetting[] {
  requireRole(
    viewer,
    ["SUPER_ADMIN", "TECH_LEAD"],
    "You do not have permission to view app settings.",
  );
  const items = moduleCode
    ? state.appSettings.filter((s) => s.moduleCode === moduleCode)
    : state.appSettings;
  return [...items];
}

export function updateAppSetting(
  viewer: User | null,
  input: { moduleCode: ModuleCode; key: string; value: unknown; isSecret?: boolean },
): AppSetting {
  const actor = requireRole(
    viewer,
    ["SUPER_ADMIN", "TECH_LEAD"],
    "You do not have permission to update app settings.",
  );
  const existing = state.appSettings.find(
    (s) => s.moduleCode === input.moduleCode && s.key === input.key,
  );
  if (existing) {
    existing.value = input.value;
    if (input.isSecret !== undefined) existing.isSecret = input.isSecret;
    existing.updatedAt = nowIso();
    appendAudit(actor, {
      moduleCode: "settings",
      action: "APP_SETTING_UPDATE",
      resourceType: "APP_SETTING",
      resourceId: existing.id,
      newData: { moduleCode: input.moduleCode, key: input.key, value: input.value },
    });
    return existing;
  }
  const created: AppSetting = {
    id: nextId("set"),
    moduleCode: input.moduleCode,
    key: input.key,
    value: input.value,
    isSecret: input.isSecret ?? false,
    description: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  state.appSettings.push(created);
  appendAudit(actor, {
    moduleCode: "settings",
    action: "APP_SETTING_UPDATE",
    resourceType: "APP_SETTING",
    resourceId: created.id,
    newData: { moduleCode: input.moduleCode, key: input.key, value: input.value },
  });
  return created;
}

export function telegramWebhookConfig(
  viewer: User | null,
): TelegramWebhookConfig {
  requireRole(
    viewer,
    ["SUPER_ADMIN", "TECH_LEAD"],
    "You do not have permission to view the webhook configuration.",
  );
  return { ...state.telegramWebhookConfig };
}

export function updateTelegramWebhookConfig(
  viewer: User | null,
  input: UpdateTelegramWebhookConfigInput,
): TelegramWebhookConfig {
  const actor = requirePermission(
    viewer,
    "settings.webhook.manage",
    "You do not have permission to manage the webhook configuration.",
  );
  const old = { ...state.telegramWebhookConfig };
  state.telegramWebhookConfig = {
    ...state.telegramWebhookConfig,
    ...input,
  };
  // Keep the app_settings mirror in sync.
  const mirror = state.appSettings.find(
    (s) => s.moduleCode === "settings" && s.key === "telegram.alert_group_chat_id",
  );
  if (mirror && input.alertGroupChatId !== undefined) {
    mirror.value = input.alertGroupChatId;
    mirror.updatedAt = nowIso();
  }
  appendAudit(actor, {
    moduleCode: "settings",
    action: "WEBHOOK_UPDATE",
    resourceType: "APP_SETTING",
    resourceId: "telegram",
    oldData: old as unknown as Record<string, unknown>,
    newData: state.telegramWebhookConfig as unknown as Record<string, unknown>,
  });
  return { ...state.telegramWebhookConfig };
}

/* -------------------------------------------------------------------------- */
/* Notifications (read-only log)                                              */
/* -------------------------------------------------------------------------- */

export function notifications(
  viewer: User | null,
  filter: {
    status?: Notification["status"];
    channel?: string;
    relatedType?: string;
  } = {},
  offset = 0,
  limit = 20,
): Connection<Notification> {
  requireRole(
    viewer,
    ["SUPER_ADMIN", "TECH_LEAD", "HR_MANAGER"],
    "You do not have permission to view notifications.",
  );
  let items = [...state.notifications];
  if (filter.status) items = items.filter((n) => n.status === filter.status);
  if (filter.channel) items = items.filter((n) => n.channel === filter.channel);
  if (filter.relatedType)
    items = items.filter((n) => n.relatedType === filter.relatedType);
  items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return paginate(items, offset, limit);
}
