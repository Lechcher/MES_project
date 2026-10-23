/**
 * Settings & IAM resolvers (`API_CONTACT_SPECIFICATION.md` §6.4).
 *
 * Thin: authorize the operation, delegate to the domain service, and map rows
 * onto the contract shapes. The only non-delegated work here is binding the
 * account-lifecycle ports to the Better Auth implementation on the context.
 */

import { hashPassword } from "better-auth/crypto";
import { type Auth, setUserPassword } from "../../auth";
import type { TelegramWebhookConfigRow } from "../../db/schema";
import { account } from "../../db/schema";
import {
	createDepartment,
	createUser,
	deactivateUser,
	getTelegramWebhookConfig,
	getUser,
	listAppSettings,
	listDepartments,
	listNotifications,
	listPermissions,
	listRoles,
	listSystemAuditLogs,
	listUsers,
	resetUserPassword,
	updateAppSetting,
	updateDepartment,
	updateRolePermissions,
	updateTelegramWebhookConfig,
	updateUser,
} from "../../domain/settings";
import { authorize, scopedDepartmentId, scopedUserId } from "../access";
import type { ViewerContext } from "../context";
import {
	pagination,
	toAppSetting,
	toDepartment,
	toNotification,
	toRole,
	toSystemAuditLog,
	toUser,
} from "../shapes";

type Resolver = (
	parent: unknown,
	args: any,
	contextValue: { ctx: ViewerContext; auth: Auth },
	info: unknown,
) => unknown;

/** The assembled schema declares the resolver context as `unknown`. */
type AssembledResolver = (
	parent: unknown,
	args: any,
	contextValue: unknown,
	info: unknown,
) => unknown;

function toPermission(row: {
	id: string;
	code: string;
	moduleCode: string;
	description: string | null;
}) {
	return {
		id: row.id,
		code: row.code,
		moduleCode: row.moduleCode,
		description: row.description ?? null,
	};
}

function toWebhookConfig(row: TelegramWebhookConfigRow) {
	return {
		botToken: row.botToken ?? null,
		alertGroupChatId: row.alertGroupChatId ?? null,
		webhookUrl: row.webhookUrl ?? null,
		isEnabled: row.isEnabled,
	};
}

/**
 * Create the Better Auth credential account for a new MES user. The MES profile
 * row (which owns `userCode`/`departmentId`) is written by the domain service;
 * this port only writes the hashed credential Better Auth would otherwise own.
 */
async function createCredentialAccount(
	ctx: ViewerContext,
	input: { userId: string; email: string; password: string },
): Promise<void> {
	const now = new Date();
	const password = await hashPassword(input.password);
	await ctx.db.insert(account).values({
		id: crypto.randomUUID(),
		accountId: input.userId,
		providerId: "credential",
		userId: input.userId,
		password,
		createdAt: now,
		updatedAt: now,
	});
}

