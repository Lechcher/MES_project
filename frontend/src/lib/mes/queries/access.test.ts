/**
 * Technical-role gate tests.
 *
 * The gate decides which roles may see codes as content on the technical
 * surfaces (Org Structure, RBAC, System Audit Logs, Audit Log). Every other
 * role reads the natural-language view.
 */

import { describe, expect, test } from "bun:test";
import { canWriteSchedule, isTechnicalViewer } from "./access";

describe("isTechnicalViewer", () => {
  test("true for exactly the two technical roles", () => {
    expect(isTechnicalViewer("TECH_LEAD")).toBe(true);
    expect(isTechnicalViewer("SUPER_ADMIN")).toBe(true);
  });

  test("false for the operational roles and for no viewer", () => {
    expect(isTechnicalViewer("HR_MANAGER")).toBe(false);
    expect(isTechnicalViewer("DEPT_HEAD")).toBe(false);
    expect(isTechnicalViewer("EMPLOYEE")).toBe(false);
    expect(isTechnicalViewer(null)).toBe(false);
  });
});

describe("canWriteSchedule", () => {
  test("company-wide planners write in any department", () => {
    for (const role of ["SUPER_ADMIN", "TECH_LEAD", "HR_MANAGER"] as const) {
      expect(canWriteSchedule(role, "d-b", "d-a")).toBe(true);
    }
  });

  test("department heads write only in their own department", () => {
    expect(canWriteSchedule("DEPT_HEAD", "d-a")).toBe(true);
    expect(canWriteSchedule("DEPT_HEAD", "d-a", "d-a")).toBe(true);
    expect(canWriteSchedule("DEPT_HEAD", "d-a", "d-b")).toBe(false);
    expect(canWriteSchedule("DEPT_HEAD", null, null)).toBe(false);
  });

  test("employees and anonymous viewers never write", () => {
    expect(canWriteSchedule("EMPLOYEE", "d-a", "d-a")).toBe(false);
    expect(canWriteSchedule(null)).toBe(false);
  });
});
