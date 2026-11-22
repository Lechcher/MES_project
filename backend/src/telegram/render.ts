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

/** The roles that may open a ticket — the menu's one role-gated entry. */
const TICKET_CREATOR_ROLES: readonly string[] = [
	"DEPT_HEAD",
	"HR_MANAGER",
	"SUPER_ADMIN",
	"TECH_LEAD",
];

/**
 * The signed-in command menu, one line per command.
 *
 * `/newticket` is the only role-gated entry — every other command is open to
 * any linked viewer — so the same list is exactly what `/help` and the
 * dashboard show, each tailored to the viewer's roles.
 */
function commandMenu(roleCodes: readonly string[]): string[] {
	const lines = [
		"/ask &lt;question&gt; — search the system (read-only AI agent)",
		"/notifications — your newest notifications",
		"/lookup — jobs, planning, performance information",
		"/audit — recent audit entries",
		"/status — server health",
		"/model — list or switch the AI model",
		"/dashboard — who you are and what is waiting on you",
		"/profile — the account this chat is linked to",
	];
	if (TICKET_CREATOR_ROLES.some((role) => roleCodes.includes(role))) {
		lines.push("/newticket — create a job ticket");
	}
	lines.push("/logout — end this bot session");
	return lines;
}

/** The `/help` overview: the signed-in command menu. */
export function renderHelp(roleCodes: readonly string[]): string {
	return [
		"<b>MES bot</b> — you are signed in.",
		"",
		...commandMenu(roleCodes),
	].join("\n");
}

/** The mark standing in for a value the viewer may not see. */
const EM_DASH = "—";

/** The dashboard's two counts, or null when a read was refused. */
export interface DashboardCounts {
	/** Open tickets assigned to the viewer, or null when unauthorized. */
	readonly myOpenTickets: number | null;
	/** The viewer's notifications, or null when unauthorized. */
	readonly notifications: number | null;
}

/** What the dashboard shows: who the viewer is and what waits for them. */
export interface DashboardRenderInput {
	readonly fullName: string;
	readonly userCode: string;
	readonly department: string | null;
	readonly roleCodes: readonly string[];
	readonly counts: DashboardCounts;
}

/**
 * Render the dashboard.
 *
 * Identity first, then the two counts — a dash marks a read authorization
 * refused, never a number and never an error — then the role-appropriate
 * command menu.
 */
export function renderDashboard(input: DashboardRenderInput): string {
	const { fullName, userCode, department, roleCodes, counts } = input;
	return [
		`<b>${escapeHtml(fullName)}</b> <i>(${escapeHtml(userCode)})</i>`,
		`Department: ${department ? escapeHtml(department) : EM_DASH}`,
		"",
		`open tickets assigned to you: ${counts.myOpenTickets ?? EM_DASH}`,
		`notifications: ${counts.notifications ?? EM_DASH}`,
		"",
		...commandMenu(roleCodes),
	].join("\n");
}

/** What the profile shows: the linked account and the link facts. */
export interface ProfileRenderInput {
	readonly fullName: string;
	readonly userCode: string;
	readonly email: string;
	readonly department: string | null;
	readonly roleCodes: readonly string[];
	readonly linkedSince: string | null;
	readonly lastSeen: string | null;
	readonly telegramUsername: string | null;
}

/**
 * Render the linked account.
 *
 * Every value belongs to the viewer themself and is escaped before it enters
 * the message, so a crafted name or username cannot inject markup; a missing
 * value renders as a dash. No other user's data and no secrets appear here.
 */
export function renderProfile(input: ProfileRenderInput): string {
	const {
		fullName,
		userCode,
		email,
		department,
		roleCodes,
		linkedSince,
		lastSeen,
		telegramUsername,
	} = input;
	const roles =
		roleCodes.length > 0 ? roleCodes.map(escapeHtml).join(", ") : EM_DASH;
	const lines = [
		"<b>Your MES account</b>",
		"",
		`name: ${escapeHtml(fullName)}`,
		`user code: ${escapeHtml(userCode)}`,
		`email: ${escapeHtml(email)}`,
		`department: ${department ? escapeHtml(department) : EM_DASH}`,
		`roles: ${roles}`,
		`linked since: ${linkedSince ?? EM_DASH}`,
		`last seen: ${lastSeen ?? EM_DASH}`,
	];
	if (telegramUsername)
		lines.push(`telegram: @${escapeHtml(telegramUsername)}`);
	return lines.join("\n");
}
