/**
 * Authentication tests.
 *
 * Covers login/logout/session management through the sign-in page.
 */

import { expect, test } from "../fixtures/auth";

test("login with valid credentials redirects to dashboard", async ({
  loginPage,
}) => {
  await loginPage.login("demo@mes.local", "demo-password");
  await expect(loginPage.page).not.toHaveURL(/\/signin/);
});

test("login with invalid credentials shows error", async ({ loginPage }) => {
  await loginPage.login("invalid@example.local", "wrong-password");
  await expect(loginPage.errorMessage).toBeVisible();
});
