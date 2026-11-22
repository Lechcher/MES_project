/**
 * The dashboard.
 *
 * `/dashboard` answers "who am I, what can I do, what is waiting on me" —
 * after login and on demand. The content is built only from what the viewer
 * is already authorized for: the command menu follows the viewer's roles, and
 * each count goes through the same `authorize()` gate and domain function the
 * web surface uses. A refused read omits its row rather than failing the
 * command, so the dashboard always renders.
 *
 * `showDashboard` is shared: the post-login path (a successful `/link` or
 * `/login`) and `/dashboard` must show the same thing, so the login
 * confirmation imports it from here.
 */

import type { Composer } from "grammy";
import type { AppConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import type { RoleCode } from "../../db/enums";
import { listDepartments, listNotifications } from "../../domain/settings";
import { listTasks } from "../../domain/tasks";
import { authorize } from "../../graphql/access";
import type { Viewer, ViewerContext } from "../../graphql/context";
import type { BotContext } from "../bot-context";
import { renderDashboard } from "../render";

export interface DashboardCommandDependencies {
	db: DatabaseHandle;
	config: AppConfig;
}

/** One count, or null when the viewer may not read it. */
async function count<T>(
	read: () => Promise<T>,
	extract: (value: T) => number,
): Promise<number | null> {
	try {
		return extract(await read());
	} catch {
		return null;
	}
}

/** What `showDashboard` needs: where to reply, and who is asking. */
export interface ShowDashboardInput {
	reply: (text: string, options?: { parse_mode: "HTML" }) => Promise<unknown>;
	viewer: Viewer;
	viewerCtx: ViewerContext;
}

/**
 * Render the dashboard for the given viewer.
 *
 * The viewer context is passed in rather than read off the bot context: the
 * pre-login surface (`/link`, `/login`) confirms with the dashboard too, and
 * those commands run before the middleware that would otherwise build it.
 */
export async function showDashboard(input: ShowDashboardInput): Promise<void> {
	const { viewer, viewerCtx } = input;

	let department: string | null = null;
	try {
		const rows = await listDepartments(viewerCtx, {
			departmentId: viewer.departmentId,
		});
		department = rows[0]?.name ?? null;
	} catch {
		// An unreadable department renders as a dash; the rest still shows.
	}

	const counts = {
		// Authorize first: a viewer without the tickets gate sees an ellipsis,
		// never a count and never an error.
		myOpenTickets: await count(
			async () => {
				const scope = authorize(viewerCtx, "tasks");
				return listTasks(viewerCtx, scope, {
					filter: { assignedToId: viewer.id },
					offset: 0,
					limit: 1,
				});
			},
			(page) => page.pageInfo.totalCount,
		),
		notifications: await count(
			async () => {
				authorize(viewerCtx, "notifications");
				return listNotifications(viewerCtx, { offset: 0, limit: 1 });
			},
			(page) => page.totalCount,
		),
	};

	await input.reply(
		renderDashboard({
			fullName: viewer.fullName,
			userCode: viewer.userCode,
			department,
			roleCodes: viewer.roleCodes as readonly RoleCode[],
			counts,
		}),
		{ parse_mode: "HTML" },
	);
}

export function registerDashboardCommands(
	composer: Composer<BotContext>,
	// Handlers read the database and configuration off `ctx.viewerContext`,
	// not from the registration dependencies — the same contract as the
	// feature surface.
	_config: DashboardCommandDependencies,
): void {
	composer.command("dashboard", async (ctx) => {
		if (!ctx.viewerContext || !ctx.viewer) return;
		await showDashboard({
			reply: (text, options) => ctx.reply(text, options),
			viewer: ctx.viewer,
			viewerCtx: ctx.viewerContext,
		});
	});
}
