/**
 * The feature surface.
 *
 * One file per feature, all mounted behind the authentication guard:
 *
 * - `/notifications` — the notification log, newest first (the same rows the
 *   web surface's management log shows; the notification log is
 *   management-only, and this surface enforces exactly that gate).
 * - `/lookup` and its subcommands — read-only module lookups reusing the
 *   domain functions, so department scoping and per-module authorization are
 *   the web app's, not a re-implementation.
 * - `/newticket` — the guided job-ticket flow, gated to the roles permitted
 *   to create tickets, writing through the same `createTask` domain function
 *   the mutation calls.
 * - `/audit` — recent audit entries under the existing Audit Log gate.
 * - `/status` — service health plus recent failures, secrets never included.
 *
 * Registered behind the guard: `ctx.viewerContext` is always present here.
 */

import type { Composer } from "grammy";
import type { AppConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import { listAuditLogs } from "../../domain/audit-log";
import { listNotifications as listNotificationRows } from "../../domain/settings";
import { createTask, listTasks } from "../../domain/tasks";
import { authorize, hasRole } from "../../graphql/access";
import type { BotContext } from "../bot-context";
import { escapeHtml, renderTable } from "../render";
import { handleNewTicketText, hasDraft, startNewTicket } from "./newticket";

export interface FeatureCommandDependencies {
	db: DatabaseHandle;
	config: AppConfig;
}

/** Roles allowed to create tickets — the web surface's `createTask` policy. */
const TICKET_CREATORS = [
	"DEPT_HEAD",
	"HR_MANAGER",
	"SUPER_ADMIN",
	"TECH_LEAD",
] as const;

export function registerFeatureCommands(
	composer: Composer<BotContext>,
	// Handlers read the database off `ctx.viewerContext`, not from the
	// registration dependencies.
	{ config }: FeatureCommandDependencies,
): void {
	/* -------------------------------------------------------------- */
	/* /notifications                                                 */
	/* -------------------------------------------------------------- */

	composer.command("notifications", async (ctx) => {
		const viewerCtx = ctx.viewerContext;
		if (!viewerCtx) return;
		// The same operation policy the GraphQL notification log uses:
		// management roles. Others are refused before any row is read.
		try {
			authorize(viewerCtx, "notifications");
		} catch {
			await ctx.reply("⛔ You do not have access to the notification log.");
			return;
		}

		const page = await listNotificationRows(viewerCtx, {
			offset: 0,
			limit: 10,
		});
		if (page.nodes.length === 0) {
			await ctx.reply("No notifications recorded yet.");
			return;
		}

		const rows = page.nodes.map((row) => [
			row.template ?? "—",
			row.channel,
			row.status,
			row.createdAt.toISOString().slice(0, 16).replace("T", " "),
		]);
		await ctx.reply(
			`<b>Recent notifications</b> (${page.totalCount} total)\n${renderTable(
				["template", "channel", "status", "when"],
				rows,
			)}`,
			{ parse_mode: "HTML" },
		);
	});

	/* -------------------------------------------------------------- */
	/* /lookup                                                        */
	/* -------------------------------------------------------------- */

	composer.command("lookup", async (ctx) => {
		await ctx.reply(
			[
				"<b>Lookup</b> — pick a view:",
				"/tickets [search] — job tickets",
				"/projects [search] — projects",
				"",
				"Planning &amp; Performance information is available through /ask —",
				"the agent answers with the same data these views show.",
			].join("\n"),
			{ parse_mode: "HTML" },
		);
	});

	composer.command("tickets", async (ctx) => {
		const viewerCtx = ctx.viewerContext;
		if (!viewerCtx) return;
		const search = (ctx.match ?? "").toString().trim();
		try {
			const scope = authorize(viewerCtx, "tasks");
			const page = await listTasks(viewerCtx, scope, {
				filter: { search: search === "" ? null : search },
				offset: 0,
				limit: 10,
			});
			if (page.nodes.length === 0) {
				await ctx.reply("No tickets match.");
				return;
			}
			const rows = page.nodes.map((task) => [
				task.taskCode,
				task.title,
				task.state,
				task.priority,
				task.progressPercentage > 0 ? `${task.progressPercentage}%` : "—",
			]);
			await ctx.reply(
				`<b>Tickets</b> (${page.pageInfo.totalCount} total)\n${renderTable(
					["code", "title", "state", "priority", "progress"],
					rows,
				)}`,
				{ parse_mode: "HTML" },
			);
		} catch {
			await ctx.reply("⛔ You do not have access to tickets.");
		}
	});

	composer.command("projects", async (ctx) => {
		const viewerCtx = ctx.viewerContext;
		if (!viewerCtx) return;
		const search = (ctx.match ?? "").toString().trim();
		try {
			const scope = authorize(viewerCtx, "projects");
			const { listProjects } = await import("../../domain/tasks");
			const page = await listProjects(viewerCtx, scope, {
				filter: { search: search === "" ? null : search },
				offset: 0,
				limit: 10,
			});
			if (page.nodes.length === 0) {
				await ctx.reply("No projects match.");
				return;
			}
			const rows = page.nodes.map((project) => [
				project.code,
				project.name,
				project.isActive ? "active" : "inactive",
			]);
			await ctx.reply(
				`<b>Projects</b> (${page.pageInfo.totalCount} total)\n${renderTable(
					["code", "name", "status"],
					rows,
				)}`,
				{ parse_mode: "HTML" },
			);
		} catch {
			await ctx.reply("⛔ You do not have access to projects.");
		}
	});

	/* -------------------------------------------------------------- */
	/* /newticket                                                     */
	/* -------------------------------------------------------------- */

	composer.command("newticket", async (ctx) => {
		const viewerCtx = ctx.viewerContext;
		const viewer = ctx.viewer;
		if (!viewerCtx || !viewer) return;

		// Authorize *before* the first prompt: an unauthorized user is never
		// asked for details they could not submit anyway.
		if (!hasRole(viewerCtx, ...TICKET_CREATORS)) {
			await ctx.reply(
				"⛔ Creating job tickets is limited to Department Heads, HR Managers, Super Admins, and Tech Leads.",
			);
			return;
		}

		startNewTicket(String(ctx.chat?.id ?? ""), {
			title: "",
			taskType: null,
			priority: null,
			assigneeIds: [],
			description: null,
			step: "title",
		});
		await ctx.reply("New ticket. Send the title (or /cancel to stop).");
	});

	/* -------------------------------------------------------------- */
	/* /audit + /status                                               */
	/* -------------------------------------------------------------- */

	composer.command("audit", async (ctx) => {
		const viewerCtx = ctx.viewerContext;
		if (!viewerCtx) return;
		try {
			authorize(viewerCtx, "auditLogs");
		} catch {
			await ctx.reply("⛔ You do not have access to the audit log.");
			return;
		}

		const page = await listAuditLogs(viewerCtx, { offset: 0, limit: 10 });
		if (page.nodes.length === 0) {
			await ctx.reply("No audit entries recorded yet.");
			return;
		}
		const rows = page.nodes.map((event) => [
			event.action,
			event.moduleCode ?? "—",
			event.createdAt.toISOString().slice(0, 16).replace("T", " "),
		]);
		await ctx.reply(
			`<b>Audit log</b> (${page.totalCount} total)\n${renderTable(
				["action", "module", "when"],
				rows,
			)}`,
			{ parse_mode: "HTML" },
		);
	});

	// Draft continuation: a chat mid-flow sends plain text that belongs to
	// the flow, not to a command. Registered after the commands (so commands
	// still win) and before the bot's catch-all fallback.
	composer.on("message:text", async (ctx, next) => {
		const chatId = String(ctx.chat?.id ?? "");
		if (!hasDraft(chatId)) return next();
		const handled = await handleNewTicketText(
			ctx,
			ctx.viewerContext,
			ctx.message?.text ?? "",
			{ createTask: createTask as never },
		);
		if (handled) return;
		return next();
	});

	composer.command("status", async (ctx) => {
		const viewerCtx = ctx.viewerContext;
		if (!viewerCtx) return;
		try {
			authorize(viewerCtx, "appSettings");
		} catch {
			await ctx.reply("⛔ Server status is limited to technical roles.");
			return;
		}

		// Health comes from the service's own liveness contract; failures come
		// from the notification log, which records every delivery failure.
		// Never secrets, tokens, or credential material.
		const failed = await listNotificationRows(viewerCtx, {
			filter: { status: "FAILED" },
			offset: 0,
			limit: 5,
		});

		const lines = [
			"<b>Server status</b>",
			`env: ${escapeHtml(config.env)}`,
			`uptime: ${Math.floor(process.uptime() / 60)} min`,
			`failed deliveries (recent ${failed.nodes.length}/${failed.totalCount}):`,
		];
		if (failed.nodes.length === 0) {
			lines.push("  none — all deliveries succeeded");
		} else {
			for (const row of failed.nodes) {
				lines.push(
					`  ${row.template ?? "—"} — ${escapeHtml(row.errorMessage ?? "unknown")}`,
				);
			}
		}
		await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
	});
}
