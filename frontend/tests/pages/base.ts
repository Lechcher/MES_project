/**
 * Base page object with common Playwright utilities used by all page objects.
 *
 * Provides helper methods for waiting on network idle, filling forms,
 * clicking and waiting for navigation, and locating elements by test id.
 */

import { expect, type Locator, type Page } from "@playwright/test";

export class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Wait for the page to reach network idle state. */
  async waitForNetworkIdle() {
    await this.page.waitForLoadState("networkidle");
  }

  /** Fill an input field by its label text. */
  async fillByLabel(label: string, value: string) {
    await this.page.getByLabel(label).fill(value);
  }

  /** Fill an input field by its placeholder text. */
  async fillByPlaceholder(placeholder: string, value: string) {
    await this.page.getByPlaceholder(placeholder).fill(value);
  }

  /** Click a button by its visible text. */
  async clickButton(text: string) {
    await this.page.getByRole("button", { name: text }).click();
  }

  /** Click a link by its visible text. */
  async clickLink(text: string) {
    await this.page.getByRole("link", { name: text }).click();
  }

  /** Wait for navigation and then wait for network idle. */
  async gotoAndWait(url: string) {
    await this.page.goto(url);
    await this.waitForNetworkIdle();
  }

  /** Assert that an element matching a selector is visible. */
  async expectVisible(locator: Locator) {
    await expect(locator).toBeVisible();
  }

  /** Assert that the page URL matches a pattern. */
  async expectUrl(pattern: string | RegExp) {
    await expect(this.page).toHaveURL(pattern);
  }

  /** Click an element matching a data-testid attribute. */
  async clickByTestId(testId: string) {
    await this.page.getByTestId(testId).click();
  }

  /** Fill an element matching a data-testid attribute. */
  async fillByTestId(testId: string, value: string) {
    await this.page.getByTestId(testId).fill(value);
  }
}
