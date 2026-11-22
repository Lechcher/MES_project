/**
 * Migration runner.
 *
 * Applies the versioned migrations in `backend/drizzle` to the configured
 * database. Migrations are additive: applying the same set twice is a no-op,
 * and Better Auth tables/data are never dropped or renamed.
 *
 * Usage: `bun run db:migrate` (respects `MES_DATABASE_URL`).
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { loadConfig } from "../config";

export const DEFAULT_MIGRATIONS_FOLDER = resolve(
	import.meta.dir,
	"../../drizzle",
);

export interface MigrationResult {
	databaseUrl: string;
	migrationsFolder: string;
	applied: boolean;
}

export async function runMigrations(options: {
	databaseUrl: string;
	migrationsFolder?: string;
}): Promise<MigrationResult> {
	const migrationsFolder =
		options.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER;

	if (!existsSync(migrationsFolder)) {
		throw new Error(
			`Migrations folder not found at ${migrationsFolder}. Run "bun run db:generate" first.`,
		);
	}

	const pool = new Pool({ connectionString: options.databaseUrl });

	try {
		await migrate(drizzle(pool), { migrationsFolder });
	} finally {
		// Drain the pool only after the migrator has finished with it.
		await pool.end();
	}

	return {
		databaseUrl: options.databaseUrl,
		migrationsFolder,
		applied: true,
	};
}

if (import.meta.main) {
	const config = loadConfig();
	const result = await runMigrations({ databaseUrl: config.databaseUrl });
	console.log(`Migrations applied to ${result.databaseUrl}`);
}
