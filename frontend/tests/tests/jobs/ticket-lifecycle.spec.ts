/**
 * Ticket lifecycle tests.
 *
 * Covers create → accept → log progress → complete → approve flow for a job
 * ticket.
 */

import { expect, test } from "../../fixtures";
import { TicketCompletionPage } from "../../pages/jobs/ticket-completion";
import { TicketDetailPage } from "../../pages/jobs/ticket-detail";
import { TicketListPage } from "../../pages/jobs/ticket-list";

// A manager-role account: the seeded demo accounts are the only sign-in
// credentials the dev stack knows, and an approver role is what the flow's
// last step needs.
const MANAGER = {
  email: "hr.manager@mes.local",
  password: "MES-dev-seed-2026!",
};

test("create, accept, log progress, complete, and approve a ticket", async ({
  page,
  loginPage,
  createTicket,
}) => {
  await loginPage.goto();
  await loginPage.login(MANAGER.email, MANAGER.password);

  const listPage = new TicketListPage(page);
  await listPage.goto();

  // Create a ticket via API fixture, then open it from the list
  const ticket = await createTicket({ title: "Lifecycle test ticket" });
  await listPage.openTicket(ticket.title);

  const detailPage = new TicketDetailPage(page);
  await expect(detailPage.state()).resolves.toContain("REQ");

  // Accept the ticket (REQ → ACT)
  await detailPage.accept();
  await expect(detailPage.state()).resolves.toContain("ACT");

  // Log progress
  await detailPage.logProgress();

  // Complete the ticket: the dialog asks for a request title before it submits,
  // and only the whole-job scope closes the ticket on approval
  const completionPage = new TicketCompletionPage(page);
  await detailPage.complete();
  await completionPage.selectFullJob();
  await completionPage.fillTitle("Lifecycle work delivered");
  await completionPage.submit();
  await expect(detailPage.state()).resolves.toContain("PEN");

  // Approve the completion request (PEN → APP)
  await completionPage.approve();
  await expect(detailPage.state()).resolves.toContain("APP");
});
