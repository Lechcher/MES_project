/**
 * SQLite connection factory.
 *
 * Foreign-key enforcement is on by default (SQLite disables it per connection),
 * and the parent directory of the database file is created when missing so a
 * fresh checkout can migrate without manual setup.
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

export type DatabaseHandle = BunSQLiteDatabase<typeof schema> & {
	$client: Database;
};

export function resolveDatabasePath(
	path: string,
	baseDir = process.cwd(),
): string {
	return isAbsolute(path) ? path : resolve(baseDir, path);
}

export function createDatabase(path: string): DatabaseHandle {
	const absolutePath = resolveDatabasePath(path);

	if (absolutePath !== ":memory:") {
		mkdirSync(dirname(absolutePath), { recursive: true });
	}

	const client = new Database(absolutePath, { create: true });
	client.exec("PRAGMA journal_mode = WAL;");
	client.exec("PRAGMA foreign_keys = ON;");

	return drizzle(client, { schema }) as DatabaseHandle;
}

export { schema };
