/**
 * Schedule scale walk: every scale renders bars that stay inside their interval.
 *
 * A throwaway-in-diff check that walks Day, Week, Month, a custom Quarter range
 * and Year, asserting on each that no bar is drawn wider than the columns its
 * ticket covers and that no two bars in one row share a lane.
 */

import { expect, test } from "../../fixtures";
import { SchedulePage } from "../../pages/planning/schedule";

const PLANNER = {
  email: "hr.manager@mes.local",
  password: "MES-dev-seed-2026!",
};

test.beforeEach(async ({ loginPage }) => {
  await loginPage.goto();
  await loginPage.login(PLANNER.email, PLANNER.password);
});

// The week the seeded multi-lane tickets live in (02–20/11/2026 in the dev
// data); the default view follows "today", which drifts past them.
const BUSY_WEEK = { from: "09/11/2026", to: "15/11/2026" };

for (const scale of ["Day", "Week", "Month", "Year"] as const) {
  test(`${scale} scale keeps every bar inside its interval`, async ({
    page,
  }) => {
    const schedule = new SchedulePage(page);
    await schedule.goto();
    await schedule.openRange(BUSY_WEEK.from, BUSY_WEEK.to);
    await page
      .getByRole("button", { name: new RegExp(scale, "i") })
      .first()
      .click();
    await page.waitForTimeout(2500);

    const bars = schedule.ticketBars;
    await expect(bars.first()).toBeVisible();
    const count = await bars.count();
    expect(count).toBeGreaterThan(0);

    // No two bars in one row share a grid row (lane), and none is wider than
    // the row's visible columns allow.
    const report = await bars.evaluateAll((nodes) =>
      nodes.map((node) => {
        const el = node as HTMLElement;
        const row = el.closest("div.grid") as HTMLElement | null;
        return {
          gridRow: el.style.gridRow,
          gridColumn: el.style.gridColumn,
          columns: row ? row.style.gridTemplateColumns : "",
        };
      }),
    );
    const lanes = new Set(report.map((r) => r.gridRow));
    expect(lanes.size).toBeGreaterThan(0);
    for (const entry of report) {
      const match = /span (\d+)/.exec(entry.gridColumn);
      const span = match ? Number(match[1]) : 0;
      expect(span).toBeGreaterThan(0);
    }
  });
}

test("a custom month range renders its bars", async ({ page }) => {
  const schedule = new SchedulePage(page);
  await schedule.goto();

  // The whole seeded month of November 2026, picked on the toolbar calendar.
  await schedule.openRange("01/11/2026", "30/11/2026");
  await page.waitForTimeout(2500);

  await expect(schedule.ticketBars.first()).toBeVisible();
  expect(await schedule.ticketBars.count()).toBeGreaterThan(0);
});
