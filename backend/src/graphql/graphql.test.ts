/**
 * GraphQL transport conformance.
 *
 * Exercises the versioned endpoint's observable behavior: the JSON envelope,
 * variable handling, partial results, introspection, and the authentication and
 * validation failures the contract requires.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { type Auth, createAuth } from "../auth";
import { type AppConfig, loadConfig } from "../config";
import { createDatabase, type DatabaseHandle } from "../db";
import { runMigrations } from "../db/migrate";
import { roles, session, user, userRoles } from "../db/schema";
import { executeGraphQL } from "./index";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const dbPath = join(TMP_ROOT, `mes-graphql-${crypto.randomUUID()}.db`);

let db: DatabaseHandle;
let auth: Auth;
let config: AppConfig;
let token: string;

const VIEWER_ID = crypto.randomUUID();

function request(body: unknown, bearer?: string): Request {
	return new Request("http://localhost:3001/api/v1/graphql", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
		},
		body: JSON.stringify(body),
	});
}

function execute(body: unknown, bearer?: string) {
	return executeGraphQL(body as never, {
		db,
		config,
		request: request(body, bearer),
		auth,
	});
}

beforeAll(async () => {
	runMigrations({ databasePath: dbPath });
	config = loadConfig({ NODE_ENV: "test", MES_DATABASE_PATH: dbPath });
	db = createDatabase(dbPath);
	auth = createAuth(db, config);

	const departmentId = crypto.randomUUID();
	await db.insert(roles).values({
		id: crypto.randomUUID(),
		code: "EMPLOYEE",
		name: "Employee",
	});

	// The department table is required by the user's foreign key.
	const { departments } = await import("../db/schema");
	await db.insert(departments).values({
		id: departmentId,
		code: "ENG",
		name: "Engineering",
	});

	await db.insert(user).values({
		id: VIEWER_ID,
		name: "Test Employee",
		email: "employee@example.test",
		userCode: "T-0001",
		departmentId,
		isActive: true,
		emailVerified: true,
	});

	const [role] = await db.select().from(roles);
	await db.insert(userRoles).values({
		id: crypto.randomUUID(),
		userId: VIEWER_ID,
		roleId: role.id,
	});

	token = `token-${crypto.randomUUID()}`;
	await db.insert(session).values({
		id: crypto.randomUUID(),
		token,
		userId: VIEWER_ID,
		expiresAt: new Date(Date.now() + 60 * 60 * 1000),
		createdAt: new Date(),
		updatedAt: new Date(),
		ipAddress: null,
		userAgent: null,
	});
});

afterAll(() => {
	for (const suffix of ["", "-wal", "-shm"]) {
		const path = `${dbPath}${suffix}`;
		if (existsSync(path)) rmSync(path);
	}
});

describe("request and response envelope", () => {
	test("executes a query and returns data in the documented envelope", async () => {
		const result = await execute(
			{
				query:
					"query { viewer { user { id fullName userCode department { code } roles { code } } } }",
			},
			token,
		);

		expect(result.errors).toBeUndefined();
		const data = result.data as {
			viewer: {
				user: {
					id: string;
					fullName: string;
					userCode: string;
					department: { code: string } | null;
					roles: { code: string }[];
				};
			};
		};
		expect(data.viewer.user.id).toBe(VIEWER_ID);
		expect(data.viewer.user.fullName).toBe("Test Employee");
		expect(data.viewer.user.userCode).toBe("T-0001");
		expect(data.viewer.user.department?.code).toBe("ENG");
		expect(data.viewer.user.roles.map((r) => r.code)).toEqual(["EMPLOYEE"]);
	});

	test("accepts variables and an operationName", async () => {
		const result = await execute(
			{
				query: `query Tasks($filter: TaskFilter) {
					tasks(filter: $filter, orderBy: END_DATE_ASC, limit: 2) {
						nodes { id state priority }
						pageInfo { offset limit totalCount hasNextPage }
					}
				}`,
				operationName: "Tasks",
				variables: { filter: { state: "ACT", isOverdue: false } },
			},
			token,
		);
		expect(result.errors).toBeUndefined();
		const connection = (
			result.data as {
				tasks: { nodes: unknown[]; pageInfo: { limit: number } };
			}
		).tasks;
		expect(Array.isArray(connection.nodes)).toBe(true);
		expect(connection.pageInfo.limit).toBe(2);
	});

	test("rejects a missing query field with a VALIDATION_FAILED code", async () => {
		const result = await execute({ variables: {} }, token);
		expect(result.data).toBeUndefined();
		expect(result.errors?.[0]?.message).toContain("`query` field is required");
		expect(result.errors?.[0]?.extensions?.code).toBe("VALIDATION_FAILED");
	});

	test("rejects an unknown field during validation", async () => {
		const result = await execute({ query: "{ notARealField }" }, token);
		expect(result.data).toBeUndefined();
		expect(result.errors?.length).toBeGreaterThan(0);
	});

	test("rejects a syntax error without executing", async () => {
		const result = await execute({ query: "query { viewer { " }, token);
		expect(result.data).toBeUndefined();
		expect(result.errors?.length).toBeGreaterThan(0);
	});

	test("allows introspection", async () => {
		const result = await execute(
			{ query: "{ __schema { queryType { name } } }" },
			token,
		);
		expect(result.errors).toBeUndefined();
		expect(
			(result.data as { __schema: { queryType: { name: string } } }).__schema
				.queryType.name,
		).toBe("Query");
	});
});

describe("partial results", () => {
	test("returns successful fields alongside the failing field's error", async () => {
		// `viewer` resolves for an EMPLOYEE, while `project` is refused. `project`
		// is nullable, so the response keeps the successful field and reports the
		// failure — the contract's partial-result behavior.
		const result = await execute(
			{
				query: `{
					viewer { user { id } }
					project(id: "00000000-0000-4000-8000-000000000000") { id }
				}`,
			},
			token,
		);

		expect((result.data as { viewer: unknown }).viewer).toBeDefined();
		expect((result.data as { project: unknown }).project).toBeNull();
		expect(result.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
	});
});

describe("authentication", () => {
	test("resolves viewer to null without a token", async () => {
		const result = await execute({ query: "{ viewer { user { id } } }" });
		expect(result.errors).toBeUndefined();
		expect((result.data as { viewer: unknown }).viewer).toBeNull();
	});

	test("rejects a protected query without a token", async () => {
		const result = await execute({ query: "{ ticketStates { code } }" });
		expect(result.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
	});

	test("rejects a protected mutation without a token", async () => {
		const result = await execute({ query: "mutation { logout }" });
		expect(result.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
	});

	test("rejects an unknown token", async () => {
		const result = await execute(
			{ query: "{ ticketStates { code } }" },
			"not-a-real-token",
		);
		expect(result.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
	});

	test("rejects an expired session", async () => {
		const expired = `expired-${crypto.randomUUID()}`;
		await db.insert(session).values({
			id: crypto.randomUUID(),
			token: expired,
			userId: VIEWER_ID,
			expiresAt: new Date(Date.now() - 1000),
			createdAt: new Date(Date.now() - 2000),
			updatedAt: new Date(Date.now() - 2000),
			ipAddress: null,
			userAgent: null,
		});

		const result = await execute(
			{ query: "{ ticketStates { code } }" },
			expired,
		);
		expect(result.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
	});
});

describe("registry reads", () => {
	test("an authenticated role can read the ticket-state registry", async () => {
		const result = await execute(
			{ query: "{ ticketStates { code name } }" },
			token,
		);
		expect(result.errors).toBeUndefined();
		expect(
			Array.isArray((result.data as { ticketStates: unknown[] }).ticketStates),
		).toBe(true);
	});

	test("an authenticated role can read the leave-code registry", async () => {
		const result = await execute(
			{ query: "{ leaveCodes { code payrollRule } }" },
			token,
		);
		expect(result.errors).toBeUndefined();
		expect(
			Array.isArray((result.data as { leaveCodes: unknown[] }).leaveCodes),
		).toBe(true);
	});
});
