/**
 * Self-service credential operations through the GraphQL surface.
 *
 * Covers the contract-visible behavior the auth operations must show: a
 * request needs a session, the confirmation is token-bound, and a completed
 * password or email change records exactly one audit event carrying the actor
 * and the addresses — never a password, token, or hash.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { type Auth, createAuth, signIn } from "../auth";
import { type AppConfig, loadConfig } from "../config";
import type { DatabaseHandle } from "../db";
import { systemAuditLogs, user } from "../db/schema";
import { createTestDatabase, type TestDatabase } from "../db/test-db";
import { createRecordingMailSender } from "../mail";
import { executeGraphQL } from "./index";

const PASSWORD = "dev-password-2026!";
const NEW_PASSWORD = "changed-password-2026!";
const APP_PASSWORD = "sup3r-s3cret-app-password";
const MAIL_URL = `smtps://lechcher@zohomail.com:${APP_PASSWORD}@smtp.zoho.com:465`;

let testDb: TestDatabase;
let db: DatabaseHandle;
let config: AppConfig;
let auth: Auth;
let sender: ReturnType<typeof createRecordingMailSender>;

function request(body: unknown, bearer?: string): Request {
	return new Request("http://localhost:3001/api/v1/graphql", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
		},
		body: JSON.stringify(body),
	});
}

async function execute(body: unknown, bearer?: string) {
	return executeGraphQL(body as never, {
		db,
		config,
		request: request(body, bearer),
		auth,
	});
}

async function createAccount(email: string): Promise<string> {
	const result = await auth.api.signUpEmail({
		body: { email, password: PASSWORD, name: `Account ${email}` },
	});
	return result.user.id;
}

async function tokenFor(email: string, password = PASSWORD): Promise<string> {
	const { token } = await signIn(auth, db, { email, password });
	return token;
}

function auditEvents() {
	return db.select().from(systemAuditLogs);
}

function tokenFromMessage(message: { text: string }): string {
	const match = message.text.match(/https?:\/\/\S+/);
	if (!match) throw new Error("no link in the composed message");
	return new URL(match[0]).searchParams.get("token") ?? "";
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
	sender = createRecordingMailSender();
	auth = createAuth(db, config, { mailSender: sender });
});

afterAll(async () => {
	await testDb.close();
});
describe("changePassword through the contract", () => {
	test("a correct current password changes it and records one event without the credential", async () => {
		const email = "gql-password@example.test";
		const userId = await createAccount(email);

		const result = await execute(
			{
				query: /* GraphQL */ `
					mutation Change($input: ChangePasswordInput!) {
						changePassword(input: $input)
					}
				`,
				variables: {
					input: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
				},
			},
			await tokenFor(email),
		);

		expect(result.errors).toBeUndefined();
		expect(result.data).toEqual({ changePassword: true });

		const events = (await auditEvents()).filter(
			(event) => event.resourceId === userId,
		);
		expect(events).toHaveLength(1);
		expect(events[0].userId).toBe(userId);
		expect(events[0].action).toBe("user.password_change");
		expect(events[0].moduleCode).toBe("settings");
		const payload = `${events[0].oldData ?? ""}${events[0].newData ?? ""}`;
		expect(payload).not.toContain(PASSWORD);
		expect(payload).not.toContain(NEW_PASSWORD);

		// The new password signs in; the old one no longer does.
		expect((await tokenFor(email, NEW_PASSWORD)).length).toBeGreaterThan(0);
		await expect(tokenFor(email, PASSWORD)).rejects.toMatchObject({
			code: "UNAUTHENTICATED",
		});
	});

	test("a wrong current password fails and records nothing", async () => {
		const email = "gql-password-reject@example.test";
		const userId = await createAccount(email);

		const result = await execute(
			{
				query: /* GraphQL */ `
					mutation Change($input: ChangePasswordInput!) {
						changePassword(input: $input)
					}
				`,
				variables: {
					input: { currentPassword: "wrong", newPassword: NEW_PASSWORD },
				},
			},
			await tokenFor(email),
		);

		expect(result.errors?.[0]?.extensions?.code).toBe("VALIDATION_FAILED");
		expect(result.data).toBeNull();
		expect(
			(await auditEvents()).some((event) => event.resourceId === userId),
		).toBe(false);
	});

	test("a request without a session is unauthenticated", async () => {
		const result = await execute({
			query: /* GraphQL */ `
				mutation Change($input: ChangePasswordInput!) {
					changePassword(input: $input)
				}
			`,
			variables: {
				input: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
			},
		});

		expect(result.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
	});
});

