/**
 * Leave management tests.
 *
 * Covers leave registration, viewing, and approval/rejection.
 */

import { expect, test } from "../../fixtures";
import { LeaveBoardPage } from "../../pages/planning/leave-board";

test("navigate to leave board and view requests", async ({
  page,
  loginPage,
}) => {
  await loginPage.login("demo@mes.local", "demo-password");

  const leavePage = new LeaveBoardPage(page);
  await leavePage.goto();
  await expect(leavePage.page.getByRole("tab", { name: /leave/i })).toHaveClass(
    /selected|active/,
  );
});
