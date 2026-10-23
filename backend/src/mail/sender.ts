/**
 * The outbound mail port and its SMTP implementation.
 *
 * The transport is an injected port so the automated suite never opens a socket
 * and no code path learns which provider is configured — which is what keeps the
 * move from a hosted provider to a local mail server a configuration change.
 *
 * `nodemailer` parses the connection URL, so the URL itself selects the mode:
 * `smtps://` establishes TLS before the SMTP conversation, `smtp://` upgrades to
 * TLS when the server offers it, and an endpoint without credentials is used
 * unauthenticated.
 */

import nodemailer, { type SentMessageInfo, type Transporter } from "nodemailer";
import type { MailEndpoint } from "../config";

export interface MailMessage {
	/** Sender identity; must be an address the transport is authorised to use. */
	readonly from: string;
	readonly to: string;
	readonly subject: string;
	readonly text: string;
	readonly html?: string;
}

/** Sends a message, or throws. */
export interface MailSender {
	send(message: MailMessage): Promise<void>;
}

/**
 * A delivery failure carrying a message that is safe to record and to return.
 *
 * It never includes the connection URL or the credential.
 */
export class MailDeliveryError extends Error {
	constructor(
		message: string,
		readonly code: string,
	) {
		super(message);
		this.name = "MailDeliveryError";
	}
}

/**
 * Remove anything that could carry the credential out of a piece of text.
 *
 * Server responses are generally safe, but a provider can echo the connection
 * string, and the password would then reach a log or an API response.
 */
export function createCredentialScrubber(
	url: string,
): (text: string) => string {
	let password = "";
	try {
		password = decodeURIComponent(new URL(url).password);
	} catch {
		password = "";
	}

	return (text: string) => {
		let scrubbed = text.split(url).join("[mail endpoint]");
		if (password.length > 0) {
			scrubbed = scrubbed.split(password).join("[redacted]");
			// A provider may echo the percent-encoded form too.
			const encoded = encodeURIComponent(password);
			if (encoded !== password) {
				scrubbed = scrubbed.split(encoded).join("[redacted]");
			}
		}
		return scrubbed;
	};
}

export interface SmtpMailSender extends MailSender {
	/** The resolved connection settings, for assertions and diagnostics. */
	describe(): {
		host: string;
		port: number;
		secure: boolean;
		hasAuth: boolean;
		ignoreTLS: boolean;
	};
}

export function createSmtpMailSender(endpoint: MailEndpoint): SmtpMailSender {
	const scrub = createCredentialScrubber(endpoint.url);

	// The endpoint's validated form decides the mode: `smtps` (or port 465) is
	// TLS from the start, anything else lets the server upgrade via STARTTLS, and
	// an endpoint without credentials is used unauthenticated.
	const parsed = new URL(endpoint.url);
	const auth = endpoint.hasCredentials
		? {
				user: decodeURIComponent(parsed.username),
				pass: decodeURIComponent(parsed.password),
			}
		: undefined;

	const transport: Transporter = nodemailer.createTransport({
		host: endpoint.host,
		port: endpoint.port,
		secure: endpoint.secure,
		...(auth ? { auth } : {}),
	});

	return {
		describe: () => ({
			host: endpoint.host,
			port: endpoint.port,
			secure: endpoint.secure,
			hasAuth: auth !== undefined,
			// STARTTLS must stay available, or the upgrade would never happen.
			ignoreTLS: false,
		}),

		async send(message: MailMessage): Promise<void> {
			let info: SentMessageInfo;
			try {
				info = await transport.sendMail({
					from: message.from,
					to: message.to,
					subject: message.subject,
					text: message.text,
					html: message.html,
				});
			} catch (error) {
				throw toDeliveryError(error, scrub);
			}

			// The server can accept the connection and still refuse the recipient.
			if (info.rejected?.length) {
				throw new MailDeliveryError(
					`The mail server refused the recipient: ${scrub(
						info.rejected.join(", "),
					)}`,
					"EENVELOPE",
				);
			}
		},
	};
}

/** Map a transport failure onto a safe, recorded reason. */
export function toDeliveryError(
	error: unknown,
	scrub: (text: string) => string = (text) => text,
): MailDeliveryError {
	if (error instanceof MailDeliveryError) return error;

	const candidate = error as { code?: unknown; message?: unknown };
	const code =
		typeof candidate?.code === "string" && candidate.code.length > 0
			? candidate.code
			: "EUNKNOWN";
	const message =
		typeof candidate?.message === "string" && candidate.message.length > 0
			? candidate.message
			: "The mail server did not accept the message.";

	return new MailDeliveryError(scrub(message), code);
}

/** An in-memory sender for tests: records messages, never opens a socket. */
export interface RecordingMailSender extends MailSender {
	readonly sent: MailMessage[];
	/** Make the next send fail with the given error. */
	failNext(error: Error): void;
	/** Make every subsequent send fail with the given error. */
	failAlways(error: Error): void;
}

export function createRecordingMailSender(): RecordingMailSender {
	const sent: MailMessage[] = [];
	const queued: Error[] = [];
	let persistent: Error | null = null;

	return {
		sent,
		failNext(error: Error) {
			queued.push(error);
		},
		failAlways(error: Error) {
			persistent = error;
		},
		async send(message: MailMessage): Promise<void> {
			const failure = queued.shift() ?? persistent;
			if (failure) throw failure;
			sent.push(message);
		},
	};
}
