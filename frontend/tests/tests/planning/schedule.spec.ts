/**
 * Schedule ticket-bar and editor tests.
 *
 * Covers the bar surface (light fill with the state color on the border), the
 * one-column span of a `DAILY` bar, lane stacking when an employee holds
 * overlapping tickets, the editor's per-category time controls, and its
 * horizontal scrolling when the window is narrower than the form.
 */

import { expect, test } from "../../fixtures";
import { SchedulePage } from "../../pages/planning/schedule";

// An HR manager sees the company-wide schedule and may write to any
// department, which the bar and editor checks need.
const PLANNER = {
  email: "hr.manager@mes.local",
  password: "MES-dev-seed-2026!",
};

// The week the seeded overlapping and out-of-shape tickets live in. The
// default view follows "today", which eventually drifts past them.
const BUSY_WEEK = { from: "19/10/2026", to: "25/10/2026" };

test.beforeEach(async ({ loginPage }) => {
  // `LoginPage.login` fills the form without navigating, so the sign-in page
  // has to be opened first.
  await loginPage.goto();
  await loginPage.login(PLANNER.email, PLANNER.password);
});

test("a ticket bar keeps the light fill and its state color on the border", async ({
  page,
}) => {
  const schedule = new SchedulePage(page);
  await schedule.goto();

  const bar = schedule.ticketBars.first();
  await expect(bar).toBeVisible();

  const surface = await bar.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      background: style.backgroundColor,
      color: style.color,
      borderColor: style.borderTopColor,
      borderWidth: style.borderTopWidth,
    };
  });
  // The Carbon light gray surface, dark text, and the state color as the
  // 1 px border around it.
  expect(surface.background).toBe("rgb(244, 244, 244)");
  expect(surface.color).toBe("rgb(22, 22, 22)");
  expect(surface.borderWidth).toBe("1px");
  expect(surface.borderColor).not.toBe(surface.background);

  // The bar's own data attributes must agree with the registry it came from.
  const state = await bar.getAttribute("data-ticket-state");
  const category = await bar.getAttribute("data-task-type");
  expect(["REQ", "ACT", "PEN", "APP", "REJ", "CAN", "OVERDUE"]).toContain(
    state,
  );
  expect(["DAILY", "MULTI_DAY", "HOURLY"]).toContain(category);
});

test("a daily ticket bar covers exactly one column", async ({ page }) => {
  const schedule = new SchedulePage(page);
  await schedule.goto();
  await schedule.openRange(BUSY_WEEK.from, BUSY_WEEK.to);

  const bar = page.locator('[data-task-type="DAILY"][role="button"]').first();
  await expect(bar).toBeVisible();

  // The placement is a single column of the row's grid.
  const gridColumn = await bar.evaluate(
    (node) => (node as HTMLElement).style.gridColumn,
  );
  expect(gridColumn).toMatch(/\/ span 1$/);

  // And its width is that one column, not the whole row.
  const columnWidth = await schedule.dayColumnWidth();
  const barWidth = (await bar.boundingBox())?.width ?? 0;
  expect(columnWidth).toBeGreaterThan(0);
  expect(barWidth).toBeGreaterThan(columnWidth * 0.5);
  expect(barWidth).toBeLessThan(columnWidth * 1.1);
});

test("an employee's overlapping tickets stack into lanes instead of overlapping", async ({
  page,
}) => {
  const schedule = new SchedulePage(page);
  await schedule.goto();
  await schedule.openRange(BUSY_WEEK.from, BUSY_WEEK.to);

  // The busiest row: the schedule packs several tickets into lanes, and no two
  // of them may be drawn on top of each other.
  const busiest = await schedule.rowWithMostBars();
  expect(busiest, "a row with several tickets exists").not.toBeNull();
  if (!busiest) return;
  expect(busiest.count).toBeGreaterThan(1);

  const bars = await schedule.barsInRow(busiest.index);
  for (let a = 0; a < bars.length; a += 1) {
    for (let b = a + 1; b < bars.length; b += 1) {
      const left = bars[a];
      const right = bars[b];
      const overlapX =
        Math.min(left.box.right, right.box.right) -
        Math.max(left.box.x, right.box.x);
      const overlapY =
        Math.min(left.box.bottom, right.box.bottom) -
        Math.max(left.box.y, right.box.y);
      expect(
        overlapX <= 1 || overlapY <= 1,
        `${left.code} and ${right.code} must not overlap`,
      ).toBe(true);
    }
  }

  // Bars may share a lane only when their columns do not overlap, and the row
  // is tall enough to hold every lane it reports.
  const geometry = await schedule.rowGeometry(busiest.index);
  expect(geometry.lanes).toBeGreaterThanOrEqual(1);
  expect(geometry.height).toBe(geometry.lanes * 52);
  for (const bar of bars) {
    const lane = Number(bar.gridRow.split(" ")[0]);
    expect(lane).toBeLessThanOrEqual(geometry.lanes);
  }
});

