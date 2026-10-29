/**
 * Audit row merging across a time frame.
 *
 * The audit levels aggregate one `(periodYear, periodMonth)` pair, so a quarter
 * or a year has to be assembled from its months. Pure so the arithmetic is
 * unit-testable without data: counts add up, scores add up, rates are averaged,
 * identity fields are carried once.
 */

import type {
  Decimal,
  DepartmentRef,
  KpiAuditLevel1Row,
  KpiAuditLevel2Row,
  KpiAuditLevel3Row,
  KpiPeriodSummary,
  UserRef,
} from "./queries/types";

/**
 * A person's role, as the audit surface needs it.
 *
 * The role code is the filter's contract and the role name is what the screen
 * renders; the identifier is irrelevant to both.
 */
export interface AuditRole {
  code: string;
  name: string;
}

/** The sum-then-round a rate keeps, matching the server's own rounding. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Coerce a decimal the API may return as a string. */
function numberOf(value: Decimal): number {
  return typeof value === "number" ? value : Number(value);
}

/**
 * A merged employee-level audit row spanning the selected months.
 *
 * `unapprovedLeaveCount`, `immediateApprovalCount`, and `returnedCount` are
 * `null` when the source level does not expose them, so the table shows "—"
 * rather than a misleading zero. No level exposes all three.
 */
export interface AuditEmployeeRow {
  user: UserRef;
  /** The roles the person holds; a person may hold more than one. */
  roles: AuditRole[];
  department: DepartmentRef | null;
  totalTasksAssigned: number;
  completedOnTime: number;
  overdueTasks: number;
  unapprovedLeaveCount: number | null;
  immediateApprovalCount: number | null;
  returnedCount: number | null;
  perfectAttendanceBonus: number;
  attendanceRate: number;
  totalKpiScore: number;
}

/** A merged department-level audit row spanning the selected months. */
export interface AuditDepartmentRow {
  department: DepartmentRef;
  /** The department head, carried from whichever month reports one. */
  manager: { fullName: string } | null;
  totalEmployees: number;
  totalTasksAssigned: number;
  avgAttendanceRate: number;
  avgDepartmentKpiScore: number;
}

/**
 * Either employee-level source, before merging — plus an already-merged row, so
 * a caller that builds one row per month itself (the personal row source) can
 * feed its months through the same merge.
 */
export type AuditEmployeeRowInput =
  | KpiAuditLevel1Row
  | KpiAuditLevel3Row
  | AuditEmployeeRow;

/**
 * The roles the person holds, across every month that reports them.
 *
 * A person holds the same roles in every month, so the rows agree; the union
 * keeps the row correct even when one month's read did not carry them.
 */
function collectRoles(rows: readonly AuditEmployeeRowInput[]): AuditRole[] {
  const byCode = new Map<string, AuditRole>();
  for (const row of rows) {
    for (const role of row.user.roles ?? []) {
      if (!byCode.has(role.code)) byCode.set(role.code, role);
    }
  }
  return [...byCode.values()];
}

/**
 * Merge one entity's monthly rows into a single period row.
 *
 * Counts and scores add up. Rates are means across the months that actually
 * reported — a month with no summary contributes nothing rather than pulling an
 * average toward zero. Identity fields are carried once, so a department shown
 * in some months but not others still renders its name.
 */
function mergeEmployee(
  rows: readonly AuditEmployeeRowInput[],
): AuditEmployeeRow {
  const first = rows[0];
  const department =
    rows.find((row) => row.department !== null)?.department ?? null;

  let totalTasksAssigned = 0;
  let completedOnTime = 0;
  let overdueTasks = 0;
  let unapprovedLeaveCount = 0;
  let immediateApprovalCount = 0;
  let returnedCount = 0;
  let perfectAttendanceBonus = 0;
  let exposesUnapproved = false;
  let exposesImmediate = false;
  let exposesReturned = false;
  let totalKpiScore = 0;
  let attendanceRateTotal = 0;
  let attendanceRateMonths = 0;

  for (const row of rows) {
    totalTasksAssigned += row.totalTasksAssigned;
    completedOnTime += row.completedOnTime;
    overdueTasks += row.overdueTasks;
    perfectAttendanceBonus += row.perfectAttendanceBonus;
    totalKpiScore += row.totalKpiScore;

    if ("unapprovedLeaveCount" in row) {
      const count = row.unapprovedLeaveCount;
      if (typeof count === "number") {
        unapprovedLeaveCount += count;
        exposesUnapproved = true;
      }
    }
    if ("immediateApprovalCount" in row) {
      const count = row.immediateApprovalCount;
      if (typeof count === "number") {
        immediateApprovalCount += count;
        exposesImmediate = true;
      }
    }
    if ("returnedCount" in row) {
      const count = row.returnedCount;
      if (typeof count === "number") {
        returnedCount += count;
        exposesReturned = true;
      }
    }

    const rate = numberOf(row.attendanceRate as Decimal);
    if (Number.isFinite(rate)) {
      attendanceRateTotal += rate;
      attendanceRateMonths += 1;
    }
  }

  return {
    user: first.user,
    roles: collectRoles(rows),
    department,
    totalTasksAssigned,
    completedOnTime,
    overdueTasks,
    unapprovedLeaveCount: exposesUnapproved ? unapprovedLeaveCount : null,
    immediateApprovalCount: exposesImmediate ? immediateApprovalCount : null,
    returnedCount: exposesReturned ? returnedCount : null,
    perfectAttendanceBonus,
    attendanceRate:
      attendanceRateMonths > 0
        ? round2(attendanceRateTotal / attendanceRateMonths)
        : 0,
    totalKpiScore,
  };
}

