/**
 * Ticket category-date rule tests.
 *
 * Covers the rules the Jobs create form and the schedule share: a `DAILY`
 * ticket is one day with a start and an end, an `HOURLY` ticket is an hour pair
 * inside a single day, `MULTI_DAY` is the only category that spans days, and an
 * interval that does not fit its category is refused rather than saved.
 */

import { expect, test } from "../../fixtures";
import { CreateTicketPage } from "../../pages/jobs/create-ticket";

const PLANNER = {
  email: "hr.manager@mes.local",
  password: "MES-dev-seed-2026!",
};

/** Local `YYYY-MM-DD` for a day offset from today. */
function dayOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The saved dates of a ticket, read back through the API. */
async function savedDates(
  page: import("@playwright/test").Page,
  title: string,
) {
  const result = await page.evaluate(async (wanted) => {
    const query = `
      query Tickets {
        scheduledTasks(input: { departmentId: null, fromDate: "2000-01-01", toDate: "2100-01-01" }) {
          taskCode title taskType state startDate endDate
        }
      }`;
    const response = await fetch("/api/mes/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: {} }),
    });
    const body = await response.json();
    const tasks = body.data?.scheduledTasks ?? [];
    const match = tasks.find(
      (task: { title: string }) => task.title === wanted,
    );
    return match
      ? {
          taskType: match.taskType as string,
          startDate: match.startDate as string | null,
          endDate: match.endDate as string | null,
        }
      : null;
  }, title);
  return result;
}

test.beforeEach(async ({ loginPage }) => {
  // `LoginPage.login` fills the form without navigating, so the sign-in page
  // has to be opened first.
  await loginPage.goto();
  await loginPage.login(PLANNER.email, PLANNER.password);
});

test("a daily ticket is saved with a start and an end on one day", async ({
  page,
}) => {
  const form = new CreateTicketPage(page);
  await form.goto();
  const title = `E2E daily rule ${Date.now()}`;
  await form.titleInput.fill(title);
  await form.selectType("DAILY");
  await form.selectDailySlot("17:00");
  await form.submit();

  // The form routes back to the list once the ticket is created.
  await expect(page).toHaveURL(/\/jobs$/);

  const saved = await savedDates(page, title);
  expect(saved, "the ticket was saved").not.toBeNull();
  if (!saved) return;
  expect(saved.taskType).toBe("DAILY");
  // Both dates are stored, and both fall on the same local day.
  expect(saved.startDate).not.toBeNull();
  expect(saved.endDate).not.toBeNull();
  const start = new Date(saved.startDate as string);
  const end = new Date(saved.endDate as string);
  expect(start.toDateString()).toBe(end.toDateString());
  // The chosen slot survives as the deadline.
  expect(end.getHours()).toBe(17);
  expect(end.getMinutes()).toBe(0);
});

test("an hourly ticket is saved as an hour pair inside one day", async ({
  page,
}) => {
  const form = new CreateTicketPage(page);
  await form.goto();
  const title = `E2E hourly rule ${Date.now()}`;
  await form.titleInput.fill(title);
  await form.selectType("HOURLY");
  await form.submit();

  await expect(page).toHaveURL(/\/jobs$/);

  const saved = await savedDates(page, title);
  expect(saved, "the ticket was saved").not.toBeNull();
  if (!saved) return;
  expect(saved.taskType).toBe("HOURLY");
  expect(saved.startDate).not.toBeNull();
  expect(saved.endDate).not.toBeNull();
  const start = new Date(saved.startDate as string);
  const end = new Date(saved.endDate as string);
  // One day, one hour, and the end after the start.
  expect(end.toDateString()).toBe(start.toDateString());
  expect(end.getTime() - start.getTime()).toBe(60 * 60 * 1000);
});

test("a multi-day ticket covers every day it was given", async ({ page }) => {
  const form = new CreateTicketPage(page);
  await form.goto();
  const title = `E2E multi-day rule ${Date.now()}`;
  await form.titleInput.fill(title);
  await form.selectType("MULTI_DAY");
  await form.fillDay("#ticket-start", dayOffset(-3));
  await form.fillDay("#ticket-end", dayOffset(3));
  await form.submit();

  await expect(page).toHaveURL(/\/jobs$/);

  const saved = await savedDates(page, title);
  expect(saved, "the ticket was saved").not.toBeNull();
  if (!saved) return;
  expect(saved.taskType).toBe("MULTI_DAY");
  const start = new Date(saved.startDate as string);
  const end = new Date(saved.endDate as string);
  // The stored end is the next local midnight, so the ticket reads back as the
  // whole inclusive span.
  expect(start.getHours()).toBe(0);
  expect(end.getHours()).toBe(0);
  expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
});

test("a multi-day range that runs backwards is refused", async ({ page }) => {
  const form = new CreateTicketPage(page);
  await form.goto();
  await form.titleInput.fill(`E2E refused range ${Date.now()}`);
  await form.selectType("MULTI_DAY");
  await form.fillDay("#ticket-start", dayOffset(3));
  await form.fillDay("#ticket-end", dayOffset(-3));
  await form.submit();

  // The form refuses, says why, and stays on the form.
  await expect(page).not.toHaveURL(/\/jobs$/);
  const message = await form.errorText();
  expect(message).toMatch(/do not fit|not after/i);
});