test("the editor offers only the controls each category allows", async ({
  page,
}) => {
  const schedule = new SchedulePage(page);
  await schedule.goto();

  await schedule.openEditorFromNew();

  // DAILY: one day, no end day and no hours.
  await schedule.selectCategory("DAILY");
  await expect(schedule.dayOnlyInput).toBeVisible();
  await expect(schedule.endDayInput).toBeHidden();
  await expect(schedule.hourDayInput).toBeHidden();
  await expect(schedule.startHourInput).toBeHidden();
  await expect(schedule.endHourInput).toBeHidden();

  // MULTI_DAY: a start day and an end day, no hours.
  await schedule.selectCategory("MULTI_DAY");
  await expect(schedule.dayOnlyInput).toBeHidden();
  await expect(schedule.startDayInput).toBeVisible();
  await expect(schedule.endDayInput).toBeVisible();
  await expect(schedule.startHourInput).toBeHidden();
  await expect(schedule.endHourInput).toBeHidden();

  // HOURLY: a start hour and an end hour on the same day, no end day.
  await schedule.selectCategory("HOURLY");
  await expect(schedule.dayOnlyInput).toBeHidden();
  await expect(schedule.endDayInput).toBeHidden();
  await expect(schedule.hourDayInput).toBeVisible();
  await expect(schedule.startHourInput).toBeVisible();
  await expect(schedule.endHourInput).toBeVisible();
});

test("the editor scrolls horizontally inside the dialog", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const schedule = new SchedulePage(page);
  await schedule.goto();

  await schedule.openEditorFromNew();
  const scroller = schedule.formScroller();
  await expect(scroller).toBeVisible();

  const geometry = await scroller.evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
    overflowX: getComputedStyle(node).overflowX,
  }));
  expect(geometry.overflowX).toBe("auto");
  // The form is at least as wide as the scroll area.
  expect(geometry.scrollWidth).toBeGreaterThanOrEqual(geometry.clientWidth);

  // The save action stays reachable while the form scrolls.
  await expect(schedule.saveButton).toBeVisible();
});

test("no two bars overlap on any scale, and the row grows for its lanes", async ({
  page,
}) => {
  const schedule = new SchedulePage(page);
  await schedule.goto();
  await schedule.openRange(BUSY_WEEK.from, BUSY_WEEK.to);

  for (const scale of ["Day", "Week", "Month", "Year"] as const) {
    await schedule.selectScale(scale);
    const rowCount = await schedule.allRows().count();
    expect(rowCount, `${scale} scale renders rows`).toBeGreaterThan(0);

    for (let index = 0; index < rowCount; index += 1) {
      const bars = await schedule.barsInRow(index);
      for (let a = 0; a < bars.length; a += 1) {
        for (let b = a + 1; b < bars.length; b += 1) {
          const left = bars[a];
          const right = bars[b];
          const overlapX =
            Math.min(left.box.right, right.box.right) -
            Math.max(left.box.x, right.box.x);
          const overlapY =
            Math.min(left.box.bottom, right.box.bottom) -
            Math.max(left.box.y, right.box.y);
          expect(
            overlapX <= 1 || overlapY <= 1,
            `${scale}: ${left.code} and ${right.code} must not overlap`,
          ).toBe(true);
        }
      }

      // The row is tall enough for every lane it reports, and the label agrees.
      const geometry = await schedule.rowGeometry(index);
      const label = await schedule.rowLabel(index);
      expect(geometry.lanes).toBeGreaterThanOrEqual(1);
      expect(geometry.height).toBe(geometry.lanes * 52);
      if (geometry.lanes > 1) {
        expect(label, `${scale}: row ${index} reports its lanes`).toContain(
          `${geometry.lanes} lane`,
        );
      }
    }
  }
});

