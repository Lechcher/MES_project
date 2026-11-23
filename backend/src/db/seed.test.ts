import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, count, eq, inArray } from "drizzle-orm";
import { loadConfig } from "../config";
import { recomputeMonthlySummary } from "../domain/kpi";
import { createContext, type Viewer } from "../graphql/context";
import type { DatabaseHandle } from "./index";
import {
	attendanceRecords,
	departments,
	kpiMonthlySummaries,
	kpiScoreEvents,
	leaveBalanceEntries,
	leaveRequests,
	overtimeRecords,
	roles,
	systemAuditLogs,
	taskCompletionRequests,
	taskProgressLogs,
	taskRequests,
	tasks,
	ticketStates,
	user,
	userRoles,
} from "./schema";
import {
	DEMO_USERS,
	DEV_SEED_PASSWORD,
	STAFF_USERS,
	seedDatabase,
} from "./seed";
import { createTestDatabase, type TestDatabase } from "./test-db";

const testDbs: TestDatabase[] = [];

afterAll(async () => {
	// Closing the generated databases in parallel keeps the
	// teardown well inside the hook timeout under a loaded server.
	await Promise.all(testDbs.map((testDb) => testDb.close()));
});

async function createSeededDatabase(): Promise<DatabaseHandle> {
	const testDb = await createTestDatabase();
	testDbs.push(testDb);
	return testDb.db;
}

/** One frozen "today" shared by the read-only assertions below. */
const now = new Date();

