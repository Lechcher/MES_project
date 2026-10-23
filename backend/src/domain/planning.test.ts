import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { loadConfig } from "../config";
import { createDatabase, type DatabaseHandle } from "../db";
import {
	attendanceRecords,
	kpiPointRules,
	kpiScoreEvents,
	leaveBalanceEntries,
	leaveCodes,
	leaveRequests,
	roles,
	user,
	userRoles,
} from "../db/schema";
import {
	createContext,
	type Viewer,
	type ViewerContext,
} from "../graphql/context";
import {
	assignPenaltyLeave,
	leaveBalances,
	registerLeave,
	reviewLeave,
} from "./planning";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const created: string[] = [];

afterAll(() => {
	for (const path of created) {
		for (const suffix of ["", "-wal", "-shm"]) {
			if (existsSync(`${path}${suffix}`)) rmSync(`${path}${suffix}`);
		}
	}
});

/* ------------------------------------------------------------------ */
/* Isolated database + fixtures                                        */
/* ------------------------------------------------------------------ */

interface Fixture {
	db: DatabaseHandle;
	employee: Viewer;
	otherEmployee: Viewer;
	hr: Viewer;
	techLead: Viewer;
	ctx: (viewer: Viewer) => ViewerContext;
}

async function createFixture(): Promise<Fixture> {
	const path = join(TMP_ROOT, `mes-planning-${crypto.randomUUID()}.db`);
	created.push(path);

	// Apply migrations to a clean database file, then open the runtime handle.
	const { runMigrations } = await import("../db/migrate");
	runMigrations({ databasePath: path });
	const db = createDatabase(path);
	const config = loadConfig({ NODE_ENV: "test" });

	await db
		.insert(roles)
		.values([
			{ id: "role-SUPER_ADMIN", code: "SUPER_ADMIN", name: "Super Admin" },
			{ id: "role-TECH_LEAD", code: "TECH_LEAD", name: "Manager / Tech Lead" },
			{ id: "role-HR_MANAGER", code: "HR_MANAGER", name: "HR Manager" },
			{ id: "role-DEPT_HEAD", code: "DEPT_HEAD", name: "Department Head" },
			{ id: "role-EMPLOYEE", code: "EMPLOYEE", name: "Employee" },
		])
		.onConflictDoNothing();

	await db
		.insert(leaveCodes)
		.values([
			{
				code: "AL",
				name: "Annual Leave",
				category: "PAID",
				isPaid: true,
				payrollRule: "100% paid",
				isBalanceTracked: true,
				sortOrder: 1,
			},
			{
				code: "UAL",
				name: "Unapproved / Unpaid Annual Leave",
				category: "UNPAID",
				payrollRule: "Deduct 100% of the daily wage + KPI point deduction",
				deductsWage: true,
				isPenalty: true,
				sortOrder: 2,
			},
			{
				code: "TOIL",
				name: "Time Off In Lieu",
				category: "PAID",
				isPaid: true,
				payrollRule: "100% paid (deducted from the OT hours fund)",
				isBalanceTracked: true,
				sortOrder: 10,
			},
		])
		.onConflictDoNothing();

	await db
		.insert(kpiPointRules)
		.values({
			code: "KPI_UNAPPROVED_LEAVE",
			event: "unapproved_leave",
			points: -10,
			description: "-10 per late/early instance or unapproved leave.",
			sortOrder: 8,
		})
		.onConflictDoNothing();

	await db
		.insert(user)
		.values([
			{
				id: "u-employee",
				name: "Mina Park",
				email: "employee@mes.local",
				userCode: "EM-001",
				departmentId: null,
			},
			{
				id: "u-other",
				name: "Ola Other",
				email: "other@mes.local",
				userCode: "EM-002",
				departmentId: null,
			},
			{
				id: "u-hr",
				name: "Hana Suzuki",
				email: "hr@mes.local",
				userCode: "HR-001",
				departmentId: null,
			},
			{
				id: "u-tech",
				name: "Priya Raman",
				email: "tech@mes.local",
				userCode: "TL-001",
				departmentId: null,
			},
		])
		.onConflictDoNothing();

	await db
		.insert(userRoles)
		.values([
			{ id: "ur-emp", userId: "u-employee", roleId: "role-EMPLOYEE" },
			{ id: "ur-other", userId: "u-other", roleId: "role-EMPLOYEE" },
			{ id: "ur-hr", userId: "u-hr", roleId: "role-HR_MANAGER" },
			{ id: "ur-tech", userId: "u-tech", roleId: "role-TECH_LEAD" },
		])
		.onConflictDoNothing();

	// Employee ledger: AL +8, TOIL +2, plus a non-tracked SL row that must never
	// surface in the balance read.
	await db
		.insert(leaveBalanceEntries)
		.values([
			{
				id: "lbe-al-emp",
				userId: "u-employee",
				leaveCode: "AL",
				entryType: "ACCRUAL",
				deltaDays: 8,
				periodYear: 2026,
			},
			{
				id: "lbe-toil-emp",
				userId: "u-employee",
				leaveCode: "TOIL",
				entryType: "ACCRUAL",
				deltaDays: 2,
				periodYear: 2026,
			},
			{
				id: "lbe-sl-emp",
				userId: "u-employee",
				leaveCode: "SL",
				entryType: "ACCRUAL",
				deltaDays: 100,
				periodYear: 2026,
			},
			{
				id: "lbe-al-other",
				userId: "u-other",
				leaveCode: "AL",
				entryType: "ACCRUAL",
				deltaDays: 5,
				periodYear: 2026,
			},
		])
		.onConflictDoNothing();

	await db
		.insert(leaveRequests)
		.values({
			id: "lr-1",
			userId: "u-employee",
			leaveCode: "AL",
			startDate: "2026-10-20",
			endDate: "2026-10-21",
			totalDays: 2,
			reason: "Annual leave.",
			status: "PENDING",
		})
		.onConflictDoNothing();

	const baseViewer = (
		id: string,
		userCode: string,
		email: string,
		roleCodes: Viewer["roleCodes"],
	): Viewer => ({
		id,
		userCode,
		fullName: email,
		email,
		departmentId: null,
		isActive: true,
		roleCodes,
	});

	const employee = baseViewer("u-employee", "EM-001", "employee@mes.local", [
		"EMPLOYEE",
	]);
	const otherEmployee = baseViewer("u-other", "EM-002", "other@mes.local", [
		"EMPLOYEE",
	]);
	const hr = baseViewer("u-hr", "HR-001", "hr@mes.local", ["HR_MANAGER"]);
	const techLead = baseViewer("u-tech", "TL-001", "tech@mes.local", [
		"TECH_LEAD",
	]);

	return {
		db,
		employee,
		otherEmployee,
		hr,
		techLead,
		ctx: (viewer: Viewer) =>
			createContext({
				db,
				config,
				request: { ipAddress: null, userAgent: null },
				viewer,
			}),
	};
}

