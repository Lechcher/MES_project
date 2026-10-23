/**
 * Settings & IAM domain service.
 *
 * Owns the administrative surface described in `API_CONTACT_SPECIFICATION.md`
 * §6.4: the user directory and account lifecycle, organization structure (with
 * the per-department Auto-forking toggle), the RBAC permission matrix, platform
 * settings, the Telegram webhook configuration, the system audit trail, and the
 * notification log.
 *
 * Every administrative write records an append-only audit event (module
 * `settings`) carrying the before/after values. Secret application settings are
 * never surfaced: their stored value is redacted both in returned rows (by the
 * shape mapper) and in the audit payload.
 *
 * The account-lifecycle functions take an injected port so the domain stays
 * testable without booting real credential hashing.
 */

import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	inArray,
	like,
	lte,
	ne,
	or,
} from "drizzle-orm";
import { MODULE_CODES, type ModuleCode, type RoleCode } from "../db/enums";
import type {
	AppSettingRow,
	DepartmentRow,
	NotificationRow,
	PermissionRow,
	RoleRow,
	SystemAuditLogRow,
	UserRow,
} from "../db/schema";
import {
	appSettings,
	departments,
	notifications,
	permissions,
	rolePermissions,
	roles,
	systemAuditLogs,
	telegramWebhookConfig,
	user,
	userRoles,
} from "../db/schema";
import type { ViewerContext } from "../graphql/context";
import { DomainError } from "../graphql/errors";
import { recordAuditEvent } from "./audit";

/** Stable action labels recorded on the settings audit trail. */
export const SETTINGS_AUDIT_ACTIONS = {
	USER_CREATE: "user.create",
	USER_UPDATE: "user.update",
	USER_RESET_PASSWORD: "user.reset_password",
	USER_DEACTIVATE: "user.deactivate",
	DEPARTMENT_CREATE: "department.create",
	DEPARTMENT_UPDATE: "department.update",
	ROLE_PERMISSIONS_UPDATE: "role.permissions.update",
	APP_SETTING_UPDATE: "app_setting.update",
	TELEGRAM_WEBHOOK_UPDATE: "telegram_webhook.update",
} as const;

/* ------------------------------------------------------------------ */
/* Ports                                                               */
/* ------------------------------------------------------------------ */

/**
 * Creates the Better Auth credential (the `account` row) for a freshly created
 * user. Injected so tests can stub credential hashing while the resolver binds
 * the real Better Auth implementation.
 */
export type CreateCredentialAccount = (input: {
	userId: string;
	email: string;
	password: string;
}) => Promise<void>;

/** Administrative password reset, injected for the same reason. */
export type SetUserPassword = (input: {
	userId: string;
	newPassword: string;
}) => Promise<void>;

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export interface UserFilterInput {
	departmentId?: string | null;
	roleCode?: RoleCode | null;
	isActive?: boolean | null;
	search?: string | null;
}

export interface AudienceRestriction {
	/** When set, only rows in this department are visible. */
	departmentId?: string | null;
	/** When set, only this user's row is visible (personal scope). */
	userId?: string | null;
}

export interface CreateUserInput {
	userCode: string;
	fullName: string;
	email: string;
	password: string;
	departmentId?: string | null;
	roleCodes: RoleCode[];
}

export interface UpdateUserInput {
	id: string;
	fullName?: string | null;
	email?: string | null;
	departmentId?: string | null;
	roleCodes?: RoleCode[] | null;
	isActive?: boolean | null;
}

export interface CreateDepartmentInput {
	code: string;
	name: string;
	departmentType: "DEPARTMENT" | "DIVISION";
	parentId?: string | null;
	managerId?: string | null;
	autoForkingEnabled?: boolean | null;
}

export interface UpdateDepartmentInput {
	id: string;
	name?: string | null;
	parentId?: string | null;
	managerId?: string | null;
	autoForkingEnabled?: boolean | null;
	isActive?: boolean | null;
}

export interface AuditTrailFilter {
	userId?: string | null;
	action?: string | null;
	resourceType?: string | null;
	resourceId?: string | null;
	fromDate?: Date | null;
	toDate?: Date | null;
}

export interface NotificationFilterInput {
	status?: "PENDING" | "SENT" | "FAILED" | null;
	channel?: string | null;
	relatedType?: string | null;
	relatedId?: string | null;
}

