/**
 * Mail transport, composition, and recorded outcomes.
 *
 * Covers the three modes the two phases need, that the reset link points at the
 * web application, that every attempt is recorded with an outcome, and that the
 * credential never reaches a record or a returned error.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { type AppConfig, loadConfig } from "../config";
import { createDatabase, type DatabaseHandle } from "../db";
import { runMigrations } from "../db/migrate";
import { notifications } from "../db/schema";
import { deliverMail, MAIL_CHANNEL, PASSWORD_RESET_TEMPLATE } from "./delivery";
import {
	buildResetUrl,
	composePasswordResetMessage,
	RESET_ROUTE_PATH,
} from "./reset-message";
import {
	createCredentialScrubber,
	createRecordingMailSender,
	createSmtpMailSender,
	MailDeliveryError,
} from "./sender";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const dbPath = join(TMP_ROOT, `mes-mail-${crypto.randomUUID()}.db`);

const APP_PASSWORD = "sup3r-s3cret-app-password";
const ZOHO_TLS = `smtps://lechcher@zohomail.com:${APP_PASSWORD}@smtp.zoho.com:465`;
const ZOHO_STARTTLS = `smtp://lechcher@zohomail.com:${APP_PASSWORD}@smtp.zoho.com:587`;
const LOCAL = "smtp://localhost:1025";

let db: DatabaseHandle;
let config: AppConfig;

function endpointFor(url: string) {
	const parsed = loadConfig({
		NODE_ENV: "test",
		MES_SMTP_URL: url,
	}).mailEndpoint;
	if (!parsed) throw new Error("expected a parsed endpoint");
	return parsed;
}

beforeAll(() => {
	runMigrations({ databasePath: dbPath });
	config = loadConfig({
		NODE_ENV: "test",
		MES_DATABASE_PATH: dbPath,
		MES_WEB_ORIGIN: "http://localhost:3000",
		MES_RESET_EMAIL_FROM: "lechcher@zohomail.com",
	});
	db = createDatabase(dbPath);
});

afterAll(() => {
	for (const suffix of ["", "-wal", "-shm"]) {
		const path = `${dbPath}${suffix}`;
		if (existsSync(path)) rmSync(path);
	}
});

describe("transport mode follows the configured endpoint", () => {
	test("implicit TLS: the endpoint is secured before the conversation", () => {
		const described = createSmtpMailSender(endpointFor(ZOHO_TLS)).describe();
		expect(described.host).toBe("smtp.zoho.com");
		expect(described.port).toBe(465);
		expect(described.secure).toBe(true);
		expect(described.hasAuth).toBe(true);
	});

	test("STARTTLS: the connection is upgraded, not initially secured", () => {
		const described = createSmtpMailSender(
			endpointFor(ZOHO_STARTTLS),
		).describe();
		expect(described.port).toBe(587);
		expect(described.secure).toBe(false);
		expect(described.hasAuth).toBe(true);
		// STARTTLS must not be disabled, or the upgrade would never happen.
		expect(described.ignoreTLS).toBe(false);
	});

	test("local: no TLS and no authentication", () => {
		const described = createSmtpMailSender(endpointFor(LOCAL)).describe();
		expect(described.host).toBe("localhost");
		expect(described.port).toBe(1025);
		expect(described.secure).toBe(false);
		expect(described.hasAuth).toBe(false);
	});

	test("no sender opens a socket when it is only described", () => {
		// Describing must not connect: the suite would otherwise need a server.
		expect(() =>
			createSmtpMailSender(endpointFor(ZOHO_TLS)).describe(),
		).not.toThrow();
	});
});

describe("reset mail links to the web application", () => {
	const input = {
		to: "employee@mes.local",
		recipientName: "Mina Park",
		token: "tok_abc123",
		from: "lechcher@zohomail.com",
		webOrigin: "http://localhost:3000",
	};

	test("the link uses the web origin's reset route and carries the token", () => {
		const url = buildResetUrl(input.webOrigin, input.token);
		expect(url).toBe(
			`http://localhost:3000${RESET_ROUTE_PATH}?token=tok_abc123`,
		);
	});

	test("the link never points at the API origin", () => {
		const message = composePasswordResetMessage(input);
		expect(message.text).not.toContain(":3001");
		expect(message.html).not.toContain(":3001");
	});

	test("the message identifies the configured sender", () => {
		expect(composePasswordResetMessage(input).from).toBe(
			"lechcher@zohomail.com",
		);
	});

	test("a trailing slash on the web origin does not double up", () => {
		expect(buildResetUrl("http://localhost:3000/", "t")).toBe(
			"http://localhost:3000/reset-password?token=t",
		);
	});

	test("the link appears in both the text and the html body", () => {
		const message = composePasswordResetMessage(input);
		const url = buildResetUrl(input.webOrigin, input.token);
		expect(message.text).toContain(url);
		expect(message.html).toContain(url);
	});

	test("a token needing encoding is encoded in the link", () => {
		expect(buildResetUrl("http://localhost:3000", "a+b/c=")).toContain(
			"token=a%2Bb%2Fc%3D",
		);
	});
});

describe("every delivery attempt records its outcome", () => {
	test("a successful delivery is recorded as sent", async () => {
		const sender = createRecordingMailSender();
		const message = composePasswordResetMessage({
			to: "employee@mes.local",
			token: "tok_sent",
			from: "lechcher@zohomail.com",
			webOrigin: "http://localhost:3000",
		});

		const outcome = await deliverMail({ db, sender }, message, {
			template: PASSWORD_RESET_TEMPLATE,
			relatedType: "USER",
			relatedId: "user-1",
		});

		expect(outcome.status).toBe("SENT");
		expect(outcome.delivered).toBe(true);
		expect(outcome.errorMessage).toBeNull();
		expect(sender.sent).toHaveLength(1);

		const [row] = await db
			.select()
			.from(notifications)
			.where(eq(notifications.id, outcome.notificationId));
		expect(row.channel).toBe(MAIL_CHANNEL);
		expect(row.template).toBe(PASSWORD_RESET_TEMPLATE);
		expect(row.recipient).toBe("employee@mes.local");
		expect(row.status).toBe("SENT");
		expect(row.sentAt).not.toBeNull();
		expect(row.errorMessage).toBeNull();
		expect(row.relatedType).toBe("USER");
		expect(row.relatedId).toBe("user-1");
	});

	test("a refused delivery is recorded as failed with a reason", async () => {
		const sender = createRecordingMailSender();
		sender.failNext(new MailDeliveryError("Invalid login: 535", "EAUTH"));

		const outcome = await deliverMail(
			{ db, sender },
			composePasswordResetMessage({
				to: "employee@mes.local",
				token: "tok_failed",
				from: "lechcher@zohomail.com",
				webOrigin: "http://localhost:3000",
			}),
			{ template: PASSWORD_RESET_TEMPLATE },
		);

		expect(outcome.status).toBe("FAILED");
		expect(outcome.delivered).toBe(false);
		expect(outcome.errorMessage).toContain("535");
		expect(outcome.errorCode).toBe("EAUTH");

		const [row] = await db
			.select()
			.from(notifications)
			.where(eq(notifications.id, outcome.notificationId));
		expect(row.status).toBe("FAILED");
		expect(row.errorMessage?.length ?? 0).toBeGreaterThan(0);
		expect(row.sentAt).toBeNull();
		expect(row.attempts).toBe(1);
	});

	test("an unreachable server records a connection failure", async () => {
		const sender = createRecordingMailSender();
		sender.failNext(
			Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1"), {
				code: "ECONNECTION",
			}),
		);

		const outcome = await deliverMail(
			{ db, sender },
			composePasswordResetMessage({
				to: "employee@mes.local",
				token: "tok_conn",
				from: "lechcher@zohomail.com",
				webOrigin: "http://localhost:3000",
			}),
			{ template: PASSWORD_RESET_TEMPLATE },
		);

		expect(outcome.errorCode).toBe("ECONNECTION");
		expect(outcome.errorMessage).toContain("ECONNREFUSED");
	});
});

describe("the mail credential is never disclosed", () => {
	test("the scrubber removes the password and the connection string", () => {
		const scrub = createCredentialScrubber(ZOHO_TLS);
		expect(scrub(`failed for ${ZOHO_TLS}`)).not.toContain(APP_PASSWORD);
		expect(scrub(`password ${APP_PASSWORD} rejected`)).not.toContain(
			APP_PASSWORD,
		);
		expect(scrub(`encoded ${encodeURIComponent(APP_PASSWORD)}`)).not.toContain(
			APP_PASSWORD,
		);
	});

	test("a scrubber for an unauthenticated endpoint is harmless", () => {
		const scrub = createCredentialScrubber(LOCAL);
		expect(scrub("nothing to redact")).toBe("nothing to redact");
	});

	test("a recorded reason never contains the credential", async () => {
		const sender = createRecordingMailSender();
		// A provider that echoes the connection string in its rejection.
		sender.failNext(
			new MailDeliveryError(`Authentication failed for ${ZOHO_TLS}`, "EAUTH"),
		);

		const outcome = await deliverMail(
			{
				db,
				sender,
				redact: createCredentialScrubber(ZOHO_TLS),
			},
			composePasswordResetMessage({
				to: "employee@mes.local",
				token: "tok_secret",
				from: "lechcher@zohomail.com",
				webOrigin: "http://localhost:3000",
			}),
			{ template: PASSWORD_RESET_TEMPLATE },
		);

		expect(outcome.errorMessage).not.toContain(APP_PASSWORD);
		expect(outcome.errorMessage).toMatch(/\[redacted\]|\[mail endpoint\]/);

		const [row] = await db
			.select()
			.from(notifications)
			.where(eq(notifications.id, outcome.notificationId));
		expect(row.errorMessage).not.toContain(APP_PASSWORD);
		expect(JSON.stringify(row)).not.toContain(APP_PASSWORD);
	});
});
