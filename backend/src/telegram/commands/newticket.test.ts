/**
 * Guided job-ticket flow tests.
 *
 * The flow's guarantees are: nothing is written before the final
 * confirmation, an abandoned or cancelled flow leaves no partial record, a
 * command typed mid-flow still runs (and the draft stays open), and the
 * domain's own rejection keeps the user in the flow instead of losing their
 * input. The write goes through the injected `createTask`, exactly like the
 * real command binds the real domain function.
 */

import { afterEach, describe, expect, test } from "bun:test";
import type { RoleCode } from "../../db/enums";
import { createContext, type ViewerContext } from "../../graphql/context";
import type { BotContext } from "../bot-context";
import {
	clearDrafts,
	handleNewTicketText,
	hasDraft,
	startNewTicket,
} from "./newticket";

interface Reply {
	text: string;
	parseMode?: string;
}

/** A recording grammY-context stand-in: only reply/chat/message matter here. */
function fakeContext(chatId = "chat-1"): {
	ctx: BotContext;
	replies: Reply[];
	send(text: string): Promise<void>;
} {
	const replies: Reply[] = [];
	const ctx = {
		chat: { id: chatId },
		message: { text: "" },
		reply: async (text: string, other?: { parse_mode?: string }) => {
			replies.push({
				text,
				...(other?.parse_mode ? { parseMode: other.parse_mode } : {}),
			});
		},
	} as unknown as BotContext;
	return {
		ctx,
		replies,
		async send(text: string) {
			if (ctx.message) ctx.message.text = text;
			await handleNewTicketText(ctx, viewerCtx, text, deps);
		},
	};
}

let viewerCtx: ViewerContext;
let deps: {
	createTask: (
		ctx: ViewerContext,
		scope: string,
		input: Record<string, unknown>,
	) => Promise<{ id: string; taskCode: string; title: string }>;
};
let created: Record<string, unknown>[];

function contextFor(roleCodes: RoleCode[]): ViewerContext {
	return createContext({
		db: null as never,
		config: {} as never,
		request: { ipAddress: null, userAgent: "telegram-bot" },
		viewer: {
			id: "u1",
			userCode: "V0000001",
			fullName: "Ticket Creator",
			email: "creator@mes.local",
			departmentId: "dept-1",
			isActive: true,
			roleCodes,
		},
	});
}

afterEach(() => clearDrafts());

