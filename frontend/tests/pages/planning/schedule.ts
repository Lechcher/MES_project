/**
 * Planning schedule page object.
 *
 * Interacts with the Planning Schedule tab at `/planning`: ticket bars on the
 * resource rows, the scale toolbar, and the task editor dialog. Ticket bars
 * carry their category and state as data attributes, and their column/row
 * placement as inline grid styles, so the schedule's own e2e checks can assert
 * the encoding without reading computed colors.
 *
 * Navigation is client-side (nav link + tab), because the app's session lives
 * in an httpOnly cookie the browser does not re-read on a cold navigation in
 * development.
 */

import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../base";

export class SchedulePage extends BasePage {
  /** A ticket bar on the grid: a role=button carrying its category. */
  readonly ticketBars: Locator;
  readonly saveButton: Locator;
  readonly dialog: Locator;

  /** The editor's day pickers, scoped to each control's own id. */
  readonly dayOnlyInput: Locator;
  readonly startDayInput: Locator;
  readonly endDayInput: Locator;
  readonly hourDayInput: Locator;
  readonly startHourInput: Locator;
  readonly endHourInput: Locator;

  constructor(page: Page) {
    super(page);
    this.dialog = this.page.getByRole("dialog");
    this.ticketBars = this.page.locator("[data-task-type][role=button]");
    // The category renders exactly one of these, so the id is the selector.
    this.dayOnlyInput = this.page.locator("#task-day");
    this.startDayInput = this.page.locator("#task-start-day");
    this.endDayInput = this.page.locator("#task-end-day");
    this.hourDayInput = this.page.locator("#task-hour-day");
    this.startHourInput = this.page.locator("#task-start-hour");
    this.endHourInput = this.page.locator("#task-end-hour");
    this.saveButton = this.dialog.getByRole("button", {
      name: /^(save|create task)$/i,
    });
  }

  /**
   * Open the Schedule tab through the app's own navigation.
   *
   * Sign-in already routed to the home screen client-side, so no cold
   * navigation happens here: the app's session contract does not survive one
   * in a development browser.
   */
  async goto() {
    const nav = this.page.getByRole("link", { name: /planning/i }).first();
    await nav.waitFor({ state: "visible" });
    await nav.click();
    await this.page
      .getByRole("tab", { name: /schedule/i })
      .first()
      .click();
    await this.ticketBars.first().waitFor({ state: "attached" });
    await this.waitForGridToSettle();
  }

  /**
   * Apply a custom day range from the toolbar.
   *
   * The seeded multi-lane tickets live in one week of October 2026, so the
   * geometry checks open that range rather than whatever "today" happens to
   * show. Applying the range is a client-side navigation, so the session
   * survives.
   */
  async openRange(fromDmy: string, toDmy: string) {
    await this.page.locator("#schedule-range-from").fill(fromDmy);
    await this.page.locator("#schedule-range-to").fill(toDmy);
    await this.page.getByRole("button", { name: /^apply$/i }).click();
    await this.ticketBars.first().waitFor({ state: "attached" });
    await this.waitForGridToSettle();
  }

  /**
   * Every employee row, in render order.
   *
   * The sticky column header also carries `border-b`, so it is excluded. This
   * is the same index space the app's drop arithmetic uses, which counts a
   * row without bars as one lane.
   */
  allRows(): Locator {
    return this.page.locator("div.grid.border-b:not(.sticky)");
  }

  /** An employee row that holds ticket bars (the grid rows). */
  row(index = 0): Locator {
    return this.allRows()
      .filter({
        has: this.ticketBars,
      })
      .nth(index);
  }