export interface UpdateAppSettingInput {
	moduleCode: string;
	key: string;
	value?: unknown;
	isSecret?: boolean | null;
}

export interface UpdateTelegramWebhookConfigInput {
	botToken?: string | null;
	alertGroupChatId?: string | null;
	webhookUrl?: string | null;
	isEnabled?: boolean | null;
}

export interface Page<T> {
	nodes: T[];
	totalCount: number;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function isModuleCode(value: string): value is ModuleCode {
	return (MODULE_CODES as readonly string[]).includes(value);
}

function toStoredValue(value: unknown): string | null {
	if (value === undefined || value === null) return null;
	if (typeof value === "string") return value;
	return JSON.stringify(value);
}

/** Redact the value of a secret setting before it reaches the audit trail. */
function auditSettingData(
	row: Pick<AppSettingRow, "moduleCode" | "key" | "value" | "isSecret">,
): Record<string, unknown> {
	return {
		moduleCode: row.moduleCode,
		key: row.key,
		value: row.isSecret ? "[REDACTED]" : toStoredValue(row.value),
		isSecret: row.isSecret,
	};
}

function buildAuditConditions(filter: AuditTrailFilter | null | undefined) {
	const conditions = [];
	if (filter?.userId)
		conditions.push(eq(systemAuditLogs.userId, filter.userId));
	if (filter?.action)
		conditions.push(eq(systemAuditLogs.action, filter.action));
	if (filter?.resourceType) {
		conditions.push(eq(systemAuditLogs.resourceType, filter.resourceType));
	}
	if (filter?.resourceId) {
		conditions.push(eq(systemAuditLogs.resourceId, filter.resourceId));
	}
	if (filter?.fromDate) {
		conditions.push(gte(systemAuditLogs.createdAt, filter.fromDate));
	}
	if (filter?.toDate) {
		conditions.push(lte(systemAuditLogs.createdAt, filter.toDate));
	}
	return conditions;
}

async function requireUserRow(
	ctx: ViewerContext,
	userId: string,
): Promise<UserRow> {
	const [row] = await ctx.db
		.select()
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	if (!row) {
		throw new DomainError("NOT_FOUND", `User ${userId} was not found.`);
	}
	return row;
}

async function resolveRoleRows(
	ctx: ViewerContext,
	codes: readonly RoleCode[],
): Promise<RoleRow[]> {
	const unique = [...new Set(codes)];
	if (unique.length === 0) {
		throw new DomainError(
			"VALIDATION_FAILED",
			"At least one role code is required.",
		);
	}
	const rows = await ctx.db
		.select()
		.from(roles)
		.where(inArray(roles.code, unique as string[]));
	if (rows.length !== unique.length) {
		const known = new Set(rows.map((r) => r.code));
		const unknown = unique.filter((code) => !known.has(code));
		throw new DomainError(
			"VALIDATION_FAILED",
			`Unknown role code(s): ${unknown.join(", ")}.`,
		);
	}
	return rows;
}

async function requireDepartmentRow(
	ctx: ViewerContext,
	departmentId: string,
): Promise<DepartmentRow> {
	const [row] = await ctx.db
		.select()
		.from(departments)
		.where(eq(departments.id, departmentId))
		.limit(1);
	if (!row) {
		throw new DomainError(
			"VALIDATION_FAILED",
			`Department ${departmentId} does not exist.`,
		);
	}
	return row;
}

function isUniqueViolation(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /unique|constraint/i.test(message);
}

/* ------------------------------------------------------------------ */
/* User directory                                                      */
/* ------------------------------------------------------------------ */

export async function listUsers(
	ctx: ViewerContext,
	input: {
		filter?: UserFilterInput | null;
		offset: number;
		limit: number;
		audience?: AudienceRestriction;
	},
): Promise<Page<UserRow>> {
	const { filter, offset, limit, audience } = input;
	const conditions = [];

	if (audience?.userId) conditions.push(eq(user.id, audience.userId));
	if (audience?.departmentId) {
		conditions.push(eq(user.departmentId, audience.departmentId));
	}
	if (filter?.departmentId) {
		conditions.push(eq(user.departmentId, filter.departmentId));
	}
	if (filter?.isActive !== undefined && filter?.isActive !== null) {
		conditions.push(eq(user.isActive, filter.isActive));
	}
	if (filter?.roleCode) {
		const roleFilter = ctx.db
			.select({ userId: userRoles.userId })
			.from(userRoles)
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.where(eq(roles.code, filter.roleCode));
		conditions.push(inArray(user.id, roleFilter));
	}
	if (filter?.search) {
		const needle = `%${filter.search}%`;
		conditions.push(
			or(
				like(user.name, needle),
				like(user.email, needle),
				like(user.userCode, needle),
			),
		);
	}

	const where = conditions.length > 0 ? and(...conditions) : undefined;

	const [{ value: totalCount }] = await ctx.db
		.select({ value: count() })
		.from(user)
		.where(where);

	const nodes = await ctx.db
		.select()
		.from(user)
		.where(where)
		.orderBy(asc(user.name), asc(user.userCode))
		.limit(limit)
		.offset(offset);

	return { nodes, totalCount };
}

export async function getUser(
	ctx: ViewerContext,
	id: string,
	audience?: AudienceRestriction,
): Promise<UserRow | null> {
	const [row] = await ctx.db
		.select()
		.from(user)
		.where(eq(user.id, id))
		.limit(1);
	if (!row) return null;
	if (audience?.userId && row.id !== audience.userId) return null;
	if (audience?.departmentId && row.departmentId !== audience.departmentId) {
		return null;
	}
	return row;
}

/* ------------------------------------------------------------------ */
/* Organization & RBAC reads                                           */
/* ------------------------------------------------------------------ */

export async function listDepartments(
	ctx: ViewerContext,
	audience?: AudienceRestriction,
): Promise<DepartmentRow[]> {
	const where = audience?.departmentId
		? eq(departments.id, audience.departmentId)
		: undefined;
	return ctx.db
		.select()
		.from(departments)
		.where(where)
		.orderBy(asc(departments.code));
}

export async function listRoles(ctx: ViewerContext): Promise<RoleRow[]> {
	return ctx.db.select().from(roles).orderBy(asc(roles.code));
}

export async function listPermissions(
	ctx: ViewerContext,
): Promise<PermissionRow[]> {
	return ctx.db
		.select()
		.from(permissions)
		.orderBy(asc(permissions.moduleCode), asc(permissions.code));
}

/* ------------------------------------------------------------------ */
/* Account lifecycle                                                   */
/* ------------------------------------------------------------------ */

export async function createUser(
	ctx: ViewerContext,
	input: CreateUserInput,
	createCredentialAccount: CreateCredentialAccount,
): Promise<UserRow> {
	const email = input.email.trim().toLowerCase();
	const userCode = input.userCode.trim();
	if (userCode === "") {
		throw new DomainError("VALIDATION_FAILED", "userCode must not be empty.");
	}
	if (email === "") {
		throw new DomainError("VALIDATION_FAILED", "email must not be empty.");
	}
	if (!input.fullName.trim()) {
		throw new DomainError("VALIDATION_FAILED", "fullName must not be empty.");
	}

	const [existing] = await ctx.db
		.select({ id: user.id })
		.from(user)
		.where(or(eq(user.email, email), eq(user.userCode, userCode)))
		.limit(1);
	if (existing) {
		throw new DomainError(
			"CONFLICT",
			"A user with this email or userCode already exists.",
		);
	}

	if (input.departmentId) {
		await requireDepartmentRow(ctx, input.departmentId);
	}

	const roleRows = await resolveRoleRows(ctx, input.roleCodes);
	const userId = crypto.randomUUID();

	try {
		await ctx.db.insert(user).values({
			id: userId,
			name: input.fullName.trim(),
			email,
			userCode,
			departmentId: input.departmentId ?? null,
			isActive: true,
			emailVerified: false,
		});
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw new DomainError(
				"CONFLICT",
				"A user with this email or userCode already exists.",
			);
		}
		throw error;
	}

