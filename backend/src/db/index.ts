/**
 * PostgreSQL connection factory.
 *
 * The connection URL points at the configured database (see `MES_DATABASE_URL`
 * in `config.ts`). The per-connection PRAGMAs of the SQLite era are gone:
 * PostgreSQL enforces foreign keys per database and manages its own
 * write-ahead logging.
 */

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DatabaseHandle = NodePgDatabase<typeof schema> & {
	$client: Pool;
};

/** Pool ceiling; one backend process serves the whole API. */
export const DEFAULT_POOL_MAX = 10;

export function createDatabase(url: string): DatabaseHandle {
	const pool = new Pool({
		connectionString: url,
		max: DEFAULT_POOL_MAX,
	});
	return drizzle(pool, { schema }) as DatabaseHandle;
}

/** Drain the pool on process exit so the service stops cleanly. */
export async function closeDatabase(db: DatabaseHandle): Promise<void> {
	await db.$client.end();
}

export { schema };
