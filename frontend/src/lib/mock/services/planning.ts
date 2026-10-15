/**
 * Planning & Attendance mock service — role-scoped matrix calendar, attendance,
 * leave registration/review, `UAL`/`USL` penalty assignment, and `AL`/`TOIL`
 * balances. Mirrors `API_CONTACT_SPECIFICATION.md` §6.2.
 */

import {
  CURRENT_MONTH,
  CURRENT_YEAR,
  departmentById,
  nextId,
  state,
} from "../db";
import { LEAVE_CODE_BY_CODE } from "../registries";
import { primaryRole } from "../permissions";
import type {
  AttendanceFilter,
  AttendanceRecord,
  Connection,
  LeaveBalance,
  LeaveBalanceEntry,
  LeaveCode,
  LeaveRequest,
  LeaveRequestFilter,
  MatrixCalendar,
  MatrixCalendarDay,
  MatrixCalendarRow,
  OvertimeRecord,
  RecordOvertimeInput,
  RegisterLeaveInput,
  ReviewLeaveInput,
  ReviewOvertimeInput,
  AssignPenaltyLeaveInput,
  User,
} from "../types";
import { MockError } from "../types";
import {
  appendAudit,
  applyKpiEvent,
  buildExportResult,
  type MockExportDescriptor,
  nowIso,
  paginate,
  requirePermission,
  requireViewer,
  userInScope,
  visibleUsers,
} from "./shared";

const BALANCE_TRACKED: LeaveCode[] = ["AL", "TOIL"];

/* -------------------------------------------------------------------------- */
/* Scoping helpers                                                            */
/* -------------------------------------------------------------------------- */

function attendanceInScope(viewer: User | null, record: AttendanceRecord): boolean {
  return userInScope(viewer, record.user);
}

function applyAttendanceFilter(
  items: AttendanceRecord[],
  filter: AttendanceFilter,
): AttendanceRecord[] {
  let result = items;
  if (filter.userId) result = result.filter((r) => r.userId === filter.userId);
  if (filter.departmentId)
    result = result.filter((r) => r.user.departmentId === filter.departmentId);
  if (filter.isLate !== undefined)
    result = result.filter((r) => r.isLate === filter.isLate);
  if (filter.isEarlyLeave !== undefined)
    result = result.filter((r) => r.isEarlyLeave === filter.isEarlyLeave);
  if (filter.leaveCode)
    result = result.filter((r) => r.leaveCode === filter.leaveCode);
  if (filter.fromDate)
    result = result.filter((r) => r.workDate >= filter.fromDate!);
  if (filter.toDate) result = result.filter((r) => r.workDate <= filter.toDate!);
  return result;
}

/* -------------------------------------------------------------------------- */
/* Matrix calendar                                                            */
/* -------------------------------------------------------------------------- */

function dayKeyStart(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function taskSpansDay(
  task: { startDate: string | null; endDate: string | null; state: string },
  dayStart: number,
): boolean {
  if (!task.endDate) return false;
  const end = dayKeyStart(new Date(task.endDate));
  const start = task.startDate
    ? dayKeyStart(new Date(task.startDate))
    : end;
  return dayStart >= start && dayStart <= end;
}

const STATE_RANK: Record<string, number> = {
  ACT: 0,
  PEN: 1,
  OVERDUE: 2,
  REQ: 3,
  REJ: 4,
  APP: 5,
  CAN: 6,
};

function representativeTask(user: User, dayStart: number) {
  const candidates = state.tasks.filter(
    (t) => t.assignedToId === user.id && taskSpansDay(t, dayStart),
  );
  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) =>
      (STATE_RANK[a.state] ?? 9) - (STATE_RANK[b.state] ?? 9) ||
      b.progressPercentage - a.progressPercentage,
  );
  return candidates[0];
}