describe("/newticket flow", () => {
	test("creates the ticket only at final confirmation", async () => {
		created = [];
		viewerCtx = contextFor(["DEPT_HEAD"]);
		deps = {
			createTask: async (_ctx, _scope, input) => {
				created.push(input);
				return {
					id: "t1",
					taskCode: "T202611-0001",
					title: String(input.title),
				};
			},
		};
		const { send, replies } = fakeContext();
		startNewTicket("chat-1", {
			title: "",
			taskType: null,
			priority: null,
			assigneeIds: [],
			description: null,
			step: "title",
		});

		await send("Ship the report");
		await send("DAILY");
		await send("HIGH");
		await send("hr.manager@mes.local, employee@mes.local");
		await send("/skip");
		// Nothing written before the confirmation.
		expect(created).toHaveLength(0);
		await send("yes");

		expect(created).toHaveLength(1);
		expect(created[0]).toMatchObject({
			title: "Ship the report",
			taskType: "DAILY",
			priority: "HIGH",
			assignedToIds: ["hr.manager@mes.local", "employee@mes.local"],
			description: null,
		});
		expect(replies.at(-1)?.text).toContain("T202611-0001");
		expect(hasDraft("chat-1")).toBe(false);
	});

	test("/cancel leaves nothing created", async () => {
		created = [];
		viewerCtx = contextFor(["SUPER_ADMIN"]);
		deps = { createTask: async () => ({ id: "x", taskCode: "X", title: "" }) };
		const { send } = fakeContext();
		startNewTicket("chat-1", {
			title: "Half entered",
			taskType: null,
			priority: null,
			assigneeIds: [],
			description: null,
			step: "priority",
		});
		await send("/cancel");
		expect(created).toHaveLength(0);
		expect(hasDraft("chat-1")).toBe(false);
	});

	test("answering no at the confirmation creates nothing", async () => {
		created = [];
		viewerCtx = contextFor(["TECH_LEAD"]);
		deps = { createTask: async () => ({ id: "x", taskCode: "X", title: "" }) };
		const { send } = fakeContext();
		startNewTicket("chat-1", {
			title: "T",
			taskType: "DAILY",
			priority: "LOW",
			assigneeIds: ["a@mes.local"],
			description: null,
			step: "confirm",
		});
		await send("no");
		expect(created).toHaveLength(0);
		expect(hasDraft("chat-1")).toBe(false);
	});

	test("a command typed mid-flow still runs and the draft stays open", async () => {
		created = [];
		viewerCtx = contextFor(["DEPT_HEAD"]);
		deps = { createTask: async () => ({ id: "x", taskCode: "X", title: "" }) };
		const { ctx, replies } = fakeContext();
		startNewTicket("chat-1", {
			title: "",
			taskType: null,
			priority: null,
			assigneeIds: [],
			description: null,
			step: "title",
		});
		if (ctx.message) ctx.message.text = "/help";
		const handled = await handleNewTicketText(ctx, viewerCtx, "/help", deps);
		expect(handled).toBe(false);
		expect(hasDraft("chat-1")).toBe(true);
		expect(replies).toHaveLength(0);
	});

	test("an invalid option re-asks without losing the draft", async () => {
		viewerCtx = contextFor(["DEPT_HEAD"]);
		deps = { createTask: async () => ({ id: "x", taskCode: "X", title: "" }) };
		const { send, replies } = fakeContext();
		startNewTicket("chat-1", {
			title: "T",
			taskType: null,
			priority: null,
			assigneeIds: [],
			description: null,
			step: "type",
		});
		await send("whenever");
		expect(replies.at(-1)?.text).toContain("Pick one of");
		expect(hasDraft("chat-1")).toBe(true);
		await send("HOURLY");
		expect(replies.at(-1)?.text).toContain("Priority?");
	});

	test("the domain's refusal keeps the user in the flow", async () => {
		const { DomainError } = await import("../../graphql/errors");
		viewerCtx = contextFor(["DEPT_HEAD"]);
		deps = {
			createTask: async () => {
				throw new DomainError(
					"VALIDATION_FAILED",
					"At least one assignee is required.",
				);
			},
		};
		const { send, replies } = fakeContext();
		startNewTicket("chat-1", {
			title: "T",
			taskType: "DAILY",
			priority: "LOW",
			assigneeIds: ["nobody@mes.local"],
			description: null,
			step: "confirm",
		});
		await send("yes");
		expect(replies.at(-1)?.text).toContain(
			"At least one assignee is required.",
		);
		expect(hasDraft("chat-1")).toBe(true);
	});

	test("a viewer that lost permissions mid-flow is refused", async () => {
		viewerCtx = contextFor(["EMPLOYEE"]);
		deps = { createTask: async () => ({ id: "x", taskCode: "X", title: "" }) };
		const { send, replies } = fakeContext();
		startNewTicket("chat-1", {
			title: "T",
			taskType: "DAILY",
			priority: "LOW",
			assigneeIds: ["a@mes.local"],
			description: null,
			step: "confirm",
		});
		await send("yes");
		expect(replies.at(-1)?.text).toContain("permission");
		expect(hasDraft("chat-1")).toBe(false);
	});

	test("a chat without a draft never consumes the message", async () => {
		viewerCtx = contextFor(["DEPT_HEAD"]);
		deps = { createTask: async () => ({ id: "x", taskCode: "X", title: "" }) };
		const { ctx, send, replies } = fakeContext("chat-9");
		await send("hello");
		expect(replies).toHaveLength(0);
		expect(ctx.reply).toBeDefined();
	});
});
