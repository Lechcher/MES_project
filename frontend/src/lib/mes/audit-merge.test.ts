/**
 * Audit row merging tests.
 *
 * Covers the arithmetic a quarter or year depends on: counts and scores add up,
 * rates average, identity fields survive, and — critically — a month with no
 * recorded summary contributes nothing to an average while its counts still
 * fold into the totals.
 */

import { describe, expect, test } from "bun:test";
import {
  filterAuditRowsByRole,
  mergeAuditDepartmentRows,
  mergeAuditEmployeeRows,
  personalAuditRow,
} from "./audit-merge";
import type {
  KpiAuditLevel1Row,
  KpiAuditLevel2Row,
  KpiAuditLevel3Row,
} from "./queries/types";

const USER_A = { id: "u-1", fullName: "Ada" } as const;
const USER_B = { id: "u-2", fullName: "Bo" } as const;
const DEPT = { id: "d-1", name: "Engineering" } as const;

/** A person who holds one role. */
const EMPLOYEE_USER = {
  ...USER_A,
  roles: [{ id: "r-1", code: "EMPLOYEE", name: "Employee" }],
} as const;

/** A person who holds two roles. */
const LEAD_USER = {
  ...USER_B,
  roles: [
    { id: "r-2", code: "TECH_LEAD", name: "Technical Lead" },
    { id: "r-3", code: "EMPLOYEE", name: "Employee" },
  ],
} as const;

function level3Row(overrides: Partial<KpiAuditLevel3Row>): KpiAuditLevel3Row {
  return {
    periodYear: 2026,
    periodMonth: 5,
    user: USER_A,
    department: DEPT,
    totalTasksAssigned: 0,
    completedOnTime: 0,
    overdueTasks: 0,
    immediateApprovalCount: 0,
    returnedCount: 0,
    perfectAttendanceBonus: 0,
    attendanceRate: 0,
    totalKpiScore: 0,
    ...overrides,
  } as KpiAuditLevel3Row;
}

function level2Row(overrides: Partial<KpiAuditLevel2Row>): KpiAuditLevel2Row {
  return {
    periodYear: 2026,
    periodMonth: 5,
    department: DEPT,
    totalEmployees: 0,
    totalTasksAssigned: 0,
    avgAttendanceRate: 0,
    avgDepartmentKpiScore: 0,
    ...overrides,
  } as KpiAuditLevel2Row;
}

