/**
 * Self-service email change: the verified request and the applied token.
 *
 * The transport is injected, so nothing here opens a socket. The loop test
 * extracts the token out of the message this system actually composed and
 * consumes it, which is what proves the link we build is the one the auth
 * library accepts — and that the change only lands after confirmation.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { type AppConfig, loadConfig } from "../config";
import type { DatabaseHandle } from "../db";
import { notifications, user } from "../db/schema";
import { createTestDatabase, type TestDatabase } from "../db/test-db";
import { createRecordingMailSender, type RecordingMailSender } from "../mail";
import {
	type Auth,
	confirmEmailChange,
	createAuth,
	requestEmailChange,
	signIn,
} from "./index";

let testDb: TestDatabase;

const PASSWORD = "dev-password-2026!";
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
		body: { email, password: PASSWORD, name: "Email Change Tester" },
	});
	return result.user.id;
}

async function signedInHeaders(
	email: string,
	password = PASSWORD,
): Promise<Headers> {
	const auth = authWith(createRecordingMailSender());
	const { token } = await signIn(auth, db, { email, password });
	return new Headers({ authorization: `Bearer ${token}` });
}

function emailRow(userId: string) {
	return db.select().from(user).where(eq(user.id, userId)).limit(1);
}

beforeAll(async () => {
	testDb = await createTestDatabase();
	db = testDb.db;
	config = loadConfig({
		NODE_ENV: "test",
		MES_DATABASE_URL: testDb.connectionString,
		MES_SMTP_URL: MAIL_URL,
		MES_WEB_ORIGIN: "http://localhost:3000",
		MES_RESET_EMAIL_FROM: "lechcher@zohomail.com",
	});
	withoutMail = loadConfig({
		NODE_ENV: "test",
		MES_DATABASE_URL: testDb.connectionString,
		MES_WEB_ORIGIN: "http://localhost:3000",
	});
});

afterAll(async () => {
	await testDb.close();
});
describe("user creation sends no verification mail", () => {
	test("the library's sign-up endpoint does not fire the change-email hook", async () => {
		const email = "no-mail-on-signup@example.test";
		const sender = createRecordingMailSender();

		// The hook that mails verification tokens is configured globally, so
		// this pins the boundary: MES creates users through the GraphQL
		// `createUser` mutation, and the one library endpoint the tests use for
		// account setup must not start sending mail either.
		await authWith(sender).api.signUpEmail({
			body: { email, password: PASSWORD, name: "No Mail On Signup" },
		});

		expect(sender.sent).toHaveLength(0);
		const rows = await db
			.select()
			.from(notifications)
			.where(eq(notifications.recipient, email));
		expect(rows).toHaveLength(0);
	});
});

describe("the request needs the caller's current password", () => {
	test("a wrong current password is rejected and nothing is sent", async () => {
		const email = "wrong-current@example.test";
		const userId = await createAccount(email);
		const sender = createRecordingMailSender();

		await expect(
			requestEmailChange(
				authWith(sender),
				db,
				config,
				await signedInHeaders(email),
				{
					currentPassword: "not-the-password",
					newEmail: "changed@example.test",
				},
			),
		).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

		expect(sender.sent).toHaveLength(0);
		const [row] = await emailRow(userId);
		expect(row.email).toBe(email);
	});

	test("the current address is rejected without sending", async () => {
		const email = "same-address@example.test";
		await createAccount(email);
		const sender = createRecordingMailSender();

		await expect(
			requestEmailChange(
				authWith(sender),
				db,
				config,
				await signedInHeaders(email),
				{
					currentPassword: PASSWORD,
					newEmail: email,
				},
			),
		).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

		expect(sender.sent).toHaveLength(0);
	});

	test("an empty new address is rejected", async () => {
		const email = "empty-new@example.test";
		await createAccount(email);
		const sender = createRecordingMailSender();

		await expect(
			requestEmailChange(
				authWith(sender),
				db,
				config,
				await signedInHeaders(email),
				{
					currentPassword: PASSWORD,
					newEmail: "   ",
				},
			),
		).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

		expect(sender.sent).toHaveLength(0);
	});

	test("a request without a session is unauthenticated", async () => {
		const email = "no-session@example.test";
		await createAccount(email);

		await expect(
			requestEmailChange(
				authWith(createRecordingMailSender()),
				db,
				config,
				new Headers(),
				{
					currentPassword: PASSWORD,
					newEmail: "changed@example.test",
				},
			),
		).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
	});
});

describe("a taken address is a visible conflict", () => {
	test("a duplicate address is rejected and no message is attempted", async () => {
		const email = "owner@example.test";
		const userId = await createAccount(email);
		const other = "taken@example.test";
		await createAccount(other);
		const sender = createRecordingMailSender();

		await expect(
			requestEmailChange(
				authWith(sender),
				db,
				config,
				await signedInHeaders(email),
				{
					currentPassword: PASSWORD,
					newEmail: other,
				},
			),
		).rejects.toMatchObject({ code: "CONFLICT" });

		expect(sender.sent).toHaveLength(0);
		const [row] = await emailRow(userId);
		expect(row.email).toBe(email);
	});
});

describe("mail failures and missing configuration are explicit", () => {
	test("a delivery failure surfaces instead of a false success", async () => {
		const email = "mail-failed@example.test";
		const userId = await createAccount(email);

		const sender = createRecordingMailSender();
		sender.failNext(new Error("connect ECONNREFUSED 127.0.0.1:1"));

		await expect(
			requestEmailChange(
				authWith(sender),
				db,
				config,
				await signedInHeaders(email),
				{
					currentPassword: PASSWORD,
					newEmail: "failed-change@example.test",
				},
			),
		).rejects.toThrow(/could not be delivered/);

		const [row] = await emailRow(userId);
		expect(row.email).toBe(email);
	});

	test("the failure is recorded with a reason and no credential", async () => {
		const email = "mail-failed-recorded@example.test";
		await createAccount(email);

		const sender = createRecordingMailSender();
		sender.failNext(new Error(`535 auth failed using ${MAIL_URL}`));

		let message = "";
		try {
			await requestEmailChange(
				authWith(sender),
				db,
				config,
				await signedInHeaders(email),
				{
					currentPassword: PASSWORD,
					newEmail: "failed-recorded@example.test",
				},
			);
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}

		expect(message).not.toContain(APP_PASSWORD);

		const rows = await db
			.select()
			.from(notifications)
			.where(eq(notifications.recipient, "failed-recorded@example.test"));
		const failed = rows.find((row) => row.status === "FAILED");
		expect(failed).toBeDefined();
		expect(failed?.errorMessage?.length ?? 0).toBeGreaterThan(0);
		expect(failed?.errorMessage).not.toContain(APP_PASSWORD);
	});

	test("no mail endpoint configured fails explicitly and sends nothing", async () => {
		const email = "no-mail@example.test";
		await createAccount(email);
		const sender = createRecordingMailSender();

		await expect(
			requestEmailChange(
				authWith(sender),
				db,
				withoutMail,
				await signedInHeaders(email),
				{
					currentPassword: PASSWORD,
					newEmail: "unreachable@example.test",
				},
			),
		).rejects.toThrow(/no mail sender is configured/);

		expect(sender.sent).toHaveLength(0);
	});
});

describe("the composed link is the one the verification endpoint accepts", () => {
	test("the token from the message applies the change and the old address stops signing in", async () => {
		const email = "roundtrip@example.test";
		const userId = await createAccount(email);
		const newEmail = "roundtrip-new@example.test";

		const sender = createRecordingMailSender();
		await requestEmailChange(
			authWith(sender),
			db,
			config,
			await signedInHeaders(email),
			{
				currentPassword: PASSWORD,
				newEmail,
			},
		);

		expect(sender.sent).toHaveLength(1);
		const message = sender.sent[0];
		expect(message.to).toBe(newEmail);
		expect(message.from).toBe("lechcher@zohomail.com");
		expect(message.text).toContain(
			"http://localhost:3000/confirm-email?token=",
		);

		// The address is unchanged until the link is opened.
		const [before] = await emailRow(userId);
		expect(before.email).toBe(email);

		const result = await confirmEmailChange(authWith(sender), db, {
			token: tokenFrom(message),
		});
		expect(result.from).toBe(email);
		expect(result.to).toBe(newEmail);
		expect(result.userId).toBe(userId);

		const [after] = await emailRow(userId);
		expect(after.email).toBe(newEmail);

		const auth = authWith(sender);
		const signedIn = await signIn(auth, db, {
			email: newEmail,
			password: PASSWORD,
		});
		expect(signedIn.viewer.email).toBe(newEmail);
		await expect(
			signIn(auth, db, { email, password: PASSWORD }),
		).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
	});

	test("the delivered attempt is recorded for the new address", async () => {
		const rows = await db
			.select()
			.from(notifications)
			.where(eq(notifications.recipient, "roundtrip-new@example.test"));
		expect(rows.some((row) => row.status === "SENT")).toBe(true);
	});
});

describe("an unusable link is a validation failure", () => {
	test("a token that is not a JWT is rejected", async () => {
		await expect(
			confirmEmailChange(authWith(createRecordingMailSender()), db, {
				token: "not-a-real-token",
			}),
		).rejects.toMatchObject({
			code: "VALIDATION_FAILED",
			details: { reason: "INVALID_TOKEN" },
		});
	});

	test("a confirmed token cannot be applied twice", async () => {
		const email = "single-use@example.test";
		const userId = await createAccount(email);

		const sender = createRecordingMailSender();
		const auth = authWith(sender);
		await requestEmailChange(auth, db, config, await signedInHeaders(email), {
			currentPassword: PASSWORD,
			newEmail: "single-use-new@example.test",
		});
		const token = tokenFrom(sender.sent[0]);

		await confirmEmailChange(auth, db, { token });

		await expect(confirmEmailChange(auth, db, { token })).rejects.toMatchObject(
			{
				code: "VALIDATION_FAILED",
				details: { reason: "INVALID_TOKEN" },
			},
		);

		const [row] = await emailRow(userId);
		expect(row.email).toBe("single-use-new@example.test");
	});
});

describe("a duplicate address at confirmation time is a conflict", () => {
	test("a race that takes the address reports a conflict and changes nothing", async () => {
		const email = "race@example.test";
		const userId = await createAccount(email);
		const wanted = "race-wanted@example.test";
		await createAccount("race-other@example.test");

		const sender = createRecordingMailSender();
		const auth = authWith(sender);
		await requestEmailChange(auth, db, config, await signedInHeaders(email), {
			currentPassword: PASSWORD,
			newEmail: wanted,
		});
		const token = tokenFrom(sender.sent[0]);

		// Another account takes the address while the link waits to be opened.
		await db
			.update(user)
			.set({ email: wanted })
			.where(eq(user.email, "race-other@example.test"));

		await expect(confirmEmailChange(auth, db, { token })).rejects.toMatchObject(
			{ code: "CONFLICT" },
		);

		const [row] = await emailRow(userId);
		expect(row.email).toBe(email);
	});
});
