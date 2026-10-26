/**
 * Jobs create-ticket page object.
 *
 * Drives the form at `/jobs/new`: the task type, its deadline controls, and the
 * category rules the form enforces. The saved dates are read back through the
 * API rather than the UI, because the rule being checked is what was stored —
 * a `DAILY` ticket with a start on its own day, an `HOURLY` pair inside one
 * day, and a refused interval that does not fit its category.
 */

import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../base";

export class CreateTicketPage extends BasePage {
  readonly titleInput: Locator;
  readonly typeSelect: Locator;
  readonly submitButton: Locator;
  readonly feedback: Locator;

  constructor(page: Page) {
    super(page);
    this.titleInput = this.page.locator("#ticket-title");
    this.typeSelect = this.page.locator("#ticket-type");
    this.submitButton = this.page.getByRole("button", { name: /^create/i });
    this.feedback = this.page.locator("[role='alert'], .text-destructive");
  }

  /**
   * Open the create form through the app's own navigation.
   *
   * Sign-in already routed client-side, and the session does not survive a cold
   * navigation in a development browser.
   */
  async goto() {
    const nav = this.page.getByRole("link", { name: /^jobs$/i }).first();
    await nav.waitFor({ state: "visible" });
    await nav.click();
    await this.page.getByRole("button", { name: /create new/i }).click();
    await this.titleInput.waitFor({ state: "visible" });
  }

  /** Pick a task type in the form's category select. */
  async selectType(type: "DAILY" | "MULTI_DAY" | "HOURLY") {
    await this.typeSelect.click();
    const label = {
      DAILY: /^daily$/i,
      MULTI_DAY: /^multi-day$/i,
      HOURLY: /^hourly$/i,
    }[type];
    await this.page.getByRole("option", { name: label }).first().click();
  }

  /** Pick one of the form's hourly slots, by its start time. */
  async selectHourlySlot(slot: "10:30" | "14:00" | "16:30") {
    await this.page
      .getByRole("button", { name: new RegExp(`^${slot}–`) })
      .first()
      .click();
  }

  /** Pick one of the form's daily deadline slots. */
  async selectDailySlot(slot: "17:00" | "18:00") {
    await this.page
      .getByRole("button", { name: new RegExp(`^${slot}$`) })
      .first()
      .click();
  }

  /** Fill a day control, as the browser's date input expects it. */
  async fillDay(id: string, day: string) {
    await this.page.locator(id).fill(day);
  }

  async submit() {
    await this.submitButton.click();
  }

  /** The inline error the form shows for a refused interval. */
  async errorText(): Promise<string> {
    await expect(this.feedback.first()).toBeVisible();
    return (await this.feedback.first().textContent()) ?? "";
  }
}
