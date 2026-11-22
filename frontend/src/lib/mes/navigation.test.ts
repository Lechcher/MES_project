/**
 * Role-aware navigation tests.
 *
 * The launcher is the only way into the apps once the top-nav link strip is
 * gone (openspec/changes/remove-app-nav-panel-links), so what it offers per
 * role is behavior worth pinning — including the viewer-personal Telegram
 * module, which every authenticated role may open. Settings is special: every
 * authenticated role reaches it for the Account tab, and the technical menus
 * stay where they were.
 */

import { describe, expect, test } from "bun:test";
import {
  appAccessFor,
  appDescriptionFor,
  canViewApp,
  MES_APP_ACCESS,
  MES_APPS,
  MES_MODULE_CODES,
  visibleApps,
} from "./navigation";
import type { MesViewer } from "./session";

function viewer(role: string): MesViewer {
  return {
    id: `u-${role}`,
    userCode: `U-${role}`,
    fullName: role,
    email: `${role}@mes.local`,
    departmentId: null,
    isActive: true,
    roles: [{ code: role, name: role }],
  };
}

const ROLES = [
  "SUPER_ADMIN",
  "TECH_LEAD",
  "HR_MANAGER",
  "DEPT_HEAD",
  "EMPLOYEE",
];

describe("MES_APPS", () => {
  test("carries a descriptor for every module code", () => {
    for (const code of MES_MODULE_CODES) {
      expect(
        MES_APPS.some((app) => app.code === code),
        `${code} has no launcher descriptor`,
      ).toBe(true);
    }
  });

  test("telegram is viewer-personal for every role", () => {
    for (const role of ROLES) {
      expect(appAccessFor(viewer(role), "telegram")).toBe("PERSONAL");
      expect(canViewApp(viewer(role), "telegram")).toBe(true);
    }
  });

  test("telegram appears in every role's launcher", () => {
    for (const role of ROLES) {
      const codes = visibleApps(viewer(role)).map((app) => app.code);
      expect(codes).toContain("telegram");
    }
  });

  test("the employee launcher adds Settings and still hides the technical apps", () => {
    const codes = visibleApps(viewer("EMPLOYEE")).map((app) => app.code);
    expect(codes).toEqual([
      "jobs",
      "planning",
      "performance",
      "settings",
      "telegram",
    ]);
  });

  test("the admin launcher carries every module", () => {
    expect(visibleApps(viewer("SUPER_ADMIN"))).toHaveLength(
      MES_MODULE_CODES.length,
    );
  });
});

describe("settings access", () => {
  test("every authenticated role can open the Settings app", () => {
    for (const role of ROLES) {
      expect(canViewApp(viewer(role), "settings")).toBe(true);
    }
  });

  test("employee and department head reach Settings at the account scope", () => {
    expect(MES_APP_ACCESS.settings.EMPLOYEE).toBe("ACCOUNT_ONLY");
    expect(MES_APP_ACCESS.settings.DEPT_HEAD).toBe("ACCOUNT_ONLY");
  });

  test("HR keeps the user-directory scope", () => {
    expect(MES_APP_ACCESS.settings.HR_MANAGER).toBe("USER_DIRECTORY_ONLY");
  });

  test("the launcher description names the account scope in English", () => {
    const settings = MES_APPS.find((app) => app.code === "settings");
    if (!settings) throw new Error("settings app descriptor missing");
    expect(appDescriptionFor(viewer("EMPLOYEE"), settings)).toBe(
      "Your account only.",
    );
    expect(appDescriptionFor(viewer("SUPER_ADMIN"), settings)).toBe(
      settings.description,
    );
  });

  test("the launcher lists Settings for every role", () => {
    const codes = visibleApps(viewer("EMPLOYEE")).map((app) => app.code);
    expect(codes).toContain("settings");
  });

  test("the other apps keep their documented scopes", () => {
    expect(MES_APP_ACCESS["audit-log"].EMPLOYEE).toBe("HIDDEN");
    expect(MES_APP_ACCESS.jobs.EMPLOYEE).toBe("PERSONAL");
    expect(appAccessFor(viewer("SUPER_ADMIN"), "audit-log")).toBe("ALL");
  });

  test("no viewer sees any app", () => {
    expect(visibleApps(null)).toEqual([]);
    expect(appAccessFor(null, "settings")).toBe("HIDDEN");
  });
});
