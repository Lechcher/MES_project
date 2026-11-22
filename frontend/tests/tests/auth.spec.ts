/**
 * Authentication tests.
 *
 * Covers login/logout/session management through the sign-in page.
 */

import { expect, test } from "../fixtures/auth";

// The seeded super-admin, whose saved storage state global setup wrote.
const SUPER_ADMIN = {
  email: "super.admin@mes.local",
  password: "MES-dev-seed-2026!",
  name: "Alex Morgan",
};

test("login with valid credentials redirects to dashboard", async ({
  loginPage,
}) => {
  await loginPage.goto();
  await loginPage.login(SUPER_ADMIN.email, SUPER_ADMIN.password);
  await expect(loginPage.page).not.toHaveURL(/\/signin/);
});

test("login with invalid credentials shows error", async ({ loginPage }) => {
  await loginPage.goto();
  await loginPage.emailInput.fill("invalid@example.local");
  await loginPage.passwordInput.fill("wrong-password");
  await loginPage.submitButton.click();
  await expect(loginPage.errorMessage).toBeVisible();
});

test("a saved session keeps the viewer signed in", async ({
  authenticatedPage,
}) => {
  // The authenticated fixture starts from the storage state global setup
  // saved, so the app resolves the viewer without a new sign-in.
  await expect(authenticatedPage).not.toHaveURL(/\/signin/);
  await expect(
    authenticatedPage.getByRole("button", { name: /alex morgan/i }),
  ).toBeVisible();
});

test("signing out returns to the sign-in page", async ({ page, loginPage }) => {
  await loginPage.goto();
  await loginPage.login(SUPER_ADMIN.email, SUPER_ADMIN.password);

  // The account menu in the app nav holds the sign-out action.
  await page.getByRole("button", { name: /alex morgan/i }).click();
  await page.getByRole("menuitem", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/signin/);
});
