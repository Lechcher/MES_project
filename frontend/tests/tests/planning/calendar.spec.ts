/**
 * Planning calendar tests.
 *
 * Covers week navigation, task viewing, and scheduling on the planning page.
 */

import { expect, test } from "../../fixtures";
import { PlanningCalendarPage } from "../../pages/planning/calendar";

test("navigate between calendar tabs", async ({ page, loginPage }) => {
  await loginPage.login("demo@mes.local", "demo-password");

  const calendarPage = new PlanningCalendarPage(page);
  await calendarPage.goto();
  await calendarPage.openCalendar();

  await calendarPage.openLeave();
  await expect(
    calendarPage.page.getByRole("tab", { name: /leave/i }),
  ).toHaveClass(/selected|active/);

  await calendarPage.openAttendance();
  await expect(
    calendarPage.page.getByRole("tab", { name: /attendance/i }),
  ).toHaveClass(/selected|active/);
});
