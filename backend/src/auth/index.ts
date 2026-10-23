/**
 * Authentication.
 *
 * Better Auth owns credentials, sessions, and password hashing. The MES profile
 * shares the Better Auth user id, so this module is the only place that knows
 * how credentials map onto the `user` table, and it exposes exactly the
 * operations the GraphQL auth surface needs.
 *
 * Password-reset delivery requires a configured mail sender. When none is
 * configured the operation fails explicitly instead of pretending mail was sent.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { hashPassword } from "better-auth/crypto";
import { bearer } from "better-auth/plugins";
import { and, eq, isNull } from "drizzle-orm";
import type { AppConfig } from "../config";
import type { DatabaseHandle } from "../db";
import { ROLE_CODES, type RoleCode } from "../db/enums";
import { account, session, user, verification } from "../db/schema";
import type { ResolvedSession, Viewer } from "../graphql/context";
import { DomainError } from "../graphql/errors";
import {
	composePasswordResetMessage,
	createCredentialScrubber,
	createSmtpMailSender,
	deliverMail,
	type MailOutcome,
	type MailSender,
	PASSWORD_RESET_TEMPLATE,
} from "../mail";

export type Auth = ReturnType<typeof createAuth>;

/**
 * The outcome of the reset send that is in flight for the current request.
 *
 * Better Auth awaits the send hook but discards anything it throws, so the hook
 * cannot signal a failure that way. It records the outcome here instead, and the
 * caller reads it once the request returns — which it can, because the hook is on
 * the awaited path (background delivery is deliberately left unconfigured).
 */
interface PendingResetAttempt {
	outcome: MailOutcome | null;
}

const resetAttempt = new AsyncLocalStorage<PendingResetAttempt>();

export interface CreateAuthOptions {
	/**
	 * Transport override. The application builds an SMTP sender from the
	 * configured endpoint; tests inject a recording sender so the suite never
	 * opens a socket.
	 */
	mailSender?: MailSender;
}

export function createAuth(
	db: DatabaseHandle,
	config: AppConfig,
	options: CreateAuthOptions = {},
) {
	const mailSender: MailSender | null =
		options.mailSender ??
		(config.mailEndpoint ? createSmtpMailSender(config.mailEndpoint) : null);
	const redact = config.mailEndpoint
		? createCredentialScrubber(config.mailEndpoint.url)
		: undefined;

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "sqlite",
			schema: { user, session, account, verification },
		}),
		secret: config.authSecret,
		baseURL: config.authUrl,
		basePath: "/api/auth",
		trustedOrigins: [config.webOrigin],
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false,
			/**
			 * Compose and deliver the reset message.
			 *
			 * The link is built from the web origin rather than the library's own
			 * URL, which is rooted at the API origin. A delivery failure is recorded
			 * and reported through the request-scoped channel instead of being
			 * thrown, because a throw here would only be logged and swallowed.
			 */
			sendResetPassword: async (data: {
				user: { email: string; name?: string | null; id: string };
				token: string;
			}) => {
				if (!mailSender) return;

				const outcome = await deliverMail(
					{ db, sender: mailSender, ...(redact ? { redact } : {}) },
					composePasswordResetMessage({
						to: data.user.email,
						recipientName: data.user.name ?? null,
						token: data.token,
						from: config.resetEmailFrom,
						webOrigin: config.webOrigin,
					}),
					{
						template: PASSWORD_RESET_TEMPLATE,
						relatedType: "USER",
						relatedId: data.user.id,
					},
				);

				const store = resetAttempt.getStore();
				if (store) store.outcome = outcome;
			},
		},
		// The contract carries the session as `Authorization: Bearer <token>`, so
		// the bearer plugin is what lets Better Auth resolve a session from a
		// header instead of a cookie.
		plugins: [bearer()],
		user: {
			additionalFields: {
				// The contract's CreateUserInput requires a user code, so it is settable.
				// Not `required` at the auth layer: accounts created without one get a
				// generated code from the create hook below.
				userCode: { type: "string", required: false, input: true },
				departmentId: { type: "string", required: false, input: false },
				isActive: { type: "boolean", required: false, input: false },
			},
		},
		databaseHooks: {
			user: {
				create: {
					before: async (newUser: Record<string, unknown>) => {
						if (
							typeof newUser.userCode === "string" &&
							newUser.userCode !== ""
						) {
							return { data: newUser };
						}
						return { data: { ...newUser, userCode: await nextUserCode(db) } };
					},
				},
			},
		},
		advanced: {
			database: { generateId: () => crypto.randomUUID() },
		},
	});
}

