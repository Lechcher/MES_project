/**
 * Password reset: the honest outcome and the consumable link.
 *
 * The transport is injected, so nothing here opens a socket. The final test
 * extracts the token out of the message this system actually composed and
 * consumes it, which is what proves the link we build is the one the auth
 * library accepts — and that the loop closes.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { type AppConfig, loadConfig } from "../config";
import { createDatabase, type DatabaseHandle } from "../db";
import { runMigrations } from "../db/migrate";
import { notifications, user } from "../db/schema";
import { createRecordingMailSender, type RecordingMailSender } from "../mail";
import {
	type Auth,
	createAuth,
	requestPasswordReset,
	resetPassword,
	signIn,
} from "./index";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const dbPath = join(TMP_ROOT, `mes-reset-${crypto.randomUUID()}.db`);

const PASSWORD = "dev-password-2026!";
const NEW_PASSWORD = "reset-password-2026!";
const APP_PASSWORD = "sup3r-s3cret-app-password";
const MAIL_URL = `smtps://lechcher@zohomail.com:${APP_PASSWORD}@smtp.zoho.com:465`;

let db: DatabaseHandle;
let config: AppConfig;
let withoutMail: AppConfig;

/** Build an auth instance with a recording transport. */
function authWith(sender: RecordingMailSender): Auth {
	return createAuth(db, config, { mailSender: sender });
}

function tokenFrom(message: { text: string }): string {
	const match = message.text.match(/https?:\/\/\S+/);
	if (!match) throw new Error("no link in the composed message");
	return new URL(match[0]).searchParams.get("token") ?? "";
}

async function createAccount(email: string): Promise<string> {
	const auth = authWith(createRecordingMailSender());
	const result = await auth.api.signUpEmail({
		body: { email, password: PASSWORD, name: "Reset Tester" },
	});
	return result.user.id;
}

/** Row count for the email channel, to prove an absent attempt. */
async function mailAttempts(): Promise<number> {
	const rows = await db
		.select()
		.from(notifications)
		.where(eq(notifications.channel, "EMAIL"));
	return rows.length;
}

beforeAll(async () => {
	runMigrations({ databasePath: dbPath });
	config = loadConfig({
		NODE_ENV: "test",
		MES_DATABASE_PATH: dbPath,
		MES_SMTP_URL: MAIL_URL,
		MES_WEB_ORIGIN: "http://localhost:3000",
		MES_RESET_EMAIL_FROM: "lechcher@zohomail.com",
	});
	withoutMail = loadConfig({
		NODE_ENV: "test",
		MES_DATABASE_PATH: dbPath,
		MES_WEB_ORIGIN: "http://localhost:3000",
	});
	db = createDatabase(dbPath);
});

afterAll(() => {
	for (const suffix of ["", "-wal", "-shm"]) {
		const path = `${dbPath}${suffix}`;
		if (existsSync(path)) rmSync(path);
	}
});

describe("a request whose message was attempted and failed reports failure", () => {
	test("a delivery failure surfaces instead of a false success", async () => {
		const email = "existing@example.test";
		await createAccount(email);

		const sender = createRecordingMailSender();
		sender.failNext(new Error("connect ECONNREFUSED 127.0.0.1:1"));

		await expect(
			requestPasswordReset(authWith(sender), config, {
				email,
				redirectTo: "http://localhost:3000/reset-password",
			}),
		).rejects.toThrow(/could not be delivered/);
	});

	test("the failure is recorded with a reason and no credential", async () => {
		const email = "recorded-failure@example.test";
		await createAccount(email);

		const sender = createRecordingMailSender();
		// A provider that echoes the connection string.
		sender.failNext(new Error(`535 auth failed using ${MAIL_URL}`));

		let message = "";
		try {
			await requestPasswordReset(authWith(sender), config, {
				email,
				redirectTo: "http://localhost:3000/reset-password",
			});
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}

		expect(message).not.toContain(APP_PASSWORD);

		const rows = await db
			.select()
			.from(notifications)
			.where(eq(notifications.recipient, email));
		const failed = rows.find((row) => row.status === "FAILED");
		expect(failed).toBeDefined();
		expect(failed?.errorMessage?.length ?? 0).toBeGreaterThan(0);
		expect(failed?.errorMessage).not.toContain(APP_PASSWORD);
	});
});

describe("an address with no account stays neutral", () => {
	test("the request reports success and no message is attempted", async () => {
		const sender = createRecordingMailSender();
		const before = await mailAttempts();

		const result = await requestPasswordReset(authWith(sender), config, {
			email: "nobody-here@example.test",
			redirectTo: "http://localhost:3000/reset-password",
		});

		expect(result).toBe(true);
		// The transport was never invoked, and nothing was recorded for it.
		expect(sender.sent).toHaveLength(0);
		expect(await mailAttempts()).toBe(before);
	});
});