	await createCredentialAccount({
		userId,
		email,
		password: input.password,
	});

	await ctx.db.insert(userRoles).values(
		roleRows.map((role) => ({
			id: crypto.randomUUID(),
			userId,
			roleId: role.id,
		})),
	);

	const row = await requireUserRow(ctx, userId);
	await recordAuditEvent(ctx, {
		moduleCode: "settings",
		action: SETTINGS_AUDIT_ACTIONS.USER_CREATE,
		resourceType: "user",
		resourceId: userId,
		oldData: null,
		newData: {
			userCode: row.userCode,
			fullName: row.name,
			email: row.email,
			departmentId: row.departmentId,
			isActive: row.isActive,
			roleCodes: roleRows.map((role) => role.code),
		},
	});
	return row;
}

export async function updateUser(
	ctx: ViewerContext,
	input: UpdateUserInput,
): Promise<UserRow> {
	const before = await requireUserRow(ctx, input.id);
	const patch: Partial<typeof user.$inferInsert> = {};

	if (input.fullName !== undefined && input.fullName !== null) {
		patch.name = input.fullName.trim();
	}
	if (input.email !== undefined && input.email !== null) {
		const email = input.email.trim().toLowerCase();
		const [clash] = await ctx.db
			.select({ id: user.id })
			.from(user)
			.where(and(eq(user.email, email), ne(user.id, input.id)))
			.limit(1);
		if (clash) {
			throw new DomainError("CONFLICT", "That email is already in use.");
		}
		patch.email = email;
	}
	if (input.departmentId !== undefined) {
		if (input.departmentId) {
			await requireDepartmentRow(ctx, input.departmentId);
		}
		patch.departmentId = input.departmentId ?? null;
	}
	if (input.isActive !== undefined && input.isActive !== null) {
		patch.isActive = input.isActive;
	}

	if (Object.keys(patch).length > 0) {
		await ctx.db.update(user).set(patch).where(eq(user.id, input.id));
	}

	let roleCodes: string[] | null = null;
	if (input.roleCodes !== undefined && input.roleCodes !== null) {
		const roleRows = await resolveRoleRows(ctx, input.roleCodes);
		await ctx.db.delete(userRoles).where(eq(userRoles.userId, input.id));
		await ctx.db.insert(userRoles).values(
			roleRows.map((role) => ({
				id: crypto.randomUUID(),
				userId: input.id,
				roleId: role.id,
			})),
		);
		roleCodes = roleRows.map((role) => role.code);
	}

	const after = await requireUserRow(ctx, input.id);
	await recordAuditEvent(ctx, {
		moduleCode: "settings",
		action: SETTINGS_AUDIT_ACTIONS.USER_UPDATE,
		resourceType: "user",
		resourceId: input.id,
		oldData: {
			fullName: before.name,
			email: before.email,
			departmentId: before.departmentId,
			isActive: before.isActive,
		},
		newData: {
			fullName: after.name,
			email: after.email,
			departmentId: after.departmentId,
			isActive: after.isActive,
			...(roleCodes ? { roleCodes } : {}),
		},
	});
	return after;
}

