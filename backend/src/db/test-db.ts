/**
 * PostgreSQL test database helper.
 *
 * Connects to the server's maintenance database, creates a uniquely named
 * database, applies the committed migration set to it, and returns a handle
 * whose `close()` drops the database again. Each test file gets an isolated
 * database, so suites never share state and never mutate a working checkout.
 *
 * The connection is a single `pg.Client` rather than a pool: tests within a
 * file run sequentially, and one connection closes deterministically — a pool
 * can strand sockets after the migrations run (a session that never returns
 * its client), which starves later test files of server connections.
 *
 * The server URL comes from `MES_TEST_DATABASE_URL` and defaults to the
 * documented local Docker instance (`postgres://mes:mes@localhost:5432/postgres`).
 * When the server is unreachable the helper fails with an actionable message
 * rather than a driver stack trace.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import type { DatabaseHandle } from "./index";
import { DEFAULT_MIGRATIONS_FOLDER } from "./migrate";
import * as schema from "./schema";

const DEFAULT_SERVER_URL = "postgres://mes:mes@localhost:5432/postgres";

export const TEST_DATABASE_SERVER =
	process.env.MES_TEST_DATABASE_URL ?? DEFAULT_SERVER_URL;

/** A per-test-file database plus the handle that serves it. */
export interface TestDatabase {
	db: DatabaseHandle;
	/** The generated database name (for diagnostics). */
	name: string;
	/** Connection URL of the generated database. */
	connectionString: string;
	/** Close the connection and drop the database. */
	close(): Promise<void>;
}

/** Rewrite the server URL onto a different database name. */
function withDatabase(serverUrl: string, name: string): string {
	const url = new URL(serverUrl);
	url.pathname = `/${name}`;
	return url.toString();
}

async function maintenanceClient(): Promise<Client> {
	const client = new Client({ connectionString: TEST_DATABASE_SERVER });
	try {
		await client.connect();
	} catch (error) {
		await client.end().catch(() => {});
		throw new Error(
			`The test PostgreSQL server at ${TEST_DATABASE_SERVER} is unreachable. ` +
				"Start it with: docker run -d --name mes-test-pg " +
				"-e POSTGRES_USER=mes -e POSTGRES_PASSWORD=mes " +
				"-p 5432:5432 docker.io/library/postgres:18-alpine",
			{ cause: error },
		);
	}
	return client;
}

/**
 * Create an isolated, migrated database for one test file.
 *
 * Call it in `beforeAll` and `close()` it in `afterAll`. The migrations are
 * applied through the runner's own folder, so the suite exercises the same
 * migration set the service boots with.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
	const server = await maintenanceClient();
	const name = `mes_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

	try {
		await server.query(`CREATE DATABASE "${name}"`);
	} finally {
		await server.end();
	}

	const connectionString = withDatabase(TEST_DATABASE_SERVER, name);
	const client = new Client({ connectionString });
	client.on("error", () => {
		// A terminated socket during teardown must not surface as an
		// unhandled client error.
	});
	await client.connect();
	// A single client: cast keeps the shared handle type; `$client` is this
	// Client, and nothing in the suites depends on pooling.
	const db = drizzle(client, { schema }) as unknown as DatabaseHandle;
	await migrate(db, { migrationsFolder: DEFAULT_MIGRATIONS_FOLDER });

	return {
		db,
		name,
		connectionString,
		async close() {
			const drop = await maintenanceClient();
			try {
				// Terminate first: this kills any query still in flight on the
				// test database (a lock-blocked statement would otherwise keep
				// the client — and the hook — waiting forever).
				await drop.query(
					`select pg_terminate_backend(pid) from pg_stat_activity
					 where datname = $1 and pid <> pg_backend_pid()`,
					[name],
				);
				// Drain the client with a cap so teardown can never hang the
				// suite; the database is about to be dropped regardless.
				await Promise.race([
					client.end().catch(() => {}),
					new Promise((resolve) => setTimeout(resolve, 2000)),
				]);
				await drop.query(`DROP DATABASE IF EXISTS "${name}"`);
			} finally {
				await drop.end();
			}
		},
	};
}
