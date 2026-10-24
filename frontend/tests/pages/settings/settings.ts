/**
 * Settings page object.
 *
 * Interacts with the settings page at `/settings`. Supports navigating tabs
 * and modifying settings.
 */

import { BasePage } from "../base";

export class SettingsPage extends BasePage {
  readonly orgStructureTab = this.page.getByRole("tab", {
    name: /organization/i,
  });
  readonly rbacTab = this.page.getByRole("tab", { name: /rbac/i });
  readonly userDirectoryTab = this.page.getByRole("tab", {
    name: /user directory/i,
  });

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
}
