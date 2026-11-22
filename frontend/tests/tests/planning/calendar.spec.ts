/**
 * Planning calendar tests.
 *
 * Covers the planning tabs, week navigation on the schedule toolbar, the
 * scheduling of the seeded tickets, and creating a task from the calendar.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "../../fixtures";
import { PlanningCalendarPage } from "../../pages/planning/calendar";
import { SchedulePage } from "../../pages/planning/schedule";

// A manager-role account: the seeded demo accounts are the only sign-in
// credentials the dev stack knows, and the company scope sees every row.
const PLANNER = {
  email: "hr.manager@mes.local",
  password: "MES-dev-seed-2026!",
};

// The week the seeded multi-lane tickets live in (02–20/11/2026 in the dev
// data); the default view follows "today", which drifts past them.
const BUSY_WEEK = { from: "09/11/2026", to: "15/11/2026" };

/** The `from` range param the toolbar's navigation writes to the URL. */
function rangeFrom(page: Page): string | null {
  return new URL(page.url()).searchParams.get("from");
}

/** Whole days between two `YYYY-MM-DD` values. */
function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00`);
  const to = new Date(`${toIso}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** Pick a day in one of the form's calendar pickers, by its `YYYY-MM-DD`. */
async function pickDay(page: Page, triggerId: string, isoDay: string) {
  await page.locator(`#${triggerId}`).click();
  const popover = page.locator("[data-slot=popover-content]");
  await expect(popover).toBeVisible();
  const [year, month, day] = isoDay.split("-");
  const dayButton = popover.locator(
    `button[data-day="${Number(month)}/${Number(day)}/${year}"]`,
  );
  // The picker opens on the current month; step toward the target month.
  const now = new Date();
  const target = new Date(Number(year), Number(month) - 1, 1);
  const current = new Date(now.getFullYear(), now.getMonth(), 1);
  const nav = target < current ? /previous month/i : /next month/i;
  for (let guard = 0; guard < 24; guard += 1) {
    if ((await dayButton.count()) > 0) break;
    await popover.getByRole("button", { name: nav }).click();
  }
  await dayButton.first().click();
}

test("navigate between calendar tabs", async ({ page, loginPage }) => {
  await loginPage.goto();
  await loginPage.login(PLANNER.email, PLANNER.password);

  const calendarPage = new PlanningCalendarPage(page);
  await calendarPage.goto();
  await calendarPage.openCalendar();

  await calendarPage.openLeave();
  await expect(
    calendarPage.page.getByRole("tab", { name: /leave/i }),
  ).toHaveAttribute("aria-selected", "true");

  await calendarPage.openAttendance();
  await expect(
    calendarPage.page.getByRole("tab", { name: /attendance/i }),
  ).toHaveAttribute("aria-selected", "true");
});

test("the toolbar steps the visible week and returns to today", async ({
  page,
  loginPage,
}) => {
  await loginPage.goto();
  await loginPage.login(PLANNER.email, PLANNER.password);

  const calendarPage = new PlanningCalendarPage(page);
  await calendarPage.goto();
  await calendarPage.openCalendar();

  // One step back writes the previous week into the URL; one step forward
  // lands a week later, and Today returns to the week that holds today.
  await calendarPage.previousRange();
  const previous = rangeFrom(page);
  expect(previous).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  await calendarPage.nextRange();
  const next = rangeFrom(page);
  expect(daysBetween(previous ?? "", next ?? "")).toBe(7);

  await calendarPage.todayRange();
  expect(rangeFrom(page)).toBe(next);
});

test("the schedule draws the seeded tickets in the chosen week", async ({
  page,
  loginPage,
}) => {
  await loginPage.goto();
  await loginPage.login(PLANNER.email, PLANNER.password);

  const calendarPage = new PlanningCalendarPage(page);
  const schedule = new SchedulePage(page);
  await calendarPage.goto();
  await calendarPage.openCalendar();

  // Open the seeded week through the toolbar's calendar picker: the grid
  // schedules every ticket whose dates the window covers.
  await schedule.openRange(BUSY_WEEK.from, BUSY_WEEK.to);
  const codes = await calendarPage.scheduledTaskCodes();
  expect(codes.length).toBeGreaterThan(0);
  expect(codes).toContain("T-0120");
});

test("a task created from the calendar lands on the grid", async ({
  page,
  loginPage,
}) => {
  await loginPage.goto();
  await loginPage.login(PLANNER.email, PLANNER.password);

  const calendarPage = new PlanningCalendarPage(page);
  const schedule = new SchedulePage(page);
  await calendarPage.goto();
  await calendarPage.openCalendar();
  await schedule.openRange(BUSY_WEEK.from, BUSY_WEEK.to);

  // Create a one-day task inside the week through the toolbar's editor.
  await schedule.openEditorFromNew();
  await schedule.selectCategory("DAILY");
  await pickDay(page, "task-day", "2026-11-12");
  await schedule.dialog.getByLabel(/title/i).fill("E2E calendar task");
  await schedule.save();

  // The new task is scheduled as a bar carrying its title.
  const bar = page.locator(
    '[data-task-type][role=button][title*="E2E calendar task"]',
  );
  await expect(bar).toBeVisible();
});
