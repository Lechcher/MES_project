/**
 * The service's log lines, exercised end to end.
 *
 * One test logger feeds a recording terminal sink and a real file sink in a
 * temp directory, so a line is proved to reach both at once. The existing
 * `../index.test.ts` stays untouched and quiet (no logger injected); this file
 * is the logging-specific run, in the same style.
 *
 * The suite never writes into `backend/data/`: the file sink points at a
 * temporary directory of its own.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Auth, createAuth } from "../auth";
import { type AppConfig, loadConfig } from "../config";
import type { DatabaseHandle } from "../db";
import { createTestDatabase, type TestDatabase } from "../db/test-db";
import { type ChangeBus, createChangeBus } from "../events/event-bus";
import { createService } from "../index";
import { createFileSink } from "./file-sink";
import { createLogger } from "./logger";

let testDb: TestDatabase;
let db: DatabaseHandle;
let auth: Auth;
let config: AppConfig;
let events: ChangeBus;

/** Every line the run wrote to the terminal sink. */
const terminal: string[] = [];
let logDirectory: string;
let app: ReturnType<typeof createService>;

beforeAll(async () => {
	testDb = await createTestDatabase();
	config = loadConfig({
		NODE_ENV: "test",
		MES_DATABASE_URL: testDb.connectionString,
		MES_WEB_ORIGIN: "http://localhost:3000",
	});
	db = testDb.db;
	auth = createAuth(db, config);
	events = createChangeBus();

	logDirectory = mkdtempSync(join(tmpdir(), "mes-run-logs-"));
	const file = createFileSink({ directory: logDirectory });
	const logger = createLogger({
		level: "debug",
		terminal: (line) => terminal.push(line),
		file: (line) => file.write(line),
	});
	app = createService({ db, auth, config, events, logging: logger });
});

afterAll(async () => {
	await testDb.close();
	rmSync(logDirectory, { recursive: true, force: true });
});

/** The first recorded line matching `needle`, the run's own account. */
function lineContaining(needle: string): string {
	const line = terminal.find((entry) => entry.includes(needle));
	if (line === undefined)
		throw new Error(`no recorded line contains ${needle}`);
	return line;
}

describe("a run of the service", () => {
	const listener: { server?: { port?: number }; stopped?: boolean } = {};
	let baseUrl: string;

	beforeAll(() => {
		app.listen({ port: 0, hostname: "127.0.0.1" }, (server) => {
			listener.server = server;
		});
		const port = listener.server?.port;
		if (port === undefined) throw new Error("listener did not start");
		baseUrl = `http://127.0.0.1:${port}`;
	});

	afterAll(() => {
		if (listener.stopped) return;
		listener.stopped = true;
		app.stop(true);
	});

	function post(body: unknown): Promise<Response> {
		return fetch(`${baseUrl}/api/v1/graphql`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	}

	test("the start hook records the port and the environment", () => {
		const startup = lineContaining("service listening on port");

		expect(startup).toContain(`port ${config.port}`);
		expect(startup).toContain(config.env);
	});

	test("the start hook records no credential and no auth secret", () => {
		// The configuration is summarised, never recorded: the auth secret and
		// the database URL's password must not appear in any line.
		const databasePassword = new URL(config.databaseUrl).password;

		for (const line of terminal) {
			expect(line).not.toContain(config.authSecret);
			expect(line).not.toContain(config.databaseUrl);
			if (databasePassword !== "") {
				expect(line).not.toContain(databasePassword);
			}
		}
	});

	test("a malformed query records VALIDATION_FAILED with the operation", async () => {
		await post({ query: "{ notAField }" });

		const record = lineContaining("codes=VALIDATION_FAILED");
		expect(record).toContain("operation=(anonymous)");
		expect(record).toContain("status=200");
	});

	test("a named operation is recorded by name", async () => {
		await post({ query: "query GetStates { ticketStates { code } }" });

		const record = lineContaining("operation=GetStates");
		expect(record).toContain("codes=UNAUTHENTICATED");
	});

	test("an unauthenticated request records UNAUTHENTICATED", async () => {
		await post({ query: "{ ticketStates { code } }" });

		const record = lineContaining("codes=UNAUTHENTICATED");
		expect(record).toContain("status=200");
	});

	test("a non-JSON body is recorded with its status and code", async () => {
		await fetch(`${baseUrl}/api/v1/graphql`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "not json",
		});

		const record = lineContaining("operation=(unparsed body)");
		expect(record).toContain("status=400");
		expect(record).toContain("codes=VALIDATION_FAILED");
	});

	test("a route that throws records the failure and its stack", async () => {
		// A body the route's schema rejects throws before the handler runs,
		// which is how a request drives an unhandled failure here.
		const response = await fetch(`${baseUrl}/api/v1/files`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(response.status).toBe(422);

		const record = lineContaining("unhandled failure");
		expect(record).toContain("/api/v1/files");
		// The thrown validation failure, and the stack it carries.
		expect(record).toContain("validation");
		expect(record).toContain(" at ");
	});

	test("an error line reaches the terminal and the log file at once", async () => {
		await post({ query: "{ notAField }" });

		const livePath = join(logDirectory, "mes-backend.log");
		expect(existsSync(livePath)).toBe(true);
		const written = readFileSync(livePath, "utf8");

		// The file holds the same lines the terminal sink received, so a
		// failure is reviewable after the run and visible during it.
		for (const line of terminal) {
			expect(written).toContain(line);
		}
		expect(written).toContain("codes=VALIDATION_FAILED");
	});

	test("the stop hook records the end of the run, and the file holds it", async () => {
		listener.stopped = true;
		// Awaited: the stop lifecycle runs after the server has closed.
		await app.stop(true);

		expect(lineContaining("service stopped")).toBeDefined();

		// A complete run in review: the startup line, the failure line, and
		// the shutdown line — one event per line, each stamped with its time.
		const written = readFileSync(join(logDirectory, "mes-backend.log"), "utf8");
		expect(written).toContain("service listening on port");
		expect(written).toContain("codes=VALIDATION_FAILED");
		expect(written).toContain("service stopped");

		for (const line of written.split("\n")) {
			if (line === "") continue;
			expect(line).toMatch(
				/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z (DEBUG|INFO|WARN|ERROR) /,
			);
		}
	});
});