describe("requestEmailChange through the contract", () => {
	test("a request without a session is unauthenticated", async () => {
		const email = "gql-request-open@example.test";
		await createAccount(email);

		const result = await execute({
			query: /* GraphQL */ `
				mutation Request($input: RequestEmailChangeInput!) {
					requestEmailChange(input: $input)
				}
			`,
			variables: {
				input: { currentPassword: PASSWORD, newEmail: "open-new@example.test" },
			},
		});

		expect(result.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
		expect(sender.sent).toHaveLength(0);
	});

	test("a wrong current password fails and no message is sent", async () => {
		const email = "gql-request-wrong@example.test";
		await createAccount(email);

		const result = await execute(
			{
				query: /* GraphQL */ `
					mutation Request($input: RequestEmailChangeInput!) {
						requestEmailChange(input: $input)
					}
				`,
				variables: {
					input: {
						currentPassword: "wrong",
						newEmail: "open-new@example.test",
					},
				},
			},
			await tokenFor(email),
		);

		expect(result.errors?.[0]?.extensions?.code).toBe("VALIDATION_FAILED");
		expect(sender.sent).toHaveLength(0);
	});
});

describe("confirmEmailChange through the contract", () => {
	test("a valid token applies the change and records the addresses", async () => {
		const email = "gql-confirm@example.test";
		const userId = await createAccount(email);
		const newEmail = "gql-confirm-new@example.test";

		await execute(
			{
				query: /* GraphQL */ `
					mutation Request($input: RequestEmailChangeInput!) {
						requestEmailChange(input: $input)
					}
				`,
				variables: { input: { currentPassword: PASSWORD, newEmail } },
			},
			await tokenFor(email),
		);
		expect(sender.sent).toHaveLength(1);
		const token = tokenFromMessage(sender.sent[0]);

		// No session: the token is what binds the change to this account.
		const result = await execute({
			query: /* GraphQL */ `
				mutation Confirm($token: String!) {
					confirmEmailChange(token: $token)
				}
			`,
			variables: { token },
		});

		expect(result.errors).toBeUndefined();
		expect(result.data).toEqual({ confirmEmailChange: true });

		const [row] = await db.select().from(user).where(eq(user.id, userId));
		expect(row.email).toBe(newEmail);

		const events = (await auditEvents()).filter(
			(event) => event.action === "user.email_change",
		);
		expect(events).toHaveLength(1);
		expect(events[0].userId).toBe(userId);
		expect(events[0].resourceId).toBe(userId);
		expect(events[0].moduleCode).toBe("settings");
		const oldData = JSON.parse(events[0].oldData ?? "{}") as { email?: string };
		const newData = JSON.parse(events[0].newData ?? "{}") as { email?: string };
		expect(oldData.email).toBe(email);
		expect(newData.email).toBe(newEmail);
		expect(
			`${events[0].oldData ?? ""}${events[0].newData ?? ""}`,
		).not.toContain(token);
	});

	test("a token issued to one account lands on that account whoever presents it", async () => {
		const email = "gql-confirm-binder@example.test";
		const userId = await createAccount(email);
		const newEmail = "gql-binder-new@example.test";
		const otherEmail = "gql-confirm-other@example.test";
		const otherId = await createAccount(otherEmail);

		await execute(
			{
				query: /* GraphQL */ `
					mutation Request($input: RequestEmailChangeInput!) {
						requestEmailChange(input: $input)
					}
				`,
				variables: { input: { currentPassword: PASSWORD, newEmail } },
			},
			await tokenFor(email),
		);
		const token = tokenFromMessage(sender.sent.at(-1) as { text: string });

		// Another account presents the link.
		const result = await execute(
			{
				query: /* GraphQL */ `
					mutation Confirm($token: String!) {
						confirmEmailChange(token: $token)
					}
				`,
				variables: { token },
			},
			await tokenFor(otherEmail),
		);

		expect(result.errors).toBeUndefined();
		expect(result.data).toEqual({ confirmEmailChange: true });

		const [changed] = await db.select().from(user).where(eq(user.id, userId));
		expect(changed.email).toBe(newEmail);

		const [unchanged] = await db
			.select()
			.from(user)
			.where(eq(user.id, otherId));
		expect(unchanged.email).toBe(otherEmail);
	});

	test("a token that is not real is refused", async () => {
		const result = await execute({
			query: /* GraphQL */ `
				mutation Confirm($token: String!) {
					confirmEmailChange(token: $token)
				}
			`,
			variables: { token: "not-a-real-token" },
		});

		expect(result.errors?.[0]?.extensions?.code).toBe("VALIDATION_FAILED");
	});
});
