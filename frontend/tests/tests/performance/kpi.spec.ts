/**
 * Performance KPI and audit tests.
 *
 * Covers the Personal KPI Dashboard with its localized rule names and the
 * score-by-month trend chart, and the merged audit chart and table: the tab
 * every role can open, the scope and time frame selectors, the Role column and
 * its multi-select filter, and the shared multi-select period selection every
 * Performance read follows.
 */

import { expect, test } from "../../fixtures";
import { LoginPage } from "../../pages/login";
import {
  AUDIT_TIME_FRAMES,
  callsTo,
  type GraphQLCall,
  monthKey,
  monthsOf,
  PerformanceDashboardPage,
  type RequestedMonth,
} from "../../pages/performance/dashboard";

// An HR manager reads both audit grains, which the scope switch needs.
const HR_MANAGER = {
  email: "hr.manager@mes.local",
  password: "MES-dev-seed-2026!",
};

/** An employee, whose scope keeps the audit surface to their own row. */
const EMPLOYEE = {
  email: "employee@mes.local",
  password: "MES-dev-seed-2026!",
};

/** The role names the English locale renders a role code with. */
const ROLE_NAMES = [
  "Super Admin",
  "Tech Lead",
  "HR Manager",
  "Department Head",
  "Employee",
];

/** The month names the English locale renders a selected month with. */
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** The month a selected period names, e.g. `October 2026`. */
function monthOf(label: string): RequestedMonth | null {
  const match = /^([A-Z][a-z]+)\s+(\d{4})$/.exec(label.trim());
  if (!match) return null;
  const periodMonth = MONTH_NAMES.indexOf(match[1]) + 1;
  if (periodMonth === 0) return null;
  return { periodYear: Number(match[2]), periodMonth };
}

/** The year a selected period names, e.g. `2026`. */
function yearOf(label: string): number | null {
  const match = /^(\d{4})$/.exec(label.trim());
  return match ? Number(match[1]) : null;
}

/** The distinct months a list of recorded calls asked for. */
function distinctMonths(calls: GraphQLCall[]) {
  return [...new Set(calls.flatMap(monthsOf).map(monthKey))].sort();
}

test.beforeEach(async ({ loginPage }) => {
  // `LoginPage.login` fills the form without navigating, so the sign-in page
  // has to be opened first.
  await loginPage.goto();
  await loginPage.login(HR_MANAGER.email, HR_MANAGER.password);
});

/**
 * An HR manager reads every audit grain, which the scope, department, and
 * time-frame switching cases need.
 */
test.describe("Personal KPI Dashboard", () => {
  test("the dashboard renders for the viewer's role", async ({ page }) => {
    const perf = new PerformanceDashboardPage(page);
    await perf.goto();
    await expect(perf.personalTab).toBeVisible();
    await expect(perf.scoreCard).toBeVisible();
  });

  test("recent KPI events show the rule name, never the code", async ({
    page,
  }) => {
    const perf = new PerformanceDashboardPage(page);
    await perf.goto();

    const rows = perf.detailTable.locator("tbody tr");
    // The rules table is the last one on the personal dashboard.
    await expect(rows.first()).toBeVisible();

    const ruleCells = await page
      .getByRole("table")
      .last()
      .locator("tbody tr td:first-child")
      .allTextContents();
    expect(ruleCells.length).toBeGreaterThan(0);
    for (const cell of ruleCells) {
      expect(cell.trim()).not.toBe("");
      expect(cell).not.toMatch(/^KPI_/);
    }
  });

  test("the score-by-month chart plots and follows the selected period", async ({
    page,
  }) => {
    const perf = new PerformanceDashboardPage(page);
    await perf.goto();

    await expect(perf.trendChart).toBeVisible();
    const before = await perf.chartPixels(perf.trendChart);
    expect(before.length).toBeGreaterThan(0);

    // Widening the period re-reads the dashboard and replots the chart, so
    // the pixels change.
    await perf.addPeriods(1);
    const after = await perf.chartPixels(perf.trendChart);
    expect(after).not.toBe(before);
  });
});

