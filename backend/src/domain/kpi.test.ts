/**
 * Deterministic KPI engine tests.
 *
 * The engine is the source of truth for scores, so these tests pin the
 * documented point values, prove the monthly summary is reproducible, and check
 * that the audit role asymmetries are enforced.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { loadConfig } from "../config";
import type { DatabaseHandle } from "../db";
import type { RoleCode } from "../db/enums";
import {
	attendanceRecords,
	departments,
	kpiPointRules,
	tasks,
	user,
} from "../db/schema";
import { createTestDatabase, type TestDatabase } from "../db/test-db";
import { authorize } from "../graphql/access";
import {
	createContext,
	type Viewer,
	type ViewerContext,
} from "../graphql/context";
import {
	ensurePointRules,
	KPI_EXTENSION_REQUEST,
	KPI_FIRST_TIME_APPROVAL,
	KPI_ON_TIME_TICKET,
	KPI_ON_TIME_URGENT,
	KPI_OVERDUE_TICKET,
	KPI_PERFECT_ATTENDANCE,
	KPI_POINTS,
	KPI_RETURNED_TICKET,
	KPI_RULES,
	KPI_UNAPPROVED_LEAVE,
	recomputeMonthlySummary,
	recordKpiEvent,
} from "./kpi";

const testDbs: TestDatabase[] = [];

afterAll(async () => {
	// Closing the generated databases in parallel keeps the
	// teardown well inside the hook timeout under a loaded server.
	await Promise.all(testDbs.map((testDb) => testDb.close()));
});

async function freshDatabase(_name: string): Promise<DatabaseHandle> {
	const testDb = await createTestDatabase();
	testDbs.push(testDb);
	return testDb.db;
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

async function seedDepartment(db: DatabaseHandle, id: string, code: string) {
	await db.insert(departments).values({ id, code, name: `${code} Dept` });
}

async function seedUser(
	db: DatabaseHandle,
	id: string,
	departmentId: string | null,
) {
	await db.insert(user).values({
		id,
		name: `User ${id}`,
		email: `${id}@mes.local`,
		userCode: `U-${id}`,
		departmentId,
	});
}

describe("documented KPI point rules", () => {
	test("carry the exact documented point values", async () => {
		expect(KPI_POINTS[KPI_ON_TIME_TICKET]).toBe(10);
		expect(KPI_POINTS[KPI_ON_TIME_URGENT]).toBe(20);
		expect(KPI_POINTS[KPI_FIRST_TIME_APPROVAL]).toBe(5);
		expect(KPI_POINTS[KPI_PERFECT_ATTENDANCE]).toBe(50);
		expect(KPI_POINTS[KPI_OVERDUE_TICKET]).toBe(-15);
		expect(KPI_POINTS[KPI_RETURNED_TICKET]).toBe(-5);
		expect(KPI_POINTS[KPI_EXTENSION_REQUEST]).toBe(-2);
		expect(KPI_POINTS[KPI_UNAPPROVED_LEAVE]).toBe(-10);
		expect(KPI_RULES).toHaveLength(8);
	});

	test("every trigger records its documented point value", async () => {
		const db = await freshDatabase("triggers");
		await seedDepartment(db, "d1", "PROD");
		await seedUser(db, "u1", "d1");
		const ctx = context(db, viewer("u1", ["EMPLOYEE"], "d1"));

		for (const rule of KPI_RULES) {
			const event = await recordKpiEvent(ctx, {
				userId: "u1",
				ruleCode: rule.code,
				periodYear: 2026,
				periodMonth: 3,
			});
			expect(event.ruleCode).toBe(rule.code);
			expect(event.points).toBe(KPI_POINTS[rule.code]);
			expect(event.periodYear).toBe(2026);
			expect(event.periodMonth).toBe(3);
		}
	});

	test("uses the configured point value when a rule is overridden", async () => {
		const db = await freshDatabase("override");
		await seedDepartment(db, "d1", "PROD");
		await seedUser(db, "u1", "d1");
		const ctx = context(db, viewer("u1", ["EMPLOYEE"], "d1"));

		await ensurePointRules(ctx);
		await db
			.update(kpiPointRules)
			.set({ points: -7 })
			.where(eq(kpiPointRules.code, KPI_EXTENSION_REQUEST));

		const event = await recordKpiEvent(ctx, {
			userId: "u1",
			ruleCode: KPI_EXTENSION_REQUEST,
			periodYear: 2026,
			periodMonth: 3,
		});
		expect(event.points).toBe(-7);
	});
});

describe("monthly summary reproducibility", () => {
	test("recomputing the same month twice yields identical totals", async () => {
		const db = await freshDatabase("idempotent");
		await seedDepartment(db, "d1", "PROD");
		await seedUser(db, "u1", "d1");
		const ctx = context(db, viewer("u1", ["EMPLOYEE"], "d1"));

		await recordKpiEvent(ctx, {
			userId: "u1",
			ruleCode: KPI_ON_TIME_TICKET,
			periodYear: 2026,
			periodMonth: 3,
		});
		await recordKpiEvent(ctx, {
			userId: "u1",
			ruleCode: KPI_OVERDUE_TICKET,
			periodYear: 2026,
			periodMonth: 3,
		});

		const first = await recomputeMonthlySummary(ctx, "u1", 2026, 3);
		const second = await recomputeMonthlySummary(ctx, "u1", 2026, 3);

		// `updatedAt` is a write timestamp, not a score input.
		const { updatedAt: _firstUpdatedAt, ...firstTotals } = first;
		const { updatedAt: _secondUpdatedAt, ...secondTotals } = second;
		expect(second.id).toBe(first.id);
		expect(secondTotals).toEqual(firstTotals);
	});

	test("accepts an occurrence date to select the month", async () => {
		const db = await freshDatabase("date-overload");
		await seedDepartment(db, "d1", "PROD");
		await seedUser(db, "u1", "d1");
		const ctx = context(db, viewer("u1", ["EMPLOYEE"], "d1"));

		await db.insert(attendanceRecords).values({
			id: "a1",
			userId: "u1",
			workDate: "2026-05-04",
			workingHours: 8,
		});

		const summary = await recomputeMonthlySummary(
			ctx,
			"u1",
			new Date(Date.UTC(2026, 4, 15)),
		);

		expect(summary.periodYear).toBe(2026);
		expect(summary.periodMonth).toBe(5);
		expect(summary.perfectAttendanceBonus).toBe(50);
	});

	test("totalKpiScore equals bonuses minus penalties for a fixed fixture", async () => {
		const db = await freshDatabase("score");
		await seedDepartment(db, "d1", "PROD");
		await seedUser(db, "u1", "d1");
		const ctx = context(db, viewer("u1", ["EMPLOYEE"], "d1"));

		for (const ruleCode of [
			KPI_ON_TIME_TICKET,
			KPI_ON_TIME_TICKET,
			KPI_ON_TIME_URGENT,
			KPI_FIRST_TIME_APPROVAL,
			KPI_OVERDUE_TICKET,
			KPI_RETURNED_TICKET,
			KPI_EXTENSION_REQUEST,
		] as const) {
			await recordKpiEvent(ctx, {
				userId: "u1",
				ruleCode,
				periodYear: 2026,
				periodMonth: 3,
			});
		}

		for (const [id, endDate] of [
			["t1", Date.UTC(2026, 2, 10)],
			["t2", Date.UTC(2026, 2, 20)],
		] as const) {
			await db.insert(tasks).values({
				id,
				taskCode: id.toUpperCase(),
				title: `Task ${id}`,
				assignedTo: "u1",
				departmentId: "d1",
				endDate: new Date(endDate),
			});
		}

		await db.insert(attendanceRecords).values([
			{ id: "a1", userId: "u1", workDate: "2026-03-02", workingHours: 8 },
			{
				id: "a2",
				userId: "u1",
				workDate: "2026-03-03",
				workingHours: 0,
				leaveCode: "UAL",
			},
			{
				id: "a3",
				userId: "u1",
				workDate: "2026-03-04",
				workingHours: 7,
				isLate: true,
			},
		]);

		const summary = await recomputeMonthlySummary(ctx, "u1", 2026, 3);

		expect(summary.totalTasksAssigned).toBe(2);
		expect(summary.completedOnTime).toBe(2);
		expect(summary.completedUrgentOnTime).toBe(1);
		expect(summary.approvedFirstTime).toBe(1);
		expect(summary.overdueTasks).toBe(1);
		expect(summary.rejectedTasks).toBe(1);
		expect(summary.extensionRequestsCount).toBe(1);
		expect(summary.unapprovedLeaveCount).toBe(1);
		expect(summary.lateEarlyCount).toBe(1);
		expect(summary.perfectAttendanceBonus).toBe(0);

		const bonuses =
			2 * KPI_POINTS[KPI_ON_TIME_TICKET] +
			1 * KPI_POINTS[KPI_ON_TIME_URGENT] +
			1 * KPI_POINTS[KPI_FIRST_TIME_APPROVAL] +
			summary.perfectAttendanceBonus;
		const penalties = -(
			1 * KPI_POINTS[KPI_OVERDUE_TICKET] +
			1 * KPI_POINTS[KPI_RETURNED_TICKET] +
			1 * KPI_POINTS[KPI_EXTENSION_REQUEST] +
			2 * KPI_POINTS[KPI_UNAPPROVED_LEAVE]
		);
		expect(bonuses).toBe(45);
		expect(penalties).toBe(42);
		expect(summary.totalKpiScore).toBe(bonuses - penalties);
		expect(summary.totalKpiScore).toBe(3);
	});

	test("a month of perfect attendance yields the +50 bonus", async () => {
		const db = await freshDatabase("perfect");
		await seedDepartment(db, "d1", "PROD");
		await seedUser(db, "u2", "d1");
		const ctx = context(db, viewer("u2", ["EMPLOYEE"], "d1"));

		await db.insert(attendanceRecords).values(
			["2026-04-01", "2026-04-02", "2026-04-03"].map((workDate, index) => ({
				id: `p${index}`,
				userId: "u2",
				workDate,
				workingHours: 8,
			})),
		);

		const summary = await recomputeMonthlySummary(ctx, "u2", 2026, 4);

		expect(summary.unapprovedLeaveCount).toBe(0);
		expect(summary.lateEarlyCount).toBe(0);
		expect(summary.attendanceRate).toBe(100);
		expect(summary.perfectAttendanceBonus).toBe(50);
		expect(summary.totalKpiScore).toBe(50);
	});
});

describe("KPI audit authorization", () => {
	test("DEPT_HEAD is denied the company-wide audit levels", async () => {
		const db = await freshDatabase("authz-dept-head");
		const ctx = context(db, viewer("dh", ["DEPT_HEAD"], "d1"));
		expect(() => authorize(ctx, "kpiAuditLevel1Company")).toThrow();
		expect(() => authorize(ctx, "kpiAuditLevel2Department")).toThrow();
		expect(authorize(ctx, "kpiAuditLevel3Employee")).toBe("DEPARTMENT_ONLY");
	});

	test("HR_MANAGER is allowed the company-wide audit levels", async () => {
		const db = await freshDatabase("authz-hr");
		const ctx = context(db, viewer("hr", ["HR_MANAGER"]));
		expect(authorize(ctx, "kpiAuditLevel1Company")).toBe("COMPANY_WIDE");
		expect(authorize(ctx, "kpiAuditLevel2Department")).toBe("COMPANY_WIDE");
		expect(authorize(ctx, "kpiAuditLevel3Employee")).toBe("COMPANY_WIDE");
	});

	test("EMPLOYEE is denied every audit level", async () => {
		const db = await freshDatabase("authz-employee");
		const ctx = context(db, viewer("emp", ["EMPLOYEE"], "d1"));
		expect(() => authorize(ctx, "kpiAuditLevel1Company")).toThrow();
		expect(() => authorize(ctx, "kpiAuditLevel2Department")).toThrow();
		expect(() => authorize(ctx, "kpiAuditLevel3Employee")).toThrow();
	});
});
