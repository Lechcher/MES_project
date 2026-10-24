/**
 * Audit log page object.
 *
 * Interacts with the audit log page at `/audit-log`. Supports viewing logs,
 * filtering, and exporting.
 */

import { BasePage } from "../base";

export class AuditLogPage extends BasePage {
  readonly exportButton = this.page.getByRole("button", { name: /export/i });
  readonly refreshButton = this.page.getByRole("button", {
    name: /refresh/i,
  });

  async goto() {
    await this.gotoAndWait("/audit-log");
  }

  /** Export audit logs. */
  async exportLogs() {
    await this.exportButton.click();
    await this.waitForNetworkIdle();
  }

  /** Refresh the audit log list. */
  async refresh() {
    await this.refreshButton.click();
    await this.waitForNetworkIdle();
  }
}
