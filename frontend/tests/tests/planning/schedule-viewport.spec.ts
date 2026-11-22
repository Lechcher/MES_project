/**
 * Schedule viewport: the grid fits the window and scrolls its timeline inside.
 *
 * Covers the requirement in
 * `openspec/changes/fix-schedule-scroll-chevrons-and-range-band/specs/frontend/planning/spec.md`:
 * the page never scrolls horizontally because of the schedule, the grid body
 * scrolls to reach every time column, and the employee column stays pinned
 * while the timeline scrolls.
 */

import { expect, test } from "../../fixtures";
import { SchedulePage } from "../../pages/planning/schedule";

const PLANNER = {
  email: "hr.manager@mes.local",
  password: "MES-dev-seed-2026!",
};

// A window narrower than the DAY scale's 24 hour columns (2336px), so the grid
// must scroll inside itself instead of stretching the page. The shell around
// the schedule still fits at this width, so the page's own scroll isolates the
// schedule's contribution.
test.use({ viewport: { width: 1440, height: 800 } });

test.beforeEach(async ({ loginPage }) => {
  await loginPage.goto();
  await loginPage.login(PLANNER.email, PLANNER.password);
});

test("the DAY scale fits the window and scrolls its timeline inside the grid", async ({
  page,
}) => {
  const schedule = new SchedulePage(page);
  await schedule.goto();
  await page.getByRole("button", { name: /^day$/i }).first().click();
  await schedule.waitForGridToSettle();

  // The page itself does not scroll horizontally.
  const pageOverflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(pageOverflow.scrollWidth).toBeLessThanOrEqual(
    pageOverflow.clientWidth + 1,
  );

  // The grid body is the scroll container: its content is wider than its box.
  const host = schedule.scrollHost();
  const hostBox = await host.evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
  }));
  expect(hostBox.scrollWidth).toBeGreaterThan(hostBox.clientWidth);

  // The employee column's screen position before the timeline scrolls.
  const pinnedBefore = await schedule
    .employeeCell()
    .evaluate((node) => node.getBoundingClientRect().x);

  // Scroll the grid body to the far end of the timeline.
  await host.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
  await page.waitForTimeout(400);
  expect(await host.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);

  // The last hour column is inside the window at the timeline's end.
  const lastHeader = page.locator("div.sticky.top-0.grid > div").last();
  await expect(lastHeader).toHaveText("23:00");
  const lastBox = await lastHeader.boundingBox();
  if (!lastBox) throw new Error("the last hour column has no box");
  expect(lastBox.x).toBeGreaterThanOrEqual(-1);
  expect(lastBox.x + lastBox.width).toBeLessThanOrEqual(
    pageOverflow.clientWidth + 1,
  );

  // The employee column keeps its screen position while the timeline moves.
  const pinnedAfter = await schedule
    .employeeCell()
    .evaluate((node) => node.getBoundingClientRect().x);
  expect(Math.abs(pinnedAfter - pinnedBefore)).toBeLessThanOrEqual(1);
});

test("a continuation chevron stands clear of the bar's content", async ({
  page,
}) => {
  const schedule = new SchedulePage(page);
  await schedule.goto();
  await page.getByRole("button", { name: /^day$/i }).first().click();
  await schedule.waitForGridToSettle();

  const bars = await schedule.chevronClearance();
  // The seeded tickets start before and end after the viewed day, so bars
  // carrying chevrons exist on this scale.
  const withChevrons = bars.filter((bar) => bar.chevronCount > 0);
  expect(withChevrons.length).toBeGreaterThan(0);

  for (const bar of withChevrons) {
    for (const chevron of bar.chevronBoxes) {
      for (const content of bar.contentBoxes) {
        // Full rectangle intersection: sharing only an x range with a
        // bottom-edge decoration like the progress strip is not an overlap.
        const overlaps =
          chevron.x < content.right &&
          content.x < chevron.right &&
          chevron.top < content.bottom &&
          content.top < chevron.bottom;
        expect(
          overlaps,
          `chevron [${chevron.x},${chevron.right}]×[${chevron.top},${chevron.bottom}] overlaps "${content.text}" [${content.x},${content.right}]×[${content.top},${content.bottom}] on ${bar.code}`,
        ).toBe(false);
      }
    }
  }
});

test("a narrow scale needs no horizontal scroll on the grid", async ({
  page,
}) => {
  const schedule = new SchedulePage(page);
  await schedule.goto();
  await page
    .getByRole("button", { name: /^week$/i })
    .first()
    .click();
  await schedule.waitForGridToSettle();

  // The WEEK scale's seven day columns fit the window, so the grid body
  // offers no horizontal scroll area at all.
  const hostBox = await schedule.scrollHost().evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
  }));
  expect(hostBox.scrollWidth).toBeLessThanOrEqual(hostBox.clientWidth + 1);

  // And the page still does not scroll horizontally.
  const pageOverflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(pageOverflow.scrollWidth).toBeLessThanOrEqual(
    pageOverflow.clientWidth + 1,
  );
});
