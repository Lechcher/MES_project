/**
 * Completion dialog page object.
 *
 * Interacts with the task completion request dialog opened from a ticket's
 * "Complete" button, and the completion request review surface shown to
 * approvers for PEN tickets.
 */

import { BasePage } from "../base";

export class TicketCompletionPage extends BasePage {
  readonly scopeMilestoneButton = this.page.getByRole("button", {
    name: /complete milestone/i,
  });
  readonly scopeFullJobButton = this.page.getByRole("button", {
    name: /complete job/i,
  });
  readonly titleInput = this.page.getByLabel(/request title/i);
  readonly descriptionInput = this.page.getByLabel(/what the work delivered/i);
  readonly progressInput = this.page.getByLabel(/estimated total progress/i);
  readonly stagesInput = this.page.getByLabel(/expected number of stages/i);
  readonly submitButton = this.page.getByRole("button", {
    name: /submit for approval/i,
  });
  readonly approveButton = this.page.getByRole("button", {
    name: /^approve$/i,
  });
  readonly rejectButton = this.page.getByRole("button", { name: /^reject$/i });
  readonly rejectReasonInput = this.page.getByLabel(/reason/i);
  readonly rejectSubmitButton = this.page.getByRole("button", {
    name: /reject/i,
  });

  /** Select "Complete milestone" scope (MULTI_DAY tickets). */
  async selectMilestone() {
    await this.scopeMilestoneButton.click();
  }

  /** Select "Complete job" scope (FULL_JOB). */
  async selectFullJob() {
    await this.scopeFullJobButton.click();
  }

  /** Fill in the completion request title. */
  async fillTitle(title: string) {
    await this.titleInput.fill(title);
  }

  /** Fill in the completion request description. */
  async fillDescription(description: string) {
    await this.descriptionInput.fill(description);
  }

  /** Fill in the estimated progress percentage. */
  async fillProgress(progress: number) {
    await this.progressInput.fill(String(progress));
  }

  /** Fill in the expected number of stages. */
  async fillStages(stages: number) {
    await this.stagesInput.fill(String(stages));
  }

  /** Submit the completion request for approval. */
  async submit() {
    await this.submitButton.click();
    await this.page.waitForLoadState("networkidle");
  }

  /** Approve a pending completion request. */
  async approve() {
    await this.approveButton.click();
    await this.page.waitForLoadState("networkidle");
  }

  /** Reject a pending completion request with a reason. */
  async reject(reason: string) {
    await this.rejectButton.click();
    await this.rejectReasonInput.fill(reason);
    await this.rejectSubmitButton.click();
    await this.page.waitForLoadState("networkidle");
  }
}
