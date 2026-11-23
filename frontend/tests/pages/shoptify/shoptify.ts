/**
 * Shopify commerce page object.
 *
 * Walks the stores overview, the order board, and the bulk-fulfillment
 * form on the `shoptify` app.
 */

import { BasePage } from "../base";

export class ShoptifyPage extends BasePage {
  readonly heading = this.page.getByRole("heading", { level: 1 });
  readonly storeRows = this.page.getByRole("row");
  readonly connectHeading = this.page.getByRole("heading", {
    name: /connect a store/i,
  });

  async gotoStores() {
    await this.gotoAndWait("/shoptify");
  }

  async gotoOrders() {
    await this.gotoAndWait("/shoptify/orders");
  }

  async gotoC() {
    await this.gotoAndWait("/shoptify/catalog");
  }

  async gotoCustomers() {
    await this.gotoAndWait("/shoptify/customers");
  }

  async gotoFinance() {
    await this.gotoAndWait("/shoptify/finance");
  }

  async gotoAutomation() {
    await this.gotoAndWait("/shoptify/automation");
  }
}