test.describe("Period selection", () => {
  test("several months can be selected and every read covers exactly them", async ({
    page,
  }) => {
    const perf = new PerformanceDashboardPage(page);
    const calls = perf.recordGraphQL();
    await perf.goto();

    // The personal dashboard is the first surface on screen, and it reads the
    // whole selection in one request.
    const labels = await perf.addPeriods(2);
    expect(labels.length).toBeGreaterThan(1);
    await expect(perf.periodChips).toHaveCount(labels.length);

    const expected = labels
      .map(monthOf)
      .filter((month): month is RequestedMonth => month !== null);
    expect(expected).toHaveLength(labels.length);

    const dashboards = callsTo(calls, "PersonalKpiDashboard");
    expect(dashboards.length).toBeGreaterThan(0);
    const requested = monthsOf(dashboards[dashboards.length - 1]);
    expect(requested.map(monthKey).sort()).toEqual(
      expected.map(monthKey).sort(),
    );

    // The audit surface covers the same months, one read per month.
    await perf.openAudit();
    const audits = callsTo(calls, "KpiAuditLevel1");
    expect(distinctMonths(audits)).toEqual(expected.map(monthKey).sort());
  });

  test("several quarters can be selected and expand into their months", async ({
    page,
  }) => {
    const perf = new PerformanceDashboardPage(page);
    const calls = perf.recordGraphQL();
    await perf.goto();
    await perf.openAudit();

    // The frame decides what the picker offers.
    await perf.selectTimeFrame("quarter");
    const labels = await perf.addPeriods(2);
    expect(labels.length).toBeGreaterThan(1);

    // Every quarter covers three months.
    const audits = callsTo(calls, "KpiAuditLevel1");
    expect(distinctMonths(audits)).toHaveLength(labels.length * 3);

    // The personal dashboard reads the same months in one request.
    await perf.openPersonal();
    const dashboards = callsTo(calls, "PersonalKpiDashboard");
    expect(monthsOf(dashboards[dashboards.length - 1])).toHaveLength(
      labels.length * 3,
    );
  });

  test("several years can be selected and expand into their months", async ({
    page,
  }) => {
    const perf = new PerformanceDashboardPage(page);
    const calls = perf.recordGraphQL();
    await perf.goto();
    await perf.openAudit();

    await perf.selectTimeFrame("year");
    const labels = await perf.addPeriods(1);
    expect(labels.length).toBeGreaterThan(1);

    const years = labels
      .map(yearOf)
      .filter((year): year is number => year !== null);
    expect(years).toHaveLength(labels.length);

    // Every year covers twelve months.
    const audits = callsTo(calls, "KpiAuditLevel1");
    expect(distinctMonths(audits)).toHaveLength(labels.length * 12);
    for (const year of years) {
      for (let periodMonth = 1; periodMonth <= 12; periodMonth += 1) {
        expect(distinctMonths(audits)).toContain(`${year}-${periodMonth}`);
      }
    }

    // The personal dashboard reads the same months in one request.
    await perf.openPersonal();
    const dashboards = callsTo(calls, "PersonalKpiDashboard");
    expect(monthsOf(dashboards[dashboards.length - 1])).toHaveLength(
      labels.length * 12,
    );
  });
});

