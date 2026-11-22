/**
 * `/profile`: the linked account.
 *
 * A chat signed in as someone should always be able to confirm *who* it is
 * signed in as — especially after a relink, or when two accounts share a
 * phone. The answer is the viewer the guard already resolved, plus the link
 * facts (which Telegram identity, since when, last seen). No secrets, no
 * other user's data, and no extra authorization gate: the viewer's own
 * record is always in scope.
 */

import { and, desc, eq } from "drizzle-orm";
import type { Composer } from "grammy";
import type { AppConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import { telegramLinks } from "../../db/schema";
import { listDepartments } from "../../domain/settings";
import type { BotContext } from "../bot-context";
import { renderProfile } from "../render";

export interface ProfileCommandDependencies {
	db: DatabaseHandle;
	config: AppConfig;
}

function stamp(date: Date | null | undefined): string | null {
	if (!date) return null;
	return date.toISOString().slice(0, 16).replace("T", " ");
}

export function registerProfileCommands(
	composer: Composer<BotContext>,
	{ db }: ProfileCommandDependencies,
): void {
	composer.command("profile", async (ctx) => {
		const viewerCtx = ctx.viewerContext;
		const viewer = ctx.viewer;
		if (!viewerCtx || !viewer) return;

		let department: string | null = null;
		try {
			const rows = await listDepartments(viewerCtx, {
				departmentId: viewer.departmentId,
			});
			department = rows[0]?.name ?? null;
		} catch {
			// An unreadable department renders as a dash; the rest still shows.
		}

		const telegramUserId = String(ctx.from?.id ?? "");
		const [link] = telegramUserId
			? await db
					.select()
					.from(telegramLinks)
					.where(
						and(
							eq(telegramLinks.userId, viewer.id),
							eq(telegramLinks.isActive, true),
						),
					)
					.orderBy(desc(telegramLinks.updatedAt))
					.limit(1)
			: [];

		await ctx.reply(
			renderProfile({
				fullName: viewer.fullName,
				userCode: viewer.userCode,
				email: viewer.email,
				department,
				roleCodes: viewer.roleCodes,
				linkedSince: stamp(link?.createdAt),
				lastSeen: stamp(link?.lastSeenAt),
				telegramUsername: link?.telegramUsername ?? null,
			}),
			{ parse_mode: "HTML" },
		);
	});
}