export function matrixCalendar(
  viewer: User | null,
  input: { departmentId?: string; fromDate: string; toDate: string },
): MatrixCalendar {
  const user = requireViewer(viewer);
  const from = new Date(input.fromDate);
  from.setHours(0, 0, 0, 0);
  const to = new Date(input.toDate);
  to.setHours(0, 0, 0, 0);

  let rowUsers = visibleUsers(user);
  if (input.departmentId) {
    // Only company-wide roles may filter by another department.
    const role = primaryRole(user);
    if (role === "EMPLOYEE" || role === "DEPT_HEAD") {
      rowUsers = rowUsers.filter((u) => u.departmentId === user.departmentId);
    }
    rowUsers = rowUsers.filter((u) => u.departmentId === input.departmentId);
  }
  rowUsers = [...rowUsers].sort(
    (a, b) =>
      (a.department?.name ?? "").localeCompare(b.department?.name ?? "") ||
      a.fullName.localeCompare(b.fullName),
  );

  const attendanceIndex = new Map(
    state.attendanceRecords.map((r) => [
      `${r.userId}|${dayKeyStart(new Date(r.workDate))}`,
      r,
    ]),
  );

  const rows: MatrixCalendarRow[] = rowUsers.map((rowUser) => {
    const days: MatrixCalendarDay[] = [];
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const dayStart = dayKeyStart(d);
      const record = attendanceIndex.get(`${rowUser.id}|${dayStart}`);
      const task = representativeTask(rowUser, dayStart);
      days.push({
        workDate: new Date(dayStart).toISOString(),
        state: task?.state ?? null,
        progressPercentage: task?.progressPercentage ?? null,
        leaveCode: record?.leaveCode ?? null,
        isLate: record?.isLate ?? false,
        isEarlyLeave: record?.isEarlyLeave ?? false,
      });
    }
    return { user: rowUser, days };
  });

  return {
    department: input.departmentId ? departmentById(input.departmentId) : null,
    fromDate: from.toISOString(),
    toDate: to.toISOString(),
    rows,
  };
}

/* -------------------------------------------------------------------------- */
/* Attendance                                                                 */
/* -------------------------------------------------------------------------- */

export function attendanceRecords(
  viewer: User | null,
  filter: AttendanceFilter = {},
  offset = 0,
  limit = 20,
): Connection<AttendanceRecord> {
  requireViewer(viewer);
  let items = state.attendanceRecords.filter((r) =>
    attendanceInScope(viewer, r),
  );
  items = applyAttendanceFilter(items, filter);
  items = [...items].sort(
    (a, b) =>
      new Date(b.workDate).getTime() - new Date(a.workDate).getTime() ||
      a.user.fullName.localeCompare(b.user.fullName),
  );
  return paginate(items, offset, limit);
}

/* -------------------------------------------------------------------------- */
/* Leave requests                                                             */
/* -------------------------------------------------------------------------- */

function applyLeaveFilter(
  items: LeaveRequest[],
  filter: LeaveRequestFilter,
): LeaveRequest[] {
  let result = items;
  if (filter.userId) result = result.filter((l) => l.userId === filter.userId);
  if (filter.departmentId)
    result = result.filter((l) => l.user.departmentId === filter.departmentId);
  if (filter.leaveCode)
    result = result.filter((l) => l.leaveCode === filter.leaveCode);
  if (filter.status) result = result.filter((l) => l.status === filter.status);
  if (filter.fromDate)
    result = result.filter((l) => l.endDate >= filter.fromDate!);
  if (filter.toDate) result = result.filter((l) => l.startDate <= filter.toDate!);
  return result;
}