describe("no mail endpoint configured", () => {
	test("fails explicitly and attempts no delivery", async () => {
		const email = "existing@example.test";
		const sender = createRecordingMailSender();
		const before = await mailAttempts();

		await expect(
			requestPasswordReset(authWith(sender), withoutMail, {
				email,
				redirectTo: "http://localhost:3000/reset-password",
			}),
		).rejects.toThrow(/no mail sender is configured/);

		expect(sender.sent).toHaveLength(0);
		expect(await mailAttempts()).toBe(before);
	});
});

describe("the hook completes before the request returns", () => {
	test("the recorded attempt is already terminal when the call returns", async () => {
		const email = "terminal@example.test";
		await createAccount(email);

		// If delivery moved off the awaited path, the row would still be PENDING
		// here and the honest-outcome guarantee would silently stop holding.
		const sender = createRecordingMailSender();
		const result = await requestPasswordReset(authWith(sender), config, {
			email,
			redirectTo: "http://localhost:3000/reset-password",
		});
		expect(result).toBe(true);

		const rows = await db
			.select()
			.from(notifications)
			.where(eq(notifications.recipient, email));
		const latest = rows.at(-1);
		expect(latest?.status).toBe("SENT");
		expect(latest?.sentAt).not.toBeNull();
	});
});

describe("the composed link is the one the reset endpoint accepts", () => {
	test("the token from the message resets the password and signs in", async () => {
		const email = "roundtrip@example.test";
		await createAccount(email);

		const sender = createRecordingMailSender();
		const auth = authWith(sender);
		await requestPasswordReset(auth, config, {
			email,
			redirectTo: "http://localhost:3000/reset-password",
		});

		expect(sender.sent).toHaveLength(1);
		const message = sender.sent[0];
		expect(message.to).toBe(email);
		expect(message.from).toBe("lechcher@zohomail.com");
		expect(message.text).toContain(
			"http://localhost:3000/reset-password?token=",
		);

		const token = tokenFrom(message);
		expect(token.length).toBeGreaterThan(0);

		expect(
			await resetPassword(auth, { token, newPassword: NEW_PASSWORD }),
		).toBe(true);

		// The new password works, and the old one no longer does.
		const signedIn = await signIn(auth, db, {
			email,
			password: NEW_PASSWORD,
		});
		expect(signedIn.viewer.email).toBe(email);
		await expect(
			signIn(auth, db, { email, password: PASSWORD }),
		).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
	});

	test("the reset is recorded as delivered for that recipient", async () => {
		const email = "roundtrip@example.test";
		const rows = await db
			.select()
			.from(notifications)
			.where(eq(notifications.recipient, email));
		expect(rows.some((row) => row.status === "SENT")).toBe(true);
	});
});

describe("an invalid or expired token is a validation failure", () => {
	test("reports VALIDATION_FAILED carrying an INVALID_TOKEN reason", async () => {
		const auth = authWith(createRecordingMailSender());

		await expect(
			resetPassword(auth, {
				token: "not-a-real-token",
				newPassword: NEW_PASSWORD,
			}),
		).rejects.toMatchObject({
			code: "VALIDATION_FAILED",
			details: { reason: "INVALID_TOKEN" },
		});
	});

	test("a consumed token cannot be used twice", async () => {
		const email = "single-use@example.test";
		await createAccount(email);

		const sender = createRecordingMailSender();
		const auth = authWith(sender);
		await requestPasswordReset(auth, config, {
			email,
			redirectTo: "http://localhost:3000/reset-password",
		});
		const token = tokenFrom(sender.sent[0]);

		expect(
			await resetPassword(auth, { token, newPassword: NEW_PASSWORD }),
		).toBe(true);

		await expect(
			resetPassword(auth, { token, newPassword: "another-password-2026!" }),
		).rejects.toMatchObject({
			code: "VALIDATION_FAILED",
			details: { reason: "INVALID_TOKEN" },
		});
	});

	test("an expired token is rejected", async () => {
		const email = "expired-token@example.test";
		const userId = await createAccount(email);

		// A token that was issued but has already lapsed.
		const { verification } = await import("../db/schema");
		const token = "expired-token-value";
		await db.insert(verification).values({
			id: crypto.randomUUID(),
			identifier: `reset-password:${token}`,
			value: userId,
			expiresAt: new Date(Date.now() - 1000),
			createdAt: new Date(Date.now() - 7200_000),
			updatedAt: new Date(Date.now() - 7200_000),
		});

		const auth = authWith(createRecordingMailSender());
		await expect(
			resetPassword(auth, { token, newPassword: NEW_PASSWORD }),
		).rejects.toMatchObject({
			code: "VALIDATION_FAILED",
			details: { reason: "INVALID_TOKEN" },
		});

		// The password was not changed.
		const [row] = await db.select().from(user).where(eq(user.id, userId));
		expect(row.email).toBe(email);
		await expect(
			signIn(auth, db, { email, password: PASSWORD }),
		).resolves.toBeDefined();
	});
});
