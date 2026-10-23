/**
 * Performance audit-level tests.
 *
 * The three audit levels are exercised through the GraphQL resolvers so the
 * assertions cover the documented node fields (including the resolved `user`
 * and `department` relations) and pagination, not just the domain rows. Scope
 * filtering is checked by role: a department head only ever sees their own
 * department and cannot reach the company-wide levels.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Auth } from "../auth";
import { loadConfig } from "../config";
import { createDatabase, type DatabaseHandle } from "../db";
import type { RoleCode } from "../db/enums";
import { runMigrations } from "../db/migrate";
import { departments, user } from "../db/schema";
import {
	createContext,
	type Viewer,
	type ViewerContext,
} from "../graphql/context";
import { performanceQuery } from "../graphql/resolvers/performance";
import { KPI_ON_TIME_TICKET, upsertMonthlySummary } from "./kpi";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const createdPaths: string[] = [];

afterAll(() => {
	for (const path of createdPaths) {
		for (const suffix of ["", "-wal", "-shm"]) {
			if (existsSync(`${path}${suffix}`)) rmSync(`${path}${suffix}`);
		}
	}
});

function freshDatabase(name: string): DatabaseHandle {
	const path = join(TMP_ROOT, `mes-perf-${name}-${crypto.randomUUID()}.db`);
	createdPaths.push(path);
	runMigrations({ databasePath: path });
	return createDatabase(path);
}

function viewer(
	id: string,
	roleCodes: RoleCode[],
	departmentId: string | null = null,
): Viewer {
	return {
		id,
		userCode: `U-${id}`,
		fullName: `User ${id}`,
		email: `${id}@mes.local`,
		departmentId,
		isActive: true,
		roleCodes,
	};
}

function context(db: DatabaseHandle, who: Viewer): ViewerContext {
	return createContext({
		db,
		config: loadConfig({ NODE_ENV: "test" }),
		request: { ipAddress: null, userAgent: null },
		viewer: who,
	});
}

function call(
	name: keyof typeof performanceQuery,
	ctx: ViewerContext,
	args: Record<string, unknown>,
) {
	type Node = Record<string, unknown>;
	interface Result {
		nodes: Node[];
		pageInfo: {
			offset: number;
			limit: number;
			totalCount: number;
			hasNextPage: boolean;
		};
	}
	return performanceQuery[name](
		null,
		args,
		{ ctx, auth: undefined as unknown as Auth },
		null,
	) as Promise<Result>;
}

interface SummaryOverrides {
	userId: string;
	totalKpiScore: number;
	attendanceRate: number;
	totalTasksAssigned: number;
	completedOnTime?: number;
	completedUrgentOnTime?: number;
	approvedFirstTime?: number;
	overdueTasks?: number;
	rejectedTasks?: number;
	extensionRequestsCount?: number;
	perfectAttendanceBonus?: number;
	unapprovedLeaveCount?: number;
	lateEarlyCount?: number;
}

async function seedSummary(ctx: ViewerContext, overrides: SummaryOverrides) {
	await upsertMonthlySummary(ctx, {
		periodYear: 2026,
		periodMonth: 3,
		completedOnTime: 0,
		completedUrgentOnTime: 0,
		approvedFirstTime: 0,
		overdueTasks: 0,
		rejectedTasks: 0,
		extensionRequestsCount: 0,
		perfectAttendanceBonus: 0,
		unapprovedLeaveCount: 0,
		lateEarlyCount: 0,
		...overrides,
	});
}

async function seedFixtures(db: DatabaseHandle): Promise<ViewerContext> {
	await db.insert(departments).values([
		{ id: "prod", code: "PROD", name: "Production" },
		{ id: "qc", code: "QC", name: "Quality Control" },
	]);
	await db.insert(user).values([
		{
			id: "u1",
			name: "User u1",
			email: "u1@mes.local",
			userCode: "U-u1",
			departmentId: "prod",
		},
		{
			id: "u2",
			name: "User u2",
			email: "u2@mes.local",
			userCode: "U-u2",
			departmentId: "prod",
		},
		{
			id: "u3",
			name: "User u3",
			email: "u3@mes.local",
			userCode: "U-u3",
			departmentId: "qc",
		},
	]);

	// Seeded by an HR context; the summaries themselves carry no scope.
	const hr = context(db, viewer("hr", ["HR_MANAGER"]));
	await seedSummary(hr, {
		userId: "u1",
		totalKpiScore: 200,
		attendanceRate: 96,
		totalTasksAssigned: 10,
		completedOnTime: 8,
		completedUrgentOnTime: 2,
		approvedFirstTime: 5,
		overdueTasks: 1,
		rejectedTasks: 1,
		extensionRequestsCount: 2,
		perfectAttendanceBonus: 50,
	});
	await seedSummary(hr, {
		userId: "u2",
		totalKpiScore: 100,
		attendanceRate: 90,
		totalTasksAssigned: 5,
		completedOnTime: 4,
		approvedFirstTime: 3,
	});
	await seedSummary(hr, {
		userId: "u3",
		totalKpiScore: 120,
		attendanceRate: 80,
		totalTasksAssigned: 7,
		completedOnTime: 6,
	});
	return hr;
}

describe("level 1 — company-wide per employee", () => {
	test("returns the documented columns ordered by score", async () => {
		const db = freshDatabase("level1");
		const hr = await seedFixtures(db);

		const result = await call("kpiAuditLevel1Company", hr, {
			filter: { periodYear: 2026 },
			offset: 0,
			limit: 20,
		});

		expect(result.pageInfo).toEqual({
			offset: 0,
			limit: 20,
			totalCount: 3,
			hasNextPage: false,
		});
		expect(result.nodes).toHaveLength(3);
		expect(result.nodes.map((node) => node.totalKpiScore)).toEqual([
			200, 120, 100,
		]);

		const [first] = result.nodes;
		expect(Object.keys(first).sort()).toEqual([
			"attendanceRate",
			"completedOnTime",
			"department",
			"overdueTasks",
			"perfectAttendanceBonus",
			"periodMonth",
			"periodYear",
			"totalKpiScore",
			"totalTasksAssigned",
			"unapprovedLeaveCount",
			"user",
		]);
		expect((first.user as Record<string, unknown>).fullName).toBe("User u1");
		expect((first.department as Record<string, unknown>).name).toBe(
			"Production",
		);
	});

	test("filters by department and by month", async () => {
		const db = freshDatabase("level1-filter");
		const hr = await seedFixtures(db);

		const byDepartment = await call("kpiAuditLevel1Company", hr, {
			filter: { periodYear: 2026, departmentId: "qc" },
			offset: 0,
			limit: 20,
		});
		expect(byDepartment.pageInfo.totalCount).toBe(1);
		expect(byDepartment.nodes[0].totalKpiScore).toBe(120);

		const byMonth = await call("kpiAuditLevel1Company", hr, {
			filter: { periodYear: 2026, periodMonth: 4 },
			offset: 0,
			limit: 20,
		});
		expect(byMonth.nodes).toHaveLength(0);
		expect(byMonth.pageInfo.totalCount).toBe(0);
	});
});

describe("level 2 — aggregated by department", () => {
	test("returns the documented aggregated columns", async () => {
		const db = freshDatabase("level2");
		const hr = await seedFixtures(db);

		const result = await call("kpiAuditLevel2Department", hr, {
			filter: { periodYear: 2026 },
		});

		expect(result.nodes).toHaveLength(2);
		expect(Object.keys(result.nodes[0]).sort()).toEqual([
			"avgAttendanceRate",
			"avgDepartmentKpiScore",
			"department",
			"periodMonth",
			"periodYear",
			"totalEmployees",
			"totalTasksAssigned",
		]);

		const [production] = result.nodes;
		expect((production.department as Record<string, unknown>).code).toBe(
			"PROD",
		);
		expect(production.totalEmployees).toBe(2);
		expect(production.totalTasksAssigned).toBe(15);
		expect(production.avgAttendanceRate).toBe(93);
		expect(production.avgDepartmentKpiScore).toBe(150);

		expect(result.pageInfo.totalCount).toBe(2);
		expect(result.pageInfo.hasNextPage).toBe(false);
	});

	test("restricts to a filtered department", async () => {
		const db = freshDatabase("level2-filter");
		const hr = await seedFixtures(db);

		const result = await call("kpiAuditLevel2Department", hr, {
			filter: { periodYear: 2026, departmentId: "qc" },
		});

		expect(result.nodes).toHaveLength(1);
		expect((result.nodes[0].department as Record<string, unknown>).code).toBe(
			"QC",
		);
		expect(result.nodes[0].totalEmployees).toBe(1);
		expect(result.nodes[0].avgDepartmentKpiScore).toBe(120);
	});
});

describe("level 3 — per employee within a department", () => {
	test("returns the documented columns and honours ordering", async () => {
		const db = freshDatabase("level3");
		const hr = await seedFixtures(db);

		const byScore = await call("kpiAuditLevel3Employee", hr, {
			filter: { periodYear: 2026 },
			orderBy: "TOTAL_KPI_SCORE_DESC",
			offset: 0,
			limit: 20,
		});
		expect(byScore.nodes.map((node) => node.totalKpiScore)).toEqual([
			200, 120, 100,
		]);
		expect(Object.keys(byScore.nodes[0]).sort()).toEqual([
			"attendanceRate",
			"completedOnTime",
			"department",
			"immediateApprovalCount",
			"overdueTasks",
			"perfectAttendanceBonus",
			"periodMonth",
			"periodYear",
			"returnedCount",
			"totalKpiScore",
			"totalTasksAssigned",
			"user",
		]);

		const [u1] = byScore.nodes;
		expect(u1.immediateApprovalCount).toBe(5);
		expect(u1.returnedCount).toBe(1);
		expect((u1.user as Record<string, unknown>).fullName).toBe("User u1");

		const byAttendance = await call("kpiAuditLevel3Employee", hr, {
			filter: { periodYear: 2026 },
			orderBy: "ATTENDANCE_RATE_DESC",
			offset: 0,
			limit: 20,
		});
		expect(byAttendance.nodes.map((node) => node.attendanceRate)).toEqual([
			96, 90, 80,
		]);
	});

	test("restricts level 3 rows to a filtered department", async () => {
		const db = freshDatabase("level3-filter");
		const hr = await seedFixtures(db);

		const result = await call("kpiAuditLevel3Employee", hr, {
			filter: { periodYear: 2026, departmentId: "qc" },
			orderBy: "TOTAL_KPI_SCORE_DESC",
			offset: 0,
			limit: 20,
		});

		expect(result.pageInfo.totalCount).toBe(1);
		expect((result.nodes[0].user as Record<string, unknown>).fullName).toBe(
			"User u3",
		);
	});
});

describe("department head scope", () => {
	test("sees only their own department in level 3", async () => {
		const db = freshDatabase("dept-head");
		await seedFixtures(db);
		const dh = context(db, viewer("dh", ["DEPT_HEAD"], "prod"));

		const result = await call("kpiAuditLevel3Employee", dh, {
			filter: { periodYear: 2026 },
			orderBy: "TOTAL_KPI_SCORE_DESC",
			offset: 0,
			limit: 20,
		});

		expect(result.nodes).toHaveLength(2);
		expect(result.nodes.map((node) => node.totalKpiScore)).toEqual([200, 100]);
		for (const node of result.nodes) {
			expect((node.department as Record<string, unknown>).code).toBe("PROD");
		}
	});

	test("cannot widen the scope with a different department filter", async () => {
		const db = freshDatabase("dept-head-widen");
		await seedFixtures(db);
		const dh = context(db, viewer("dh", ["DEPT_HEAD"], "prod"));

		const result = await call("kpiAuditLevel3Employee", dh, {
			filter: { periodYear: 2026, departmentId: "qc" },
			orderBy: "TOTAL_KPI_SCORE_DESC",
			offset: 0,
			limit: 20,
		});

		expect(result.nodes.map((node) => node.totalKpiScore)).toEqual([200, 100]);
	});

	test("is denied the company-wide levels", async () => {
		const db = freshDatabase("dept-head-denied");
		await seedFixtures(db);
		const dh = context(db, viewer("dh", ["DEPT_HEAD"], "prod"));

		await expect(
			call("kpiAuditLevel1Company", dh, {
				filter: { periodYear: 2026 },
			}),
		).rejects.toThrow();
		await expect(
			call("kpiAuditLevel2Department", dh, {
				filter: { periodYear: 2026 },
			}),
		).rejects.toThrow();
	});
});

describe("score event scope", () => {
	test("an employee only sees their own events", async () => {
		const db = freshDatabase("events");
		const hr = await seedFixtures(db);
		const { recordKpiEvent } = await import("./kpi");

		await recordKpiEvent(hr, {
			userId: "u1",
			ruleCode: KPI_ON_TIME_TICKET,
			periodYear: 2026,
			periodMonth: 3,
		});
		await recordKpiEvent(hr, {
			userId: "u3",
			ruleCode: KPI_ON_TIME_TICKET,
			periodYear: 2026,
			periodMonth: 3,
		});

		const employee = context(db, viewer("u1", ["EMPLOYEE"], "prod"));
		const own = await call("kpiScoreEvents", employee, {
			input: { periodYear: 2026, periodMonth: 3 },
			offset: 0,
			limit: 20,
		});
		expect(own.pageInfo.totalCount).toBe(1);

		const companyWide = await call("kpiScoreEvents", hr, {
			input: { periodYear: 2026, periodMonth: 3 },
			offset: 0,
			limit: 20,
		});
		expect(companyWide.pageInfo.totalCount).toBe(2);
	});
});
