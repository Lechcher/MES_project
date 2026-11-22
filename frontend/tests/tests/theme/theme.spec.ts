/**
 * Theme (appearance) selection tests.
 *
 * Covers the requirements in `openspec/changes/add-dark-mode-theme-selector/specs/frontend/theme-selection/spec.md`:
 * the selector's three modes and its reachability for every role, persistence
 * across reload, an explicit choice overriding a forced operating-system
 * scheme, follow-the-system adopting that scheme, and the dark canvas already
 * applying on the first painted frame.
 *
 * Each file authenticates one viewer, because Playwright's session lives in the
 * browser context and `LoginPage.login()` does not clear it — a session cannot
 * be swapped mid-file.
 */

import { expect, test } from "../../fixtures";
import { LoginPage } from "../../pages/login";
import { AppearancePage, THEME_MODES } from "../../pages/theme/appearance";

/** An HR manager reaches every screen and every selector. */
const HR_MANAGER = {
  email: "hr.manager@mes.local",
  password: "MES-dev-seed-2026!",
};

/** One working account per seeded role, all sharing the dev password. */
const ACCOUNTS = [
  HR_MANAGER.email,
  "dept.head@mes.local",
  "employee@mes.local",
] as const;

test.beforeEach(async ({ loginPage }) => {
  // `LoginPage.login` fills the form without navigating, so the sign-in page
  // has to be opened first.
  await loginPage.goto();
  await loginPage.login(HR_MANAGER.email, HR_MANAGER.password);
  // The shell only renders once the session resolves; waiting on a specific
  // route is brittle, because sign-in lands the viewer wherever they were
  // headed. The theme selector itself proves the shell is up.
  await expect(loginPage.page.getByLabel("Theme")).toBeVisible({
    timeout: 20_000,
  });
});

test.describe("Theme selector", () => {
  test("offers exactly follow-the-system, light, and dark", async ({
    page,
  }) => {
    const theme = new AppearancePage(page);
    await theme.page.goto("/jobs");
    await theme.waitForNetworkIdle();

    await theme.themeTrigger().click();
    const options = await page.getByRole("option").allTextContents();
    expect(options).toEqual([...THEME_MODES]);
  });

  test("is reachable in the app shell for every role", async ({
    loginPage,
    browser,
  }) => {
    // The selector is a shell preference, not a role permission, so all three
    // seeded roles must reach it. A fresh context per account, because a
    // logged-in session cannot be swapped mid-file.
    for (const email of ACCOUNTS) {
      const context = await browser.newContext();
      const accountPage = await context.newPage();
      const accountLogin = new LoginPage(accountPage);
      await accountLogin.goto();
      await accountLogin.login(email, HR_MANAGER.password);
      // The shell's own controls prove the session resolved for this account.
      await expect(accountPage.getByLabel("Theme")).toBeVisible({
        timeout: 20_000,
      });
      await accountPage.goto("/jobs");
      await accountPage.waitForLoadState("networkidle");

      const theme = new AppearancePage(accountPage);
      await expect(
        theme.themeTrigger(),
        `theme selector for ${email}`,
      ).toBeVisible();
      await context.close();
    }
    // The outer page still holds the HR session from beforeEach.
    expect(
      await new AppearancePage(loginPage.page).themeTrigger().count(),
    ).toBeGreaterThan(0);
  });

  test("follow-the-system reports the mode chosen, not the theme resolved", async ({
    browser,
  }) => {
    // Nothing is pinned, so the selector keeps showing the mode the viewer
    // picked while the document itself follows the operating system. A forced
    // dark OS makes that split observable: the label stays "Follow system"
    // while the canvas goes dark.
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();

    const login = new LoginPage(page);
    await login.goto();
    await login.login(HR_MANAGER.email, HR_MANAGER.password);
    await expect(page.getByLabel("Theme")).toBeVisible({ timeout: 20_000 });

    const theme = new AppearancePage(page);
    await theme.setThemeCookie("system");
    await page.goto("/jobs");
    await page.waitForLoadState("networkidle");

    const shown = (await theme.themeTrigger().textContent())?.trim() ?? "";
    expect(shown).toContain("Follow system");
    expect(await theme.appliedTheme()).toBe("dark");
    await context.close();
  });
});

