/**
 * services/planning.ts — Planning & Attendance mock service.
 *
 * Role-scoped matrix calendar rows, attendance records, leave requests with
 * register/review flows, UAL/USL penalty assignment (HR_MANAGER / SUPER_ADMIN
 * only), and leave balances (Employee: own AL/TOIL only). Mirrors
 * API_CONTACT_SPECIFICATION.md §6.2.
 */

import type {
  AttendanceRecord,
  LeaveRequest,
  LeaveBalance,
  OvertimeRecord,
  MatrixCalendar,
  MatrixCalendarRow,
  MatrixCalendarDay,
  User,
  LeaveCode,
  ApprovalStatus,
  Department,
  Role,
} from "../types";
import {
  attendanceRecords,
  attendanceById,
  leaveRequests,
  leaveById,
  leaveBalances,
  overtimeRecords,
  users,
  userById,
  departments,
  deptByCode,
  id,
  iso,
  now,
  startOfDay,
  endOfDay,
  addDays,
} from "../db";
import { paginate, mockExportResult } from "./shared";

/*──────────────────────────── local filter shapes ────────────────────────────*/

interface PlanningAttendanceFilter {
  userId?: string;
  departmentId?: string;
  fromDate?: string;
  toDate?: string;
  isLate?: boolean;
  isEarlyLeave?: boolean;
  leaveCode?: LeaveCode;
  offset?: number;
  limit?: number;
}

interface PlanningLeaveRequestFilter {
  userId?: string;
  departmentId?: string;
  leaveCode?: LeaveCode;
  status?: ApprovalStatus;
  fromDate?: string;
  toDate?: string;
  offset?: number;
  limit?: number;
}

interface PlanningMatrixCalendarInput {
  departmentId?: string;
  fromDate: string;
  toDate: string;
}

/*──────────────────────────── role scopes ────────────────────────────────────*/

const PLANNING_SCOPES: Record<string, string> = {
  SUPER_ADMIN: "ALL",
  TECH_LEAD: "ALL",
  HR_MANAGER: "COMPANY_WIDE",
  DEPT_HEAD: "DEPARTMENT_ONLY",
  EMPLOYEE: "PERSONAL",
};

function scopeUsers(viewer: User | null): User[] {
  const scope = PLANNING_SCOPES[viewer?.roles[0]?.code || "EMPLOYEE"];
  switch (scope) {
    case "ALL":
    case "COMPANY_WIDE":
      return users;
    case "DEPARTMENT_ONLY": {
      const deptId = viewer?.department?.id || null;
      return users.filter((u) => u.department?.id === deptId);
    }
    case "PERSONAL":
    default:
      return viewer ? [viewer] : [];
  }
}

/*──────────────────────────── matrix calendar ────────────────────────────────*/

export function matrixCalendar(
  viewer: User | null,
  input: PlanningMatrixCalendarInput,
): MatrixCalendar {
  const { fromDate, toDate, departmentId } = input;
  const from = startOfDay(new Date(fromDate));
  const to = endOfDay(new Date(toDate));

  let dept: Department | null = null;
  if (departmentId) {
    dept = deptByCode[departmentId] || null;
  }

  const usersInScope = scopeUsers(viewer);

  const rows: MatrixCalendarRow[] = usersInScope.map((user) => {
    const days: MatrixCalendarDay[] = [];
    let cursor = new Date(from);
    while (cursor <= to) {
      const workDate = iso(cursor);
      const att = attendanceRecords.find(
        (a) => a.user.id === user.id && a.workDate === workDate,
      );
      const leave = leaveRequests.find(
        (lr) =>
          lr.user.id === user.id && lr.startDate <= workDate && lr.endDate >= workDate,
      );
      days.push({
        workDate,
        state: null,
        progressPercentage: null,
        leaveCode: (att?.leaveCode || (leave ? leave.leaveCode : null)) as
          | LeaveCode
          | null,
        isLate: att?.isLate ?? false,
        isEarlyLeave: att?.isEarlyLeave ?? false,
      });
      cursor = addDays(cursor, 1);
    }
    return { user, days };
  });

  return { department: dept, fromDate: iso(from), toDate: iso(to), rows };
}

/*──────────────────────────── attendance reads ───────────────────────────────*/

