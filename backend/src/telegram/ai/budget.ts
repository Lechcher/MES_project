/**
 * Per-user AI query budget.
 *
 * `/ask` costs money per question, so each linked viewer gets a rolling
 * 30-day ceiling (`TELEGRAM_AI_MONTHLY_QUOTA`, default 100). Usage is counted
 * in `telegram_ai_usage` with the window start persisted, so the counter
 * survives restarts and works across processes — an in-memory counter would
 * reset on every deploy and let a single user spend unbounded.
 */

import { eq } from "drizzle-orm";
import type { DatabaseHandle } from "../../db";
import { telegramAiUsage } from "../../db/schema";
import type { Viewer } from "../../graphql/context";

/** The rolling window length, in days. */
export const BUDGET_WINDOW_DAYS = 30;

export interface BudgetCheck {
	allowed: boolean;
	/** The configured ceiling (0 means unlimited). */
	limit: number;
	/** How many queries were used in the current window. */
	used: number;
}

function windowStart(now: Date): Date {
	return new Date(now.getTime() - BUDGET_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Count one query against the viewer's budget.
 *
 * The row's window start is the first query inside the current window; a row
 * older than the window is reset rather than accumulated, which is what makes
 * the window rolling. A limit of 0 disables the budget entirely.
 */
export async function consumeBudget(
	db: DatabaseHandle,
	viewer: Viewer,
	limit: number,
	now: Date = new Date(),
): Promise<BudgetCheck> {
	if (limit <= 0) return { allowed: true, limit, used: 0 };

	const [row] = await db
		.select()
		.from(telegramAiUsage)
		.where(eq(telegramAiUsage.userId, viewer.id))
		.limit(1);

	const fresh = !row || row.windowStart.getTime() <= windowStart(now).getTime();

	if (!row) {
		await db.insert(telegramAiUsage).values({
			userId: viewer.id,
			windowStart: now,
			queryCount: 1,
		});
		return { allowed: true, limit, used: 1 };
	}

	if (fresh) {
		await db
			.update(telegramAiUsage)
			.set({ windowStart: now, queryCount: 1, updatedAt: now })
			.where(eq(telegramAiUsage.userId, viewer.id));
		return { allowed: true, limit, used: 1 };
	}

	if (row.queryCount >= limit) {
		return { allowed: false, limit, used: row.queryCount };
	}

	await db
		.update(telegramAiUsage)
		.set({ queryCount: row.queryCount + 1, updatedAt: now })
		.where(eq(telegramAiUsage.userId, viewer.id));
	return { allowed: true, limit, used: row.queryCount + 1 };
}
