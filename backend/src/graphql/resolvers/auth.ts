/**
 * Auth resolvers (`API_CONTACT_SPECIFICATION.md` §3).
 *
 * These are thin adapters over the operations exposed by `../../auth`; the
 * Better Auth instance arrives on the GraphQL context value as `auth`, and the
 * MES viewer/session live on `ctx`. Better Auth calls that need HTTP `Headers`
 * reconstruct them from the resolved context (bearer token + request metadata),
 * because the raw request is represented on the context only as metadata.
 */

import { eq } from "drizzle-orm";
import {
	type Auth,
	changePassword,
	requestPasswordReset,
	resetPassword,
	signIn,
	signOut,
} from "../../auth";
import { session, user } from "../../db/schema";
import { requireViewer } from "../access";
import type { ViewerContext } from "../context";
import { loadUser, toUser } from "../shapes";

type Resolver = (
	parent: unknown,
	args: any,
	contextValue: { ctx: ViewerContext; auth: Auth },
	info: unknown,
) => unknown;

interface AuthContextValue {
	ctx: ViewerContext;
	auth: Auth;
}

/** The assembled schema declares the resolver context as `unknown`. */
type AssembledResolver = (
	parent: unknown,
	args: any,
	contextValue: unknown,
	info: unknown,
) => unknown;

/** Rebuild the HTTP headers Better Auth expects from the resolved context. */
function headersFrom(ctx: ViewerContext): Headers {
	const headers = new Headers();
	if (ctx.session?.token) {
		headers.set("authorization", `Bearer ${ctx.session.token}`);
	}
	if (ctx.request.userAgent) headers.set("user-agent", ctx.request.userAgent);
	if (ctx.request.ipAddress) {
		headers.set("x-forwarded-for", ctx.request.ipAddress);
	}
	return headers;
}

function toSessionShape(row: typeof session.$inferSelect) {
	return {
		id: row.id,
		token: row.token,
		expiresAt: row.expiresAt,
		ipAddress: row.ipAddress ?? null,
		userAgent: row.userAgent ?? null,
	};
}

const queryResolvers: Record<string, Resolver> = {
	viewer: async (_parent, _args, { ctx }) => {
		if (!ctx.viewer || !ctx.session) return null;
		const row = await loadUser(ctx, ctx.viewer.id);
		if (!row) return null;
		return {
			user: toUser(row),
			session: {
				id: ctx.session.id,
				token: ctx.session.token,
				expiresAt: ctx.session.expiresAt,
				ipAddress: ctx.session.ipAddress,
				userAgent: ctx.session.userAgent,
			},
		};
	},
};

const mutationResolvers: Record<string, Resolver> = {
	login: async (
		_parent,
		args: { input: { email: string; password: string } },
		{ ctx, auth }: AuthContextValue,
	) => {
		const result = await signIn(auth, ctx.db, {
			email: args.input.email,
			password: args.input.password,
		});

		const [userRow] = await ctx.db
			.select()
			.from(user)
			.where(eq(user.id, result.viewer.id))
			.limit(1);
		if (!userRow) {
			throw new Error("Authenticated user record is missing.");
		}

		const [sessionRow] = await ctx.db
			.select()
			.from(session)
			.where(eq(session.token, result.token))
			.limit(1);
		const sessionShape = sessionRow
			? toSessionShape(sessionRow)
			: {
					id: result.token,
					token: result.token,
					expiresAt: result.expiresAt,
					ipAddress: null,
					userAgent: null,
				};

		return {
			session: sessionShape,
			viewer: { user: toUser(userRow), session: sessionShape },
		};
	},

	logout: async (_parent, _args, { ctx, auth }: AuthContextValue) => {
		requireViewer(ctx);
		return signOut(auth, headersFrom(ctx));
	},

	requestPasswordReset: async (
		_parent,
		args: { email: string },
		{ ctx, auth }: AuthContextValue,
	) => {
		return requestPasswordReset(auth, ctx.config, {
			email: args.email,
			redirectTo: `${ctx.config.webOrigin}/reset-password`,
		});
	},

	resetPassword: async (
		_parent,
		args: { input: { token: string; newPassword: string } },
		{ auth }: AuthContextValue,
	) => {
		return resetPassword(auth, {
			token: args.input.token,
			newPassword: args.input.newPassword,
		});
	},

	changePassword: async (
		_parent,
		args: { input: { currentPassword: string; newPassword: string } },
		{ ctx, auth }: AuthContextValue,
	) => {
		requireViewer(ctx);
		return changePassword(auth, headersFrom(ctx), {
			currentPassword: args.input.currentPassword,
			newPassword: args.input.newPassword,
		});
	},
};

export const authQuery = queryResolvers as Record<string, AssembledResolver>;
export const authMutation = mutationResolvers as Record<
	string,
	AssembledResolver
>;