function dayKey(value: Date): string {
	const y = value.getFullYear();
	const m = String(value.getMonth() + 1).padStart(2, "0");
	const d = String(value.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/** Weekdays between the first of the month and today, inclusive. */
function expectedMonthWeekdays(): number {
	let total = 0;
	const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	while (cursor <= today) {
		const weekday = cursor.getDay();
		if (weekday !== 0 && weekday !== 6) total += 1;
		cursor.setDate(cursor.getDate() + 1);
	}
	return total;
}

const config = loadConfig({ NODE_ENV: "test" });

/** Shared read-only database; seeded once for the coverage assertions. */
let db: DatabaseHandle;

beforeAll(async () => {
	db = await createSeededDatabase();
	await seedDatabase({ db, config, now });
});

describe("seedDatabase", () => {
	test("registries load the documented code tables", async () => {
		const states = await db.select().from(ticketStates);
		expect(states.map((state) => state.code).sort()).toEqual([
			"ACT",
			"APP",
			"CAN",
			"OVERDUE",
			"PEN",
			"REJ",
			"REQ",
		]);
		// Each state carries the documented display name, colour and sort order.
		const requested = states.find((state) => state.code === "REQ");
		expect(requested?.name).toBe("Requested");
		expect(requested?.color).toBe("White");
		expect(requested?.sortOrder).toBe(1);
		const cancelled = states.find((state) => state.code === "CAN");
		expect(cancelled?.isTerminal).toBe(true);

		const [counts] = await db.select({ value: count() }).from(userRoles);
		expect(counts?.value).toBe(15);
	});

	test("seeding twice is repeatable with identical row counts", async () => {
		const fresh = await createSeededDatabase();
		const first = await seedDatabase({ db: fresh, config, now });
		const second = await seedDatabase({ db: fresh, config, now });

		expect(first.counts).toEqual(second.counts);
		expect(second.counts.users).toBe(15);
		expect(second.counts.ticketStates).toBe(7);
		expect(second.counts.leaveCodes).toBe(11);
		expect(second.counts.modules).toBe(6);
		expect(second.counts.roles).toBe(5);
		expect(second.counts.permissions).toBe(30);
		expect(second.counts.kpiPointRules).toBe(8);
		expect(second.counts.rolePermissions).toBe(96);
		expect(second.counts.tasks).toBeGreaterThanOrEqual(55);
	});

	test("the five demo accounts stay intact and staff supplement them", async () => {
		const users = await db.select().from(user);
		expect(users).toHaveLength(15);

		const roleRows = await db.select().from(roles);
		const roleCodeById = new Map(roleRows.map((row) => [row.id, row.code]));

		for (const spec of DEMO_USERS) {
			const row = users.find((item) => item.email === spec.email);
			expect(row).toBeDefined();
			expect(row?.userCode).toBe(spec.userCode);
			expect(row?.name).toBe(spec.name);
			expect(row?.departmentId).toBe(spec.departmentId);
			expect(row?.isActive).toBe(true);

			const links = await db
				.select()
				.from(userRoles)
				.where(eq(userRoles.userId, row?.id ?? ""));
			expect(links).toHaveLength(1);
			expect(roleCodeById.get(links[0]?.roleId ?? "")).toBe(spec.role);
		}

		// The added accounts hold the EMPLOYEE role only: no second manager,
		// HR or admin account appears in the seeded directory.
		const staffRoleCodes: string[] = [];
		for (const spec of STAFF_USERS) {
			const row = users.find((item) => item.email === spec.email);
			expect(row?.userCode).toBe(spec.userCode);
			const links = await db
				.select()
				.from(userRoles)
				.where(eq(userRoles.userId, row?.id ?? ""));
			expect(links).toHaveLength(1);
			staffRoleCodes.push(roleCodeById.get(links[0]?.roleId ?? "") ?? "");
		}
		expect(staffRoleCodes.every((code) => code === "EMPLOYEE")).toBe(true);
	});

	test("every department root holds multiple staff and one account is inactive", async () => {
		const users = await db.select().from(user);

		const activeIn = async (ids: readonly string[]) =>
			(
				await db
					.select({ value: count() })
					.from(user)
					.where(inArray(user.departmentId, ids as string[]))
			)[0]?.value ?? 0;

		const engineering = await activeIn([
			"dept-eng",
			"dept-eng-core",
			"dept-eng-qa",
			"dept-eng-fab",
		]);
		const headquarters = await activeIn(["dept-hq", "dept-hq-ops"]);
		expect(engineering).toBeGreaterThanOrEqual(3);
		expect(headquarters).toBeGreaterThanOrEqual(3);

		const departmentsSeeded = await db.select().from(departments);
		expect(departmentsSeeded.length).toBeGreaterThanOrEqual(6);

		// Exactly one deactivated account exercises activation-state filtering.
		const inactive = users.filter((row) => !row.isActive);
		expect(inactive).toHaveLength(1);
		expect(inactive[0]?.email).toBe("minh.ngo@mes.local");
	});

	test("the schedule covers every state and task type around today", async () => {
		const taskRows = await db.select().from(tasks);
		expect(taskRows.length).toBeGreaterThanOrEqual(55);

		const stateCounts = new Map<string, number>();
		const typeCounts = new Map<string, number>();
		for (const row of taskRows) {
			stateCounts.set(row.state, (stateCounts.get(row.state) ?? 0) + 1);
			typeCounts.set(row.taskType, (typeCounts.get(row.taskType) ?? 0) + 1);
		}
		for (const state of ["REQ", "ACT", "PEN", "APP", "REJ", "CAN", "OVERDUE"]) {
			expect(stateCounts.get(state) ?? 0).toBeGreaterThanOrEqual(2);
		}
		for (const type of ["HOURLY", "DAILY", "MULTI_DAY"]) {
			expect(typeCounts.get(type) ?? 0).toBeGreaterThanOrEqual(2);
		}

		// Tickets start before today and after today, so the schedule bars and
		// the tomorrow view always have content.
		const starts = taskRows
			.map((row) => row.startDate?.getTime() ?? 0)
			.filter((value) => value > 0);
		expect(Math.min(...starts)).toBeLessThan(now.getTime());
		expect(Math.max(...starts)).toBeGreaterThan(now.getTime());
	});

	test("workflow records accompany the seeded tickets", async () => {
		const transitions = await db.select().from(taskProgressLogs);
		expect(transitions.length).toBeGreaterThanOrEqual(20);

		// Every multi-day ticket with progress carries a progress log.
		const multiDayWithProgress = (
			await db
				.select({ id: tasks.id })
				.from(tasks)
				.where(eq(tasks.taskType, "MULTI_DAY"))
		).length;
		expect(multiDayWithProgress).toBeGreaterThanOrEqual(2);
		const logs = await db
			.select({ taskId: taskProgressLogs.taskId })
			.from(taskProgressLogs);
		const loggedTaskIds = new Set(logs.map((row) => row.taskId));
		const multiDayTaskIds = (
			await db
				.select({ id: tasks.id, progressPercentage: tasks.progressPercentage })
				.from(tasks)
				.where(eq(tasks.taskType, "MULTI_DAY"))
		).filter((row) => row.progressPercentage > 0);
		for (const row of multiDayTaskIds) {
			expect(loggedTaskIds.has(row.id)).toBe(true);
		}

		const requests = await db.select().from(taskRequests);
		for (const type of ["EXTENSION", "LATE_EXPLANATION"]) {
			for (const status of ["PENDING", "APPROVED", "REJECTED"]) {
				expect(
					requests.filter(
						(row) => row.requestType === type && row.status === status,
					).length,
				).toBeGreaterThanOrEqual(1);
			}
		}

		const completions = await db.select().from(taskCompletionRequests);
		for (const state of ["PEN", "APP", "REJ"]) {
			expect(
				completions.filter((row) => row.state === state).length,
			).toBeGreaterThanOrEqual(1);
		}
		for (const scope of ["MILESTONE", "FULL_JOB"]) {
			expect(
				completions.filter((row) => row.scope === scope).length,
			).toBeGreaterThanOrEqual(1);
		}
		// Rejected decisions always explain what has to change.
		for (const row of completions.filter((item) => item.state === "REJ")) {
			expect(row.decisionReason).toBeTruthy();
		}
		// Only one pending submission per ticket.
		const pendingByTask = new Map<string, number>();
		for (const row of completions.filter((item) => item.state === "PEN")) {
			pendingByTask.set(row.taskId, (pendingByTask.get(row.taskId) ?? 0) + 1);
		}
		for (const value of pendingByTask.values()) {
			expect(value).toBe(1);
		}
	});

	test("attendance covers the current month for every active account", async () => {
		const expected = expectedMonthWeekdays();
		expect(expected).toBeGreaterThan(0);

		const users = await db.select().from(user);
		const activeUsers = users.filter((row) => row.isActive);
		expect(activeUsers).toHaveLength(14);

		const monthKey = dayKey(new Date(now.getFullYear(), now.getMonth(), 1));
		const byUser = new Map<string, string[]>();
		for (const row of await db.select().from(attendanceRecords)) {
			const bucket = byUser.get(row.userId) ?? [];
			bucket.push(row.workDate);
			byUser.set(row.userId, bucket);
		}

		for (const user of activeUsers) {
			const monthDays = (byUser.get(user.id) ?? []).filter(
				(day) => day >= monthKey && day <= dayKey(now),
			);
			expect(monthDays.length).toBeGreaterThanOrEqual(expected);
		}

		// Penalty leave appears for the employee and two staff accounts.
		const penaltyDays = (await db.select().from(attendanceRecords)).filter(
			(row) => row.leaveCode === "UAL" || row.leaveCode === "USL",
		);
		expect(penaltyDays.length).toBeGreaterThanOrEqual(3);
	});

	test("leave, overtime and balance ledgers are populated", async () => {
		const leaves = await db.select().from(leaveRequests);
		expect(leaves.length).toBeGreaterThanOrEqual(15);
		for (const status of ["APPROVED", "PENDING", "REJECTED"]) {
			expect(
				leaves.filter((row) => row.status === status).length,
			).toBeGreaterThanOrEqual(2);
		}

		const balances = await db.select().from(leaveBalanceEntries);
		for (const entryType of [
			"ACCRUAL",
			"USAGE",
			"ADJUSTMENT",
			"EXPIRY",
			"CARRY_OVER",
		]) {
			expect(
				balances.filter((row) => row.entryType === entryType).length,
			).toBeGreaterThanOrEqual(1);
		}

		const overtime = await db.select().from(overtimeRecords);
		expect(overtime.length).toBeGreaterThanOrEqual(10);
		expect(
			overtime.filter((row) => row.isApproved).length,
		).toBeGreaterThanOrEqual(1);

		// Every approved 8-hour overtime record feeds exactly one TOIL day.
		for (const record of overtime.filter(
			(row) => row.isApproved && row.hours === 8,
		)) {
			const accrual = balances.filter(
				(row) =>
					row.leaveCode === "TOIL" &&
					row.entryType === "ACCRUAL" &&
					row.referenceId === record.id,
			);
			expect(accrual).toHaveLength(1);
			expect(accrual[0]?.deltaDays).toBe(1);
		}
	});

	test("KPI events and derived summaries are populated", async () => {
		const events = await db.select().from(kpiScoreEvents);
		expect(events.length).toBeGreaterThanOrEqual(40);

		const ruleCodes = new Set(events.map((row) => row.ruleCode));
		for (const code of [
			"KPI_ON_TIME_TICKET",
			"KPI_ON_TIME_URGENT",
			"KPI_FIRST_TIME_APPROVAL",
			"KPI_PERFECT_ATTENDANCE",
			"KPI_OVERDUE_TICKET",
			"KPI_RETURNED_TICKET",
			"KPI_EXTENSION_REQUEST",
			"KPI_UNAPPROVED_LEAVE",
		]) {
			expect(ruleCodes.has(code)).toBe(true);
		}

		const periods = new Set(
			events.map((row) => `${row.periodYear}-${row.periodMonth}`),
		);
		expect(periods.size).toBeGreaterThanOrEqual(2);

		const summaries = await db.select().from(kpiMonthlySummaries);
		expect(summaries.length).toBeGreaterThanOrEqual(30);
		expect(
			summaries.filter((row) => row.totalKpiScore !== 0).length,
		).toBeGreaterThanOrEqual(1);
	});

	test("monthly summaries equal the application's own recomputation", async () => {
		const users = await db.select().from(user);
		const employee = users.find((row) => row.email === "employee@mes.local");
		expect(employee).toBeDefined();

		const admin = DEMO_USERS.find((spec) => spec.role === "SUPER_ADMIN");
		const adminRow = users.find((row) => row.email === admin?.email);
		const viewer: Viewer = {
			id: adminRow?.id ?? "",
			userCode: admin?.userCode ?? "",
			fullName: admin?.name ?? "",
			email: admin?.email ?? "",
			departmentId: admin?.departmentId ?? null,
			isActive: true,
			roleCodes: ["SUPER_ADMIN"],
		};
		const ctx = createContext({
			db,
			config,
			request: { ipAddress: null, userAgent: null },
			viewer,
		});

		const recomputed = await recomputeMonthlySummary(
			ctx,
			employee?.id ?? "",
			now.getFullYear(),
			now.getMonth() + 1,
		);

		const [stored] = await db
			.select()
			.from(kpiMonthlySummaries)
			.where(
				and(
					eq(kpiMonthlySummaries.userId, employee?.id ?? ""),
					eq(kpiMonthlySummaries.periodYear, now.getFullYear()),
					eq(kpiMonthlySummaries.periodMonth, now.getMonth() + 1),
				),
			);

		expect(stored?.totalKpiScore).toBe(recomputed.totalKpiScore);
		expect(stored?.totalTasksAssigned).toBe(recomputed.totalTasksAssigned);
		expect(stored?.attendanceRate).toBe(recomputed.attendanceRate);
		expect(stored?.unapprovedLeaveCount).toBe(recomputed.unapprovedLeaveCount);
	});

	test("audit activity spans several modules", async () => {
		const rows = await db.select().from(systemAuditLogs);
		expect(rows.length).toBeGreaterThanOrEqual(30);
		const modules = new Set(rows.map((row) => row.moduleCode));
		expect(modules.size).toBeGreaterThanOrEqual(3);
		for (const row of rows) {
			if (row.oldData !== null) {
				const payload = row.oldData;
				expect(() => JSON.parse(payload)).not.toThrow();
			}
			if (row.newData !== null) {
				const payload = row.newData;
				expect(() => JSON.parse(payload)).not.toThrow();
			}
		}
	});

	test("a production configuration refuses to seed", async () => {
		const fresh = await createSeededDatabase();
		const productionConfig = { ...config, isProduction: true };

		await expect(
			seedDatabase({ db: fresh, config: productionConfig }),
		).rejects.toThrow(/production/i);

		// Nothing was loaded.
		const users = await fresh.select({ value: count() }).from(user);
		expect(users[0]?.value).toBe(0);
		const states = await fresh.select({ value: count() }).from(ticketStates);
		expect(states[0]?.value).toBe(0);
	});

	test("exports a documented development-only password constant", () => {
		expect(typeof DEV_SEED_PASSWORD).toBe("string");
		expect(DEV_SEED_PASSWORD.length).toBeGreaterThanOrEqual(8);
	});
});
