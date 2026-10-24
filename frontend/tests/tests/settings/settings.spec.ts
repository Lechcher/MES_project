/**
 * Settings tests.
 *
 * Covers settings navigation and modification.
 */

import { test } from "../../fixtures";
import { SettingsPage } from "../../pages/settings/settings";

test("navigate between settings tabs", async ({ page, loginPage }) => {
  await loginPage.login("demo@mes.local", "demo-password");

  const settingsPage = new SettingsPage(page);
  await settingsPage.goto();
  await settingsPage.openOrgStructure();
  await settingsPage.openRBAC();
  await settingsPage.openUserDirectory();
});
