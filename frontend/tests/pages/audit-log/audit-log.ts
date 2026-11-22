/**
 * Audit log page object.
 *
 * Interacts with the audit log page at `/audit-log`. The screen is a
 * read-only activity stream: the per-module summary table, the filter
 * controls, the newest-first events table, and one export action per format.
 */

import { BasePage } from "../base";

/** The export formats the screen offers. */
export type ExportFormat = "XLSX" | "CSV";

export class AuditLogPage extends BasePage {
  /** The export actions, one per format — both label themselves "Export filtered". */
  readonly exportXlsxButton = this.page.getByRole("button", {
    name: /export filtered \(\.xlsx\)/i,
  });
  readonly exportCsvButton = this.page.getByRole("button", {
    name: /export filtered \(\.csv\)/i,
  });

  /** The activity stream's events table: the last of the screen's two tables. */
  readonly eventsTable = this.page.getByRole("table").last();
  readonly eventRows = this.eventsTable.locator("tbody tr");

  async goto() {
    await this.gotoAndWait("/audit-log");
  }

  /** Export the filtered activity stream in the given format. */
  async exportLogs(format: ExportFormat = "XLSX") {
    const button =
      format === "CSV" ? this.exportCsvButton : this.exportXlsxButton;
    await button.click();
    await this.waitForNetworkIdle();
  }

  /**
   * The recorded events, one entry per row, as the table shows them.
   *
   * The stream is append-only and newest first, so the first entry a
   * freshly loaded page shows is the most recent recorded event.
   */
  async logEntries(): Promise<string[]> {
    const rows = await this.eventRows.allTextContents();
    return rows.map((row) => row.replace(/\s+/g, " ").trim()).filter(Boolean);
  }

  /**
   * Re-read the activity stream.
   *
   * The screen has no control that re-issues its read — the trail is
   * append-only and the live channel keeps it current — so a reload is the
   * only re-read the page offers.
   */
  async refresh() {
    await this.page.reload();
    await this.waitForNetworkIdle();
  }
}
