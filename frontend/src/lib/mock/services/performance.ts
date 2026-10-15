/**
 * services/performance.ts — Performance & Audit mock service.
 *
 * Personal dashboard, score events, point rules, and the three audit-table
 * row sets with role scoping. Mirrors API_CONTACT_SPECIFICATION.md §6.3.
 */

import {
  departments,
  id,
  iso,
  kpiMonthlySummaries,
  kpiScoreEvents,
  leaveBalances,
  now,
  periodMonth,
  periodYear,
  prevMonth,
  prevYear,
  tasks,
  userById,
  users,
} from "../db";
import { KPI_POINT_RULES } from "../registries";
import { can } from "../session";
import type {
  Department,
  KpiAuditLevel1Row,
  KpiAuditLevel2Row,
  KpiAuditLevel3Row,
  KpiMonthlySummary,
  KpiPointRule,
  KpiScoreEvent,
  LeaveBalance,
  PersonalKpiDashboard,
  User,
} from "../types";
import { paginate } from "./shared";

/*──────────────────────────── point rules ────────────────────────────────────*/

export function listKpiPointRules(): KpiPointRule[] {
  return [...KPI_POINT_RULES];
}

/*──────────────────────────── personal KPI dashboard ─────────────────────────*/

export function personalKpiDashboard(
  viewer: User | null,
  periodYearIn: number,
  periodMonthIn: number,
): PersonalKpiDashboard {
  const user = viewer!;
  const summaries = kpiMonthlySummaries.filter(
    (s) =>
      s.user.id === user.id &&
      s.periodYear === periodYearIn &&
      s.periodMonth === periodMonthIn,
  );
  const summary = summaries[0] ?? null;
  const events = kpiScoreEvents.filter(
    (e) =>
      e.user.id === user.id &&
      e.periodYear === periodYearIn &&
      e.periodMonth === periodMonthIn,
  );
  const totalKpiScore = summary?.totalKpiScore ?? 0;
  const bal = leaveBalances.filter((b) => b.user.id === user.id);

  return {
    periodYear: periodYearIn,
    periodMonth: periodMonthIn,
    totalKpiScore,
    summary,
    leaveBalances: bal,
    recentEvents: events
      .slice()
      .sort((a, b) => (b.occurredAt || "").localeCompare(a.occurredAt || ""))
      .slice(0, 10),
  };
}

export function listKpiScoreEvents(
  viewer: User | null,
  year: number,
  month: number,
  offset = 0,
  limit = 20,
) {
  const usersInScope = scopeUserIds(viewer);
  const result = kpiScoreEvents.filter(
    (e) =>
      usersInScope.has(e.user.id) &&
      e.periodYear === year &&
      e.periodMonth === month,
  );
  result.sort((a, b) => (b.occurredAt || "").localeCompare(a.occurredAt || ""));
  return paginate(result, offset, limit);
}

/*──────────────────────────── audit levels ───────────────────────────────────*/

function auditUserRows(year: number, month: number) {
  return kpiMonthlySummaries.filter(
    (s) => s.periodYear === year && s.periodMonth === month,
  );
}

export function listAuditLevel1(
  viewer: User | null,
  year: number,
  month: number,
  offset = 0,
  limit = 20,
) {
  const allowed =
    viewer?.roles.some((r) =>
      ["SUPER_ADMIN", "TECH_LEAD", "HR_MANAGER"].includes(r.code),
    ) ?? false;
  if (!allowed)
    throw new Error("Forbidden: Audit Level 1 is hidden from your role");
  const rows = auditUserRows(year, month).map((s) => ({
    periodYear: s.periodYear,
    periodMonth: s.periodMonth,
    user: s.user,
    department: s.user.department ?? null,
    totalTasksAssigned: s.totalTasksAssigned,
    completedOnTime: s.completedOnTime,
    overdueTasks: s.overdueTasks,
    unapprovedLeaveCount: s.unapprovedLeaveCount,
    perfectAttendanceBonus: s.perfectAttendanceBonus,
    attendanceRate: s.attendanceRate,
    totalKpiScore: s.totalKpiScore,
  }));
  rows.sort((a, b) => b.totalKpiScore - a.totalKpiScore);
  return paginate(rows, offset, limit);
}