interface CaughtError {
	code?: string;
	message: string;
}

async function catchError(fn: () => Promise<unknown>): Promise<CaughtError> {
	try {
		await fn();
	} catch (error) {
		const candidate = error as {
			extensions?: { code?: string };
			code?: string;
			message?: string;
		};
		return {
			code: candidate.extensions?.code ?? candidate.code,
			message: candidate.message ?? String(error),
		};
	}
	throw new Error("Expected the operation to be rejected, but it succeeded.");
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("planning domain service", () => {
	test("a TECH_LEAD cannot assign UAL/USL penalty leave", async () => {
		const fixture = await createFixture();

		const err = await catchError(() =>
			assignPenaltyLeave(fixture.ctx(fixture.techLead), {
				userId: "u-employee",
				leaveCode: "UAL",
				workDate: "2026-10-15",
			}),
		);

		expect(err.code).toBe("FORBIDDEN");

		const attendance = await fixture.db.select().from(attendanceRecords);
		expect(attendance).toHaveLength(0);
		const events = await fixture.db.select().from(kpiScoreEvents);
		expect(events).toHaveLength(0);
	});

	test("an HR_MANAGER assigning penalty leave creates the attendance row and a -10 KPI event", async () => {
		const fixture = await createFixture();

		const row = await assignPenaltyLeave(fixture.ctx(fixture.hr), {
			userId: "u-employee",
			leaveCode: "UAL",
			workDate: "2026-10-15",
		});

		expect(row.leaveCode).toBe("UAL");
		expect(row.workDate).toBe("2026-10-15");
		expect(row.workingHours).toBe(0);
		expect(row.note ?? "").toContain("100% of the daily wage");

		const events = await fixture.db
			.select()
			.from(kpiScoreEvents)
			.where(eq(kpiScoreEvents.userId, "u-employee"));
		expect(events).toHaveLength(1);
		expect(events[0]?.ruleCode).toBe("KPI_UNAPPROVED_LEAVE");
		expect(events[0]?.points).toBe(-10);
		expect(events[0]?.periodMonth).toBe(10);
		expect(events[0]?.periodYear).toBe(2026);

		// Re-assigning the same code for the same day is refused, so the penalty
		// score can never be double-counted.
		const err = await catchError(() =>
			assignPenaltyLeave(fixture.ctx(fixture.hr), {
				userId: "u-employee",
				leaveCode: "UAL",
				workDate: "2026-10-15",
			}),
		);
		expect(err.code).toBe("CONFLICT");
	});

	test("an EMPLOYEE's leave balances are limited to AL/TOIL and their own ledger", async () => {
		const fixture = await createFixture();

		const balances = await leaveBalances(fixture.ctx(fixture.employee));

		expect(balances.map((balance) => balance.leaveCode).sort()).toEqual([
			"AL",
			"TOIL",
		]);
		expect(balances.every((balance) => balance.userId === "u-employee")).toBe(
			true,
		);
		expect(
			balances.find((balance) => balance.leaveCode === "AL")?.balanceDays,
		).toBe(8);
		expect(
			balances.find((balance) => balance.leaveCode === "TOIL")?.balanceDays,
		).toBe(2);
		// The untracked SL row never appears.
		expect(balances.map((balance) => balance.leaveCode)).not.toContain("SL");

		const err = await catchError(() =>
			leaveBalances(fixture.ctx(fixture.employee), { userId: "u-other" }),
		);
		expect(err.code).toBe("FORBIDDEN");
	});

	test("registering leave with endDate before startDate is rejected", async () => {
		const fixture = await createFixture();

		const err = await catchError(() =>
			registerLeave(fixture.ctx(fixture.employee), {
				leaveCode: "AL",
				startDate: "2026-10-20",
				endDate: "2026-10-18",
				reason: "Reversed dates.",
			}),
		);

		expect(err.code).toBe("VALIDATION_FAILED");

		const rows = await fixture.db
			.select()
			.from(leaveRequests)
			.where(eq(leaveRequests.userId, "u-employee"));
		// Only the pre-seeded pending request remains.
		expect(rows).toHaveLength(1);
		expect(rows[0]?.id).toBe("lr-1");
	});

	test("approving an AL request appends a negative USAGE ledger entry", async () => {
		const fixture = await createFixture();

		const row = await reviewLeave(fixture.ctx(fixture.hr), {
			leaveRequestId: "lr-1",
			decision: "APPROVED",
		});

		expect(row.status).toBe("APPROVED");
		expect(row.approvedBy).toBe("u-hr");

		const usage = await fixture.db
			.select()
			.from(leaveBalanceEntries)
			.where(
				and(
					eq(leaveBalanceEntries.referenceId, "lr-1"),
					eq(leaveBalanceEntries.entryType, "USAGE"),
				),
			);
		expect(usage).toHaveLength(1);
		expect(usage[0]?.leaveCode).toBe("AL");
		expect(usage[0]?.deltaDays).toBe(-2);

		const balances = await leaveBalances(fixture.ctx(fixture.employee));
		const al = balances.find((balance) => balance.leaveCode === "AL");
		expect(al?.balanceDays).toBe(6);
	});

	test("leaveBalances defaults to the caller's own ledger", async () => {
		const fixture = await createFixture();

		const balances = await leaveBalances(fixture.ctx(fixture.employee));
		expect(balances).toHaveLength(2);
		expect(balances[0]?.userId).toBe("u-employee");

		// An untracked code is never reported even when it has ledger rows.
		const codes = balances.map((balance) => balance.leaveCode);
		expect(codes).not.toContain("SL");
	});
});
