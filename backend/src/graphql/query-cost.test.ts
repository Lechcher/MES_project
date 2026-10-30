/**
 * Query-cost guard.
 *
 * Counts the SQL statements a list read issues when its selection includes
 * nested relations, so the per-row fan-out in `shapes.ts` is measurable and the
 * batching work can prove it removed the multiplier. Drives the real GraphQL
 * resolvers against a seeded database.
 *
 * See `openspec/changes/optimize-query-performance/baseline.md` for the
 * pre-fix measurement.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execute, parse } from "graphql";
import { eq } from "drizzle-orm";
import { loadConfig } from "../config";
import { createDatabase, type DatabaseHandle } from "../db";
import { runMigrations } from "../db/migrate";
import { seedDatabase } from "../db/seed";
import { user as userTable } from "../db/schema";
import { schema } from "./index";
import { createContext, graphqlContextValue, type Viewer } from "./context";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const dbPath = join(TMP_ROOT, `mes-query-cost-${crypto.randomUUID()}.db`);

let db: DatabaseHandle;
let config: ReturnType<typeof loadConfig>;
let viewer: Viewer;

afterAll(() => {
	for (const suffix of ["", "-wal", "-shm"]) {
		if (existsSync(`${dbPath}${suffix}`)) rmSync(`${dbPath}${suffix}`);
	}
});

/** Wrap a DB handle so every query-builder call is counted. */
function statementCounter(target: DatabaseHandle) {
	let n = 0;
	const proxy = new Proxy(target, {
		get(t, prop, recv) {
			const v = Reflect.get(t, prop, recv);
			const isQuery =
				typeof v === "function" &&
				["select", "insert", "update", "delete"].includes(String(prop));
			if (isQuery) {
				return (...args: unknown[]) => {
					n += 1;
					return (v as (...a: unknown[]) => unknown).apply(t, args);
				};
			}
			return typeof v === "function"
				? (v as (...a: unknown[]) => unknown).bind(t)
				: v;
		},
	});
	return {
		proxy,
		reset: () => {
			n = 0;
		},
		count: () => n,
	};
}

const TASK_LIST = parse(`
  query QueryCost($offset: Int!, $limit: Int!) {
    tasks(offset: $offset, limit: $limit) {
      nodes {
        id
        assignedTo { id }
        createdBy { id }
        department { id }
        progressLogs { id }
        stateTransitions { id }
        requests { id }
        journey { id }
        attachments { id }
        badges
      }
    }
  }
`);

/** Execute the nested task list and return node count + statement count + ms. */
async function measureList(variables: {
	offset: number;
	limit: number;
}): Promise<{ nodes: number; statements: number; ms: number; errors: number }> {
	const ctx = createContext({
		db,
		config,
		request: { ipAddress: null, userAgent: "query-cost-guard" },
		viewer,
	});
	const counter = statementCounter(db);
	ctx.db = counter.proxy as typeof db;
	const contextValue = graphqlContextValue(ctx, {} as never);

	counter.reset();
	const t0 = performance.now();
	const res = await execute({
		schema,
		document: TASK_LIST,
		contextValue,
		variableValues: variables,
	});
	const tasks = res.data as
		| { tasks?: { nodes?: unknown[] } }
		| null
		| undefined;
	return {
		nodes: tasks?.tasks?.nodes?.length ?? 0,
		statements: counter.count(),
		ms: performance.now() - t0,
		errors: res.errors?.length ?? 0,
	};
}

beforeAll(async () => {
	runMigrations({ databasePath: dbPath });
	config = loadConfig({ NODE_ENV: "test" });
	db = createDatabase(dbPath);
	await seedDatabase({ db, config, now: new Date() });

	const [admin] = await db
		.select()
		.from(userTable)
		.where(eq(userTable.email, "super.admin@mes.local"))
		.limit(1);
	if (!admin) throw new Error("seed did not create super.admin@mes.local");
	viewer = {
		id: admin.id,
		userCode: admin.userCode,
		fullName: admin.name ?? admin.userCode,
		email: admin.email,
		departmentId: admin.departmentId ?? null,
		isActive: true,
		roleCodes: ["SUPER_ADMIN"],
	};
});

describe("query-cost guard", () => {
	test("the guard executes a nested task list and reports its cost", async () => {
		const measured = await measureList({ offset: 0, limit: 10 });
		expect(measured.errors).toBe(0);
		expect(measured.nodes).toBeGreaterThan(0);
		expect(measured.statements).toBeGreaterThan(0);
	});

	test("a nested task list issues a bounded query count independent of page size", async () => {
		// Collections are batched per page and relations (user/department)
		// coalesce per request, so the statement count is a small constant
		// instead of the pre-fix fan-out (~7 statements per row → ~350 for 50).
		const small = await measureList({ offset: 0, limit: 10 });
		const large = await measureList({ offset: 0, limit: 50 });
		expect(small.errors).toBe(0);
		expect(large.errors).toBe(0);
		expect(large.nodes).toBeGreaterThan(small.nodes);

		expect(small.statements).toBeLessThanOrEqual(50);
		expect(large.statements).toBeLessThanOrEqual(50);
		expect(large.statements / large.nodes).toBeLessThanOrEqual(1.5);
	});
});
