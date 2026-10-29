/**
 * Technical-role gate tests.
 *
 * The gate decides which roles may see codes as content on the technical
 * surfaces (Org Structure, RBAC, System Audit Logs, Audit Log). Every other
 * role reads the natural-language view.
 */

import { describe, expect, test } from "bun:test";
import {
  auditScopeFor,
  canWriteSchedule,
  isTechnicalViewer,
  ROLE_CODES,
} from "./access";

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

describe("auditScopeFor", () => {
  test("company-wide roles read all three grains and choose any department", () => {
    for (const role of ["SUPER_ADMIN", "TECH_LEAD", "HR_MANAGER"] as const) {
      expect(auditScopeFor(role)).toEqual({
        scopes: ["company", "department", "employees-in-department"],
        companySource: "level1",
        departmentSource: "level2",
        employeeListSource: "level3",
        canChooseDepartment: true,
      });
    }
  });

  test("a department head reads only their own department's employees", () => {
    expect(auditScopeFor("DEPT_HEAD")).toEqual({
      scopes: ["company", "employees-in-department"],
      companySource: "level3",
      departmentSource: null,
      employeeListSource: "level3",
      // The server forces their department, so the selector must be disabled.
      canChooseDepartment: false,
    });
  });

  test("an employee reads only their own summary and selects no scope", () => {
    expect(auditScopeFor("EMPLOYEE")).toEqual({
      scopes: [],
      companySource: "personal",
      departmentSource: null,
      employeeListSource: null,
      canChooseDepartment: false,
    });
  });

  test("no viewer falls back to the personal scope", () => {
    expect(auditScopeFor(null)).toEqual({
      scopes: [],
      companySource: "personal",
      departmentSource: null,
      employeeListSource: null,
      canChooseDepartment: false,
    });
  });

  test("every role reaches the audit surface with an authorized row source", () => {
    for (const role of ROLE_CODES) {
      const scope = auditScopeFor(role);
      // The surface is never gated; the contract only limits the rows.
      expect(
        scope.companySource,
        `${role} has no company row source`,
      ).toBeTruthy();
      expect(scope.scopes.length).toBeLessThanOrEqual(3);
    }
  });

  test("only a role with a per-department read is offered that scope", () => {
    for (const role of ROLE_CODES) {
      const scope = auditScopeFor(role);
      const offersList = scope.scopes.includes("employees-in-department");
      // The scope may only be offered where an authorized read backs it.
      expect(offersList).toBe(scope.employeeListSource !== null);
      // Choosing a department implies the read is not restricted to one.
      if (scope.canChooseDepartment) {
        expect(scope.employeeListSource).toBe("level3");
      }
    }
  });
});
