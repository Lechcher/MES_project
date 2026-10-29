/**
 * Audit filter-variable tests.
 *
 * Covers the department's presence in the filter for the grain that narrows by
 * it and, critically, that an absent and an empty-string department produce
 * identical variables — otherwise the per-department grain would narrow every
 * row away, or a department id would leak into a grain that must not be
 * narrowed. The filter names the months it covers, so the read carries the
 * same period model as every other Performance read.
 */

import { describe, expect, test } from "bun:test";
import { auditFilterVariables } from "./audit-filter";

const PERIOD = { periodYear: 2026, periodMonth: 5 };

describe("audit filter variables", () => {
  test("an absent department leaves the filter company-wide", () => {
    const variables = auditFilterVariables(PERIOD);
    expect(variables.filter).toEqual({
      months: [{ periodYear: 2026, periodMonth: 5 }],
    });
    expect("departmentId" in variables.filter).toBe(false);
  });

  test("an empty-string department is the same as no department", () => {
    // The schema distinguishes "no filter" from "this department"; an empty id
    // would narrow every row away, so it must not reach the filter.
    expect(auditFilterVariables(PERIOD, "")).toEqual(
      auditFilterVariables(PERIOD),
    );
    expect(auditFilterVariables(PERIOD, "")).toEqual(
      auditFilterVariables(PERIOD, null),
    );
  });

  test("a present department narrows the filter", () => {
    const variables = auditFilterVariables(PERIOD, "d-1");
    expect(variables.filter).toEqual({
      months: [{ periodYear: 2026, periodMonth: 5 }],
      departmentId: "d-1",
    });
  });

  test("the period is carried through untouched", () => {
    for (const [periodYear, periodMonth] of [
      [2026, 1],
      [2026, 12],
      [2027, 5],
    ]) {
      const variables = auditFilterVariables({ periodYear, periodMonth });
      expect(variables.filter.months).toHaveLength(1);
      expect(variables.filter.months[0].periodYear).toBe(periodYear);
      expect(variables.filter.months[0].periodMonth).toBe(periodMonth);
    }
  });

  test("ordering and paging stay fixed for every read", () => {
    const variables = auditFilterVariables(PERIOD, "d-1");
    expect(variables.orderBy).toBe("TOTAL_KPI_SCORE_DESC");
    expect(variables.offset).toBe(0);
    expect(variables.limit).toBe(200);
  });

  test("the limit is overridable", () => {
    expect(auditFilterVariables(PERIOD, undefined, 10).limit).toBe(10);
  });
});