test.describe("Theme persistence", () => {
  test("selecting dark and reloading restores dark", async ({ page }) => {
    const theme = new AppearancePage(page);
    await theme.page.goto("/jobs");
    await theme.waitForNetworkIdle();

    await theme.selectTheme("Dark");
    expect(await theme.appliedTheme()).toBe("dark");
    expect(await theme.canvasIsCharcoal()).toBe(true);

    await theme.page.reload();
    await theme.waitForNetworkIdle();
    // The stored choice survives the reload without the viewer choosing again.
    expect(await theme.appliedTheme()).toBe("dark");
    expect(await theme.canvasIsCharcoal()).toBe(true);
  });

  test("a first-time viewer follows the operating system", async ({
    browser,
    loginPage,
  }) => {
    const theme = new AppearancePage(loginPage.page);
    await theme.clearThemeCookie();
    await theme.page.goto("/jobs");
    await theme.waitForNetworkIdle();

    // The app's default context reports no OS preference, which the schema
    // resolves to light.
    expect(await theme.appliedTheme()).toBe("light");
    expect(await theme.canvasIsWhite()).toBe(true);

    // A fresh, signed-in context forced to dark must come up dark with no
    // cookie of its own.
    const forced = await browser.newContext({ colorScheme: "dark" });
    const forcedPage = await forced.newPage();
    const forcedLogin = new LoginPage(forcedPage);
    await forcedLogin.goto();
    await forcedLogin.login(HR_MANAGER.email, HR_MANAGER.password);
    await expect(forcedPage.getByLabel("Theme")).toBeVisible({
      timeout: 20_000,
    });
    await forcedPage.goto("/jobs");
    await forcedPage.waitForLoadState("networkidle");
    const forcedTheme = new AppearancePage(forcedPage);
    expect(await forcedTheme.appliedTheme()).toBe("dark");
    expect(await forcedTheme.canvasIsCharcoal()).toBe(true);
    await forced.close();
  });
});

test.describe("An explicit choice overrides the operating system", () => {
  test("pinned light holds against a dark operating system", async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();

    // Sign in first so the assertions read the app shell, not the sign-in
    // redirect a protected route would bounce to.
    const login = new LoginPage(page);
    await login.goto();
    await login.login(HR_MANAGER.email, HR_MANAGER.password);
    await expect(page.getByLabel("Theme")).toBeVisible({ timeout: 20_000 });

    const theme = new AppearancePage(page);
    await theme.setThemeCookie("light");
    await page.goto("/jobs");
    await page.waitForLoadState("networkidle");

    expect(await theme.appliedTheme()).toBe("light");
    expect(await theme.canvasIsWhite()).toBe(true);
    await context.close();
  });

  test("pinned dark holds against a light operating system", async ({
    page,
  }) => {
    const theme = new AppearancePage(page);

    await theme.setThemeCookie("dark");
    await theme.page.goto("/jobs");
    await theme.waitForNetworkIdle();

    expect(await theme.appliedTheme()).toBe("dark");
    expect(await theme.canvasIsCharcoal()).toBe(true);
  });

  test("switching back to follow-the-system adopts the forced scheme", async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();

    // A fresh context has no session, so sign in before driving the shell.
    const login = new LoginPage(page);
    await login.goto();
    await login.login(HR_MANAGER.email, HR_MANAGER.password);
    await expect(page.getByLabel("Theme")).toBeVisible({ timeout: 20_000 });

    const theme = new AppearancePage(page);

    // Start pinned light, so the viewer has said what they want.
    await theme.setThemeCookie("light");
    await page.goto("/jobs");
    await page.waitForLoadState("networkidle");
    expect(await theme.appliedTheme()).toBe("light");

    await theme.selectTheme("Follow system");
    // The OS preference is the only thing left to consult, and it reports dark.
    expect(await theme.appliedTheme()).toBe("dark");
    await context.close();
  });
});

test.describe("The dark canvas is applied before first paint", () => {
  test("a stored dark theme paints no light frame", async ({ page }) => {
    const theme = new AppearancePage(page);
    await theme.setThemeCookie("dark");

    // Wait only for the document's own parse, before stylesheets and app
    // bundles settle: the blocking inline script has already run by then, so a
    // light frame the successor failed to prevent reads as `light` here rather
    // than being masked by a later paint.
    await page.goto("/jobs", { waitUntil: "domcontentloaded" });
    expect(await theme.appliedTheme()).toBe("dark");
    expect(await theme.canvasIsCharcoal()).toBe(true);
  });

  test("every app screen renders the dark palette", async ({ page }) => {
    const theme = new AppearancePage(page);
    await theme.setThemeCookie("dark");

    for (const route of [
      "/",
      "/jobs",
      "/planning",
      "/performance",
      "/settings",
      "/signin",
    ]) {
      await theme.page.goto(route);
      await theme.page.waitForLoadState("networkidle");
      expect(await theme.appliedTheme(), `route ${route}`).toBe("dark");

      // No element may still be painting a pure-white surface, which is what a
      // hard-coded light value would leave behind.
      const lightSurfaces = await theme.page.evaluate(
        () =>
          Array.from(document.querySelectorAll("*")).filter(
            (el) =>
              getComputedStyle(el).backgroundColor === "rgb(255, 255, 255)",
          ).length,
      );
      expect(lightSurfaces, `light surface on ${route}`).toBe(0);
    }
  });
});
