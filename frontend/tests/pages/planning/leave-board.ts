/**
 * Leave board page object.
 *
 * Interacts with the leave requests section of the planning page and the new
 * leave request form it opens. Supports registering a request, and (for
 * approvers) approving or rejecting one.
 */

import { BasePage } from "../base";

/** The new-leave form's fields, labeled in the form they are edited in. */
export interface LeaveRequestInput {
  /** The select shows the domain label ("Annual Leave"), not the code. */
  leaveCode?: string | RegExp;
  fromDate?: string;
  toDate?: string;
  reason?: string;
}

/** Local `YYYY-MM-DD`, the date-only shape the form's inputs take. */
function localDay(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export class LeaveBoardPage extends BasePage {
  readonly createLeaveButton = this.page.getByRole("button", {
    name: /create leave/i,
  });
  readonly approveButton = this.page.getByRole("button", {
    name: /^approve$/i,
  });
  readonly rejectButton = this.page.getByRole("button", { name: /^reject$/i });

  /** The new leave request form's controls. */
  readonly codeSelect = this.page.getByLabel(/leave code/i);
  readonly startDateInput = this.page.getByLabel(/start date/i);
  readonly endDateInput = this.page.getByLabel(/end date/i);
  readonly reasonInput = this.page.getByLabel(/reason/i);
  readonly registerButton = this.page.getByRole("button", {
    name: /^register leave$/i,
  });
  /** The confirmation the form shows once the request is stored. */
  readonly registeredConfirmation = this.page.getByText(/request registered/i);

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

  /**
   * Register a leave request through the planning page's Create leave action.
   *
   * The form computes its own day count from the range, so only the code, the
   * two dates, and the reason are entered. The API contract exposes no
   * attachment upload, so a request registered here carries none.
   */
  async registerLeave(request: LeaveRequestInput = {}) {
    await this.createLeave();
    await this.selectLeaveCode(request.leaveCode ?? "Annual Leave");
    await this.startDateInput.fill(request.fromDate ?? localDay());
    await this.endDateInput.fill(request.toDate ?? localDay());
    await this.reasonInput.fill(request.reason ?? "E2E test leave");
    await this.registerButton.click();
    await this.waitForNetworkIdle();
  }

  /** Pick a leave code in the form's select, by the label it shows. */
  async selectLeaveCode(label: string | RegExp) {
    await this.codeSelect.click();
    await this.page.getByRole("option", { name: label }).first().click();
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
