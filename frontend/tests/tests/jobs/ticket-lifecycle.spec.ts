/**
 * Ticket lifecycle tests.
 *
 * Covers create → accept → log progress → complete flow for a job ticket.
 */

import { expect, test } from "../../fixtures";
import { TicketDetailPage } from "../../pages/jobs/ticket-detail";
import { TicketListPage } from "../../pages/jobs/ticket-list";

test("create, accept, log progress, and complete a ticket", async ({
  page,
  loginPage,
  createTicket,
}) => {
  await loginPage.login("demo@mes.local", "demo-password");

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

  // Complete the ticket
  await detailPage.complete();
  await expect(detailPage.state()).resolves.toContain("PEN");
});