export function listAttendance(
  viewer: User | null,
  filter: PlanningAttendanceFilter = {},
): { nodes: AttendanceRecord[]; pageInfo: { offset: number; limit: number; totalCount: number; hasNextPage: boolean } } {
  const { offset = 0, limit = 20 } = filter;
  const usersInScope = new Set(scopeUsers(viewer).map((u) => u.id));
  let result = attendanceRecords.filter((a) => usersInScope.has(a.user.id));
  if (filter.userId) result = result.filter((a) => a.user.id === filter.userId);
  if (filter.departmentId) {
    result = result.filter((a) => a.user.department?.id === filter.departmentId);
  }
  if (filter.fromDate) {
    const fromDate = filter.fromDate;
    result = result.filter((a) => a.workDate >= fromDate);
  }
  if (filter.toDate) {
    const toDate = filter.toDate;
    result = result.filter((a) => a.workDate <= toDate);
  }
  if (filter.isLate !== undefined)
    result = result.filter((a) => a.isLate === filter.isLate);
  if (filter.isEarlyLeave !== undefined)
    result = result.filter((a) => a.isEarlyLeave === filter.isEarlyLeave);
  if (filter.leaveCode)
    result = result.filter((a) => a.leaveCode === filter.leaveCode);
  result.sort((a, b) => (b.workDate || "").localeCompare(a.workDate || ""));
  return paginate(result, offset, limit);
}

export function listOvertime(
  viewer: User | null,
  filter: { userId?: string; offset?: number; limit?: number } = {},
): { nodes: OvertimeRecord[]; pageInfo: { offset: number; limit: number; totalCount: number; hasNextPage: boolean } } {
  const { offset = 0, limit = 20 } = filter;
  const usersInScope = new Set(scopeUsers(viewer).map((u) => u.id));
  let result = overtimeRecords.filter((o) => usersInScope.has(o.user.id));
  if (filter.userId) result = result.filter((o) => o.user.id === filter.userId);
  result.sort((a, b) => (b.workDate || "").localeCompare(a.workDate || ""));
  return paginate(result, offset, limit);
}

/*──────────────────────────── leave requests ─────────────────────────────────*/

export function listLeaveRequests(
  viewer: User | null,
  filter: PlanningLeaveRequestFilter = {},
): { nodes: LeaveRequest[]; pageInfo: { offset: number; limit: number; totalCount: number; hasNextPage: boolean } } {
  const { offset = 0, limit = 20 } = filter;
  const usersInScope = new Set(scopeUsers(viewer).map((u) => u.id));
  let result = leaveRequests.filter((lr) => usersInScope.has(lr.user.id));
  if (filter.userId) result = result.filter((lr) => lr.user.id === filter.userId);
  if (filter.departmentId) {
    result = result.filter((lr) => lr.user.department?.id === filter.departmentId);
  }
  if (filter.leaveCode) result = result.filter((lr) => lr.leaveCode === filter.leaveCode);
  if (filter.status) result = result.filter((lr) => lr.status === filter.status);
  if (filter.fromDate) {
    const fromDate = filter.fromDate;
    result = result.filter((lr) => lr.startDate >= fromDate);
  }
  if (filter.toDate) {
    const toDate = filter.toDate;
    result = result.filter((lr) => lr.endDate <= toDate);
  }
  result.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return paginate(result, offset, limit);
}

export function getLeaveRequest(viewer: User | null, id: string): LeaveRequest | null {
  const lr = leaveById[id];
  if (!lr) return null;
  const usersInScope = new Set(scopeUsers(viewer).map((u) => u.id));
  if (!usersInScope.has(lr.user.id)) return null;
  return lr;
}

export function registerLeave(
  actor: User,
  input: {
    leaveCode: LeaveCode;
    startDate: string;
    endDate: string;
    reason: string;
    handoverUserId?: string;
    attachmentIds?: string[];
  },
): LeaveRequest {
  const handoverUser = input.handoverUserId ? userById[input.handoverUserId] : undefined;
  const request: LeaveRequest = {
    id: id(),
    user: actor,
    leaveCode: input.leaveCode,
    startDate: input.startDate,
    endDate: input.endDate,
    totalDays: 1,
    reason: input.reason,
    handoverUser: handoverUser ?? null,
    status: "PENDING",
    approvedBy: null,
    approvedAt: null,
    attachments: [],
    createdAt: iso(now()),
    updatedAt: iso(now()),
  };
  leaveRequests.push(request);
  leaveById[request.id] = request;
  return request;
}