export async function resetUserPassword(
	ctx: ViewerContext,
	userId: string,
	newPassword: string,
	setUserPassword: SetUserPassword,
): Promise<boolean> {
	const target = await requireUserRow(ctx, userId);
	if (!newPassword) {
		throw new DomainError(
			"VALIDATION_FAILED",
			"newPassword must not be empty.",
		);
	}
	await setUserPassword({ userId, newPassword });
	await recordAuditEvent(ctx, {
		moduleCode: "settings",
		action: SETTINGS_AUDIT_ACTIONS.USER_RESET_PASSWORD,
		resourceType: "user",
		resourceId: userId,
		oldData: { email: target.email },
		newData: { passwordReset: true },
	});
	return true;
}

export async function deactivateUser(
	ctx: ViewerContext,
	userId: string,
): Promise<UserRow> {
	const before = await requireUserRow(ctx, userId);
	const now = new Date();
	await ctx.db
		.update(user)
		.set({ isActive: false, deletedAt: now, updatedAt: now })
		.where(eq(user.id, userId));

	const after = await requireUserRow(ctx, userId);
	await recordAuditEvent(ctx, {
		moduleCode: "settings",
		action: SETTINGS_AUDIT_ACTIONS.USER_DEACTIVATE,
		resourceType: "user",
		resourceId: userId,
		oldData: { isActive: before.isActive, deletedAt: before.deletedAt },
		newData: { isActive: after.isActive, deletedAt: after.deletedAt },
	});
	return after;
}

/* ------------------------------------------------------------------ */
/* Organization structure                                              */
/* ------------------------------------------------------------------ */