const queryResolvers: Record<string, Resolver> = {
	users: async (_parent, args: any, { ctx }) => {
		const scope = authorize(ctx, "users");
		const offset = args.offset ?? 0;
		const limit = args.limit ?? 20;
		const page = await listUsers(ctx, {
			filter: args.filter ?? null,
			offset,
			limit,
			audience: {
				departmentId: scopedDepartmentId(ctx, scope),
				userId: scopedUserId(ctx, scope),
			},
		});
		return {
			nodes: page.nodes.map(toUser),
			pageInfo: pagination(offset, limit, page.totalCount),
		};
	},

	user: async (_parent, args: { id: string }, { ctx }) => {
		const scope = authorize(ctx, "user");
		const found = await getUser(ctx, args.id, {
			departmentId: scopedDepartmentId(ctx, scope),
			userId: scopedUserId(ctx, scope),
		});
		return found ? toUser(found) : null;
	},

	departments: async (_parent, _args, { ctx }) => {
		const scope = authorize(ctx, "departments");
		const rows = await listDepartments(ctx, {
			departmentId: scopedDepartmentId(ctx, scope),
		});
		return rows.map(toDepartment);
	},

	roles: async (_parent, _args, { ctx }) => {
		authorize(ctx, "roles");
		const rows = await listRoles(ctx);
		return rows.map(toRole);
	},

	permissions: async (_parent, _args, { ctx }) => {
		authorize(ctx, "permissions");
		const rows = await listPermissions(ctx);
		return rows.map(toPermission);
	},

	systemAuditLogs: async (_parent, args: any, { ctx }) => {
		authorize(ctx, "systemAuditLogs");
		const offset = args.offset ?? 0;
		const limit = args.limit ?? 20;
		const page = await listSystemAuditLogs(ctx, {
			filter: args.filter ?? null,
			offset,
			limit,
		});
		return {
			nodes: page.nodes.map(toSystemAuditLog),
			pageInfo: pagination(offset, limit, page.totalCount),
		};
	},

	appSettings: async (
		_parent,
		args: { moduleCode?: string | null },
		{ ctx },
	) => {
		authorize(ctx, "appSettings");
		const rows = await listAppSettings(ctx, args.moduleCode ?? null);
		return rows.map(toAppSetting);
	},

	telegramWebhookConfig: async (_parent, _args, { ctx }) => {
		authorize(ctx, "telegramWebhookConfig");
		const row = await getTelegramWebhookConfig(ctx);
		return toWebhookConfig(row);
	},

	notifications: async (_parent, args: any, { ctx }) => {
		authorize(ctx, "notifications");
		const offset = args.offset ?? 0;
		const limit = args.limit ?? 20;
		const page = await listNotifications(ctx, {
			filter: args.filter ?? null,
			offset,
			limit,
		});
		return {
			nodes: page.nodes.map(toNotification),
			pageInfo: pagination(offset, limit, page.totalCount),
		};
	},
};

const mutationResolvers: Record<string, Resolver> = {
	createUser: async (_parent, args: any, { ctx }) => {
		authorize(ctx, "createUser");
		const row = await createUser(ctx, args.input, (input) =>
			createCredentialAccount(ctx, input),
		);
		return toUser(row);
	},

	updateUser: async (_parent, args: any, { ctx }) => {
		authorize(ctx, "updateUser");
		const row = await updateUser(ctx, args.input);
		return toUser(row);
	},

	resetUserPassword: async (
		_parent,
		args: { userId: string; newPassword: string },
		{ ctx },
	) => {
		authorize(ctx, "resetUserPassword");
		return resetUserPassword(
			ctx,
			args.userId,
			args.newPassword,
			async (input) => {
				await setUserPassword(ctx.db, input);
			},
		);
	},

	deactivateUser: async (_parent, args: { userId: string }, { ctx }) => {
		authorize(ctx, "deactivateUser");
		const row = await deactivateUser(ctx, args.userId);
		return toUser(row);
	},

	createDepartment: async (_parent, args: any, { ctx }) => {
		authorize(ctx, "createDepartment");
		const row = await createDepartment(ctx, args.input);
		return toDepartment(row);
	},

	updateDepartment: async (_parent, args: any, { ctx }) => {
		authorize(ctx, "updateDepartment");
		const row = await updateDepartment(ctx, args.input);
		return toDepartment(row);
	},

	updateRolePermissions: async (_parent, args: any, { ctx }) => {
		authorize(ctx, "updateRolePermissions");
		const row = await updateRolePermissions(
			ctx,
			args.input.roleId,
			args.input.permissionCodes,
		);
		return toRole(row);
	},

	updateAppSetting: async (_parent, args: any, { ctx }) => {
		authorize(ctx, "updateAppSetting");
		const row = await updateAppSetting(ctx, args.input);
		return toAppSetting(row);
	},

	updateTelegramWebhookConfig: async (_parent, args: any, { ctx }) => {
		authorize(ctx, "updateTelegramWebhookConfig");
		const row = await updateTelegramWebhookConfig(ctx, args.input);
		return toWebhookConfig(row);
	},
};

export const settingsQuery = queryResolvers as Record<
	string,
	AssembledResolver
>;
export const settingsMutation = mutationResolvers as Record<
	string,
	AssembledResolver
>;
