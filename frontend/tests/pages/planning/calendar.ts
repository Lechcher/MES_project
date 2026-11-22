/**
 * Planning calendar page object.
 *
 * Interacts with the planning calendar tab at `/planning`. The calendar tab
 * renders the schedule grid, so this object drives the toolbar that moves the
 * visible range — the previous/next/today controls and the scale toggle that
 * turns the range into a week — and reads the ticket bars the grid draws. The
 * leave board is reached through the leave tab.
 */

import { BasePage } from "../base";

/** The schedule toolbar's scale buttons, by the label each shows. */
export type ScheduleScale = "Day" | "Week" | "Month" | "Year";

export class PlanningCalendarPage extends BasePage {
  readonly calendarTab = this.page.getByRole("tab", { name: /calendar/i });
  readonly leaveTab = this.page.getByRole("tab", { name: /leave/i });
  readonly boardTab = this.page.getByRole("tab", { name: /board/i });
  readonly attendanceTab = this.page.getByRole("tab", {
    name: /attendance/i,
  });

  /** The toolbar's range controls, by their accessible names. */
  readonly previousButton = this.page.getByRole("button", {
    name: /^previous$/i,
  });
  readonly nextButton = this.page.getByRole("button", { name: /^next$/i });
  readonly todayButton = this.page.getByRole("button", { name: /^today$/i });

  /** A ticket bar on the grid: a role=button carrying its category. */
  readonly ticketBars = this.page.locator("[data-task-type][role=button]");

  async goto() {
    await this.gotoAndWait("/planning");
  }

  /** Switch to the calendar tab. */
  async openCalendar() {
    await this.calendarTab.click();
    await this.waitForNetworkIdle();
  }

  /** Step the visible range back one period (a week at the week scale). */
  async previousRange() {
    await this.previousButton.click();
    await this.waitForNetworkIdle();
  }

  /** Step the visible range forward one period (a week at the week scale). */
  async nextRange() {
    await this.nextButton.click();
    await this.waitForNetworkIdle();
  }

  /** Jump the visible range back to the period that holds today. */
  async todayRange() {
    await this.todayButton.click();
    await this.waitForNetworkIdle();
  }

  /** Switch the grid's scale, which is what a week view means here. */
  async selectScale(scale: ScheduleScale) {
    await this.page
      .getByRole("button", { name: new RegExp(`^${scale}$`, "i") })
      .first()
      .click();
    await this.waitForNetworkIdle();
  }

  /** The task codes the currently visible range holds. */
  async scheduledTaskCodes(): Promise<string[]> {
    const codes = await this.ticketBars.locator(".font-mono").allTextContents();
    return codes.map((code) => code.trim()).filter(Boolean);
  }

  /** Switch to the leave requests tab. */
  async openLeave() {
    await this.leaveTab.click();
    await this.waitForNetworkIdle();
  }

  /** Switch to the approval board tab (approvers only). */
  async openBoard() {
    await this.boardTab.click();
    await this.waitForNetworkIdle();
  }

  /** Switch to the attendance tab. */
  async openAttendance() {
    await this.attendanceTab.click();
    await this.waitForNetworkIdle();
  }
}