export async function createDepartment(
	ctx: ViewerContext,
	input: CreateDepartmentInput,
): Promise<DepartmentRow> {
	if (input.parentId) await requireDepartmentRow(ctx, input.parentId);
	if (input.managerId) await requireUserRow(ctx, input.managerId);

	const id = crypto.randomUUID();
	try {
		await ctx.db.insert(departments).values({
			id,
			code: input.code.trim(),
			name: input.name.trim(),
			departmentType: input.departmentType,
			parentId: input.parentId ?? null,
			managerId: input.managerId ?? null,
			autoForkingEnabled: input.autoForkingEnabled ?? true,
			isActive: true,
		});
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw new DomainError(
				"CONFLICT",
				`A department with code ${input.code} already exists.`,
			);
		}
		throw error;
	}

	const [row] = await ctx.db
		.select()
		.from(departments)
		.where(eq(departments.id, id))
		.limit(1);
	await recordAuditEvent(ctx, {
		moduleCode: "settings",
		action: SETTINGS_AUDIT_ACTIONS.DEPARTMENT_CREATE,
		resourceType: "department",
		resourceId: id,
		oldData: null,
		newData: {
			code: row.code,
			name: row.name,
			departmentType: row.departmentType,
			parentId: row.parentId,
			managerId: row.managerId,
			autoForkingEnabled: row.autoForkingEnabled,
			isActive: row.isActive,
		},
	});
	return row;
}

export async function updateDepartment(
	ctx: ViewerContext,
	input: UpdateDepartmentInput,
): Promise<DepartmentRow> {
	const before = await requireDepartmentRow(ctx, input.id);
	const patch: Partial<typeof departments.$inferInsert> = {};

	if (input.name !== undefined && input.name !== null) {
		patch.name = input.name.trim();
	}
	if (input.parentId !== undefined) {
		if (input.parentId) {
			if (input.parentId === input.id) {
				throw new DomainError(
					"VALIDATION_FAILED",
					"A department cannot be its own parent.",
				);
			}
			await requireDepartmentRow(ctx, input.parentId);
		}
		patch.parentId = input.parentId ?? null;
	}
	if (input.managerId !== undefined) {
		if (input.managerId) await requireUserRow(ctx, input.managerId);
		patch.managerId = input.managerId ?? null;
	}
	if (
		input.autoForkingEnabled !== undefined &&
		input.autoForkingEnabled !== null
	) {
		patch.autoForkingEnabled = input.autoForkingEnabled;
	}
	if (input.isActive !== undefined && input.isActive !== null) {
		patch.isActive = input.isActive;
	}

	if (Object.keys(patch).length > 0) {
		await ctx.db
			.update(departments)
			.set(patch)
			.where(eq(departments.id, input.id));
	}

	const [after] = await ctx.db
		.select()
		.from(departments)
		.where(eq(departments.id, input.id))
		.limit(1);
	await recordAuditEvent(ctx, {
		moduleCode: "settings",
		action: SETTINGS_AUDIT_ACTIONS.DEPARTMENT_UPDATE,
		resourceType: "department",
		resourceId: input.id,
		oldData: {
			name: before.name,
			parentId: before.parentId,
			managerId: before.managerId,
			autoForkingEnabled: before.autoForkingEnabled,
			isActive: before.isActive,
		},
		newData: {
			name: after.name,
			parentId: after.parentId,
			managerId: after.managerId,
			autoForkingEnabled: after.autoForkingEnabled,
			isActive: after.isActive,
		},
	});
	return after;
}

/* ------------------------------------------------------------------ */
/* RBAC matrix                                                         */
/* ------------------------------------------------------------------ */

export async function listRolePermissionCodes(
	ctx: ViewerContext,
	roleId: string,
): Promise<string[]> {
	const rows = await ctx.db
		.select({ code: permissions.code })
		.from(rolePermissions)
		.innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
		.where(eq(rolePermissions.roleId, roleId));
	return rows.map((row) => row.code).sort();
}