/**
 * A `U-0001`-style code for accounts created without an explicit user code.
 * Uniqueness is still enforced by the database.
 */
async function nextUserCode(db: DatabaseHandle): Promise<string> {
	const rows = await db.select({ id: user.id }).from(user);
	return `U-${String(rows.length + 1).padStart(4, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Viewer resolution                                                   */
/* ------------------------------------------------------------------ */

function isRoleCode(value: string): value is RoleCode {
	return (ROLE_CODES as readonly string[]).includes(value);
}

/**
 * Load the viewer and their roles for an authenticated user id.
 * Returns `null` when the account is missing, deleted, or deactivated.
 */
export async function loadViewer(
	db: DatabaseHandle,
	userId: string,
): Promise<Viewer | null> {
	const [row] = await db
		.select()
		.from(user)
		.where(and(eq(user.id, userId), isNull(user.deletedAt)))
		.limit(1);

	if (!row?.isActive) return null;

	const roleCodes = await loadRoleCodes(db, userId);

	return {
		id: row.id,
		userCode: row.userCode,
		fullName: row.name,
		email: row.email,
		departmentId: row.departmentId ?? null,
		isActive: row.isActive,
		roleCodes,
	};
}

export async function loadRoleCodes(
	db: DatabaseHandle,
	userId: string,
): Promise<RoleCode[]> {
	const { roles, userRoles } = await import("../db/schema");
	const rows = await db
		.select({ code: roles.code })
		.from(userRoles)
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.where(eq(userRoles.userId, userId));
	return rows.map((r) => r.code).filter(isRoleCode);
}

/**
 * Resolve a bearer token to a session and viewer.
 * Expired sessions resolve to `null` so the caller returns `UNAUTHENTICATED`.
 */
export async function resolveSession(
	db: DatabaseHandle,
	token: string,
): Promise<{ viewer: Viewer; session: ResolvedSession } | null> {
	const [row] = await db
		.select()
		.from(session)
		.where(eq(session.token, token))
		.limit(1);

	if (!row) return null;
	if (row.expiresAt.getTime() <= Date.now()) return null;

	const viewer = await loadViewer(db, row.userId);
	if (!viewer) return null;

	return {
		viewer,
		session: {
			id: row.id,
			token: row.token,
			expiresAt: row.expiresAt,
			ipAddress: row.ipAddress ?? null,
			userAgent: row.userAgent ?? null,
		},
	};
}

/* ------------------------------------------------------------------ */
/* Auth operations used by the GraphQL auth surface                    */
/* ------------------------------------------------------------------ */

export interface SignInResult {
	token: string;
	expiresAt: Date;
	viewer: Viewer;
}

export async function signIn(
	auth: Auth,
	db: DatabaseHandle,
	input: { email: string; password: string },
): Promise<SignInResult> {
	let result: Awaited<ReturnType<Auth["api"]["signInEmail"]>>;
	try {
		result = await auth.api.signInEmail({
			body: { email: input.email, password: input.password },
		});
	} catch (error) {
		// Better Auth rejects unknown credentials with its own error type; the
		// contract requires a stable UNAUTHENTICATED code instead.
		throw new DomainError("UNAUTHENTICATED", "Invalid email or password.", {
			cause: error instanceof Error ? error.message : undefined,
		});
	}

	if (!result?.token || !result.user) {
		throw new DomainError("UNAUTHENTICATED", "Invalid email or password.");
	}

	const viewer = await loadViewer(db, result.user.id);
	if (!viewer) {
		throw new DomainError(
			"FORBIDDEN",
			"This account is deactivated. Contact an administrator.",
		);
	}

	return {
		token: result.token,
		expiresAt: await sessionExpiry(db, result.token),
		viewer,
	};
}

/** Read the committed expiry for a freshly issued session token. */
async function sessionExpiry(db: DatabaseHandle, token: string): Promise<Date> {
	const [row] = await db
		.select({ expiresAt: session.expiresAt })
		.from(session)
		.where(eq(session.token, token))
		.limit(1);
	return row?.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}

export async function signOut(auth: Auth, headers: Headers): Promise<boolean> {
	await auth.api.signOut({ headers });
	return true;
}

export async function changePassword(
	auth: Auth,
	headers: Headers,
	input: { currentPassword: string; newPassword: string },
): Promise<boolean> {
	await auth.api.changePassword({
		body: {
			currentPassword: input.currentPassword,
			newPassword: input.newPassword,
			revokeOtherSessions: true,
		},
		headers,
	});
	return true;
}

/**
 * Begin a password reset.
 *
 * Without a configured SMTP endpoint the request cannot be delivered, so the
 * operation reports an explicit failure rather than a false success.
 *
 * When an endpoint is configured, the outcome of the send decides the result. An
 * address with no account is never attempted (the auth library returns the
 * neutral response without invoking the hook), so an absent outcome stays a
 * neutral success — reporting it as a failure would disclose which addresses
 * have accounts.
 */
export async function requestPasswordReset(
	auth: Auth,
	config: AppConfig,
	input: { email: string; redirectTo: string },
): Promise<boolean> {
	if (!config.smtpUrl) {
		throw new DomainError(
			"INTERNAL",
			"Password reset is unavailable: no mail sender is configured (MES_SMTP_URL).",
		);
	}

	const store: PendingResetAttempt = { outcome: null };
	await resetAttempt.run(store, async () => {
		await auth.api.requestPasswordReset({
			body: { email: input.email, redirectTo: input.redirectTo },
		});
	});

	if (store.outcome && !store.outcome.delivered) {
		throw new DomainError(
			"INTERNAL",
			`The reset message could not be delivered: ${store.outcome.errorMessage}`,
			{ delivery: "FAILED", notificationId: store.outcome.notificationId },
		);
	}

	return true;
}

/** Read the machine-readable code out of a rejected auth call. */
function authErrorCode(error: unknown): string | null {
	const candidate = error as
		| { body?: { code?: unknown }; code?: unknown }
		| undefined;
	if (typeof candidate?.body?.code === "string") return candidate.body.code;
	if (typeof candidate?.code === "string") return candidate.code;
	return null;
}

/**
 * Complete a password reset.
 *
 * A rejected token is an input problem, not an internal fault, so it is reported
 * as a validation failure carrying a reason the reset page can act on. The
 * contract's error catalog has no token-specific code.
 */
export async function resetPassword(
	auth: Auth,
	input: { token: string; newPassword: string },
): Promise<boolean> {
	try {
		await auth.api.resetPassword({
			body: { token: input.token, newPassword: input.newPassword },
		});
	} catch (error) {
		const code = authErrorCode(error);
		throw new DomainError(
			"VALIDATION_FAILED",
			code === "INVALID_TOKEN"
				? "This reset link is invalid or has expired. Request a new one to continue."
				: "The password could not be reset. Check the new password and try again.",
			{ reason: code === "INVALID_TOKEN" ? "INVALID_TOKEN" : "RESET_REJECTED" },
		);
	}
	return true;
}

/**
 * Administrative reset used by the user directory.
 *
 * There is no session for the target user, so the credential is re-hashed
 * directly and written to that user's credential account row. This is the same
 * hashing Better Auth uses at sign-in and sign-up.
 */
export async function setUserPassword(
	db: DatabaseHandle,
	input: { userId: string; newPassword: string },
): Promise<boolean> {
	if (input.newPassword.length < 8) {
		throw new DomainError(
			"VALIDATION_FAILED",
			"The new password must be at least 8 characters long.",
		);
	}

	const hashed = await hashPassword(input.newPassword);

	const [credential] = await db
		.select({ id: account.id })
		.from(account)
		.where(
			and(
				eq(account.userId, input.userId),
				eq(account.providerId, "credential"),
			),
		)
		.limit(1);

	if (!credential) {
		throw new DomainError(
			"NOT_FOUND",
			"That user has no password credential to reset.",
		);
	}

	await db
		.update(account)
		.set({ password: hashed, updatedAt: new Date() })
		.where(eq(account.id, credential.id));

	return true;
}
