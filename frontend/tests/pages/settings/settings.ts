/**
 * Settings page object.
 *
 * Interacts with the settings page at `/settings`. Supports navigating the
 * role-gated tabs and modifying the Telegram bot settings, which the server
 * stores so a reload reads the saved values back.
 */

import { BasePage } from "../base";

export class SettingsPage extends BasePage {
  readonly orgStructureTab = this.page.getByRole("tab", {
    name: /org structure/i,
  });
  readonly rbacTab = this.page.getByRole("tab", { name: /rbac/i });
  readonly userDirectoryTab = this.page.getByRole("tab", {
    name: /user directory/i,
  });
  readonly telegramTab = this.page.getByRole("tab", { name: /telegram/i });

  /** The Telegram bot panel's settings, labeled in the form they are edited in. */
  readonly botTokenInput = this.page.getByLabel(/bot token/i);
  readonly defaultModelInput = this.page.getByLabel(/default model/i);
  readonly saveSettingsButton = this.page.getByRole("button", {
    name: /^save configuration$/i,
  });
  /** The confirmation the panel shows once the server accepts a save. */
  readonly savedConfirmation = this.page.getByText(/configuration saved/i);

  async goto() {
    await this.gotoAndWait("/settings");
  }

  /** Switch to the organization structure tab. */
  async openOrgStructure() {
    await this.orgStructureTab.click();
    await this.waitForNetworkIdle();
  }

  /** Switch to the RBAC tab. */
  async openRBAC() {
    await this.rbacTab.click();
    await this.waitForNetworkIdle();
  }

  /** Switch to the user directory tab. */
  async openUserDirectory() {
    await this.userDirectoryTab.click();
    await this.waitForNetworkIdle();
  }

  /** Switch to the Telegram bot tab (Tech Lead and Super Admin only). */
  async openTelegram() {
    await this.telegramTab.click();
    await this.waitForNetworkIdle();
  }

  /**
   * Change the bot's default AI model and save it.
   *
   * The panel is a full-save, so a save persists every field it shows — an
   * empty secret field leaves the stored secret untouched, which is why the
   * helper writes only the model it was given.
   */
  async setDefaultModel(model: string) {
    await this.defaultModelInput.fill(model);
    await this.saveSettingsButton.click();
    await this.waitForNetworkIdle();
  }
}