export async function updateRolePermissions(
	ctx: ViewerContext,
	roleId: string,
	permissionCodes: readonly string[],
): Promise<RoleRow> {
	const [role] = await ctx.db
		.select()
		.from(roles)
		.where(eq(roles.id, roleId))
		.limit(1);
	if (!role) {
		throw new DomainError("NOT_FOUND", `Role ${roleId} was not found.`);
	}

	const unique = [...new Set(permissionCodes)];
	const permissionRows =
		unique.length === 0
			? []
			: await ctx.db
					.select()
					.from(permissions)
					.where(inArray(permissions.code, unique));
	if (permissionRows.length !== unique.length) {
		const known = new Set(permissionRows.map((row) => row.code));
		const unknown = unique.filter((code) => !known.has(code));
		throw new DomainError(
			"VALIDATION_FAILED",
			`Unknown permission code(s): ${unknown.join(", ")}.`,
		);
	}

	const before = await listRolePermissionCodes(ctx, roleId);
	await ctx.db
		.delete(rolePermissions)
		.where(eq(rolePermissions.roleId, roleId));
	if (permissionRows.length > 0) {
		await ctx.db.insert(rolePermissions).values(
			permissionRows.map((permission) => ({
				id: crypto.randomUUID(),
				roleId,
				permissionId: permission.id,
			})),
		);
	}

	const after = await listRolePermissionCodes(ctx, roleId);
	await recordAuditEvent(ctx, {
		moduleCode: "settings",
		action: SETTINGS_AUDIT_ACTIONS.ROLE_PERMISSIONS_UPDATE,
		resourceType: "role",
		resourceId: roleId,
		oldData: { permissionCodes: before },
		newData: { permissionCodes: after },
	});
	return role;
}

/* ------------------------------------------------------------------ */
/* System audit trail                                                  */
/* ------------------------------------------------------------------ */

export async function listSystemAuditLogs(
	ctx: ViewerContext,
	input: {
		filter?: AuditTrailFilter | null;
		offset: number;
		limit: number;
	},
): Promise<Page<SystemAuditLogRow>> {
	const conditions = buildAuditConditions(input.filter);
	const where = conditions.length > 0 ? and(...conditions) : undefined;

	const [{ value: totalCount }] = await ctx.db
		.select({ value: count() })
		.from(systemAuditLogs)
		.where(where);

	const nodes = await ctx.db
		.select()
		.from(systemAuditLogs)
		.where(where)
		.orderBy(desc(systemAuditLogs.createdAt))
		.limit(input.limit)
		.offset(input.offset);

	return { nodes, totalCount };
}

/* ------------------------------------------------------------------ */
/* Application settings                                                */
/* ------------------------------------------------------------------ */

export async function listAppSettings(
	ctx: ViewerContext,
	moduleCode?: string | null,
): Promise<AppSettingRow[]> {
	if (moduleCode) {
		if (!isModuleCode(moduleCode)) {
			throw new DomainError(
				"VALIDATION_FAILED",
				`Unknown module code: ${moduleCode}.`,
			);
		}
		return ctx.db
			.select()
			.from(appSettings)
			.where(eq(appSettings.moduleCode, moduleCode))
			.orderBy(asc(appSettings.key));
	}
	return ctx.db
		.select()
		.from(appSettings)
		.orderBy(asc(appSettings.moduleCode), asc(appSettings.key));
}

export async function updateAppSetting(
	ctx: ViewerContext,
	input: UpdateAppSettingInput,
): Promise<AppSettingRow> {
	if (!isModuleCode(input.moduleCode)) {
		throw new DomainError(
			"VALIDATION_FAILED",
			`Unknown module code: ${input.moduleCode}.`,
		);
	}
	if (!input.key.trim()) {
		throw new DomainError("VALIDATION_FAILED", "key must not be empty.");
	}

	const [existing] = await ctx.db
		.select()
		.from(appSettings)
		.where(
			and(
				eq(appSettings.moduleCode, input.moduleCode),
				eq(appSettings.key, input.key),
			),
		)
		.limit(1);

	if (existing) {
		const isSecret =
			input.isSecret === undefined || input.isSecret === null
				? existing.isSecret
				: input.isSecret;
		await ctx.db
			.update(appSettings)
			.set({
				value:
					input.value === undefined
						? existing.value
						: toStoredValue(input.value),
				isSecret,
				updatedAt: new Date(),
			})
			.where(eq(appSettings.id, existing.id));
	} else {
		await ctx.db.insert(appSettings).values({
			id: crypto.randomUUID(),
			moduleCode: input.moduleCode,
			key: input.key,
			value: toStoredValue(input.value),
			isSecret: input.isSecret ?? false,
		});
	}

	const [after] = await ctx.db
		.select()
		.from(appSettings)
		.where(
			and(
				eq(appSettings.moduleCode, input.moduleCode),
				eq(appSettings.key, input.key),
			),
		)
		.limit(1);

	await recordAuditEvent(ctx, {
		moduleCode: "settings",
		action: SETTINGS_AUDIT_ACTIONS.APP_SETTING_UPDATE,
		resourceType: "app_setting",
		resourceId: after.id,
		oldData: existing ? auditSettingData(existing) : null,
		newData: auditSettingData(after),
	});
	return after;
}

