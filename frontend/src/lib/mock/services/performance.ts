/**
 * Performance & Audit mock service — personal KPI dashboard, the fixed point
 * rules, and the three audit levels with role-based visibility and scoping.
 * Mirrors `API_CONTACT_SPECIFICATION.md` §6.3.
 */

import { CURRENT_MONTH, CURRENT_YEAR, state } from "../db";
import { KPI_POINT_RULES } from "../registries";
import { primaryRole } from "../permissions";
import type {
  Connection,
  KpiAuditLevel1Row,
  KpiAuditLevel2Row,
  KpiAuditLevel3Row,
  KpiAuditFilter,
  KpiMonthlySummary,
  KpiPeriodInput,
  KpiPointRule,
  KpiScoreEvent,
  PersonalKpiDashboard,
  User,
} from "../types";
import { MockError } from "../types";
import {
  appendAudit,
  buildExportResult,
  type MockExportDescriptor,
  paginate,
  requirePermission,
  requireViewer,
  userInScope,
  visibleUsers,
} from "./shared";

function period(filter: { periodYear: number; periodMonth?: number }): {
  year: number;
  month: number;
} {
  return {
    year: filter.periodYear,
    month: filter.periodMonth ?? CURRENT_MONTH,
  };
}

function summaryFor(
  user: User,
  year: number,
  month: number,
): KpiMonthlySummary | null {
  return (
    state.kpiMonthlySummaries.find(
      (s) =>
        s.user.id === user.id &&
        s.periodYear === year &&
        s.periodMonth === month,
    ) ?? null
  );
}

/* -------------------------------------------------------------------------- */
/* Personal dashboard                                                         */
/* -------------------------------------------------------------------------- */

export function personalKpiDashboard(
  viewer: User | null,
  input: KpiPeriodInput,
): PersonalKpiDashboard {
  const user = requirePermission(
    viewer,
    "performance.kpi.view_personal",
    "You do not have permission to view the KPI dashboard.",
  );
  const { year, month } = period(input);
  const summary = summaryFor(user, year, month);
  const recentEvents = state.kpiScoreEvents
    .filter(
      (e) =>
        e.user.id === user.id &&
        e.periodYear === year &&
        e.periodMonth === month,
    )
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    )
    .slice(0, 20);

  const balances = ["AL", "TOIL"].flatMap((code) => {
    const total = state.leaveBalanceEntries
      .filter((e) => e.user.id === user.id && e.leaveCode === code)
      .reduce((sum, e) => sum + e.deltaDays, 0);
    return [
      {
        user,
        leaveCode: code as "AL" | "TOIL",
        leaveName: code === "AL" ? "Annual Leave" : "Time Off In Lieu",
        balanceDays: Math.round(total * 100) / 100,
      },
    ];
  });

  return {
    periodYear: year,
    periodMonth: month,
    totalKpiScore: summary?.totalKpiScore ?? 0,
    summary,
    leaveBalances: balances,
    recentEvents,
  };
}

export function kpiScoreEvents(
  viewer: User | null,
  input: KpiPeriodInput,
  offset = 0,
  limit = 20,
): Connection<KpiScoreEvent> {
  requireViewer(viewer);
  const { year, month } = period(input);
  const items = state.kpiScoreEvents
    .filter(
      (e) =>
        e.periodYear === year &&
        e.periodMonth === month &&
        userInScope(viewer, e.user),
    )
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
  return paginate(items, offset, limit);
}

export function kpiPointRules(): KpiPointRule[] {
  return KPI_POINT_RULES;
}

/* -------------------------------------------------------------------------- */
/* Audit levels                                                               */
/* -------------------------------------------------------------------------- */

