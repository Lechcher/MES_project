/**
 * Settings tests.
 *
 * Covers settings navigation and modification.
 */

import { test } from "../../fixtures";
import { SettingsPage } from "../../pages/settings/settings";

test("navigate between settings tabs", async ({ page, loginPage }) => {
  await loginPage.goto();
  await loginPage.login("super.admin@mes.local", "MES-dev-seed-2026!");

  const settingsPage = new SettingsPage(page);
  await settingsPage.goto();
  await settingsPage.openOrgStructure();
  await settingsPage.openRBAC();
  await settingsPage.openUserDirectory();
});
