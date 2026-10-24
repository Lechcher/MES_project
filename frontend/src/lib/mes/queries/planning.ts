/**
 * Planning & Attendance GraphQL operations (`API_CONTACT_SPECIFICATION.md`
 * §6.2 and the print/export operations in §7.2).
 */

import { DEPARTMENT_BRIEF, EXPORT_RESULT_FIELDS, USER_BRIEF } from "./common";
import { TASK_SUMMARY_FIELDS } from "./jobs";

export const MATRIX_CALENDAR_QUERY = /* GraphQL */ `
  query MatrixCalendar($input: MatrixCalendarInput!) {
    matrixCalendar(input: $input) {
      fromDate
      toDate
      department {
        ${DEPARTMENT_BRIEF}
      }
      rows {
        user {
          ${USER_BRIEF}
          roles {
            id
            code
            name
          }
        }
        days {
          workDate
          state
          progressPercentage
          leaveCode
          isLate
          isEarlyLeave
        }
      }
    }
  }
`;

export const ATTENDANCE_RECORDS_QUERY = /* GraphQL */ `
  query AttendanceRecords($filter: AttendanceFilter, $offset: Int, $limit: Int) {
    attendanceRecords(filter: $filter, offset: $offset, limit: $limit) {
      nodes {
        id
        workDate
        checkIn
        checkOut
        isLate
        isEarlyLeave
        leaveCode
        workingHours
        user {
          ${USER_BRIEF}
        }
      }
      pageInfo {
        offset
        limit
        totalCount
        hasNextPage
      }
    }
  }
`;

export const LEAVE_REQUESTS_QUERY = /* GraphQL */ `
  query LeaveRequests($filter: LeaveRequestFilter, $offset: Int, $limit: Int) {
    leaveRequests(filter: $filter, offset: $offset, limit: $limit) {
      nodes {
        id
        leaveCode
        startDate
        endDate
        totalDays
        reason
        status
        approvedAt
        createdAt
        user {
          ${USER_BRIEF}
        }
        handoverUser {
          ${USER_BRIEF}
        }
        approvedBy {
          ${USER_BRIEF}
        }
        attachments {
          id
          url
          fileName
          mimeType
        }
      }
      pageInfo {
        offset
        limit
        totalCount
        hasNextPage
      }
    }
  }
`;

export const LEAVE_BALANCES_QUERY = /* GraphQL */ `
  query LeaveBalances($userId: ID) {
    leaveBalances(userId: $userId) {
      leaveCode
      leaveName
      balanceDays
      user {
        ${USER_BRIEF}
      }
    }
  }
`;

export const OVERTIME_RECORDS_QUERY = /* GraphQL */ `
  query OvertimeRecords($offset: Int, $limit: Int) {
    overtimeRecords(offset: $offset, limit: $limit) {
      nodes {
        id
        workDate
        hours
        isApproved
        note
        user {
          ${USER_BRIEF}
        }
        approvedBy {
          ${USER_BRIEF}
        }
      }
      pageInfo {
        offset
        limit
        totalCount
        hasNextPage
      }
    }
  }
`;

/* ──────────────────────────── Mutations ─────────────────────────── */

export const REGISTER_LEAVE_MUTATION = /* GraphQL */ `
  mutation RegisterLeave($input: RegisterLeaveInput!) {
    registerLeave(input: $input) {
      id
      leaveCode
      startDate
      endDate
      totalDays
      reason
      status
      createdAt
    }
  }
`;

export const REVIEW_LEAVE_MUTATION = /* GraphQL */ `
  mutation ReviewLeave($input: ReviewLeaveInput!) {
    reviewLeave(input: $input) {
      id
      leaveCode
      startDate
      endDate
      totalDays
      status
      approvedAt
      user {
        ${USER_BRIEF}
      }
    }
  }
`;

