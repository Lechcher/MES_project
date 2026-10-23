/**
 * Password-reset message composition.
 *
 * The link is built here rather than taken from the auth library, whose own
 * ``/reset-password/<token>`` URL is rooted at the API origin — where no reset
 * page exists. The link must point at the web application.
 */

import type { MailMessage } from "./sender";

export interface ResetMessageInput {
	/** Recipient address. */
	to: string;
	/** Display name of the account, when known. */
	recipientName?: string | null;
	/** The token issued for this reset. */
	token: string;
	/** Sender identity the transport is authorised to use. */
	from: string;
	/** Web application origin, e.g. `http://localhost:3000`. */
	webOrigin: string;
}

export const RESET_ROUTE_PATH = "/reset-password";

/**
 * The web application URL a reset recipient must open.
 * Exported so the route and the message can never drift apart.
 */
export function buildResetUrl(webOrigin: string, token: string): string {
	const base = webOrigin.replace(/\/+$/, "");
	return `${base}${RESET_ROUTE_PATH}?token=${encodeURIComponent(token)}`;
}

export function composePasswordResetMessage(
	input: ResetMessageInput,
): MailMessage {
	const url = buildResetUrl(input.webOrigin, input.token);
	const greeting = input.recipientName
		? `Hello ${input.recipientName},`
		: "Hello,";

	const text = [
		greeting,
		"",
		"A password reset was requested for your MES account.",
		"Open the link below to choose a new password:",
		"",
		url,
		"",
		"The link expires in one hour. If you did not request this, you can ignore this message and your password will stay unchanged.",
	].join("\n");

	const html = [
		`<p>${escapeHtml(greeting)}</p>`,
		"<p>A password reset was requested for your MES account. " +
			"Open the link below to choose a new password:</p>",
		`<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`,
		"<p>The link expires in one hour. If you did not request this, you can " +
			"ignore this message and your password will stay unchanged.</p>",
	].join("");

	return {
		from: input.from,
		to: input.to,
		subject: "Reset your MES password",
		text,
		html,
	};
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
