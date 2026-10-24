/**
 * Jobs ticket list page object.
 *
 * Interacts with the ticket list at `/jobs`. Supports filtering by state,
 * priority, type, and search, creating new tickets, and navigating to ticket
 * detail pages.
 */

import { BasePage } from "../base";

export class TicketListPage extends BasePage {
  readonly stateSelect = this.page.getByLabel(/state/i);
  readonly prioritySelect = this.page.getByLabel(/priority/i);
  readonly typeSelect = this.page.getByLabel(/type/i);
  readonly searchInput = this.page.getByLabel(/search/i);
  readonly createNewButton = this.page.getByRole("button", {
    name: /create new/i,
  });
  readonly quickAddButton = this.page.getByRole("button", {
    name: /quick add/i,
  });

  async goto() {
    await this.gotoAndWait("/jobs");
  }

  /** Filter tickets by state (e.g., "ACT", "PEN", "APP"). */
  async filterByState(state: string) {
    await this.stateSelect.selectOption(state);
    await this.waitForNetworkIdle();
  }

  /** Filter tickets by priority (e.g., "LOW", "MEDIUM", "HIGH", "URGENT"). */
  async filterByPriority(priority: string) {
    await this.prioritySelect.selectOption(priority);
    await this.waitForNetworkIdle();
  }

  /** Filter tickets by type (e.g., "HOURLY", "DAILY", "MULTI_DAY"). */
  async filterByType(type: string) {
    await this.typeSelect.selectOption(type);
    await this.waitForNetworkIdle();
  }

  /** Search tickets by title or code. */
  async search(query: string) {
    await this.searchInput.fill(query);
    await this.waitForNetworkIdle();
  }

  /** Open the new ticket creation page. */
  async createNew() {
    await this.createNewButton.click();
    await this.waitForNetworkIdle();
  }

  /** Open quick add ticket page. */
  async quickAdd() {
    await this.quickAddButton.click();
    await this.waitForNetworkIdle();
  }

  /** Navigate to a ticket's detail page by clicking its title link. */
  async openTicket(title: string) {
    await this.page.getByRole("link", { name: title }).click();
    await this.waitForNetworkIdle();
  }

  /** Get the text of all ticket title links in the table. */
  async ticketTitles() {
    return this.page.getByRole("link").allTextContents();
  }
}
