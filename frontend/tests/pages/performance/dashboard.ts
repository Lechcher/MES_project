/**
 * Performance dashboard page object.
 *
 * Interacts with the performance page at `/performance`. Supports viewing KPI
 * dashboards, charts, and audit tables.
 */

import { BasePage } from "../base";

export class PerformanceDashboardPage extends BasePage {
  readonly kpiCard = this.page.getByText(/KPI/i);
  readonly dashboardLink = this.page.getByRole("link", { name: /dashboard/i });

  async goto() {
    await this.gotoAndWait("/performance");
  }

  /** View the KPI dashboard. */
  async viewKPI() {
    await this.kpiCard.click();
    await this.waitForNetworkIdle();
  }

  /** Get all visible KPI values. */
  async kpiValues() {
    return this.page.getByText(/\d+/).allTextContents();
  }
}
