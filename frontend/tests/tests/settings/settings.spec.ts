/**
 * Settings tests.
 *
 * Covers settings navigation and modification.
 */

import { expect, test } from "../../fixtures";
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

test("a saved setting persists across a reload", async ({
  page,
  loginPage,
}) => {
  await loginPage.goto();
  await loginPage.login("super.admin@mes.local", "MES-dev-seed-2026!");

  const settingsPage = new SettingsPage(page);
  await settingsPage.goto();

  // The Telegram panel is a full-save the server stores, so the default AI
  // model read back after a reload is the one that was written.
  const model = `e2e-model-${Date.now()}`;
  await settingsPage.openTelegram();
  await settingsPage.setDefaultModel(model);
  await expect(settingsPage.savedConfirmation).toBeVisible();

  await settingsPage.goto();
  await settingsPage.openTelegram();
  expect(await settingsPage.defaultModelInput.inputValue()).toBe(model);
});
