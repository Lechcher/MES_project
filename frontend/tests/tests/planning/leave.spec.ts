/**
 * Leave management tests.
 *
 * Covers leave registration, viewing, and approval/rejection.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "../../fixtures";
import { PlanningCalendarPage } from "../../pages/planning/calendar";
import { LeaveBoardPage } from "../../pages/planning/leave-board";

// A manager-role account: the seeded demo accounts are the only sign-in
// credentials the dev stack knows, and an approver role is what the leave
// board's decision needs.
const PLANNER = {
  email: "hr.manager@mes.local",
  password: "MES-dev-seed-2026!",
};

/** Local `YYYY-MM-DD`, the date-only shape the form's pickers take. */
function localDay(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

test("navigate to leave board and view requests", async ({
  page,
  loginPage,
}) => {
  await loginPage.goto();
  await loginPage.login(PLANNER.email, PLANNER.password);

  const leavePage = new LeaveBoardPage(page);
  await leavePage.goto();
  await expect(
    leavePage.page.getByRole("tab", { name: /leave/i }),
  ).toHaveAttribute("aria-selected", "true");
  // A seeded pending request is on the board.
  await expect(
    page.getByRole("row", { name: /compassionate leave/i }),
  ).toBeVisible();
});

test("register, approve, and read the leave balance", async ({
  page,
  loginPage,
}) => {
  await loginPage.goto();
  await loginPage.login(PLANNER.email, PLANNER.password);

  const leavePage = new LeaveBoardPage(page);
  // Unique per run: the API has no request delete, so a repeated run's rows
  // would otherwise share this reason.
  const reason = `E2E annual leave ${Date.now()}`;
  await leavePage.goto();

  // Register a request through the Create leave form: the code select, the
  // two calendar pickers, and the reason.
  await leavePage.createLeave();
  await leavePage.selectLeaveCode("Annual Leave");
  await pickDay(page, "leave-start", localDay());
  await pickDay(page, "leave-end", localDay(1));
  await leavePage.reasonInput.fill(reason);
  await leavePage.registerButton.click();
  await expect(leavePage.registeredConfirmation).toBeVisible();

  // Approve the request from the board: its row shows the decision.
  await leavePage.goto();
  const row = page.getByRole("row", { name: new RegExp(reason, "i") });
  await expect(row).toContainText(/pending/i);
  await row.getByRole("button", { name: /^approve$/i }).click();
  await expect(row).toContainText(/approved/i);

  // The attendance tab carries the leave fund the approval draws down.
  const calendarPage = new PlanningCalendarPage(page);
  await calendarPage.openAttendance();
  await expect(
    page.getByRole("heading", { name: /al balance \/ toil balance/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("table").last().locator("tbody tr").first(),
  ).toBeVisible();
});