describe("mergeAuditEmployeeRows", () => {
  test("a single month passes through unchanged", () => {
    const [row] = mergeAuditEmployeeRows([
      level3Row({
        periodMonth: 5,
        totalTasksAssigned: 10,
        completedOnTime: 8,
        overdueTasks: 2,
        totalKpiScore: 65,
        attendanceRate: 90,
      }),
    ]);
    expect(row.totalTasksAssigned).toBe(10);
    expect(row.totalKpiScore).toBe(65);
    expect(row.attendanceRate).toBe(90);
  });

  test("no level exposes all three optional counts, so the rest stay null", () => {
    const [level1Shaped] = mergeAuditEmployeeRows([
      {
        periodYear: 2026,
        periodMonth: 5,
        user: USER_A,
        department: DEPT,
        totalTasksAssigned: 7,
        completedOnTime: 6,
        overdueTasks: 1,
        unapprovedLeaveCount: 2,
        perfectAttendanceBonus: 0,
        attendanceRate: 88,
        totalKpiScore: 55,
      } as KpiAuditLevel1Row,
    ]);
    expect(level1Shaped.unapprovedLeaveCount).toBe(2);
    expect(level1Shaped.immediateApprovalCount).toBeNull();
    expect(level1Shaped.returnedCount).toBeNull();
  });

  test("counts and scores add up across months", () => {
    const [row] = mergeAuditEmployeeRows([
      level3Row({
        periodMonth: 4,
        totalTasksAssigned: 10,
        completedOnTime: 8,
        overdueTasks: 2,
        totalKpiScore: 60,
      }),
      level3Row({
        periodMonth: 5,
        totalTasksAssigned: 4,
        completedOnTime: 4,
        overdueTasks: 0,
        totalKpiScore: 40,
      }),
      level3Row({
        periodMonth: 6,
        totalTasksAssigned: 6,
        completedOnTime: 5,
        overdueTasks: 1,
        totalKpiScore: 25,
      }),
    ]);
    expect(row.totalTasksAssigned).toBe(20);
    expect(row.completedOnTime).toBe(17);
    expect(row.overdueTasks).toBe(3);
    expect(row.totalKpiScore).toBe(125);
  });

  test("a gap month contributes nothing to a rate but its counts still fold in", () => {
    // February has no summary; March does.
    const [row] = mergeAuditEmployeeRows([
      level3Row({ periodMonth: 1, totalTasksAssigned: 5, attendanceRate: 100 }),
      level3Row({ periodMonth: 3, totalTasksAssigned: 3, attendanceRate: 80 }),
    ]);
    // Counts sum over the months that reported.
    expect(row.totalTasksAssigned).toBe(8);
    // The rate is the mean of the two reported months (100, 80) — not (100, 0, 80),
    // which would drag it to 60.
    expect(row.attendanceRate).toBe(90);
  });

  test("one row per entity, ranked by total score", () => {
    const rows = mergeAuditEmployeeRows([
      level3Row({ user: USER_A, periodMonth: 4, totalKpiScore: 40 }),
      level3Row({ user: USER_B, periodMonth: 4, totalKpiScore: 90 }),
      level3Row({ user: USER_A, periodMonth: 5, totalKpiScore: 30 }),
      level3Row({ user: USER_B, periodMonth: 5, totalKpiScore: 5 }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].user.id).toBe("u-2");
    expect(rows[0].totalKpiScore).toBe(95);
    expect(rows[1].user.id).toBe("u-1");
    expect(rows[1].totalKpiScore).toBe(70);
  });

  test("identity fields survive a month where the entity is missing", () => {
    const [row] = mergeAuditEmployeeRows([
      level3Row({ periodMonth: 4, department: null }),
      level3Row({ periodMonth: 5, department: DEPT }),
    ]);
    expect(row.department?.id).toBe("d-1");
    expect(row.user.id).toBe("u-1");
  });

  test("a source that does not expose a count stays null rather than zero", () => {
    const [row] = mergeAuditEmployeeRows([
      level3Row({
        totalTasksAssigned: 7,
        immediateApprovalCount: 3,
        returnedCount: 1,
      }),
    ]);
    // Level 3 exposes the approval counts but not the leave count.
    expect(row.immediateApprovalCount).toBe(3);
    expect(row.returnedCount).toBe(1);
    expect(row.unapprovedLeaveCount).toBeNull();
    expect(row.totalTasksAssigned).toBe(7);
  });

  test("ties rank by name so the order is stable", () => {
    const rows = mergeAuditEmployeeRows([
      level3Row({ user: USER_B, totalKpiScore: 0 }),
      level3Row({ user: USER_A, totalKpiScore: 0 }),
    ]);
    expect(rows.map((row) => row.user.fullName)).toEqual(["Ada", "Bo"]);
  });
});

describe("mergeAuditDepartmentRows", () => {
  test("counts add up across months", () => {
    const [row] = mergeAuditDepartmentRows([
      level2Row({
        periodMonth: 4,
        totalEmployees: 9,
        totalTasksAssigned: 20,
      }),
      level2Row({
        periodMonth: 5,
        totalEmployees: 11,
        totalTasksAssigned: 15,
      }),
    ]);
    expect(row.totalEmployees).toBe(20);
    expect(row.totalTasksAssigned).toBe(35);
  });

  test("rates are employee-weighted, matching the true period average", () => {
    // Month A: 10 employees at 100. Month B: 10 employees at 80.
    // The employee-weighted mean is 90, and so is the plain mean here.
    const [row] = mergeAuditDepartmentRows([
      level2Row({
        periodMonth: 4,
        totalEmployees: 10,
        avgAttendanceRate: 100,
        avgDepartmentKpiScore: 50,
      }),
      level2Row({
        periodMonth: 5,
        totalEmployees: 10,
        avgAttendanceRate: 80,
        avgDepartmentKpiScore: 30,
      }),
    ]);
    expect(row.avgAttendanceRate).toBe(90);
    expect(row.avgDepartmentKpiScore).toBe(40);
  });

  test("a month with more employees carries more of the average", () => {
    // 10 employees at 100, then 30 at 80 → weighted mean 85, plain mean 90.
    const [row] = mergeAuditDepartmentRows([
      level2Row({ periodMonth: 4, totalEmployees: 10, avgAttendanceRate: 100 }),
      level2Row({ periodMonth: 5, totalEmployees: 30, avgAttendanceRate: 80 }),
    ]);
    expect(row.avgAttendanceRate).toBe(85);
  });

  test("a gap month contributes nothing to the weighted average", () => {
    const [row] = mergeAuditDepartmentRows([
      level2Row({ periodMonth: 4, totalEmployees: 10, avgAttendanceRate: 100 }),
      level2Row({ periodMonth: 6, totalEmployees: 10, avgAttendanceRate: 80 }),
    ]);
    expect(row.totalEmployees).toBe(20);
    expect(row.avgAttendanceRate).toBe(90);
  });

  test("departments with no reported employees fall back to a plain mean", () => {
    const [row] = mergeAuditDepartmentRows([
      level2Row({
        periodMonth: 4,
        totalEmployees: 0,
        avgAttendanceRate: 100,
        avgDepartmentKpiScore: 60,
      }),
      level2Row({
        periodMonth: 5,
        totalEmployees: 0,
        avgAttendanceRate: 60,
        avgDepartmentKpiScore: 40,
      }),
    ]);
    expect(row.avgAttendanceRate).toBe(80);
    expect(row.avgDepartmentKpiScore).toBe(50);
  });

  test("one row per department, ranked by average department score", () => {
    const rows = mergeAuditDepartmentRows([
      level2Row({
        department: { id: "d-1", name: "Engineering" } as never,
        avgDepartmentKpiScore: 70,
      }),
      level2Row({
        department: { id: "d-2", name: "Sales" } as never,
        avgDepartmentKpiScore: 88,
      }),
    ]);
    expect(rows.map((row) => row.department.id)).toEqual(["d-2", "d-1"]);
  });
});

describe("personalAuditRow", () => {
  const summary = {
    id: "s-1",
    periodMonth: 5,
    periodYear: 2026,
    totalTasksAssigned: 8,
    completedOnTime: 6,
    completedUrgentOnTime: 2,
    approvedFirstTime: 3,
    overdueTasks: 2,
    rejectedTasks: 1,
    extensionRequestsCount: 1,
    attendanceRate: 91,
    perfectAttendanceBonus: 0,
    unapprovedLeaveCount: 4,
    lateEarlyCount: 4,
    totalKpiScore: 62,
  } as never;

  const viewer = { id: "u-1", fullName: "Ada" } as never;

  test("every employee-level column it feeds resolves to a defined value", () => {
    const row = personalAuditRow(summary, viewer, null);
    for (const key of [
      "user",
      "totalTasksAssigned",
      "completedOnTime",
      "overdueTasks",
      "unapprovedLeaveCount",
      "perfectAttendanceBonus",
      "attendanceRate",
      "totalKpiScore",
    ] as const) {
      expect(row[key], `${key} is undefined`).not.toBeUndefined();
    }
    expect(row.totalTasksAssigned).toBe(8);
    expect(row.totalKpiScore).toBe(62);
    expect(row.attendanceRate).toBe(91);
  });

  test("the personal summary carries no approval or return counts", () => {
    const row = personalAuditRow(summary, viewer, null);
    expect(row.immediateApprovalCount).toBeNull();
    expect(row.returnedCount).toBeNull();
  });

  test("the viewer's own row names the roles they hold", () => {
    const row = personalAuditRow(summary, EMPLOYEE_USER as never, null);
    expect(row.roles.map((role) => role.code)).toEqual(["EMPLOYEE"]);
  });

  test("a decimal rate returned as a string still coerces to a number", () => {
    const row = personalAuditRow(
      { ...summary, attendanceRate: "93.5" } as never,
      viewer,
      null,
    );
    expect(row.attendanceRate).toBe(93.5);
  });

  test("a merged personal row folds back into the employee merge", () => {
    // One row per month, then merged like any other employee-level source.
    const merged = mergeAuditEmployeeRows([
      personalAuditRow(summary, viewer, null),
      personalAuditRow(
        {
          ...summary,
          periodMonth: 4,
          totalTasksAssigned: 2,
          totalKpiScore: 10,
        } as never,
        viewer,
        null,
      ),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].totalTasksAssigned).toBe(10);
    expect(merged[0].totalKpiScore).toBe(72);
  });
});

describe("the role dimension", () => {
  function rowsWithRoles() {
    return mergeAuditEmployeeRows([
      level3Row({ user: EMPLOYEE_USER, totalKpiScore: 40 }),
      level3Row({ user: LEAD_USER, totalKpiScore: 90 }),
    ]);
  }

  test("a merged row carries the person's roles", () => {
    const rows = rowsWithRoles();
    const lead = rows.find((row) => row.user.id === "u-2");
    expect(lead?.roles.map((role) => role.code)).toEqual([
      "TECH_LEAD",
      "EMPLOYEE",
    ]);
    const employee = rows.find((row) => row.user.id === "u-1");
    expect(employee?.roles.map((role) => role.code)).toEqual(["EMPLOYEE"]);
  });

  test("an empty role selection keeps every row", () => {
    const rows = rowsWithRoles();
    expect(filterAuditRowsByRole(rows, [])).toHaveLength(2);
  });

  test("a role selection keeps only the rows that hold it", () => {
    const rows = rowsWithRoles();
    const kept = filterAuditRowsByRole(rows, ["TECH_LEAD"]);
    expect(kept.map((row) => row.user.id)).toEqual(["u-2"]);
  });

  test("several roles can be selected at once", () => {
    const rows = rowsWithRoles();
    const kept = filterAuditRowsByRole(rows, ["EMPLOYEE", "TECH_LEAD"]);
    expect(kept.map((row) => row.user.id).sort()).toEqual(["u-1", "u-2"]);
  });

  test("a person holding several roles stays visible under either one", () => {
    const rows = rowsWithRoles();
    expect(filterAuditRowsByRole(rows, ["EMPLOYEE"])).toHaveLength(2);
  });

  test("a role no authorized row holds empties the surface", () => {
    const rows = rowsWithRoles();
    expect(filterAuditRowsByRole(rows, ["HR_MANAGER"])).toHaveLength(0);
  });

  test("the filter narrows only — it never invents a row", () => {
    const rows = rowsWithRoles();
    const kept = filterAuditRowsByRole(rows, ["EMPLOYEE"]);
    for (const row of kept) {
      expect(rows.some((candidate) => candidate.user.id === row.user.id)).toBe(
        true,
      );
    }
  });
});

describe("merged department rows carry identity fields", () => {
  test("the department head survives a merge that drops other rows", () => {
    const rows = mergeAuditDepartmentRows([
      level2Row({
        periodMonth: 4,
        department: {
          id: "d-1",
          name: "Engineering",
          manager: { id: "u-9", fullName: "Cy" },
        } as never,
        totalEmployees: 10,
        avgDepartmentKpiScore: 70,
      }),
      level2Row({
        periodMonth: 5,
        department: {
          id: "d-1",
          name: "Engineering",
          manager: { id: "u-9", fullName: "Cy" },
        } as never,
        totalEmployees: 11,
        avgDepartmentKpiScore: 80,
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].manager).toEqual({ fullName: "Cy" });
    expect(rows[0].totalEmployees).toBe(21);
  });

  test("a department with no recorded head renders as null, not a crash", () => {
    const [row] = mergeAuditDepartmentRows([
      level2Row({
        department: { id: "d-2", name: "Sales", manager: null } as never,
      }),
    ]);
    expect(row.manager).toBeNull();
  });
});
