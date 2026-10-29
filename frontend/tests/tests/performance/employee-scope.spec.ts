/**
 * Performance audit scope by role.
 *
 * A separate file from `kpi.spec.ts`, because Playwright's session lives in
 * the browser context and `LoginPage.login()` does not clear it — the shared
 * HR session there cannot be swapped for an employee mid-file. Each file
 * authenticates one viewer.
 */

import { expect, test } from "../../fixtures";
import {
  callsTo,
  monthKey,
  monthsOf,
  PerformanceDashboardPage,
} from "../../pages/performance/dashboard";

/**
 * An employee reads only their own summary, so the per-department employee
 * grain is never offered to them.
 */
const EMPLOYEE = {
  email: "employee@mes.local",
  password: "MES-dev-seed-2026!",
};

test.beforeEach(async ({ loginPage }) => {
  // `LoginPage.login` fills the form without navigating, so the sign-in page
  // has to be opened first.
  await loginPage.goto();
  await loginPage.login(EMPLOYEE.email, EMPLOYEE.password);
});

test("an employee is not offered the per-department scope", async ({
  page,
}) => {
  const perf = new PerformanceDashboardPage(page);
  await perf.goto();
  await perf.openAudit();

  // The scope selector is disabled for a personal-scoped viewer, so no grain
  // across companies, departments, or one department can be chosen at all.
  await expect(perf.scopeSelect).toBeDisabled();
  await expect(perf.departmentSelect).toHaveCount(0);
});

test("the employee's audit table shows only their own row, with their role", async ({
  page,
}) => {
  const perf = new PerformanceDashboardPage(page);
  await perf.goto();
  await perf.openAudit();

  // Their scope authorizes their own row and nothing else.
  await expect(perf.detailRows()).toHaveCount(1);
  await expect(perf.roleColumnHeader).toBeVisible();
  await expect(perf.roleCells().first()).toHaveText("Employee");
});

test("the period picker changes what the employee's row covers", async ({
  page,
}) => {
  const perf = new PerformanceDashboardPage(page);
  const calls = perf.recordGraphQL();
  await perf.goto();

  const labels = await perf.addPeriods(2);
  expect(labels.length).toBeGreaterThan(1);

  // The employee's own dashboard reads the whole selection in one request.
  const dashboards = callsTo(calls, "PersonalKpiDashboard");
  expect(dashboards.length).toBeGreaterThan(0);
  expect(monthsOf(dashboards[dashboards.length - 1])).toHaveLength(
    labels.length,
  );

  // The audit surface reads the same months, one request per month.
  await perf.openAudit();
  const auditMonths = [
    ...new Set(
      callsTo(calls, "PersonalKpiDashboard").flatMap(monthsOf).map(monthKey),
    ),
  ];
  expect(auditMonths).toHaveLength(labels.length);
});