export const ASSIGN_PENALTY_LEAVE_MUTATION = /* GraphQL */ `
  mutation AssignPenaltyLeave($input: AssignPenaltyLeaveInput!) {
    assignPenaltyLeave(input: $input) {
      id
      workDate
      leaveCode
      isLate
      isEarlyLeave
      user {
        ${USER_BRIEF}
      }
    }
  }
`;

export const RECORD_OVERTIME_MUTATION = /* GraphQL */ `
  mutation RecordOvertime($input: RecordOvertimeInput!) {
    recordOvertime(input: $input) {
      id
      workDate
      hours
      isApproved
      note
    }
  }
`;

export const REVIEW_OVERTIME_MUTATION = /* GraphQL */ `
  mutation ReviewOvertime($input: ReviewOvertimeInput!) {
    reviewOvertime(input: $input) {
      id
      workDate
      hours
      isApproved
    }
  }
`;

/* ───────────────────────── Print / export ───────────────────────── */

export const PRINT_LEAVE_REQUEST_MUTATION = /* GraphQL */ `
  mutation PrintLeaveRequest($leaveRequestId: ID!) {
    printLeaveRequest(leaveRequestId: $leaveRequestId) {
      ${EXPORT_RESULT_FIELDS}
    }
  }
`;

export const PRINT_ATTENDANCE_CALENDAR_MUTATION = /* GraphQL */ `
  mutation PrintAttendanceCalendar($input: MatrixCalendarInput!) {
    printAttendanceCalendar(input: $input) {
      ${EXPORT_RESULT_FIELDS}
    }
  }
`;

export const EXPORT_ATTENDANCE_MUTATION = /* GraphQL */ `
  mutation ExportAttendance($filter: AttendanceFilter, $format: ExportFormat) {
    exportAttendance(filter: $filter, format: $format) {
      ${EXPORT_RESULT_FIELDS}
    }
  }
`;

/* ───────────────────────── Planning Schedule ───────────────────────── */

export const SCHEDULED_TASKS_QUERY = /* GraphQL */ `
  query ScheduledTasks($input: ScheduleInput!) {
    scheduledTasks(input: $input) {
      ${TASK_SUMMARY_FIELDS}
    }
  }
`;

export const UPDATE_TASK_MUTATION = /* GraphQL */ `
  mutation UpdateTask($input: UpdateTaskInput!) {
    updateTask(input: $input) {
      ${TASK_SUMMARY_FIELDS}
    }
  }
`;

export const DELETE_TASK_MUTATION = /* GraphQL */ `
  mutation DeleteTask($taskId: ID!) {
    deleteTask(taskId: $taskId)
  }
`;

export const DUPLICATE_TASK_MUTATION = /* GraphQL */ `
  mutation DuplicateTask($input: DuplicateTaskInput!) {
    duplicateTask(input: $input) {
      ${TASK_SUMMARY_FIELDS}
    }
  }
`;

export const PREVIEW_TASK_IMPORT_MUTATION = /* GraphQL */ `
  mutation PreviewTaskImport($file: ImportFileInput!) {
    previewTaskImport(file: $file) {
      rows {
        line
        values
        errors
      }
      validCount
      errorCount
    }
  }
`;

export const COMMIT_TASK_IMPORT_MUTATION = /* GraphQL */ `
  mutation CommitTaskImport($file: ImportFileInput!) {
    commitTaskImport(file: $file) {
      id
    }
  }
`;

export const EXPORT_SCHEDULE_MUTATION = /* GraphQL */ `
  mutation ExportSchedule($input: ScheduleInput!, $format: ExportFormat) {
    exportSchedule(input: $input, format: $format) {
      ${EXPORT_RESULT_FIELDS}
    }
  }
`;

export const TASK_IMPORT_TEMPLATE_MUTATION = /* GraphQL */ `
  mutation TaskImportTemplate($format: ExportFormat) {
    taskImportTemplate(format: $format) {
      ${EXPORT_RESULT_FIELDS}
    }
  }
`;