export function reviewLeave(
  requestId: string,
  actor: User,
  input: { decision: ApprovalStatus; reviewComment?: string },
): LeaveRequest {
  const request = leaveById[requestId];
  if (!request) throw new Error("Leave request not found");
  if (request.status !== "PENDING") throw new Error("Leave request already reviewed");
  request.status = input.decision;
  request.approvedBy = actor;
  request.approvedAt = iso(now());
  request.updatedAt = iso(now());
  return request;
}

/*──────────────────────────── penalty leave (HR / SUPER_ADMIN only) ─────────*/

export function assignPenaltyLeave(
  actor: User,
  input: {
    userId: string;
    leaveCode: LeaveCode;
    workDate: string;
    note?: string;
  },
): AttendanceRecord {
  const allowed = actor.roles.some(
    (r: Role) => r.code === "SUPER_ADMIN" || r.code === "HR_MANAGER",
  );
  if (!allowed) throw new Error("Only HR Manager or Super Admin can assign penalty leave");
  if (input.leaveCode !== "UAL" && input.leaveCode !== "USL") {
    throw new Error("Only UAL or USL may be assigned as penalty leave");
  }
  const user = userById[input.userId];
  if (!user) throw new Error("User not found");
  const record: AttendanceRecord = {
    id: id(),
    user,
    workDate: input.workDate,
    checkIn: null,
    checkOut: null,
    isLate: false,
    isEarlyLeave: false,
    leaveCode: input.leaveCode,
    workingHours: 0,
    createdAt: iso(now()),
    updatedAt: iso(now()),
  };
  attendanceRecords.push(record);
  attendanceById[record.id] = record;
  return record;
}

/*──────────────────────────── leave balances ─────────────────────────────────*/

export function listLeaveBalances(viewer: User | null, userId?: string): LeaveBalance[] {
  const scope = PLANNING_SCOPES[viewer?.roles[0]?.code || "EMPLOYEE"];
  let targetUsers: User[];
  if (userId) {
    targetUsers = [userById[userId]].filter(Boolean);
  } else if (scope === "PERSONAL") {
    targetUsers = viewer ? [viewer] : [];
  } else {
    targetUsers = scopeUsers(viewer);
  }
  return leaveBalances.filter((lb) => targetUsers.some((u) => u.id === lb.user.id));
}

/*──────────────────────────── overtime ───────────────────────────────────────*/

export function recordOvertime(
  actor: User,
  input: { userId: string; workDate: string; hours: number; note?: string },
): OvertimeRecord {
  const user = userById[input.userId];
  if (!user) throw new Error("User not found");
  const record: OvertimeRecord = {
    id: id(),
    user,
    workDate: input.workDate,
    hours: input.hours,
    isApproved: false,
    approvedBy: null,
    approvedAt: null,
    note: input.note ?? null,
    createdAt: iso(now()),
    updatedAt: iso(now()),
  };
  overtimeRecords.push(record);
  return record;
}

export function reviewOvertime(
  overtimeId: string,
  actor: User,
  input: { decision: ApprovalStatus; reviewComment?: string },
): OvertimeRecord {
  const record = overtimeRecords.find((o) => o.id === overtimeId);
  if (!record) throw new Error("Overtime record not found");
  record.isApproved = input.decision === "APPROVED";
  record.approvedBy = actor;
  record.approvedAt = iso(now());
  return record;
}

/*──────────────────────────── print/export ───────────────────────────────────*/

export function printLeaveRequest(leaveRequestId: string) {
  const lr = leaveById[leaveRequestId];
  if (!lr) throw new Error("Leave request not found");
  return mockExportResult(
    `leave-request-${lr.id}.pdf`,
    "application/pdf",
    "PDF",
  );
}

export function printAttendanceCalendar(viewer: User | null, input: PlanningMatrixCalendarInput) {
  const cal = matrixCalendar(viewer, input);
  return mockExportResult(
    `attendance-calendar-${cal.fromDate}-to-${cal.toDate}.pdf`,
    "application/pdf",
    "PDF",
  );
}

export function exportAttendance(viewer: User | null, filter: PlanningAttendanceFilter & { format?: "PDF" | "XLSX" | "CSV" } = {}) {
  const conn = listAttendance(viewer, filter);
  return {
    result: mockExportResult(
      `attendance-export.${filter.format === "CSV" ? "csv" : "xlsx"}`,
      filter.format === "CSV" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filter.format ?? "XLSX",
    ),
    count: conn.nodes.length,
  };
}
