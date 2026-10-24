/**
 * Leave board page object.
 *
 * Interacts with the leave requests section of the planning page. Supports
 * viewing leave requests and (for approvers) approving/rejecting them.
 */

import { BasePage } from "../base";

export class LeaveBoardPage extends BasePage {
  readonly createLeaveButton = this.page.getByRole("button", {
    name: /create leave/i,
  });
  readonly approveButton = this.page.getByRole("button", {
    name: /^approve$/i,
  });
  readonly rejectButton = this.page.getByRole("button", { name: /^reject$/i });

  async goto() {
    await this.gotoAndWait("/planning");
    await this.openLeave();
  }

  async openLeave() {
    await this.leaveTab.click();
    await this.waitForNetworkIdle();
  }

  /** Open the new leave request page. */
  async createLeave() {
    await this.createLeaveButton.click();
    await this.waitForNetworkIdle();
  }

  /** Approve a leave request. */
  async approve() {
    await this.approveButton.click();
    await this.waitForNetworkIdle();
  }

  /** Reject a leave request. */
  async reject() {
    await this.rejectButton.click();
    await this.waitForNetworkIdle();
  }

  private get leaveTab() {
    return this.page.getByRole("tab", { name: /leave/i });
  }
}
