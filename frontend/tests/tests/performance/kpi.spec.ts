/**
 * Performance dashboard tests.
 *
 * Covers KPI dashboard viewing and personal dashboard access.
 */

import { expect, test } from "../../fixtures";
import { PerformanceDashboardPage } from "../../pages/performance/dashboard";

test("view the performance dashboard", async ({ page, loginPage }) => {
  await loginPage.login("demo@mes.local", "demo-password");

  const perfPage = new PerformanceDashboardPage(page);
  await perfPage.goto();
  await perfPage.viewKPI();

  const values = await perfPage.kpiValues();
  expect(values.length).toBeGreaterThan(0);
});
