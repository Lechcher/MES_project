/**
 * Performance audit scope for a Department Head.
 *
 * A separate file from `kpi.spec.ts`, because Playwright's session lives in
 * the browser context and `LoginPage.login()` does not clear it — the shared
 * HR session there cannot be swapped for another role mid-file. Each file
 * authenticates one viewer.
 */

import { expect, test } from "../../fixtures";
import { PerformanceDashboardPage } from "../../pages/performance/dashboard";

/**
 * A Department Head's rows are confined to their own department by the server,
 * so the department selector must be visible but not changeable.
 */
const DEPT_HEAD = {
  email: "dept.head@mes.local",
  password: "MES-dev-seed-2026!",
};

test.beforeEach(async ({ loginPage }) => {
  // `LoginPage.login` fills the form without navigating, so the sign-in page
  // has to be opened first.
  await loginPage.goto();
  await loginPage.login(DEPT_HEAD.email, DEPT_HEAD.password);
});

test("a department head's department selector is disabled", async ({
  page,
}) => {
  const perf = new PerformanceDashboardPage(page);
  await perf.goto();
  await perf.openAudit();

  // The grain is offered, because Level 3 is authorized for this role.
  await perf.selectScope("employees-in-department");

  // Visible so the viewer can see which department their rows are scoped to,
  // but not changeable — the server forces it.
  await expect(perf.departmentSelect).toBeVisible();
  await expect(perf.departmentSelect).toBeDisabled();
});
