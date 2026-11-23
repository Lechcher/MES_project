/**
 * Shopify session storage over the PostgreSQL `shoptify_sessions` table.
 *
 * Wraps the official `DrizzleSessionStoragePostgres` adapter (the same
 * package that shipped the SQLite adapter at adoption time — see design.md
 * D5 and this change's design P2) behind this module's `SessionStorage`
 * alias, so the rest of the domain depends on our own name rather than the
 * package's. The adapter reads the table's property names, which
 * `db/schema.ts` mirrors exactly (see that file's comment).
 */

import type { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import { DrizzleSessionStoragePostgres } from "@shopify/shopify-app-session-storage-drizzle";
import type { DatabaseHandle } from "../../db";
import { shoptifySessions } from "../../db/schema";

export type { Session, SessionStorage };

/**
 * The table type the adapter's published declaration expects.
 *
 * Its README schema is a structural ideal (every column exactly its declared
 * shape); `shoptify_sessions` matches that contract at runtime — same column
 * names, types, and nullability, verified by the round-trip test — so the
 * cast below only bridges the declaration, not the behavior.
 */
type AdapterSessionTable = ConstructorParameters<
	typeof DrizzleSessionStoragePostgres
>[1];

/**
 * Build the session storage bound to this deployment's database.
 *
 * Created per service (like the rest of the injected dependencies), not per
 * request, so the adapter holds no per-call state.
 */
export function createSessionStorage(
	db: DatabaseHandle,
): DrizzleSessionStoragePostgres {
	return new DrizzleSessionStoragePostgres(
		db,
		shoptifySessions as unknown as AdapterSessionTable,
	);
}
