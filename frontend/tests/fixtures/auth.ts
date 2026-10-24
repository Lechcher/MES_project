/**
 * Authentication fixtures for Playwright tests.
 *
 * Provides a logged-in page fixture that reuses a saved storage state, and a
 * login/logout helper for tests that need to manage their own session.
 */

import { test as base, type Page } from "@playwright/test";
import { LoginPage } from "../pages/login";

export type AuthFixtures = {
  loginPage: LoginPage;
  authenticatedPage: Page;
};

/** Extend the base test with auth fixtures. */
export const test = base.extend<AuthFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  authenticatedPage: async ({ browser, storageState }, use) => {
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await use(page);
    await context.close();
  },
});

export { expect } from "@playwright/test";
