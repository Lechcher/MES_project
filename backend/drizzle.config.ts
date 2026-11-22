import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration for the MES PostgreSQL database.
 *
 * The database URL is resolved from the same environment variable the runtime
 * service uses (`MES_DATABASE_URL`), so `db:generate` / `db:migrate` operate on
 * the configured database rather than a hard-coded path.
 */
export default defineConfig({
	schema: "./src/db/schema.ts",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.MES_DATABASE_URL ?? "postgres://mes:mes@localhost:5432/mes",
	},
	strict: true,
	verbose: true,
});