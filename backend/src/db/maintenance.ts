/**
 * Storage maintenance that keeps high-churn tables bounded.
 *
 * Runs on the startup path, never in the request hot path, and is idempotent.
 */

import { lt } from "drizzle-orm";
import type { DatabaseHandle } from "./index";
import { session } from "./schema";

/**
 * Delete expired authentication sessions so the session table does not grow
 * without bound across sign-ins. Sessions still valid (`expiresAt` in the
 * future) are retained. Safe to run on every startup.
 */
export async function pruneExpiredSessions(db: DatabaseHandle): Promise<void> {
	await db.delete(session).where(lt(session.expiresAt, new Date()));
}
