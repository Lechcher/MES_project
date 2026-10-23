import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration for the MES SQLite database.
 *
 * The database file is resolved from the same environment variable the runtime
 * service uses (`MES_DATABASE_PATH`), so `db:generate` / `db:migrate` operate on
 * the configured database rather than a hard-coded path.
 */
export default defineConfig({
	schema: "./src/db/schema.ts",
	out: "./drizzle",
	dialect: "sqlite",
	dbCredentials: {
		url: process.env.MES_DATABASE_PATH ?? "./data/mes.db",
	},
	strict: true,
	verbose: true,
});
