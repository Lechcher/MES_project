/**
 * Audit filter variables.
 *
 * Pure so the filter shape is unit-testable without data: the department is a
 * narrowing input for one grain only, and it must never leak into the read of a
 * different grain, where it would silently change what the surface means.
 */

import type { AuditPeriod } from "@/lib/mes/audit-period";

/**
 * The variables `KPI_AUDIT_QUERY`'s documents take.
 *
 * The index signature lets this shape satisfy `graphqlRequest`'s
 * `Record<string, unknown>` variables without a cast at every call site.
 */
export interface AuditFilterVariables {
  [variable: string]: unknown;
  filter: {
    months: { periodYear: number; periodMonth: number }[];
    departmentId?: string;
  };
  orderBy: "TOTAL_KPI_SCORE_DESC";
  offset: number;
  limit: number;
}

/**
 * The filter variables for one period's audit read.
 *
 * The filter names the months it covers, so the read carries the same month
 * list every other Performance read takes. The audit surface still issues one
 * read per month and merges the rows itself.
 *
 * `departmentId` is included only when it is a non-empty string. An absent
 * department and an empty-string department must produce the same variables,
 * because the schema distinguishes "no department filter" from "this
 * department" and an empty id would otherwise narrow every row away.
 */
export function auditFilterVariables(
  period: AuditPeriod,
  departmentId?: string | null,
  limit = 200,
): AuditFilterVariables {
  const narrowing =
    typeof departmentId === "string" && departmentId.length > 0
      ? departmentId
      : undefined;

  const month = {
    periodYear: period.periodYear,
    periodMonth: period.periodMonth,
  };

  return {
    filter: narrowing
      ? {
          months: [month],
          departmentId: narrowing,
        }
      : {
          months: [month],
        },
    orderBy: "TOTAL_KPI_SCORE_DESC",
    offset: 0,
    limit,
  };
}