/* ------------------------------------------------------------------ */
/* Telegram webhook configuration                                      */
/* ------------------------------------------------------------------ */

export async function getTelegramWebhookConfig(ctx: ViewerContext) {
	const [existing] = await ctx.db.select().from(telegramWebhookConfig).limit(1);
	if (existing) return existing;

	const id = crypto.randomUUID();
	await ctx.db.insert(telegramWebhookConfig).values({
		id,
		botToken: null,
		alertGroupChatId: null,
		webhookUrl: null,
		isEnabled: false,
	});
	const [created] = await ctx.db
		.select()
		.from(telegramWebhookConfig)
		.where(eq(telegramWebhookConfig.id, id))
		.limit(1);
	return created;
}

export async function updateTelegramWebhookConfig(
	ctx: ViewerContext,
	input: UpdateTelegramWebhookConfigInput,
) {
	const before = await getTelegramWebhookConfig(ctx);
	const patch: Partial<typeof telegramWebhookConfig.$inferInsert> = {};
	if (input.botToken !== undefined) patch.botToken = input.botToken;
	if (input.alertGroupChatId !== undefined) {
		patch.alertGroupChatId = input.alertGroupChatId;
	}
	if (input.webhookUrl !== undefined) patch.webhookUrl = input.webhookUrl;
	if (input.isEnabled !== undefined && input.isEnabled !== null) {
		patch.isEnabled = input.isEnabled;
	}

	if (Object.keys(patch).length > 0) {
		await ctx.db
			.update(telegramWebhookConfig)
			.set({ ...patch, updatedAt: new Date() })
			.where(eq(telegramWebhookConfig.id, before.id));
	}

	const [after] = await ctx.db
		.select()
		.from(telegramWebhookConfig)
		.where(eq(telegramWebhookConfig.id, before.id))
		.limit(1);

	await recordAuditEvent(ctx, {
		moduleCode: "settings",
		action: SETTINGS_AUDIT_ACTIONS.TELEGRAM_WEBHOOK_UPDATE,
		resourceType: "telegram_webhook_config",
		resourceId: before.id,
		oldData: {
			alertGroupChatId: before.alertGroupChatId,
			webhookUrl: before.webhookUrl,
			isEnabled: before.isEnabled,
		},
		newData: {
			alertGroupChatId: after.alertGroupChatId,
			webhookUrl: after.webhookUrl,
			isEnabled: after.isEnabled,
		},
	});
	return after;
}

/* ------------------------------------------------------------------ */
/* Notification log                                                    */
/* ------------------------------------------------------------------ */

export async function listNotifications(
	ctx: ViewerContext,
	input: {
		filter?: NotificationFilterInput | null;
		offset: number;
		limit: number;
	},
): Promise<Page<NotificationRow>> {
	const conditions = [];
	const { filter } = input;
	if (filter?.status) conditions.push(eq(notifications.status, filter.status));
	if (filter?.channel) {
		conditions.push(eq(notifications.channel, filter.channel));
	}
	if (filter?.relatedType) {
		conditions.push(eq(notifications.relatedType, filter.relatedType));
	}
	if (filter?.relatedId) {
		conditions.push(eq(notifications.relatedId, filter.relatedId));
	}
	const where = conditions.length > 0 ? and(...conditions) : undefined;

	const [{ value: totalCount }] = await ctx.db
		.select({ value: count() })
		.from(notifications)
		.where(where);

	const nodes = await ctx.db
		.select()
		.from(notifications)
		.where(where)
		.orderBy(desc(notifications.createdAt))
		.limit(input.limit)
		.offset(input.offset);

	return { nodes, totalCount };
}