export function kpiAuditLevel1Company(
  viewer: User | null,
  filter: KpiAuditFilter,
  offset = 0,
  limit = 20,
): Connection<KpiAuditLevel1Row> {
  requirePermission(
    viewer,
    "performance.audit.level1_2_view",
    "You do not have permission to view company audit tables.",
  );
  const { year, month } = period(filter);
  const rows: KpiAuditLevel1Row[] = state.kpiMonthlySummaries
    .filter((s) => s.periodYear === year && s.periodMonth === month)
    .map((s) => ({
      periodYear: s.periodYear,
      periodMonth: s.periodMonth,
      user: s.user,
      department: s.user.department,
      totalTasksAssigned: s.totalTasksAssigned,
      completedOnTime: s.completedOnTime,
      overdueTasks: s.overdueTasks,
      unapprovedLeaveCount: s.unapprovedLeaveCount,
      perfectAttendanceBonus: s.perfectAttendanceBonus,
      attendanceRate: s.attendanceRate,
      totalKpiScore: s.totalKpiScore,
    }))
    .sort((a, b) => b.totalKpiScore - a.totalKpiScore);
  return paginate(rows, offset, limit);
}

export function kpiAuditLevel2Department(
  viewer: User | null,
  filter: KpiAuditFilter,
): Connection<KpiAuditLevel2Row> {
  requirePermission(
    viewer,
    "performance.audit.level1_2_view",
    "You do not have permission to view department audit tables.",
  );
  const { year, month } = period(filter);
  const byDept = new Map<string, KpiAuditLevel2Row>();
  for (const s of state.kpiMonthlySummaries) {
    if (s.periodYear !== year || s.periodMonth !== month) continue;
    const dept = s.user.department;
    if (!dept) continue;
    const existing = byDept.get(dept.id);
    if (!existing) {
      byDept.set(dept.id, {
        periodYear: year,
        periodMonth: month,
        department: dept,
        totalEmployees: 1,
        totalTasksAssigned: s.totalTasksAssigned,
        avgAttendanceRate: s.attendanceRate,
        avgDepartmentKpiScore: s.totalKpiScore,
      });
    } else {
      existing.totalEmployees += 1;
      existing.totalTasksAssigned += s.totalTasksAssigned;
      existing.avgAttendanceRate += s.attendanceRate;
      existing.avgDepartmentKpiScore += s.totalKpiScore;
    }
  }
  const rows = [...byDept.values()]
    .map((row) => ({
      ...row,
      avgAttendanceRate:
        Math.round((row.avgAttendanceRate / row.totalEmployees) * 100) / 100,
      avgDepartmentKpiScore:
        Math.round((row.avgDepartmentKpiScore / row.totalEmployees) * 100) / 100,
    }))
    .sort((a, b) => b.avgDepartmentKpiScore - a.avgDepartmentKpiScore);
  return paginate(rows, 0, rows.length);
}

export function kpiAuditLevel3Employee(
  viewer: User | null,
  filter: KpiAuditFilter,
  orderBy: "TOTAL_KPI_SCORE_DESC" | "TOTAL_KPI_SCORE_ASC" | "ATTENDANCE_RATE_DESC" = "TOTAL_KPI_SCORE_DESC",
  offset = 0,
  limit = 20,
): Connection<KpiAuditLevel3Row> {
  const user = requirePermission(
    viewer,
    "performance.audit.level3_view",
    "You do not have permission to view department audit tables.",
  );
  const { year, month } = period(filter);
  const role = primaryRole(user);
  const departmentId =
    role === "DEPT_HEAD" ? user.departmentId : filter.departmentId;

  const scopeUsers = new Set(visibleUsers(user).map((u) => u.id));
  const rows: KpiAuditLevel3Row[] = state.kpiMonthlySummaries
    .filter(
      (s) =>
        s.periodYear === year &&
        s.periodMonth === month &&
        scopeUsers.has(s.user.id) &&
        (!departmentId || s.user.departmentId === departmentId),
    )
    .map((s) => ({
      periodYear: s.periodYear,
      periodMonth: s.periodMonth,
      department: s.user.department!,
      user: s.user,
      totalTasksAssigned: s.totalTasksAssigned,
      completedOnTime: s.completedOnTime,
      overdueTasks: s.overdueTasks,
      immediateApprovalCount: s.approvedFirstTime,
      returnedCount: s.rejectedTasks,
      perfectAttendanceBonus: s.perfectAttendanceBonus,
      attendanceRate: s.attendanceRate,
      totalKpiScore: s.totalKpiScore,
    }))
    .filter((row) => row.department !== undefined);
  rows.sort((a, b) => {
    if (orderBy === "TOTAL_KPI_SCORE_ASC") return a.totalKpiScore - b.totalKpiScore;
    if (orderBy === "ATTENDANCE_RATE_DESC") return b.attendanceRate - a.attendanceRate;
    return b.totalKpiScore - a.totalKpiScore;
  });
  return paginate(rows, offset, limit);
}