  /**
   * Wait until the grid stops changing.
   *
   * Rows and bars arrive from two queries plus the live channel, so a fixed
   * wait races the data: a row can be measured before the tickets that grow it
   * have landed. This polls until the bar count holds steady.
   */
  async waitForGridToSettle(): Promise<number> {
    let previous = -1;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const count = await this.ticketBars.count();
      if (count > 0 && count === previous) return count;
      previous = count;
      await this.page.waitForTimeout(500);
    }
    return previous;
  }

  /** The width of one day column, read from the grid's inline template. */
  async dayColumnWidth(): Promise<number> {
    const template = await this.allRows()
      .nth(0)
      .evaluate((node) => (node as HTMLElement).style.gridTemplateColumns);
    // `224px repeat(7, 128px)` — every day column shares the repeat width.
    const match = /repeat\(\d+,\s*([\d.]+)px\)/.exec(template);
    return match ? Number.parseFloat(match[1]) : 0;
  }

  /** The scrollable form body inside the editor dialog. */
  formScroller(): Locator {
    return this.dialog.locator("div.grid.max-h-\\[65vh\\]").first();
  }

  /** Open the editor from the toolbar's New task action. */
  async openEditorFromNew() {
    await this.page.getByRole("button", { name: /new task/i }).click();
    await expect(this.dialog).toBeVisible();
  }

  /** Pick a category in the editor's category select. */
  async selectCategory(category: "DAILY" | "MULTI_DAY" | "HOURLY") {
    await this.dialog.getByRole("combobox").first().click();
    const label = {
      DAILY: /^daily$/i,
      MULTI_DAY: /^multi-day$/i,
      HOURLY: /^hourly$/i,
    }[category];
    // The listbox is portaled out of the dialog.
    await this.page.getByRole("option", { name: label }).first().click();
  }

  /** Save the editor's form and wait for the dialog to close. */
  async save() {
    await this.saveButton.click();
    await expect(this.dialog).toBeHidden();
  }

  /** Switch the scale through the toolbar and wait for the grid to settle. */
  async selectScale(scale: "Day" | "Week" | "Month" | "Year") {
    await this.page
      .getByRole("button", { name: new RegExp(`^${scale}$`, "i") })
      .first()
      .click();
    await this.ticketBars.first().waitFor({ state: "attached" });
    await this.waitForGridToSettle();
  }

  /**
   * Every bar in one row: its grid placement, its rendered box, and the
   * continues-before/after chevrons it carries.
   */
  async barsInRow(index = 0) {
    return this.allRows()
      .nth(index)
      .locator("[data-task-type][role=button]")
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const element = node as HTMLElement;
          const box = element.getBoundingClientRect();
          return {
            code: element.querySelector(".font-mono")?.textContent ?? "",
            category: element.getAttribute("data-task-type"),
            state: element.getAttribute("data-ticket-state"),
            gridRow: element.style.gridRow,
            gridColumn: element.style.gridColumn,
            chevrons: [...element.querySelectorAll("svg[aria-label]")].map(
              (svg) => svg.getAttribute("aria-label") ?? "",
            ),
            box: {
              x: Math.round(box.x),
              y: Math.round(box.y),
              width: Math.round(box.width),
              height: Math.round(box.height),
              right: Math.round(box.right),
              bottom: Math.round(box.bottom),
            },
          };
        }),
      );
  }

  /** The row's lane count and height, from its inline grid template. */
  async rowGeometry(index = 0) {
    return this.allRows()
      .nth(index)
      .evaluate((node) => {
        const element = node as HTMLElement;
        const box = element.getBoundingClientRect();
        const lanes = /repeat\((\d+)/.exec(element.style.gridTemplateRows);
        return {
          lanes: lanes ? Number(lanes[1]) : 1,
          height: Math.round(box.height),
          top: Math.round(box.top),
          bottom: Math.round(box.bottom),
        };
      });
  }

  /**
   * The lane count of every row that holds bars, in render order — the same
   * array the drop arithmetic resolves against.
   */
  async laneCounts() {
    const count = await this.allRows().count();
    const out: number[] = [];
    for (let index = 0; index < count; index += 1) {
      out.push((await this.rowGeometry(index)).lanes);
    }
    return out;
  }

  /**
   * The row holding the most bars, with its bars — the row whose lane packing
   * is worth checking.
   */
  async rowWithMostBars() {
    const count = await this.allRows().count();
    let best: { index: number; count: number; label: string } | null = null;
    for (let index = 0; index < count; index += 1) {
      const bars = await this.barsInRow(index);
      if (bars.length === 0) continue;
      if (!best || bars.length > best.count) {
        best = { index, count: bars.length, label: await this.rowLabel(index) };
      }
    }
    return best;
  }

  /** The employee cell's own text, which carries the lane count. */
  async rowLabel(index = 0) {
    return this.allRows()
      .nth(index)
      .locator("> div")
      .first()
      .evaluate((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim());
  }

  /**
   * The first row that holds more than one lane, with one of its bars, so a
   * drag can be aimed at a row whose lanes have a definite owner.
   */
  async rowWithLanes() {
    const count = await this.allRows().count();
    for (let index = 0; index < count; index += 1) {
      const geometry = await this.rowGeometry(index);
      if (geometry.lanes < 2) continue;
      const bars = await this.barsInRow(index);
      if (bars.length === 0) continue;
      return {
        rowIndex: index,
        label: await this.rowLabel(index),
        code: bars[0].code,
        geometry,
      };
    }
    return null;
  }

  /** Where a ticket's bar currently sits, by its task code. */
  async findBar(taskCode: string) {
    const bar = this.page
      .locator("[data-task-type][role=button]")
      .filter({ has: this.page.locator(`.font-mono`, { hasText: taskCode }) })
      .first();
    await bar.waitFor({ state: "attached" });
    return bar;
  }

  /**
   * Drag a bar by a pixel offset with real mouse input and return where its
   * ticket ended up, so a drop can be checked against the lane arithmetic.
   */
  async dragBar(taskCode: string, dx: number, dy: number) {
    const bar = await this.findBar(taskCode);
    // A bar in a tall row can sit below the fold; the mouse can only reach
    // what the viewport shows.
    await bar.scrollIntoViewIfNeeded();
    const box = await bar.boundingBox();
    if (!box) throw new Error(`bar ${taskCode} has no box`);
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    const steps = 8;
    for (let step = 1; step <= steps; step += 1) {
      await this.page.mouse.move(
        startX + (dx * step) / steps,
        startY + (dy * step) / steps,
      );
      await this.page.waitForTimeout(20);
    }
    await this.page.mouse.up();
    // The mutation settles and the merged state re-places every bar.
    await this.page.waitForTimeout(4_000);
    return this.whereIsTicket(taskCode);
  }

  /** The employee row that currently holds a ticket's bar. */
  async whereIsTicket(taskCode: string) {
    const count = await this.allRows().count();
    for (let index = 0; index < count; index += 1) {
      const row = this.allRows().nth(index);
      const codes = await row
        .locator("[data-task-type][role=button] .font-mono")
        .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""));
      if (codes.some((code) => code.includes(taskCode))) {
        return { index, label: await this.rowLabel(index), codes };
      }
    }
    return null;
  }
}