export function listAuditLevel2(
  viewer: User | null,
  year: number,
  month: number,
) {
  const allowed =
    viewer?.roles.some((r) =>
      ["SUPER_ADMIN", "TECH_LEAD", "HR_MANAGER"].includes(r.code),
    ) ?? false;
  if (!allowed)
    throw new Error("Forbidden: Audit Level 2 is hidden from your role");
  const byDept = new Map<string, KpiAuditLevel2Row>();
  for (const s of auditUserRows(year, month)) {
    const dept = s.user.department;
    if (!dept) continue;
    const key = dept.id;
    if (!byDept.has(key)) {
      byDept.set(key, {
        periodYear: s.periodYear,
        periodMonth: s.periodMonth,
        department: dept,
        totalEmployees: 0,
        totalTasksAssigned: 0,
        avgAttendanceRate: 0,
        avgDepartmentKpiScore: 0,
      });
    }
    const row = byDept.get(key)!;
    row.totalEmployees += 1;
    row.totalTasksAssigned += s.totalTasksAssigned;
  }
  for (const row of byDept.values()) {
    const deptRows = auditUserRows(year, month).filter(
      (s) => s.user.department?.id === row.department.id,
    );
    row.avgAttendanceRate =
      deptRows.reduce((acc, s) => acc + s.attendanceRate, 0) / deptRows.length;
    row.avgDepartmentKpiScore =
      deptRows.reduce((acc, s) => acc + s.totalKpiScore, 0) / deptRows.length;
  }
  return Array.from(byDept.values()).sort(
    (a, b) => b.avgDepartmentKpiScore - a.avgDepartmentKpiScore,
  );
}

export function listAuditLevel3(
  viewer: User | null,
  year: number,
  month: number,
  departmentId?: string,
  offset = 0,
  limit = 20,
) {
  const allowed =
    viewer?.roles.some((r) =>
      ["SUPER_ADMIN", "TECH_LEAD", "HR_MANAGER", "DEPT_HEAD"].includes(r.code),
    ) ?? false;
  if (!allowed)
    throw new Error("Forbidden: Audit Level 3 is hidden from your role");
  const scope = viewer?.roles[0]?.code;
  let rows = auditUserRows(year, month).map((s) => ({
    periodYear: s.periodYear,
    periodMonth: s.periodMonth,
    department: s.user.department ?? null,
    user: s.user,
    totalTasksAssigned: s.totalTasksAssigned,
    completedOnTime: s.completedOnTime,
    overdueTasks: s.overdueTasks,
    immediateApprovalCount: s.approvedFirstTime,
    returnedCount: s.rejectedTasks,
    perfectAttendanceBonus: s.perfectAttendanceBonus,
    attendanceRate: s.attendanceRate,
    totalKpiScore: s.totalKpiScore,
  }));
  if (departmentId) {
    rows = rows.filter((r) => r.department?.id === departmentId);
  } else if (scope === "DEPT_HEAD") {
    const deptId = viewer?.department?.id;
    rows = rows.filter((r) => r.department?.id === deptId);
  }
  rows.sort((a, b) => b.totalKpiScore - a.totalKpiScore);
  return paginate(rows, offset, limit);
}

/*──────────────────────────── helpers ────────────────────────────────────────*/

function scopeUserIds(viewer: User | null): Set<string> {
  const scope = viewer?.roles[0]?.code;
  switch (scope) {
    case "SUPER_ADMIN":
    case "TECH_LEAD":
    case "HR_MANAGER":
      return new Set(users.map((u) => u.id));
    case "DEPT_HEAD": {
      const deptId = viewer?.department?.id;
      return new Set(
        users.filter((u) => u.department?.id === deptId).map((u) => u.id),
      );
    }
    case "EMPLOYEE":
    default:
      return new Set(viewer ? [viewer.id] : []);
  }
}