export function leaveRequests(
  viewer: User | null,
  filter: LeaveRequestFilter = {},
  offset = 0,
  limit = 20,
): Connection<LeaveRequest> {
  requireViewer(viewer);
  let items = state.leaveRequests.filter((l) => userInScope(viewer, l.user));
  items = applyLeaveFilter(items, filter);
  items = [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return paginate(items, offset, limit);
}

export function getLeaveRequest(
  viewer: User | null,
  id: string,
): LeaveRequest | null {
  const request = state.leaveRequests.find((l) => l.id === id);
  if (!request || !userInScope(viewer, request.user)) return null;
  return request;
}

function stampLeaveOnAttendance(request: LeaveRequest): void {
  const start = new Date(request.startDate);
  const end = new Date(request.endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const workDate = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
    ).toISOString();
    const existing = state.attendanceRecords.find(
      (r) => r.userId === request.userId && r.workDate === workDate,
    );
    if (existing) {
      existing.leaveCode = request.leaveCode;
    } else {
      state.attendanceRecords.push({
        id: nextId("attd"),
        userId: request.userId,
        user: request.user,
        workDate,
        checkIn: null,
        checkOut: null,
        isLate: false,
        isEarlyLeave: false,
        leaveCode: request.leaveCode,
        workingHours: 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }
  }
}

export function registerLeave(
  viewer: User | null,
  input: RegisterLeaveInput,
): LeaveRequest {
  const user = requirePermission(
    viewer,
    "planning.leave.register",
    "You do not have permission to register leave.",
  );
  const code = LEAVE_CODE_BY_CODE[input.leaveCode];
  if (!code) {
    throw new MockError("VALIDATION_FAILED", "Unknown leave code.");
  }
  if (new Date(input.endDate) < new Date(input.startDate)) {
    throw new MockError("VALIDATION_FAILED", "The end date must be on or after the start date.");
  }
  if (!input.reason.trim()) {
    throw new MockError("RULE_VIOLATION", "A leave reason is required.");
  }
  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  const totalDays =
    Math.round((end.getTime() - start.getTime()) / 86400000) + 1;

  const request: LeaveRequest = {
    id: nextId("leave"),
    userId: user.id,
    user,
    leaveCode: input.leaveCode,
    startDate: new Date(start.getFullYear(), start.getMonth(), start.getDate()).toISOString(),
    endDate: new Date(end.getFullYear(), end.getMonth(), end.getDate()).toISOString(),
    totalDays,
    reason: input.reason,
    handoverUser: input.handoverUserId
      ? state.users.find((u) => u.id === input.handoverUserId) ?? null
      : null,
    status: "PENDING",
    approvedBy: null,
    approvedAt: null,
    attachments: (input.attachmentNames ?? []).map((fileName) => ({
      id: nextId("att"),
      ownerType: "LEAVE_REQUEST",
      ownerId: "pending",
      url: `mock://attachments/${fileName}`,
      fileName,
      mimeType: "application/pdf",
      uploadedBy: user,
      createdAt: nowIso(),
    })),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  for (const attachment of request.attachments) attachment.ownerId = request.id;
  state.leaveRequests.push(request);
  appendAudit(user, {
    moduleCode: "planning",
    action: "LEAVE_REGISTER",
    resourceType: "LEAVE",
    resourceId: request.id,
    newData: { leaveCode: input.leaveCode, totalDays },
  });
  return request;
}

export function reviewLeave(
  viewer: User | null,
  input: ReviewLeaveInput,
): LeaveRequest {
  const actor = requirePermission(
    viewer,
    "planning.leave.approve",
    "You do not have permission to review leave requests.",
  );
  const request = state.leaveRequests.find((l) => l.id === input.leaveRequestId);
  if (!request) {
    throw new MockError("NOT_FOUND", "The leave request was not found.");
  }
  if (!userInScope(viewer, request.user)) {
    throw new MockError("NOT_FOUND", "The leave request is out of scope.");
  }
  if (request.status !== "PENDING") {
    throw new MockError("CONFLICT", "This leave request has already been reviewed.");
  }
  request.status = input.decision;
  request.approvedBy = input.decision === "APPROVED" ? actor : null;
  request.approvedAt = input.decision === "APPROVED" ? nowIso() : null;
  request.updatedAt = nowIso();
  if (input.decision === "APPROVED") {
    stampLeaveOnAttendance(request);
    const tracked = LEAVE_CODE_BY_CODE[request.leaveCode].isBalanceTracked;
    if (tracked) {
      const entry: LeaveBalanceEntry = {
        id: nextId("bal"),
        user: request.user,
        leaveCode: request.leaveCode,
        entryType: "USAGE",
        deltaDays: -request.totalDays,
        periodYear: CURRENT_YEAR,
        referenceType: "LEAVE_REQUEST",
        referenceId: request.id,
        note: `Approved ${request.leaveCode}.`,
        createdBy: actor,
        createdAt: nowIso(),
      };
      state.leaveBalanceEntries.push(entry);
    }
  }
  appendAudit(actor, {
    moduleCode: "planning",
    action: "LEAVE_REVIEW",
    resourceType: "LEAVE",
    resourceId: request.id,
    newData: { decision: input.decision, comment: input.reviewComment ?? null },
  });
  return request;
}

/* -------------------------------------------------------------------------- */
/* Penalty leave (HR Manager / Super Admin only)                              */
/* -------------------------------------------------------------------------- */

export function assignPenaltyLeave(
  viewer: User | null,
  input: AssignPenaltyLeaveInput,
): AttendanceRecord {
  const actor = requirePermission(
    viewer,
    "planning.leave.assign_penalty",
    `You do not have permission to assign the ${input.leaveCode} leave code.`,
  );
  const code = LEAVE_CODE_BY_CODE[input.leaveCode];
  if (!code || !code.isPenalty) {
    throw new MockError(
      "VALIDATION_FAILED",
      "Only the penalty leave codes UAL and USL may be assigned.",
    );
  }
  const target = state.users.find((u) => u.id === input.userId);
  if (!target) throw new MockError("NOT_FOUND", "The employee was not found.");

  const workDate = new Date(input.workDate);
  const workDateIso = new Date(
    workDate.getFullYear(),
    workDate.getMonth(),
    workDate.getDate(),
  ).toISOString();

  let record = state.attendanceRecords.find(
    (r) => r.userId === target.id && r.workDate === workDateIso,
  );
  if (record) {
    record.leaveCode = input.leaveCode;
    record.workingHours = 0;
    record.checkIn = null;
    record.checkOut = null;
    record.updatedAt = nowIso();
  } else {
    record = {
      id: nextId("attd"),
      userId: target.id,
      user: target,
      workDate: workDateIso,
      checkIn: null,
      checkOut: null,
      isLate: false,
      isEarlyLeave: false,
      leaveCode: input.leaveCode,
      workingHours: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.attendanceRecords.push(record);
  }

  // Deduct 100% of the daily wage (working hours zeroed) + KPI deduction.
  applyKpiEvent(target, "KPI_UNAPPROVED_LEAVE");
  appendAudit(actor, {
    moduleCode: "planning",
    action: "PENALTY_LEAVE_ASSIGN",
    resourceType: "ATTENDANCE",
    resourceId: record.id,
    newData: {
      userId: target.id,
      leaveCode: input.leaveCode,
      workDate: workDateIso,
      note: input.note ?? null,
      wageDeduction: "100% of daily wage",
    },
  });
  return record;
}

/* -------------------------------------------------------------------------- */
/* Leave balances                                                             */
/* -------------------------------------------------------------------------- */

export function leaveBalances(
  viewer: User | null,
  userId?: string,
): LeaveBalance[] {
  const user = requireViewer(viewer);
  let targets = visibleUsers(user);
  if (primaryRole(user) === "EMPLOYEE") targets = [user];
  if (userId) targets = targets.filter((u) => u.id === userId);
  else if (primaryRole(user) === "EMPLOYEE") targets = [user];

  const balances: LeaveBalance[] = [];
  for (const target of targets) {
    for (const code of BALANCE_TRACKED) {
      const total = state.leaveBalanceEntries
        .filter((e) => e.user.id === target.id && e.leaveCode === code)
        .reduce((sum, e) => sum + e.deltaDays, 0);
      balances.push({
        user: target,
        leaveCode: code,
        leaveName: LEAVE_CODE_BY_CODE[code].name,
        balanceDays: Math.round(total * 100) / 100,
      });
    }
  }
  return balances;
}

/* -------------------------------------------------------------------------- */
/* Overtime (feeds TOIL)                                                      */
/* -------------------------------------------------------------------------- */

export function overtimeRecords(
  viewer: User | null,
  offset = 0,
  limit = 20,
): Connection<OvertimeRecord> {
  requireViewer(viewer);
  const items = state.overtimeRecords
    .filter((o) => userInScope(viewer, o.user))
    .sort(
      (a, b) =>
        new Date(b.workDate).getTime() - new Date(a.workDate).getTime(),
    );
  return paginate(items, offset, limit);
}

export function recordOvertime(
  viewer: User | null,
  input: RecordOvertimeInput,
): OvertimeRecord {
  const actor = requirePermission(
    viewer,
    "planning.calendar.view",
    "You do not have permission to record overtime.",
  );
  const target = state.users.find((u) => u.id === input.userId);
  if (!target) throw new MockError("NOT_FOUND", "The employee was not found.");
  if (input.hours <= 0) {
    throw new MockError("VALIDATION_FAILED", "Overtime hours must be positive.");
  }
  const record: OvertimeRecord = {
    id: nextId("ot"),
    user: target,
    workDate: new Date(input.workDate).toISOString(),
    hours: input.hours,
    isApproved: false,
    approvedBy: null,
    approvedAt: null,
    note: input.note ?? null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  state.overtimeRecords.push(record);
  appendAudit(actor, {
    moduleCode: "planning",
    action: "OVERTIME_RECORD",
    resourceType: "OVERTIME",
    resourceId: record.id,
    newData: { hours: input.hours },
  });
  return record;
}

export function reviewOvertime(
  viewer: User | null,
  input: ReviewOvertimeInput,
): OvertimeRecord {
  const actor = requirePermission(
    viewer,
    "planning.leave.approve",
    "You do not have permission to review overtime.",
  );
  const record = state.overtimeRecords.find((o) => o.id === input.overtimeId);
  if (!record) throw new MockError("NOT_FOUND", "The overtime record was not found.");
  if (record.isApproved) {
    throw new MockError("CONFLICT", "This overtime record is already approved.");
  }
  if (input.decision === "APPROVED") {
    record.isApproved = true;
    record.approvedBy = actor;
    record.approvedAt = nowIso();
    // Feed the OT hours fund backing TOIL (8 hours = 1 day).
    state.leaveBalanceEntries.push({
      id: nextId("bal"),
      user: record.user,
      leaveCode: "TOIL",
      entryType: "ACCRUAL",
      deltaDays: Math.round((record.hours / 8) * 100) / 100,
      periodYear: CURRENT_YEAR,
      referenceType: "OVERTIME",
      referenceId: record.id,
      note: `${record.hours}h overtime approved.`,
      createdBy: actor,
      createdAt: nowIso(),
    });
  }
  record.updatedAt = nowIso();
  appendAudit(actor, {
    moduleCode: "planning",
    action: "OVERTIME_REVIEW",
    resourceType: "OVERTIME",
    resourceId: record.id,
    newData: { decision: input.decision },
  });
  return record;
}

/* -------------------------------------------------------------------------- */
/* Print / export (mock results)                                              */
/* -------------------------------------------------------------------------- */

export function printLeaveRequest(
  viewer: User | null,
  leaveRequestId: string,
): MockExportDescriptor {
  const actor = requirePermission(
    viewer,
    "planning.print_export",
    "You do not have permission to print leave requests.",
  );
  const request = getLeaveRequest(viewer, leaveRequestId);
  if (!request) throw new MockError("NOT_FOUND", "The leave request was not found.");
  appendAudit(actor, {
    moduleCode: "planning",
    action: "LEAVE_PRINT",
    resourceType: "LEAVE",
    resourceId: request.id,
  });
  return buildExportResult({
    fileName: `leave-request-${request.id}.pdf`,
    format: "PDF",
    scopeNote: "A4 form with signature placeholder",
  });
}

export function printAttendanceCalendar(
  viewer: User | null,
  input: { departmentId?: string; fromDate: string; toDate: string },
): MockExportDescriptor {
  const actor = requirePermission(
    viewer,
    "planning.print_export",
    "You do not have permission to print attendance calendars.",
  );
  const role = primaryRole(viewer);
  const scopeNote =
    role === "EMPLOYEE"
      ? "Personal calendar"
      : role === "DEPT_HEAD"
        ? "Department calendar"
        : "Company calendar";
  appendAudit(actor, {
    moduleCode: "planning",
    action: "ATTENDANCE_CALENDAR_PRINT",
    resourceType: "ATTENDANCE",
  });
  return buildExportResult({
    fileName: `attendance-calendar-${CURRENT_YEAR}-${String(CURRENT_MONTH).padStart(2, "0")}.pdf`,
    format: "PDF",
    scopeNote: `${scopeNote} — A4 landscape`,
  });
}

export function exportAttendance(
  viewer: User | null,
  filter: AttendanceFilter = {},
  format: "XLSX" | "CSV" = "XLSX",
): MockExportDescriptor {
  const actor = requirePermission(
    viewer,
    "planning.print_export",
    "You do not have permission to export attendance data.",
  );
  const count = applyAttendanceFilter(
    state.attendanceRecords.filter((r) => attendanceInScope(viewer, r)),
    filter,
  ).length;
  const role = primaryRole(viewer);
  const scopeNote =
    role === "EMPLOYEE"
      ? "Personal records (AL/TOIL)"
      : role === "DEPT_HEAD"
        ? "Department records"
        : "Company records";
  appendAudit(actor, {
    moduleCode: "planning",
    action: "ATTENDANCE_EXPORT",
    resourceType: "ATTENDANCE",
    newData: { count, format },
  });
  return buildExportResult({
    fileName: `attendance-balances-${CURRENT_YEAR}-${String(CURRENT_MONTH).padStart(2, "0")}.${format.toLowerCase()}`,
    format,
    scopeNote: `${scopeNote} (${count} rows)`,
  });
}
