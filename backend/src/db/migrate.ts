/**
 * Migration runner.
 *
 * Applies the versioned migrations in `backend/drizzle` to the configured
 * database. Migrations are additive: applying the same set twice is a no-op,
 * and Better Auth tables/data are never dropped or renamed.
 *
 * Usage: `bun run db:migrate` (respects `MES_DATABASE_PATH`).
 */

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { loadConfig } from "../config";
import { resolveDatabasePath } from "./index";

export const DEFAULT_MIGRATIONS_FOLDER = resolve(
	import.meta.dir,
	"../../drizzle",
);

export interface MigrationResult {
	databasePath: string;
	migrationsFolder: string;
	applied: boolean;
}

export function runMigrations(options: {
	databasePath: string;
	migrationsFolder?: string;
}): MigrationResult {
	const migrationsFolder =
		options.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER;

	if (!existsSync(migrationsFolder)) {
		throw new Error(
			`Migrations folder not found at ${migrationsFolder}. Run "bun run db:generate" first.`,
		);
	}

	const databasePath = resolveDatabasePath(options.databasePath);
	const client = new Database(databasePath, { create: true });
	client.exec("PRAGMA foreign_keys = ON;");

	try {
		migrate(drizzle(client), { migrationsFolder });
	} finally {
		client.close();
	}

	return { databasePath, migrationsFolder, applied: true };
}

if (import.meta.main) {
	const config = loadConfig();
	const result = runMigrations({ databasePath: config.databasePath });
	console.log(`Migrations applied to ${result.databasePath}`);
}
