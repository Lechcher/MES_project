/**
 * Schedule interaction checks that must survive the bar and row rework:
 * drag-to-move, the overflow menu, and the import/export actions.
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

test("the overflow menu still opens on a light bar", async ({ page }) => {
  const schedule = new SchedulePage(page);
  await schedule.goto();

  const bar = schedule.ticketBars.first();
  await bar.hover();
  await bar.getByRole("button", { name: /task actions/i }).click();
  await expect(page.getByRole("menuitem", { name: /^open$/i })).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: /^duplicate$/i }),
  ).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /^delete$/i })).toBeVisible();
});

test("the toolbar still offers import, export and print", async ({ page }) => {
  const schedule = new SchedulePage(page);
  await schedule.goto();

  for (const name of [/import/i, /export/i, /print/i, /new task/i]) {
    await expect(page.getByRole("button", { name })).toBeVisible();
  }
});

test("the drag handle is still registered on a lane bar", async ({ page }) => {
  const schedule = new SchedulePage(page);
  await schedule.goto();

  // A draggable bar (writer scope) carries the grab cursor.
  const bar = schedule.ticketBars.first();
  const cursor = await bar.evaluate((node) => getComputedStyle(node).cursor);
  expect(["grab", "grabbing"]).toContain(cursor);
});
