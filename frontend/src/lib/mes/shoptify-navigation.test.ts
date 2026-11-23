import { describe, expect, test } from "bun:test";
import {
  canViewApp,
  MES_APP_ACCESS,
  MES_MODULE_CODES,
  MES_ROLE_CODES,
  type MesViewer,
  visibleApps,
} from "./navigation";

function viewer(role: string): MesViewer {
  return { roles: [{ code: role }] } as unknown as MesViewer;
}

describe("shoptify app registration", () => {
  test("the module code is registered", () => {
    expect(MES_MODULE_CODES).toContain("shoptify");
  });

  test("every role in the matrix has a shoptify entry", () => {
    for (const role of MES_ROLE_CODES) {
      expect(MES_APP_ACCESS.shoptify[role]).toBeDefined();
    }
  });

  test("the launcher shows shoptify exactly for the technical roles", () => {
    expect(canViewApp(viewer("SUPER_ADMIN"), "shoptify")).toBe(true);
    expect(canViewApp(viewer("TECH_LEAD"), "shoptify")).toBe(true);
    expect(canViewApp(viewer("HR_MANAGER"), "shoptify")).toBe(false);
    expect(canViewApp(viewer("DEPT_HEAD"), "shoptify")).toBe(false);
    expect(canViewApp(viewer("EMPLOYEE"), "shoptify")).toBe(false);

    const adminApps = visibleApps(viewer("SUPER_ADMIN")).map((app) => app.code);
    expect(adminApps).toContain("shoptify");

    const employeeApps = visibleApps(viewer("EMPLOYEE")).map((app) => app.code);
    expect(employeeApps).not.toContain("shoptify");
  });

  test("the launcher entry carries its own label and route", () => {
    const entry = visibleApps(viewer("TECH_LEAD")).find(
      (app) => app.code === "shoptify",
    );
    expect(entry).toBeDefined();
    expect(entry?.shortLabel).toBeTruthy();
    expect(entry?.href).toBe("/shoptify");
  });
});