test.describe("Audit chart and table", () => {
  test("every role opens the audit tab and sees one ranking chart", async ({
    page,
  }) => {
    const perf = new PerformanceDashboardPage(page);
    await perf.goto();

    // No role gating: the tab is there without any level-based visibility.
    await perf.openAudit();
    await expect(perf.auditTab).toHaveAttribute("aria-selected", "true");
    await expect(perf.rankingChart).toBeVisible();
  });

  test("the time frame selector offers month, quarter and year only", async ({
    page,
  }) => {
    const perf = new PerformanceDashboardPage(page);
    await perf.goto();
    await perf.openAudit();

    await perf.timeFrameSelect.click();
    for (const frame of AUDIT_TIME_FRAMES) {
      await expect(
        page.getByRole("option", { name: new RegExp(frame, "i") }),
      ).toBeVisible();
    }
    await expect(page.getByRole("option", { name: /week/i })).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("one detail table, and switching the scope switches its grain", async ({
    page,
  }) => {
    const perf = new PerformanceDashboardPage(page);
    await perf.goto();
    await perf.openAudit();

    // Exactly one detail table on the surface.
    await expect(
      page.getByRole("heading", { name: /detail performance kpi score/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: /audit table 1|audit table 2|audit table 3/i,
      }),
    ).toHaveCount(0);

    // Company-wide lists employees; department-wide lists departments.
    await perf.selectScope("company");
    const companyHeaders = await headers(perf);
    expect(companyHeaders).toMatch(/employee name/i);
    expect(companyHeaders).toMatch(/role/i);
    expect(companyHeaders).toMatch(/total tasks/i);
    expect(companyHeaders).not.toMatch(/total employees/i);

    await perf.selectScope("department");
    const departmentHeaders = await headers(perf);
    expect(departmentHeaders).toMatch(/department\/division name/i);
    expect(departmentHeaders).toMatch(/total employees/i);
    expect(departmentHeaders).not.toMatch(/employee name/i);
  });

  test("the time frame changes the rows the table shows", async ({ page }) => {
    const perf = new PerformanceDashboardPage(page);
    await perf.goto();
    await perf.openAudit();

    await perf.selectTimeFrame("month");
    const monthRows = await perf.detailTable
      .locator("tbody tr td:last-child")
      .allTextContents();
    expect(monthRows.length).toBeGreaterThan(0);

    await perf.selectTimeFrame("year");
    await expect(perf.detailTable.locator("tbody tr").first()).toBeVisible();
    // A year aggregates twelve months, so its scores are larger.
    const yearRows = await perf.detailTable
      .locator("tbody tr td:last-child")
      .allTextContents();
    const yearTotal = yearRows.reduce(
      (sum, cell) => sum + (Number(cell) || 0),
      0,
    );
    const monthTotal = monthRows.reduce(
      (sum, cell) => sum + (Number(cell) || 0),
      0,
    );
    expect(yearTotal).toBeGreaterThanOrEqual(monthTotal);
  });

  test("the per-department scope reveals a department selector", async ({
    page,
  }) => {
    const perf = new PerformanceDashboardPage(page);
    await perf.goto();
    await perf.openAudit();

    // The department selector only exists for this one scope.
    await expect(perf.departmentSelect).toHaveCount(0);
    await perf.selectScope("employees-in-department");
    await expect(perf.departmentSelect).toBeVisible();
  });

  test("choosing a department keeps the employee grain and narrows it", async ({
    page,
  }) => {
    const perf = new PerformanceDashboardPage(page);
    await perf.goto();
    await perf.openAudit();
    await perf.selectScope("employees-in-department");

    const before = await rowValues(perf);
    // An exact name, not a prefix: the seeded departments include a longer
    // one whose name starts with the same word.
    await perf.selectDepartment("Engineering");

    // The employee columns survive; only the rows narrow.
    const rows = await headers(perf);
    expect(rows).toMatch(/employee name/i);
    expect(rows).not.toMatch(/total employees/i);
    expect(await rowValues(perf)).not.toEqual(before);
  });
});

test.describe("Role dimension", () => {
  test("the Role column names each row's role, never its code", async ({
    page,
  }) => {
    const perf = new PerformanceDashboardPage(page);
    await perf.goto();
    await perf.openAudit();

    await expect(perf.roleColumnHeader).toBeVisible();

    const cells = await perf.roleCells().allTextContents();
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      const names = cell
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) {
        // A role is named, never coded.
        expect(name).not.toMatch(/^[A-Z][A-Z_]*$/);
        if (name !== "—") expect(ROLE_NAMES).toContain(name);
      }
    }
  });

  test("the role filter narrows the chart and the table", async ({ page }) => {
    const perf = new PerformanceDashboardPage(page);
    await perf.goto();
    await perf.openAudit();

    // The filter is offered only where the authorized rows expose more than
    // one role, so its presence is the case's precondition.
    await expect(perf.rolePicker).toBeVisible();

    const roles = await perf.readRoleOptions();
    expect(roles.length).toBeGreaterThan(1);

    const before = await perf.detailRows().count();
    expect(before).toBeGreaterThan(0);
    const beforePixels = await perf.chartPixels(perf.rankingChart);

    // One role keeps only the rows that hold it.
    await perf.selectRoles([roles[0]]);
    await expect(perf.roleChips).toHaveCount(1);
    const narrowed = await perf.detailRows().count();
    expect(narrowed).toBeLessThan(before);
    for (const cell of await perf.roleCells().allTextContents()) {
      expect(cell).toContain(roles[0]);
    }

    // The chart plots the same narrowed rows, so it is redrawn.
    const afterPixels = await perf.chartPixels(perf.rankingChart);
    expect(afterPixels).not.toBe(beforePixels);

    // A second role widens the selection again.
    await perf.selectRoles([roles[1]]);
    await expect(perf.roleChips).toHaveCount(2);
    await expect(perf.detailRows()).toHaveCount(before);
  });
});

/**
 * The audit surface an employee reaches.
 *
 * The session lives in the browser context, so the shared HR session cannot
 * be swapped for an employee mid-file: the case signs in on a fresh context
 * of its own.
 */
test.describe("An employee's audit surface", () => {
  test("the role picker is not offered and the scope note names the role", async ({
    browser,
    page,
  }) => {
    const context = await browser.newContext({
      baseURL: new URL(page.url()).origin,
    });
    const employeePage = await context.newPage();
    try {
      const login = new LoginPage(employeePage);
      await login.goto();
      await login.login(EMPLOYEE.email, EMPLOYEE.password);

      const perf = new PerformanceDashboardPage(employeePage);
      await perf.goto();
      await perf.openAudit();

      // The employee's own row exposes one role, so there is nothing to
      // narrow and the filter is not offered at all.
      await expect(perf.rolePicker).toHaveCount(0);
      await expect(perf.roleInput).toHaveCount(0);

      // The fixed-scope note names the viewer's role, never its code.
      const note = employeePage.getByText(
        /your data scope limits you to your own rows/i,
      );
      await expect(note).toBeVisible();
      await expect(note).toContainText("Employee");
      await expect(note).not.toContainText("EMPLOYEE");
    } finally {
      await context.close();
    }
  });
});

/** The detail table's column headers as one searchable string. */
async function headers(perf: PerformanceDashboardPage) {
  const cells = await perf.detailTable.locator("thead th").allTextContents();
  return cells.join(" | ");
}

/** The detail table's row identities, so two selections can be compared. */
async function rowValues(perf: PerformanceDashboardPage) {
  return perf.detailTable.locator("tbody tr").allTextContents();
}
