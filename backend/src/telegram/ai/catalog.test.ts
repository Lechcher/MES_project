/**
 * Model catalog tests.
 *
 * The catalog's contract: both endpoint answer shapes are accepted, a failed
 * refresh keeps the previous cache (never leaving users without a list), and
 * the stored rows are what `/model` serves. A fetch stub stands in for the
 * endpoint — no network in the suite.
 */

import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createDatabase, type DatabaseHandle } from "../../db";
import { runMigrations } from "../../db/migrate";
import { telegramAiModels } from "../../db/schema";
import {
	catalogAgeMs,
	fetchModelCatalog,
	isKnownModel,
	loadModelCatalog,
	refreshModelCatalog,
} from "./catalog";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const dbPath = join(TMP_ROOT, `mes-tg-catalog-${crypto.randomUUID()}.db`);

let db: DatabaseHandle;

beforeAll(() => {
	runMigrations({ databasePath: dbPath });
	db = createDatabase(dbPath);
});

afterAll(() => {
	for (const suffix of ["", "-wal", "-shm"]) {
		if (existsSync(`${dbPath}${suffix}`)) rmSync(`${dbPath}${suffix}`);
	}
});

afterEach(async () => {
	await db.delete(telegramAiModels);
});

/** A fetch stub answering with a fixed payload or status. */
function stubFetch(payload: unknown, status = 200): typeof fetch {
	return (async () =>
		new Response(JSON.stringify(payload), {
			status,
			headers: { "content-type": "application/json" },
		})) as unknown as typeof fetch;
}

describe("fetchModelCatalog", () => {
	test("accepts the OpenAI { data: [...] } shape", async () => {
		const entries = await fetchModelCatalog(
			"https://endpoint.example.com/v1/",
			null,
			stubFetch({ data: [{ id: "gpt-4o-mini" }, { id: "gpt-4o" }] }),
		);
		expect(entries.map((entry) => entry.modelId)).toEqual([
			"gpt-4o-mini",
			"gpt-4o",
		]);
	});

	test("accepts the bare-array shape", async () => {
		const entries = await fetchModelCatalog(
			"https://endpoint.example.com/v1",
			null,
			stubFetch([{ id: "llama-3" }]),
		);
		expect(entries.map((entry) => entry.modelId)).toEqual(["llama-3"]);
	});

	test("sends the API key as a bearer header when one is set", async () => {
		// Initialized non-empty so the closure's write is visible to the
		// assertion's type (TS control-flow narrows `null` back otherwise).
		let authorization = "unset";
		const fetchImpl = (async (_url: string, init: RequestInit) => {
			authorization =
				(init.headers as { authorization?: string })?.authorization ?? "unset";
			return new Response(JSON.stringify({ data: [] }), { status: 200 });
		}) as typeof fetch;
		await fetchModelCatalog(
			"https://endpoint.example.com/v1",
			"sk-key",
			fetchImpl,
		);
		expect(authorization).toBe("Bearer sk-key");
	});

	test("throws on a non-OK response so the caller keeps the cache", async () => {
		expect(
			fetchModelCatalog(
				"https://endpoint.example.com/v1",
				null,
				stubFetch({ error: "nope" }, 500),
			),
		).rejects.toThrow("500");
	});
});

describe("refreshModelCatalog", () => {
	test("replaces the stored catalog", async () => {
		const entries = await refreshModelCatalog(
			db,
			{ aiBaseUrl: "https://endpoint.example.com/v1", aiApiKey: null },
			stubFetch({ data: [{ id: "model-a" }, { id: "model-b" }] }),
		);
		expect(entries).toHaveLength(2);

		const rows = await loadModelCatalog(db);
		expect(rows.map((row) => row.modelId).sort()).toEqual([
			"model-a",
			"model-b",
		]);
		expect(await catalogAgeMs(db)).not.toBeNull();
		expect(await isKnownModel(db, "model-a")).toBe(true);
		expect(await isKnownModel(db, "model-z")).toBe(false);
	});

	test("keeps the previous rows when the fetch fails", async () => {
		await refreshModelCatalog(
			db,
			{ aiBaseUrl: "https://endpoint.example.com/v1", aiApiKey: null },
			stubFetch({ data: [{ id: "kept-model" }] }),
		);

		await expect(
			refreshModelCatalog(
				db,
				{ aiBaseUrl: "https://endpoint.example.com/v1", aiApiKey: null },
				stubFetch({ error: "unreachable" }, 503),
			),
		).rejects.toThrow();

		const rows = await loadModelCatalog(db);
		expect(rows.map((row) => row.modelId)).toEqual(["kept-model"]);
	});

	test("refreshes nothing without a configured endpoint", async () => {
		expect(
			await refreshModelCatalog(
				db,
				{ aiBaseUrl: null, aiApiKey: null },
				stubFetch({ data: [{ id: "never" }] }),
			),
		).toEqual([]);
		expect(await loadModelCatalog(db)).toHaveLength(0);
	});
});
