/**
 * Planning calendar page object.
 *
 * Interacts with the planning calendar tab at `/planning`. Supports navigating
 * between weeks, viewing scheduled tasks, and opening task details.
 */

import { BasePage } from "../base";

export class PlanningCalendarPage extends BasePage {
  readonly calendarTab = this.page.getByRole("tab", { name: /calendar/i });
  readonly leaveTab = this.page.getByRole("tab", { name: /leave/i });
  readonly boardTab = this.page.getByRole("tab", { name: /board/i });
  readonly attendanceTab = this.page.getByRole("tab", {
    name: /attendance/i,
  });

  async goto() {
    await this.gotoAndWait("/planning");
  }

  /** Switch to the calendar tab. */
  async openCalendar() {
    await this.calendarTab.click();
    await this.waitForNetworkIdle();
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