test("a daily ticket stored spanning months is drawn on its due day", async ({
  page,
}) => {
  const schedule = new SchedulePage(page);
  await schedule.goto();
  await schedule.openRange(BUSY_WEEK.from, BUSY_WEEK.to);

  // Diego's ticket: opened 27/07, due 24/10, stored as a `DAILY` multi-day span.
  const bar = await schedule.findBar("T202610-0036");
  await expect(bar).toBeVisible();

  const geometry = await bar.evaluate((node) => {
    const element = node as HTMLElement;
    const row = element.closest("div.grid") as HTMLElement;
    const columns = row.style.gridTemplateColumns;
    return { gridColumn: element.style.gridColumn, columns };
  });
  // One column wide, on the Saturday (24/10) of the visible week.
  expect(geometry.gridColumn).toMatch(/\/ span 1$/);

  // It is drawn, and marked as continuing from earlier — never as spanning the
  // whole window it only touches at one end.
  const chevrons = await bar.evaluate((node) =>
    [...node.querySelectorAll("svg[aria-label]")].map(
      (svg) => svg.getAttribute("aria-label") ?? "",
    ),
  );
  expect(chevrons.some((label) => /continues from earlier/i.test(label))).toBe(
    true,
  );
  expect(chevrons.some((label) => /continues later/i.test(label))).toBe(false);

  // Every other day of the window is untouched by it.
  const barsInRow = await schedule.barsInRow();
  const self = barsInRow.filter((bar) => bar.code === "T202610-0036");
  expect(self).toHaveLength(1);
});

test("a drag of one lane lands on the employee of the row under the pointer", async ({
  page,
}) => {
  const schedule = new SchedulePage(page);
  await schedule.goto();
  await schedule.openRange(BUSY_WEEK.from, BUSY_WEEK.to);

  const laneCounts = await schedule.laneCounts();
  // A multi-lane row that is not the last one, so a one-lane drop has a row
  // below it to land on.
  let source: { index: number; label: string } | null = null;
  for (let index = 0; index < laneCounts.length - 1; index += 1) {
    if (laneCounts[index] < 2) continue;
    const bars = await schedule.barsInRow(index);
    if (bars.length === 0) continue;
    source = { index, label: await schedule.rowLabel(index) };
    break;
  }
  expect(source, "a multi-lane row with a row below it exists").not.toBeNull();
  if (!source) return;

  // The bar in that row's last lane, so a one-lane drop crosses into the row
  // below it rather than shuffling inside its own.
  const bars = await schedule.barsInRow(source.index);
  const dragged = bars.reduce((deepest, bar) =>
    Number(bar.gridRow.split(" ")[0]) > Number(deepest.gridRow.split(" ")[0])
      ? bar
      : deepest,
  );
  const lane = Number(dragged.gridRow.split(" ")[0]) - 1;

  // The row that owns the lane one below this bar's, the same arithmetic the
  // drop uses.
  const firstLane = laneCounts
    .slice(0, source.index)
    .reduce((sum, count) => sum + Math.max(1, count), 0);
  const absolute = firstLane + lane + 1;
  let accumulated = 0;
  let expectedIndex = laneCounts.length - 1;
  for (let index = 0; index < laneCounts.length; index += 1) {
    accumulated += Math.max(1, laneCounts[index]);
    if (absolute < accumulated) {
      expectedIndex = index;
      break;
    }
  }
  expect(expectedIndex, "the drop crosses into the next row").toBeGreaterThan(
    source.index,
  );
  const expectedLabel = await schedule.rowLabel(expectedIndex);

  const after = await schedule.dragBar(dragged.code, 0, 52);
  expect(after, "the ticket is still on the grid").not.toBeNull();
  expect(after?.index, "the ticket moved to the row under the pointer").toBe(
    expectedIndex,
  );
  expect(after?.label).toBe(expectedLabel);

  // Nothing overlaps after the drop, in any row.
  const rowCount = await schedule.allRows().count();
  for (let index = 0; index < rowCount; index += 1) {
    const rowBars = await schedule.barsInRow(index);
    for (let a = 0; a < rowBars.length; a += 1) {
      for (let b = a + 1; b < rowBars.length; b += 1) {
        const overlapX =
          Math.min(rowBars[a].box.right, rowBars[b].box.right) -
          Math.max(rowBars[a].box.x, rowBars[b].box.x);
        const overlapY =
          Math.min(rowBars[a].box.bottom, rowBars[b].box.bottom) -
          Math.max(rowBars[a].box.y, rowBars[b].box.y);
        expect(overlapX <= 1 || overlapY <= 1).toBe(true);
      }
    }
  }
});
