/**
 * Job ticket detail page object.
 *
 * Interacts with a ticket's detail page at `/jobs/tasks/:id`. Supports
 * lifecycle actions (accept, log progress, complete, report late, request
 * extension, cancel), viewing the journey, progress log, transitions, and
 * attachments.
 */

import { BasePage } from "../base";

export class TicketDetailPage extends BasePage {
  readonly stateBadge = this.page.getByText(/REQ|ACT|PEN|APP|REJ|CAN|OVERDUE/);
  readonly acceptButton = this.page.getByRole("button", { name: /^accept$/i });
  readonly logProgressButton = this.page.getByRole("button", {
    name: /log progress/i,
  });
  readonly completeButton = this.page.getByRole("button", {
    name: /^complete$/i,
  });
  readonly reportLateButton = this.page.getByRole("button", {
    name: /report late/i,
  });
  readonly requestExtensionButton = this.page.getByRole("button", {
    name: /request extension/i,
  });
  readonly cancelTicketButton = this.page.getByRole("button", {
    name: /cancel ticket/i,
  });

  async goto(taskId: string) {
    await this.gotoAndWait(`/jobs/tasks/${taskId}`);
  }

  /** Accept a task (REQ → ACT). */
  async accept() {
    await this.acceptButton.click();
    await this.waitForNetworkIdle();
  }

  /** Log progress for an ACT ticket. */
  async logProgress() {
    await this.logProgressButton.click();
    await this.waitForNetworkIdle();
  }

  /** Open the completion dialog to submit a completion request. */
  async complete() {
    await this.completeButton.click();
    await this.waitForNetworkIdle();
  }

  /** Report late submission for an OVERDUE ticket. */
  async reportLate() {
    await this.reportLateButton.click();
    await this.waitForNetworkIdle();
  }

  /** Request a deadline extension. */
  async requestExtension() {
    await this.requestExtensionButton.click();
    await this.waitForNetworkIdle();
  }

  /** Cancel the ticket. */
  async cancel() {
    await this.cancelTicketButton.click();
    await this.waitForNetworkIdle();
  }

  /** Get the current ticket state badge text. */
  async state(): Promise<string> {
    return this.stateBadge.textContent() ?? "";
  }

  /** Get the progress percentage text. */
  async progress(): Promise<string> {
    return this.page.getByText(/%/).first().textContent() ?? "";
  }
}
