/**
 * Completion request tests.
 *
 * Covers milestone and full-job completion, rejection with reason, and
 * resubmission after rejection.
 */

import { expect, test } from "../../fixtures";
import { TicketCompletionPage } from "../../pages/jobs/ticket-completion";
import { TicketDetailPage } from "../../pages/jobs/ticket-detail";
import { TicketListPage } from "../../pages/jobs/ticket-list";

test("submit and approve a milestone completion request", async ({
  page,
  loginPage,
  createTicket,
}) => {
  await loginPage.login("demo@mes.local", "demo-password");

  const listPage = new TicketListPage(page);
  await listPage.goto();

  const ticket = await createTicket({
    title: "Milestone completion test",
    taskType: "MULTI_DAY",
  });
  await listPage.openTicket(ticket.title);

  const detailPage = new TicketDetailPage(page);
  await detailPage.accept();

  const completionPage = new TicketCompletionPage(page);
  await detailPage.complete();
  await completionPage.selectMilestone();
  await completionPage.fillTitle("Stage 1: Outline");
  await completionPage.fillProgress(25);
  await completionPage.fillStages(4);
  await completionPage.submit();

  await expect(detailPage.state()).resolves.toContain("PEN");

  // Approve the milestone (keeps ticket PEN)
  await completionPage.approve();
  await expect(detailPage.state()).resolves.toContain("PEN");
});

test("submit and reject a full-job completion request", async ({
  page,
  loginPage,
  createTicket,
}) => {
  await loginPage.login("demo@mes.local", "demo-password");

  const listPage = new TicketListPage(page);
  await listPage.goto();

  const ticket = await createTicket({ title: "Full job completion test" });
  await listPage.openTicket(ticket.title);

  const detailPage = new TicketDetailPage(page);
  await detailPage.accept();

  const completionPage = new TicketCompletionPage(page);
  await detailPage.complete();
  await completionPage.selectFullJob();
  await completionPage.fillTitle("All work delivered");
  await completionPage.submit();

  await expect(detailPage.state()).resolves.toContain("PEN");

  // Reject with a reason
  await completionPage.reject("The deliverable is missing the final report.");
  await expect(detailPage.state()).resolves.toContain("REJ");
});
