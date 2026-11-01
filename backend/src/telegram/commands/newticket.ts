/**
 * The guided job-ticket creation flow.
 *
 * A small in-memory state machine per chat: title → type → priority →
 * assignees → description → confirm. Nothing is persisted until the final
 * confirmation, so an abandoned flow leaves no partial record anywhere — the
 * spec's cleanliness guarantee falls out of the design. The draft itself is
 * deliberately in memory: a process restart loses the draft, never the data.
 *
 * The final write goes through the same `createTask` domain function the
 * GraphQL mutation calls, with the linked viewer's scope — the ticket is
 * created exactly as if it were created on the web surface.
 */

import { GraphQLError } from "graphql";
import { authorize } from "../../graphql/access";
import type { ViewerContext } from "../../graphql/context";
import { DomainError } from "../../graphql/errors";
import type { BotContext } from "../bot-context";

export type Step =
	| "title"
	| "type"
	| "priority"
	| "assignees"
	| "description"
	| "confirm";

export interface NewTicketDraft {
	title: string;
	taskType: string | null;
	priority: string | null;
	assigneeIds: string[];
	description: string | null;
	step: Step;
}

/** In-memory draft store, keyed by chat id. */
const drafts = new Map<string, NewTicketDraft>();

/** Test seam: drop every draft. */
export function clearDrafts(): void {
	drafts.clear();
}

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const TASK_TYPES = ["HOURLY", "DAILY", "MULTI_DAY"] as const;

/** The write port: the real `createTask` domain function. */
export interface NewTicketDeps {
	createTask: (
		ctx: ViewerContext,
		scope: string,
		input: Record<string, unknown>,
	) => Promise<{ id: string; taskCode: string; title: string }>;
}

/** True when this chat has an open draft. */
export function hasDraft(chatId: string): boolean {
	return drafts.has(chatId);
}

/** Open a draft for the chat (the role check happened before this call). */
export function startNewTicket(chatId: string, draft: NewTicketDraft): void {
	drafts.set(chatId, draft);
}

/**
 * Advance the flow for one message text.
 *
 * Returns true when the message was consumed. A message that starts with `/`
 * (other than the flow's own `/cancel` and `/skip`) is *not* consumed: a
 * command typed mid-flow runs, and the draft stays open.
 */
export async function handleNewTicketText(
	ctx: BotContext,
	viewerCtx: ViewerContext | null,
	text: string,
	deps: NewTicketDeps,
): Promise<boolean> {
	const chatId = String(ctx.chat?.id ?? "");
	const draft = drafts.get(chatId);
	if (!draft) return false;

	if (text === "/cancel") {
		drafts.delete(chatId);
		await ctx.reply("Ticket creation cancelled. Nothing was created.");
		return true;
	}
	if (text.startsWith("/") && text !== "/skip") return false;

	switch (draft.step) {
		case "title": {
			const title = text.trim();
			if (title.length === 0) {
				await ctx.reply("The title cannot be empty. Send the title again:");
				return true;
			}
			draft.title = title;
			draft.step = "type";
			await ctx.reply(`Type? (${TASK_TYPES.join(", ")})`);
			return true;
		}
		case "type": {
			const value = text.trim().toUpperCase();
			if (!(TASK_TYPES as readonly string[]).includes(value)) {
				await ctx.reply(`Pick one of: ${TASK_TYPES.join(", ")}`);
				return true;
			}
			draft.taskType = value;
			draft.step = "priority";
			await ctx.reply(`Priority? (${PRIORITIES.join(", ")})`);
			return true;
		}
		case "priority": {
			const value = text.trim().toUpperCase();
			if (!(PRIORITIES as readonly string[]).includes(value)) {
				await ctx.reply(`Pick one of: ${PRIORITIES.join(", ")}`);
				return true;
			}
			draft.priority = value;
			draft.step = "assignees";
			await ctx.reply(
				"Assignees — emails or user codes, separated by commas (at least one):",
			);
			return true;
		}
		case "assignees": {
			const identifiers = text
				.split(",")
				.map((part) => part.trim())
				.filter((part) => part !== "");
			if (identifiers.length === 0) {
				await ctx.reply("Send at least one assignee (email or user code):");
				return true;
			}
			draft.assigneeIds = identifiers;
			draft.step = "description";
			await ctx.reply("Description? Send it, or /skip to leave it empty.");
			return true;
		}
		case "description": {
			draft.description =
				text === "/skip" || text.trim() === "" ? null : text.trim();
			draft.step = "confirm";
			await ctx.reply(renderConfirmation(draft), { parse_mode: "HTML" });
			await ctx.reply("Create it? (yes / no)");
			return true;
		}
		case "confirm": {
			const answer = text.trim().toLowerCase();
			if (answer === "no") {
				drafts.delete(chatId);
				await ctx.reply("Ticket creation cancelled. Nothing was created.");
				return true;
			}
			if (answer !== "yes") {
				await ctx.reply("Send yes to create it, or no to cancel.");
				return true;
			}
			if (!viewerCtx) {
				drafts.delete(chatId);
				await ctx.reply("Your session changed. Start again with /newticket.");
				return true;
			}

			const { title, taskType, priority, description } = draft;
			try {
				// Re-checked at write time: the conversation can outlive a
				// permission change.
				const scope = authorize(viewerCtx, "createTask");
				const task = await deps.createTask(viewerCtx, scope, {
					title,
					description,
					taskType,
					priority,
					assignedToIds: draft.assigneeIds,
				});
				drafts.delete(chatId);
				await ctx.reply(
					`✅ Ticket created: <b>${task.taskCode}</b> — ${title}`,
					{ parse_mode: "HTML" },
				);
			} catch (error) {
				// Authorization (GraphQLError) is not correctable in-chat:
				// the write can never succeed, so the flow ends. A domain
				// DomainError is a validation failure the user can fix, so
				// the flow stays open. Anything else is a real fault.
				if (error instanceof GraphQLError) {
					drafts.delete(chatId);
					await ctx.reply(`⛔ ${error.message} Ticket creation cancelled.`);
					return true;
				}
				if (error instanceof DomainError) {
					await ctx.reply(`⛔ ${error.message}`);
					return true;
				}
				drafts.delete(chatId);
				await ctx.reply("⚠️ Could not create the ticket. Please try again.");
			}
			return true;
		}
	}
}

function renderConfirmation(draft: NewTicketDraft): string {
	return [
		"<b>Confirm the ticket</b>",
		`title: ${draft.title}`,
		`type: ${draft.taskType}`,
		`priority: ${draft.priority}`,
		`assignees: ${draft.assigneeIds.join(", ")}`,
		`description: ${draft.description ?? "—"}`,
	].join("\n");
}
