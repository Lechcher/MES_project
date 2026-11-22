/**
 * Authentication tests.
 *
 * Covers login/logout/session management through the sign-in page.
 */

import { expect, test } from "../fixtures/auth";

test("login with valid credentials redirects to dashboard", async ({
  loginPage,
}) => {
  await loginPage.goto();
  await loginPage.login("super.admin@mes.local", "MES-dev-seed-2026!");
  await expect(loginPage.page).not.toHaveURL(/\/signin/);
});

test("login with invalid credentials shows error", async ({ loginPage }) => {
  await loginPage.goto();
  await loginPage.emailInput.fill("invalid@example.local");
  await loginPage.passwordInput.fill("wrong-password");
  await loginPage.submitButton.click();
  await expect(loginPage.errorMessage).toBeVisible();
});