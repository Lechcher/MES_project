/**
 * Message rendering.
 *
 * Telegram messages are plain text with a small HTML subset. Tables render as
 * `<pre>` blocks so columns line up in a monospace font; long lists are
 * paginated by inline keyboard (the "next page" button is the whole UX). This
 * module holds no state and performs no I/O, so formatting is unit-testable.
 */

/** Telegram's hard per-message limit. */
export const TELEGRAM_MESSAGE_LIMIT = 4096;

/** One column never exceeds this width, so a long title cannot wreck the table. */
const MAX_CELL_WIDTH = 40;

/** Pad a cell and clip it so one long value cannot wreck the columns. */
function cell(value: string, width: number): string {
	const text = value.length > width ? `${value.slice(0, width - 1)}…` : value;
	return text.padEnd(width);
}

/**
 * Render rows as a monospace table inside `<pre>`.
 *
 * `rows` are already-formatted cells. Returns Telegram HTML — callers must
 * send it with `parse_mode: "HTML"`.
 */
export function renderTable(
	headers: readonly string[],
	rows: readonly (readonly string[])[],
): string {
	if (rows.length === 0) return "<pre>No records.</pre>";
	const widths = headers.map((_, column) =>
		Math.min(
			MAX_CELL_WIDTH,
			Math.max(
				headers[column]?.length ?? 0,
				...rows.map((row) => (row[column] ?? "").length),
			),
		),
	);
	const head = headers
		.map((header, column) => cell(header, widths[column]))
		.join("  ");
	const divider = widths.map((width) => "─".repeat(width)).join("  ");
	const body = rows
		.map((row) =>
			headers
				.map((_, column) => cell(row[column] ?? "", widths[column]))
				.join("  "),
		)
		.join("\n");
	return ["```", head, divider, body, "```"].join("\n");
}

/** Escape the three HTML-significant characters for Telegram's HTML subset. */
export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/** Clip a reply to Telegram's limit, ending on a visible marker. */
export function clipToLimit(text: string): string {
	if (text.length <= TELEGRAM_MESSAGE_LIMIT) return text;
	return `${text.slice(0, TELEGRAM_MESSAGE_LIMIT - 20)}\n… (truncated)`;
}

/** "Page 2 of 5" style footer for paginated answers. */
export function pageFooter(page: number, totalPages: number): string {
	if (totalPages <= 1) return "";
	return `\n<i>Page ${page} of ${totalPages}</i>`;
}

/** The login instructions shown to any unlinked chat. */
export function renderLoginPrompt(): string {
	return [
		"🔐 <b>Sign in to use this bot</b>",
		"",
		"1. Open the MES website → <b>Settings → Telegram</b> and generate a link code.",
		"2. Send it here: <code>/link LINK-XXXX</code>",
		"",
		"Fallback (the code is preferred — never leave a password in chat):",
		"<code>/login email@mes.local your-password</code>",
	].join("\n");
}

/** The `/help` overview: the five feature surfaces. */
export function renderHelp(roleCodes: readonly string[]): string {
	const canCreate = [
		"DEPT_HEAD",
		"HR_MANAGER",
		"SUPER_ADMIN",
		"TECH_LEAD",
	].some((role) => roleCodes.includes(role));
	const lines = [
		"<b>MES bot</b> — you are signed in.",
		"",
		"/ask &lt;question&gt; — search the system (read-only AI agent)",
		"/notifications — your newest notifications",
		"/lookup — jobs, planning, performance information",
		"/audit — recent audit entries",
		"/status — server health",
		"/model — list or switch the AI model",
	];
	if (canCreate) lines.push("/newticket — create a job ticket");
	lines.push("/logout — end this bot session");
	return lines.join("\n");
}