/**
 * Map one personal summary onto the employee-row shape.
 *
 * An `EMPLOYEE` has no authorized audit query, so their single audit row is
 * their own dashboard summary. Fields the personal summary does not carry stay
 * `null` so the table shows "—" rather than inventing a zero.
 */
export function personalAuditRow(
  summary: KpiPeriodSummary,
  user: UserRef,
  department: DepartmentRef | null,
): AuditEmployeeRow {
  const rate = numberOf(summary.attendanceRate as Decimal);
  return {
    user,
    roles: user.roles ?? [],
    department,
    totalTasksAssigned: summary.totalTasksAssigned,
    completedOnTime: summary.completedOnTime,
    overdueTasks: summary.overdueTasks,
    unapprovedLeaveCount: summary.unapprovedLeaveCount,
    immediateApprovalCount: null,
    returnedCount: null,
    perfectAttendanceBonus: summary.perfectAttendanceBonus,
    attendanceRate: Number.isFinite(rate) ? round2(rate) : 0,
    totalKpiScore: summary.totalKpiScore,
  };
}

/**
 * Keep only the rows whose person holds one of the selected roles.
 *
 * The filter narrows, it never widens: it can only remove rows the viewer may
 * already read. An empty selection keeps every row, and a person who holds
 * several roles stays visible when any one of them is selected.
 */
export function filterAuditRowsByRole(
  rows: readonly AuditEmployeeRow[],
  roleCodes: readonly string[],
): AuditEmployeeRow[] {
  if (roleCodes.length === 0) return [...rows];
  const wanted = new Set(roleCodes);
  return rows.filter((row) => row.roles.some((role) => wanted.has(role.code)));
}

/**
 * Merge the monthly audit rows into one row per entity, ranked.
 *
 * Employee rows rank by total performance score; department rows rank by
 * average department score. Ties break on the entity's name so the order is
 * stable when a period has no recorded activity.
 */
export function mergeAuditEmployeeRows(
  rows: readonly AuditEmployeeRowInput[],
): AuditEmployeeRow[] {
  const byUser = new Map<string, AuditEmployeeRowInput[]>();
  for (const row of rows) {
    const key = row.user.id;
    byUser.set(key, [...(byUser.get(key) ?? []), row]);
  }

  return [...byUser.values()].map(mergeEmployee).sort((a, b) => {
    if (b.totalKpiScore !== a.totalKpiScore) {
      return b.totalKpiScore - a.totalKpiScore;
    }
    return a.user.fullName.localeCompare(b.user.fullName);
  });
}

/**
 * Merge the monthly department rows into one row per department, ranked.
 *
 * `totalEmployees` is summed, so over a multi-month period it counts
 * employee-months rather than distinct people — the level reports a distinct
 * count per month and cannot de-duplicate across months. The rate averages are
 * therefore weighted by that count: the weighted mean of the monthly averages
 * equals the period's true employee-weighted average.
 */
export function mergeAuditDepartmentRows(
  rows: readonly KpiAuditLevel2Row[],
): AuditDepartmentRow[] {
  const byDepartment = new Map<string, KpiAuditLevel2Row[]>();
  for (const row of rows) {
    const key = row.department.id;
    byDepartment.set(key, [...(byDepartment.get(key) ?? []), row]);
  }

  const merged = [...byDepartment.values()].map((group) => {
    const totalEmployees = group.reduce(
      (sum, row) => sum + row.totalEmployees,
      0,
    );
    const totalTasksAssigned = group.reduce(
      (sum, row) => sum + row.totalTasksAssigned,
      0,
    );

    // Employee-weighted means, so a department with more staff in one month
    // carries more of that month's rate. Fall back to a plain mean when every
    // month reports zero employees.
    const weighted = (rateOf: (row: KpiAuditLevel2Row) => number): number => {
      const weight = group.reduce((sum, row) => sum + row.totalEmployees, 0);
      if (weight > 0) {
        const total = group.reduce(
          (sum, row) => sum + rateOf(row) * row.totalEmployees,
          0,
        );
        return round2(total / weight);
      }
      const reported = group.map(rateOf).filter(Number.isFinite);
      if (reported.length === 0) return 0;
      return round2(
        reported.reduce((sum, value) => sum + value, 0) / reported.length,
      );
    };

    const manager = group.find((row) => row.department.manager)?.department
      .manager;

    return {
      department: group[0].department,
      manager: manager ? { fullName: manager.fullName } : null,
      totalEmployees,
      totalTasksAssigned,
      avgAttendanceRate: weighted((row) =>
        numberOf(row.avgAttendanceRate as Decimal),
      ),
      avgDepartmentKpiScore: weighted((row) =>
        numberOf(row.avgDepartmentKpiScore as Decimal),
      ),
    };
  });

  return merged.sort((a, b) => {
    if (b.avgDepartmentKpiScore !== a.avgDepartmentKpiScore) {
      return b.avgDepartmentKpiScore - a.avgDepartmentKpiScore;
    }
    return a.department.name.localeCompare(b.department.name);
  });
}
