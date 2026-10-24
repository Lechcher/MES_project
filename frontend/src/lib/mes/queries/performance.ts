/**
 * Performance & Audit GraphQL operations (`API_CONTACT_SPECIFICATION.md` §6.3
 * and the print/export operations in §7.2).
 */

import { DEPARTMENT_BRIEF, EXPORT_RESULT_FIELDS, USER_BRIEF } from "./common";

export const PERSONAL_KPI_DASHBOARD_QUERY = /* GraphQL */ `
  query PersonalKpiDashboard($input: KpiPeriodInput!) {
    personalKpiDashboard(input: $input) {
      periodYear
      periodMonth
      totalKpiScore
      summary {
        id
        periodYear
        periodMonth
        totalTasksAssigned
        completedOnTime
        completedUrgentOnTime
        approvedFirstTime
        overdueTasks
        rejectedTasks
        extensionRequestsCount
        attendanceRate
        perfectAttendanceBonus
        unapprovedLeaveCount
        lateEarlyCount
        totalKpiScore
      }
      leaveBalances {
        leaveCode
        leaveName
        balanceDays
      }
      recentEvents {
        id
        ruleCode
        points
        occurredAt
        task {
          id
          taskCode
        }
      }
    }
  }
`;

export const KPI_POINT_RULES_QUERY = /* GraphQL */ `
  query KpiPointRules {
    kpiPointRules {
      code
      event
      points
      description
      isActive
      sortOrder
    }
  }
`;

export const KPI_SCORE_EVENTS_QUERY = /* GraphQL */ `
  query KpiScoreEvents($input: KpiPeriodInput!, $offset: Int, $limit: Int) {
    kpiScoreEvents(input: $input, offset: $offset, limit: $limit) {
      nodes {
        id
        ruleCode
        points
        periodYear
        periodMonth
        occurredAt
        user {
          ${USER_BRIEF}
        }
        task {
          id
          taskCode
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

export const KPI_AUDIT_LEVEL1_QUERY = /* GraphQL */ `
  query KpiAuditLevel1($filter: KpiAuditFilter!, $offset: Int, $limit: Int) {
    kpiAuditLevel1Company(filter: $filter, offset: $offset, limit: $limit) {
      nodes {
        periodYear
        periodMonth
        totalTasksAssigned
        completedOnTime
        overdueTasks
        unapprovedLeaveCount
        perfectAttendanceBonus
        attendanceRate
        totalKpiScore
        user {
          ${USER_BRIEF}
        }
        department {
          ${DEPARTMENT_BRIEF}
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

export const KPI_AUDIT_LEVEL2_QUERY = /* GraphQL */ `
  query KpiAuditLevel2($filter: KpiAuditFilter!) {
    kpiAuditLevel2Department(filter: $filter) {
      nodes {
        periodYear
        periodMonth
        totalEmployees
        totalTasksAssigned
        avgAttendanceRate
        avgDepartmentKpiScore
        department {
          id
          code
          name
          departmentType
          manager {
            ${USER_BRIEF}
          }
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

export const KPI_AUDIT_LEVEL3_QUERY = /* GraphQL */ `
  query KpiAuditLevel3(
    $filter: KpiAuditFilter!
    $orderBy: KpiAuditOrderBy
    $offset: Int
    $limit: Int
  ) {
    kpiAuditLevel3Employee(
      filter: $filter
      orderBy: $orderBy
      offset: $offset
      limit: $limit
    ) {
      nodes {
        periodYear
        periodMonth
        totalTasksAssigned
        completedOnTime
        overdueTasks
        immediateApprovalCount
        returnedCount
        perfectAttendanceBonus
        attendanceRate
        totalKpiScore
        user {
          ${USER_BRIEF}
        }
        department {
          ${DEPARTMENT_BRIEF}
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

/* ───────────────────────── Print / export ───────────────────────── */

export const PRINT_KPI_REPORT_MUTATION = /* GraphQL */ `
  mutation PrintKpiReport($input: KpiPeriodInput!) {
    printKpiReport(input: $input) {
      ${EXPORT_RESULT_FIELDS}
    }
  }
`;

export const EXPORT_AUDIT_WORKBOOK_MUTATION = /* GraphQL */ `
  mutation ExportAuditWorkbook($filter: KpiAuditFilter!) {
    exportAuditWorkbook(filter: $filter) {
      ${EXPORT_RESULT_FIELDS}
    }
  }
`;
