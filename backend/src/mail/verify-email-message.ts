/**
 * Email-change verification message composition.
 *
 * Same shape as the reset message: the link is built here rather than taken from
 * the auth library, whose own ``/verify-email`` URL is rooted at the API origin —
 * where no confirmation page exists. The link must point at the web application,
 * and the token it carries is applied through the GraphQL contract, so no other
 * library route is browser-facing either.
 */

import type { MailMessage } from "./sender";

export interface EmailChangeMessageInput {
	/** Recipient address — the NEW address the user asked to use. */
	to: string;
	/** Display name of the account, when known. */
	recipientName?: string | null;
	/** The token issued for this email change. */
	token: string;
	/** Sender identity the transport is authorised to use. */
	from: string;
	/** Web application origin, e.g. `http://localhost:3000`. */
	webOrigin: string;
}

export const CONFIRM_EMAIL_ROUTE_PATH = "/confirm-email";

/**
 * The web application URL a verification recipient must open.
 * Exported so the route and the message can never drift apart.
 */
export function buildConfirmEmailUrl(webOrigin: string, token: string): string {
	const base = webOrigin.replace(/\/+$/, "");
	return `${base}${CONFIRM_EMAIL_ROUTE_PATH}?token=${encodeURIComponent(token)}`;
}

export function composeEmailChangeMessage(
	input: EmailChangeMessageInput,
): MailMessage {
	const url = buildConfirmEmailUrl(input.webOrigin, input.token);
	const greeting = input.recipientName
		? `Hello ${input.recipientName},`
		: "Hello,";

	const text = [
		greeting,
		"",
		"An email change was requested for your MES account.",
		"Open the link below to confirm this new address:",
		"",
		url,
		"",
		"The link expires in one hour. If you did not request this, you can ignore this message and your address will stay unchanged.",
	].join("\n");

	const html = [
		`<p>${escapeHtml(greeting)}</p>`,
		"<p>An email change was requested for your MES account. " +
			"Open the link below to confirm this new address:</p>",
		`<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`,
		"<p>The link expires in one hour. If you did not request this, you can " +
			"ignore this message and your address will stay unchanged.</p>",
	].join("");

	return {
		from: input.from,
		to: input.to,
		subject: "Confirm your new MES email address",
		text,
		html,
	};
}

function escapeHtml(value: string): string {
	// Entities are composed at runtime rather than written literally, so the
	// escaping survives any copy-paste of this file.
	return value
		.replace(/&/g, "&" + "amp;")
		.replace(/</g, "&" + "lt;")
		.replace(/>/g, "&" + "gt;")
		.replace(/"/g, "&" + "quot;");
}