/* -------------------------------------------------------------------------- */
/* Print / export (mock results)                                              */
/* -------------------------------------------------------------------------- */

export function printKpiReport(
  viewer: User | null,
  input: KpiPeriodInput,
): MockExportDescriptor {
  const actor = requirePermission(
    viewer,
    "performance.print_export",
    "You do not have permission to print KPI reports.",
  );
  const { year, month } = period(input);
  appendAudit(actor, {
    moduleCode: "performance",
    action: "KPI_REPORT_PRINT",
    resourceType: "KPI_SUMMARY",
    newData: { periodYear: year, periodMonth: month },
  });
  return buildExportResult({
    fileName: `kpi-report-${actor.userCode}-${year}-${String(month).padStart(2, "0")}.pdf`,
    format: "PDF",
    scopeNote: "Personal KPI report — A4",
  });
}

export function exportAuditWorkbook(
  viewer: User | null,
  filter: KpiAuditFilter,
): MockExportDescriptor {
  const actor = requirePermission(
    viewer,
    "performance.print_export",
    "You do not have permission to export audit workbooks.",
  );
  const { year, month } = period(filter);
  const role = primaryRole(viewer);
  if (role === "EMPLOYEE") {
    return buildExportResult({
      fileName: `kpi-report-${actor.userCode}-${year}-${String(month).padStart(2, "0")}.xlsx`,
      format: "XLSX",
      scopeNote: "Personal report only",
    });
  }
  appendAudit(actor, {
    moduleCode: "performance",
    action: "KPI_AUDIT_EXPORT",
    resourceType: "KPI_SUMMARY",
    newData: { periodYear: year, periodMonth: month },
  });
  const scopeNote =
    role === "DEPT_HEAD"
      ? "Department audit tables"
      : "All audit tables + ranking chart";
  const suffix = filter.departmentId ? `-${filter.departmentId}` : "";
  return buildExportResult({
    fileName: `audit-workbook-${year}-${String(month).padStart(2, "0")}${suffix}.xlsx`,
    format: "XLSX",
    scopeNote,
  });
}

/** Guard used by the app to decide whether a role may open the audit views. */
export function canViewAuditLevels(
  viewer: User | null,
): { level1: boolean; level2: boolean; level3: boolean } {
  if (!viewer) return { level1: false, level2: false, level3: false };
  const has = (code: string) =>
    viewer.roles.some((r) => r.permissions.some((p) => p.code === code));
  const can = has("performance.audit.level1_2_view");
  const can3 = has("performance.audit.level3_view");
  return { level1: can, level2: can, level3: can3 };
}

export function requireKpiPeriod(input: KpiPeriodInput): KpiPeriodInput {
  if (!input.periodYear || !input.periodMonth) {
    throw new MockError("VALIDATION_FAILED", "A period year and month are required.");
  }
  return input;
}

export const KPI_DEFAULT_PERIOD: KpiPeriodInput = {
  periodYear: CURRENT_YEAR,
  periodMonth: CURRENT_MONTH,
};
