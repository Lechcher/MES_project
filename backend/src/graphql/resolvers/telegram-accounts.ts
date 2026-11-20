/**
 * Telegram multi-account resolvers
 * (`openspec/specs/core/telegram-multi-account/spec.md`).
 *
 * Thin: authorize the operation under the personal-scope policy, delegate to
 * the domain service, and return its shape as-is — the contract surface is
 * already viewer-scoped by the domain layer, and the session string exists
 * only inside the owning viewer's own response.
 */

import {
	linkTelegramAccount,
	listViewerTelegramAccounts,
	removeTelegramAccount,
} from "../../telegram-accounts/accounts";
import { authorize } from "../access";

export const telegramAccountsQuery = {
	telegramAccounts: async (_parent: any, _args: any, { ctx }: any) => {
		// Every authenticated role manages *their own* accounts; the policy
		// maps every role to the personal scope.
		authorize(ctx, "telegramAccounts");
		return listViewerTelegramAccounts(ctx);
	},
};

export const telegramAccountsMutation = {
	saveTelegramAccount: async (_parent: any, args: any, { ctx }: any) => {
		authorize(ctx, "saveTelegramAccount");
		return linkTelegramAccount(ctx, {
			sessionString: String(args.input.sessionString),
			profile: {
				telegramUserId: String(args.input.profile.telegramUserId),
				phoneNumber: String(args.input.profile.phoneNumber),
				username: args.input.profile.username ?? null,
				firstName: String(args.input.profile.firstName),
				lastName: args.input.profile.lastName ?? null,
				avatarUrl: args.input.profile.avatarUrl ?? null,
			},
			deviceFingerprint: {
				deviceModel: String(args.input.deviceFingerprint.deviceModel),
				systemVersion: String(args.input.deviceFingerprint.systemVersion),
				appVersion: String(args.input.deviceFingerprint.appVersion),
			},
		});
	},

	removeTelegramAccount: async (_parent: any, args: any, { ctx }: any) => {
		authorize(ctx, "removeTelegramAccount");
		await removeTelegramAccount(ctx, String(args.accountId));
		return true;
	},
};