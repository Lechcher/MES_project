/**
 * Performance & Audit GraphQL operations (`API_CONTACT_SPECIFICATION.md` §6.3
 * and the print/export operations in §7.2).
 */

import {
  DEPARTMENT_BRIEF,
  EXPORT_RESULT_FIELDS,
  USER_BRIEF,
  USER_BRIEF_WITH_ROLES,
} from "./common";

export const PERSONAL_KPI_DASHBOARD_QUERY = /* GraphQL */ `
  query PersonalKpiDashboard($input: KpiPeriodSelectionInput!) {
    personalKpiDashboard(input: $input) {
      months {
        periodYear
        periodMonth
      }
      totalKpiScore
      monthlyTotals {
        periodYear
        periodMonth
        totalKpiScore
      }
      summary {
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
  query KpiScoreEvents(
    $input: KpiPeriodSelectionInput!
    $offset: Int
    $limit: Int
  ) {
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

/* ────────────────────────────── Audit ───────────────────────────── */

/**
 * The authorized audit row sources, named for the level each one reads.
 *
 * `level1` and `level2` are restricted to `SUPER_ADMIN`/`TECH_LEAD`/
 * `HR_MANAGER`; `level3` additionally serves a `DEPT_HEAD`, scoped to their
 * department server-side. Which source a viewer may read comes from
 * `auditScopeFor` in `./access`.
 */
export type AuditRowSource = "level1" | "level2" | "level3";

const AUDIT_ROW_QUERIES: Record<AuditRowSource, string> = {
  level1: /* GraphQL */ `
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
            ${USER_BRIEF_WITH_ROLES}
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
  `,
  level2: /* GraphQL */ `
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
  `,
  level3: /* GraphQL */ `
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
            ${USER_BRIEF_WITH_ROLES}
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
  `,
};

/**
 * The audit operation for one authorized row source.
 *
 * The audit surface reaches every level through a scope selector, so the three
 * documents are selected by source rather than imported separately — each
 * keeps its own selection set, because the employee rows and the department
 * rows do not share a shape.
 */
export function KPI_AUDIT_QUERY(source: AuditRowSource): string {
  return AUDIT_ROW_QUERIES[source];
}

/** The root field each audit source's rows arrive under. */
export const AUDIT_ROW_FIELDS: Record<AuditRowSource, string> = {
  level1: "kpiAuditLevel1Company",
  level2: "kpiAuditLevel2Department",
  level3: "kpiAuditLevel3Employee",
};

/* ───────────────────────── Print / export ───────────────────────── */

export const PRINT_KPI_REPORT_MUTATION = /* GraphQL */ `
  mutation PrintKpiReport($input: KpiPeriodSelectionInput!) {
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
