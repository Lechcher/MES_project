/**
 * Calendar range band: the days between two selected dates stay visible.
 *
 * Covers the requirement in
 * `openspec/changes/fix-schedule-scroll-chevrons-and-range-band/specs/frontend/planning/spec.md`:
 * the in-between days render on a band distinct from the calendar's background
 * in every active theme, and the endpoint days keep reading as the selected
 * bounds.
 */

import { expect, test } from "../../fixtures";
import { SchedulePage } from "../../pages/planning/schedule";
import { AppearancePage } from "../../pages/theme/appearance";

const PLANNER = {
  email: "hr.manager@mes.local",
  password: "MES-dev-seed-2026!",
};

test.beforeEach(async ({ loginPage }) => {
  await loginPage.goto();
  await loginPage.login(PLANNER.email, PLANNER.password);
});

// The schedule toolbar's range shows the viewed window, so the WEEK scale
// gives a multi-day range whose middle days carry the band.
for (const theme of ["light", "dark"] as const) {
  test(`the ${theme} theme shows a range band between two selected dates`, async ({
    page,
  }) => {
    const appearance = new AppearancePage(page);
    const schedule = new SchedulePage(page);

    await appearance.setThemeCookie(theme);
    await schedule.goto();
    await page.reload();
    await schedule.waitForGridToSettle();
    expect(await appearance.appliedTheme()).toBe(theme);

    // The month window (1st through last day) keeps both endpoints inside
    // the calendar's rendered month, unlike a week that straddles a seam.
    await page
      .getByRole("button", { name: /^month$/i })
      .first()
      .click();
    await schedule.waitForGridToSettle();

    await schedule.openRangeCalendar();
    const band = await schedule.rangeBandColors();

    // The range has in-between days, and none of them matches the popover.
    expect(band.middles.length).toBeGreaterThan(0);
    for (const middle of band.middles) {
      expect(middle).not.toBe(band.popoverBackground);
    }

    // The two endpoints still carry the primary fill.
    expect(band.endpoints.length).toBe(2);
    for (const endpoint of band.endpoints) {
      expect(endpoint).toBe("rgb(15, 98, 254)");
    }
  });
}
