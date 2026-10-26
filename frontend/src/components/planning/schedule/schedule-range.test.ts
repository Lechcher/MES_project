/**
 * Pure date-math tests for the schedule grid.
 *
 * Covers every scale's column layout, bar clipping at the range edges,
 * multi-day spans, duration-preserving shifts, strict `DD/MM/YYYY` parsing,
 * and month/year navigation — the grid components consume these results
 * verbatim, so the math has to be right without React.
 */

import { describe, expect, test } from "bun:test";
import type { ScheduledTask, TaskType } from "@/lib/mes/queries/types";
import {
  assignLanes,
  columnsFor,
  customRange,
  defaultRange,
  formatDmy,
  isCanonical,
  parseDmy,
  placeBar,
  rangeFromParams,
  rangeParams,
  rowForLaneOffset,
  shiftByColumns,
  step,
  windowFor,
} from "./schedule-range";
import { taskPayloadFrom } from "./task-dates";

/** 09:00 local on the given day. */
function at(day: number, hour = 9): Date {
  return new Date(2026, 9, day, hour, 0, 0, 0); // October 2026
}

function barOf(
  start: Date | null,
  end: Date | null,
  taskType: TaskType = "DAILY",
): ScheduledTask {
  return {
    id: "t1",
    taskCode: "T-1",
    title: "Ticket",
    description: null,
    project: null,
    taskType,
    priority: "MEDIUM",
    state: "REQ",
    createdBy: null,
    assignedTo: null,
    department: null,
    startDate: start ? start.toISOString() : null,
    endDate: end ? end.toISOString() : null,
    extendedDeadline: null,
    progressPercentage: 0,
    isUrgentHourly: false,
    isExtensionRequested: false,
    isOverdue: false,
    badges: [],
    approvedBy: null,
    approvedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: start ? start.toISOString() : "2026-10-01T00:00:00.000Z",
    updatedAt: start ? start.toISOString() : "2026-10-01T00:00:00.000Z",
  };
}

describe("windowFor", () => {
  test("week starts on Monday and spans seven days", () => {
    const range = windowFor("WEEK", at(21, 15)); // Wednesday 21 Oct 2026
    expect(range.from.getDay()).toBe(1);
    expect(range.from.getDate()).toBe(19);
    expect(diffInDays(range.to, range.from)).toBe(7);
  });

  test("month and year windows are calendar-aligned", () => {
    const month = windowFor("MONTH", at(21, 15));
    expect(month.from.getDate()).toBe(1);
    expect(month.from.getMonth()).toBe(9);
    expect(month.to.getMonth()).toBe(10);

    const year = windowFor("YEAR", at(21, 15));
    expect(year.from.getMonth()).toBe(0);
    expect(year.from.getDate()).toBe(1);
    expect(year.to.getFullYear()).toBe(year.from.getFullYear() + 1);
  });

  test("day window is one local day", () => {
    const day = windowFor("DAY", at(21, 15));
    expect(day.from.getHours()).toBe(0);
    expect(diffInDays(day.to, day.from)).toBe(1);
  });

  test("the default view is the current week", () => {
    const range = defaultRange();
    expect(range.scale).toBe("WEEK");
    expect(isCanonical(range)).toBe(true);
    expect(range.from.getTime()).toBeLessThanOrEqual(Date.now());
    expect(range.to.getTime()).toBeGreaterThan(Date.now());
  });
});

function diffInDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/** `parseDmy` with the impossible-date check already covered above. */
function dmy(value: string): Date {
  const date = parseDmy(value);
  if (!date) throw new Error(`unparseable date: ${value}`);
  return date;
}

describe("columnsFor", () => {
  test("day scale yields 24 hour columns", () => {
    const cols = columnsFor(windowFor("DAY", at(21)));
    expect(cols).toHaveLength(24);
    expect(cols[0].getHours()).toBe(0);
    expect(cols[23].getHours()).toBe(23);
  });

  test("week scale yields the seven days", () => {
    const cols = columnsFor(windowFor("WEEK", at(21)));
    expect(cols).toHaveLength(7);
    expect(cols.map((col) => col.getDate())).toEqual([
      19, 20, 21, 22, 23, 24, 25,
    ]);
  });

  test("month scale yields one column per day of the month", () => {
    const cols = columnsFor(windowFor("MONTH", at(21)));
    expect(cols).toHaveLength(31);
    expect(cols[0].getDate()).toBe(1);
    expect(cols[30].getDate()).toBe(31);
  });

  test("year scale yields twelve first-of-month columns", () => {
    const cols = columnsFor(windowFor("YEAR", at(21)));
    expect(cols).toHaveLength(12);
    expect(cols[0].getMonth()).toBe(0);
    expect(cols[11].getMonth()).toBe(11);
    for (const col of cols) expect(col.getDate()).toBe(1);
  });

  test("a custom range yields exactly the entered days", () => {
    const range = customRange(dmy("01/11/2026"), dmy("15/11/2026"));
    const cols = columnsFor(range);
    expect(cols).toHaveLength(15);
    expect(cols[0].getDate()).toBe(1);
    expect(cols[14].getDate()).toBe(15);
  });
});

describe("placeBar", () => {
  const week = windowFor("WEEK", at(21)); // Mon 19 – Mon 26 Oct 2026
  const cols = columnsFor(week);

  test("a same-day ticket occupies one column", () => {
    expect(placeBar(barOf(at(21, 9), at(21, 17)), cols, "WEEK")).toEqual({
      start: 2,
      span: 1,
    });
  });

  test("a daily ticket occupies exactly one column however long its interval", () => {
    expect(placeBar(barOf(at(21, 9), at(21, 17)), cols, "WEEK")).toEqual({
      start: 2,
      span: 1,
    });

    // A daily ticket whose interval runs past its start day is pinned to the
    // single day it is due, so it is one column on that day rather than a span
    // the category does not allow — and rather than nothing at all.
    const long = barOf(at(21, 9), new Date(2026, 9, 22, 17, 0, 0, 0));
    expect(placeBar(long, cols, "WEEK")).toEqual({ start: 3, span: 1 });

    const threeDays = barOf(at(21, 9), new Date(2026, 9, 23, 17, 0, 0, 0));
    expect(placeBar(threeDays, cols, "WEEK")).toEqual({ start: 4, span: 1 });
  });

  test("a daily ticket stored spanning months is drawn on its due day", () => {
    // Real data: a daily ticket opened 27/07 and due 24/10, viewed on the week
    // of 19–25 Oct. It must be drawn on the day it is due, not dropped.
    const stored = barOf(
      new Date(2026, 6, 27, 0, 0, 0, 0),
      new Date(2026, 9, 24, 17, 0, 0, 0),
    );
    expect(placeBar(stored, cols, "WEEK")).toEqual({ start: 5, span: 1 });
  });

  test("a ticket with no start date is drawn on its end day", () => {
    const noStart = barOf(null, at(21, 17));
    expect(placeBar(noStart, cols, "WEEK")).toEqual({ start: 2, span: 1 });

    // Nothing says when it began, so an end beyond the window is treated as
    // still running: the bar is clamped to the window's last day.
    const beyond = barOf(null, new Date(2026, 10, 3, 17, 0, 0, 0));
    expect(placeBar(beyond, cols, "WEEK")).toEqual({ start: 6, span: 1 });

    // An end day before the window is finished work, so it draws nothing.
    const before = barOf(null, new Date(2026, 9, 5, 17, 0, 0, 0));
    expect(placeBar(before, cols, "WEEK")).toBeNull();
  });

  test("an out-of-shape daily ticket stays visible while it runs", () => {
    // Started inside the window, due well past it: drawn on the window's last
    // day rather than nowhere.
    const running = barOf(at(21, 9), new Date(2026, 10, 30, 17, 0, 0, 0));
    expect(placeBar(running, cols, "WEEK")).toEqual({ start: 6, span: 1 });

    // Started before the window and due inside it: drawn on its due day.
    const due = barOf(
      new Date(2026, 6, 27, 0, 0, 0, 0),
      new Date(2026, 9, 24, 17, 0, 0, 0),
    );
    expect(placeBar(due, cols, "WEEK")).toEqual({ start: 5, span: 1 });

    // Finished before the window: nothing.
    const done = barOf(at(5, 9), at(6, 17));
    expect(placeBar(done, cols, "WEEK")).toBeNull();
  });

  test("a multi-day ticket spans its days", () => {
    const start = at(19, 9);
    const end = new Date(2026, 9, 21, 17, 0, 0, 0);
    expect(placeBar(barOf(start, end, "MULTI_DAY"), cols, "WEEK")).toEqual({
      start: 0,
      span: 3,
    });
  });

  test("an end stored at local midnight covers through the day before", () => {
    // The editor writes a multi-day ticket's end as the next local midnight,
    // so an end of 22/10 00:00 means "due 21/10" — never a day wider.
    const start = at(20, 8);
    const end = new Date(2026, 9, 22, 0, 0, 0, 0);
    expect(placeBar(barOf(start, end, "MULTI_DAY"), cols, "WEEK")).toEqual({
      start: 1,
      span: 2,
    });
  });

  test("a timed end still keeps its final day", () => {
    // A multi-day ticket due 31/10 at 06:59 covers every day up to the 31st —
    // twelve days, on a scale wide enough to show all of them.
    const monthCols = columnsFor(windowFor("MONTH", at(21)));
    const start = at(20, 9);
    const end = new Date(2026, 9, 31, 6, 59, 0, 0);
    expect(
      placeBar(barOf(start, end, "MULTI_DAY"), monthCols, "MONTH"),
    ).toEqual({ start: 19, span: 12 });
  });

  test("an editor's multi-day end day is the last day its bar covers", () => {
    // `taskPayloadFrom` writes the end day as the next local midnight; the bar
    // must stop on the end day it was given, not spill a day past it.
    const monthCols = columnsFor(windowFor("MONTH", at(21)));
    const payload = taskPayloadFrom({
      taskType: "MULTI_DAY",
      day: "2026-10-20",
      endDay: "2026-10-31",
    });
    expect(payload).not.toBeNull();
    if (!payload) return;
    const task = barOf(
      new Date(payload.startDate),
      new Date(payload.endDate),
      "MULTI_DAY",
    );
    // 20/10 through 31/10 inclusive is twelve days.
    expect(placeBar(task, monthCols, "MONTH")).toEqual({ start: 19, span: 12 });
  });

  test("an hourly ticket never gains a day from its end date", () => {
    // A by-the-hour ticket whose end is stored at local midnight keeps its
    // hours instead of spilling onto the next day's column.
    const midnightEnd = barOf(
      at(21, 9),
      new Date(2026, 9, 22, 0, 0, 0, 0),
      "HOURLY",
    );
    expect(placeBar(midnightEnd, cols, "WEEK")).toEqual({ start: 2, span: 1 });
  });

  test("bars are clipped at both range edges", () => {
    // Starts the week before, ends the week after.
    const before = barOf(
      new Date(2026, 9, 16, 9, 0, 0),
      at(20, 17),
      "MULTI_DAY",
    );
    expect(placeBar(before, cols, "WEEK")).toEqual({ start: 0, span: 2 });

    const after = barOf(
      at(24, 9),
      new Date(2026, 9, 28, 17, 0, 0),
      "MULTI_DAY",
    );
    expect(placeBar(after, cols, "WEEK")).toEqual({ start: 5, span: 2 });
  });

  test("tickets outside the range and tickets without any dates cannot be placed", () => {
    expect(
      placeBar(barOf(new Date(2026, 10, 3, 9), null), cols, "WEEK"),
    ).toBeNull();
    expect(placeBar(barOf(null, null), cols, "WEEK")).toBeNull();
  });

  test("the day scale places bars by hour slot", () => {
    const dayCols = columnsFor(windowFor("DAY", at(21)));
    const urgent = barOf(
      new Date(2026, 9, 21, 14, 0, 0),
      new Date(2026, 9, 21, 15, 0, 0),
      "HOURLY",
    );
    expect(placeBar(urgent, dayCols, "DAY")).toEqual({ start: 14, span: 1 });

    const late = barOf(new Date(2026, 9, 21, 22, 0, 0), null);
    expect(placeBar(late, dayCols, "DAY")).toEqual({ start: 22, span: 1 });
  });

  test("the day scale covers exactly the hours an hourly ticket was given", () => {
    const dayCols = columnsFor(windowFor("DAY", at(21)));
    expect(
      placeBar(
        barOf(
          new Date(2026, 9, 21, 18, 0, 0),
          new Date(2026, 9, 21, 22, 0, 0),
          "HOURLY",
        ),
        dayCols,
        "DAY",
      ),
    ).toEqual({ start: 18, span: 4 });
  });

  test("the day scale keeps a daily ticket inside its own day", () => {
    const dayCols = columnsFor(windowFor("DAY", at(21)));
    const throughMidnight = barOf(at(21, 9), new Date(2026, 9, 22, 0, 0, 0, 0));
    expect(placeBar(throughMidnight, dayCols, "DAY")).toEqual({
      start: 9,
      span: 15,
    });
  });

  test("the day scale shows a multi-day ticket on each of its days", () => {
    const dayCols = columnsFor(windowFor("DAY", at(21)));
    const middle = barOf(
      at(19, 9),
      new Date(2026, 9, 23, 17, 0, 0),
      "MULTI_DAY",
    );
    expect(placeBar(middle, dayCols, "DAY")).toEqual({ start: 0, span: 24 });
    expect(
      placeBar(middle, columnsFor(windowFor("DAY", at(20))), "DAY"),
    ).toEqual({ start: 0, span: 24 });
  });

  test("the year scale places bars by month", () => {
    const yearCols = columnsFor(windowFor("YEAR", at(21)));
    const quarter = barOf(
      new Date(2026, 2, 15, 9, 0, 0),
      new Date(2026, 4, 30, 17, 0, 0),
      "MULTI_DAY",
    );
    expect(placeBar(quarter, yearCols, "YEAR")).toEqual({ start: 2, span: 3 });

    const oneDay = barOf(
      new Date(2026, 2, 15, 9, 0, 0),
      new Date(2026, 2, 15, 17, 0, 0),
    );
    expect(placeBar(oneDay, yearCols, "YEAR")).toEqual({ start: 2, span: 1 });
  });
});

describe("assignLanes", () => {
  const week = windowFor("WEEK", at(21)); // Mon 19 – Mon 26 Oct 2026
  const cols = columnsFor(week);

  const lanesOf = (tasks: ScheduledTask[]) =>
    assignLanes(tasks, cols, "WEEK").map(({ task, placement, lane }) => ({
      code: task.taskCode,
      ...placement,
      lane,
    }));

  function ticket(
    code: string,
    start: Date,
    end: Date,
    type: TaskType = "DAILY",
  ): ScheduledTask {
    return { ...barOf(start, end, type), id: code, taskCode: code };
  }

  test("tickets that do not overlap share one lane", () => {
    const lanes = lanesOf([
      ticket("A", at(19, 9), at(19, 17)),
      ticket("B", at(20, 9), at(20, 17)),
      ticket("C", at(21, 9), at(21, 17)),
    ]);
    expect(lanes).toEqual([
      { code: "A", start: 0, span: 1, lane: 0 },
      { code: "B", start: 1, span: 1, lane: 0 },
      { code: "C", start: 2, span: 1, lane: 0 },
    ]);
  });

  test("overlap moves a ticket to the next lane", () => {
    const lanes = lanesOf([
      ticket("A", at(19, 9), at(21, 17), "MULTI_DAY"),
      ticket("B", at(20, 9), at(20, 17)),
      ticket("C", at(22, 9), at(22, 17)),
    ]);
    expect(lanes).toEqual([
      { code: "A", start: 0, span: 3, lane: 0 },
      { code: "B", start: 1, span: 1, lane: 1 },
      { code: "C", start: 3, span: 1, lane: 0 },
    ]);
    expect(Math.max(...lanes.map((l) => l.lane)) + 1).toBe(2);
  });

  test("a lane is reused as soon as it frees up", () => {
    // A covers columns 0 and 1; B is pushed to lane 1; C starts on column 2,
    // after A's lane is free, so it returns to lane 0.
    const lanes = lanesOf([
      ticket("A", at(19, 9), new Date(2026, 9, 20, 17, 0, 0), "MULTI_DAY"),
      ticket("B", at(19, 9), at(19, 17)),
      ticket("C", at(21, 9), at(21, 17)),
    ]);
    expect(lanes.find((l) => l.code === "B")?.lane).toBe(1);
    expect(lanes.find((l) => l.code === "C")?.lane).toBe(0);
  });

  test("equal starts are ordered by the longer bar first", () => {
    const lanes = lanesOf([
      ticket("A", at(19, 9), at(19, 17)),
      ticket("B", at(19, 9), at(21, 17), "MULTI_DAY"),
    ]);
    expect(lanes.find((l) => l.code === "B")?.lane).toBe(0);
    expect(lanes.find((l) => l.code === "A")?.lane).toBe(1);
  });

  test("tickets outside the visible range are dropped", () => {
    expect(
      lanesOf([ticket("A", new Date(2026, 9, 30, 9), at(30, 17))]),
    ).toEqual([]);
  });

  test("the input order is preserved for the renderer", () => {
    const lanes = assignLanes(
      [
        ticket("A", at(19, 9), at(19, 17)),
        ticket("B", at(19, 9), at(21, 17), "MULTI_DAY"),
        ticket("C", at(20, 9), at(20, 17)),
      ],
      cols,
      "WEEK",
    );
    expect(lanes.map((l) => l.task.taskCode)).toEqual(["A", "B", "C"]);
  });

  test("no two bars share a lane while overlapping columns", () => {
    // The row shape the schedule must draw without collisions: several
    // overlapping multi-day and daily tickets.
    const tasks = [
      ticket("A", at(19, 9), new Date(2026, 9, 21, 17, 0, 0), "MULTI_DAY"),
      ticket("B", at(19, 9), at(19, 17)),
      ticket("C", at(20, 9), new Date(2026, 9, 22, 17, 0, 0), "MULTI_DAY"),
      ticket("D", at(21, 9), at(21, 17)),
      ticket("E", at(22, 9), new Date(2026, 9, 24, 17, 0, 0), "MULTI_DAY"),
      ticket("F", at(19, 9), new Date(2026, 9, 23, 17, 0, 0), "MULTI_DAY"),
    ];
    const lanes = assignLanes(tasks, cols, "WEEK");
    const bars = lanes.map(({ task, placement, lane }) => ({
      code: task.taskCode,
      ...placement,
      lane,
    }));

    for (let i = 0; i < bars.length; i += 1) {
      for (let j = i + 1; j < bars.length; j += 1) {
        const a = bars[i];
        const b = bars[j];
        if (a.lane !== b.lane) continue;
        const overlaps =
          a.start < b.start + b.span && b.start < a.start + a.span;
        expect(overlaps).toBe(false);
      }
    }

    // No bar is wider than the whole days its ticket covers.
    for (const lane of lanes) {
      const days = wholeDaysCovered(lane.task);
      expect(lane.placement.span).toBeGreaterThanOrEqual(1);
      expect(lane.placement.span).toBeLessThanOrEqual(days);
    }
  });

  test("the packer's placement matches a fresh placeBar call", () => {
    const tasks = [
      ticket("A", at(19, 9), new Date(2026, 9, 21, 17, 0, 0), "MULTI_DAY"),
      ticket("B", at(19, 9), at(19, 17)),
      ticket("C", at(20, 9), new Date(2026, 9, 22, 17, 0, 0), "MULTI_DAY"),
    ];
    for (const { task, placement } of assignLanes(tasks, cols, "WEEK")) {
      expect(placeBar(task, cols, "WEEK")).toEqual(placement);
    }
  });

  test("tickets stored outside their category still occupy a lane", () => {
    // A daily ticket spanning months and a ticket with no start date are both
    // drawn on the day they are due instead of being dropped from the row.
    const lanes = lanesOf([
      ticket(
        "A",
        new Date(2026, 6, 27, 0, 0, 0, 0),
        new Date(2026, 9, 24, 17, 0, 0, 0),
      ),
      ticket("B", null, at(21, 17)),
    ]);
    expect(lanes.map((l) => l.code).sort()).toEqual(["A", "B"]);
    expect(lanes.find((l) => l.code === "A")?.start).toBe(5);
    expect(lanes.find((l) => l.code === "B")?.start).toBe(2);
    for (const lane of lanes) {
      expect(lane.span).toBe(1);
    }
  });
});

/** The whole local days a ticket's stored interval covers. */
function wholeDaysCovered(task: ScheduledTask): number {
  const start = task.startDate ? new Date(task.startDate) : null;
  const end = task.endDate ? new Date(task.endDate) : null;
  if (!start || !end) return 1;
  const from = new Date(start);
  from.setHours(0, 0, 0, 0);
  const to = new Date(end);
  to.setHours(0, 0, 0, 0);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 1;
  return Math.max(
    1,
    Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1,
  );
}

describe("rowForLaneOffset", () => {
  test("maps an absolute lane offset onto the row that owns it", () => {
    // Rows with 1, 2 and 1 lanes: lanes 0 | 1,2 | 3
    expect(rowForLaneOffset([1, 2, 1], 0)).toBe(0);
    expect(rowForLaneOffset([1, 2, 1], 1)).toBe(1);
    expect(rowForLaneOffset([1, 2, 1], 2)).toBe(1);
    expect(rowForLaneOffset([1, 2, 1], 3)).toBe(2);
  });

  test("clamps an offset that falls past the last row", () => {
    expect(rowForLaneOffset([1, 1], 5)).toBe(1);
    expect(rowForLaneOffset([], 3)).toBe(0);
  });

  test("rows of unequal lane counts still resolve a cross-row drop", () => {
    // Diego 1 lane, Mina 5, Hana 4: lanes 0 | 1-5 | 6-9.
    const laneCounts = [1, 5, 4];
    // A drop from Mina's last lane (5) down one lane lands on Hana.
    expect(rowForLaneOffset(laneCounts, 6)).toBe(2);
    // A drop from Mina's first lane (1) down four lanes stays inside Mina.
    expect(rowForLaneOffset(laneCounts, 5)).toBe(1);
    // A drop from Mina's first lane up one lane lands on Diego.
    expect(rowForLaneOffset(laneCounts, 0)).toBe(0);
    // A one-lane row above a tall one: dropping one lane from Diego (0) reaches
    // Mina even though Mina is 5 lanes tall.
    expect(rowForLaneOffset([1, 5, 1], 1)).toBe(1);
    // A tall row followed by a short one: dropping from Hana's last lane (9)
    // down one lane reaches the row after it.
    expect(rowForLaneOffset([1, 5, 4, 1], 10)).toBe(3);
  });
});

describe("shiftByColumns", () => {
  test("a day-column shift preserves the duration and the time of day", () => {
    const task = barOf(at(19, 9), new Date(2026, 9, 21, 17, 0, 0));
    const moved = shiftByColumns(task, 2, "WEEK");
    expect(moved.startDate).toBe(new Date(2026, 9, 21, 9).toISOString());
    expect(moved.endDate).toBe(new Date(2026, 9, 23, 17).toISOString());
  });

  test("a day-scale shift moves by hours", () => {
    const task = barOf(
      new Date(2026, 9, 21, 14, 0, 0),
      new Date(2026, 9, 21, 15, 0, 0),
    );
    const moved = shiftByColumns(task, 2, "DAY");
    expect(moved.startDate).toBe(new Date(2026, 9, 21, 16).toISOString());
    expect(moved.endDate).toBe(new Date(2026, 9, 21, 17).toISOString());
  });

  test("a year-scale shift moves by months", () => {
    const task = barOf(
      new Date(2026, 2, 15, 9, 0, 0),
      new Date(2026, 4, 30, 17, 0, 0),
    );
    const moved = shiftByColumns(task, 3, "YEAR");
    expect(moved.startDate).toBe(new Date(2026, 5, 15, 9).toISOString());
    expect(moved.endDate).toBe(new Date(2026, 7, 30, 17).toISOString());
  });

  test("a ticket without an end date keeps the shift and an empty end", () => {
    const task = barOf(at(19, 9), null);
    const moved = shiftByColumns(task, 1, "WEEK");
    expect(moved.startDate).toBe(new Date(2026, 9, 20, 9).toISOString());
    expect(moved.endDate).toBe("");
  });
});

describe("parseDmy and formatDmy", () => {
  test("parses DD/MM/YYYY in local time", () => {
    const date = parseDmy("05/11/2026");
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(10);
    expect(date?.getDate()).toBe(5);
  });

  test("rejects impossible and malformed dates", () => {
    expect(parseDmy("31/02/2026")).toBeNull();
    expect(parseDmy("2026/11/05")).toBeNull();
    expect(parseDmy("5/11/2026")).toBeNull();
    expect(parseDmy("05/13/2026")).toBeNull();
    expect(parseDmy("")).toBeNull();
  });

  test("formats back to DD/MM/YYYY", () => {
    expect(formatDmy(new Date(2026, 10, 5))).toBe("05/11/2026");
    expect(formatDmy(new Date(2026, 0, 31))).toBe("31/01/2026");
  });
});

describe("step", () => {
  test("month scale steps to the following calendar month", () => {
    const october = windowFor("MONTH", at(21));
    const november = step(october, 1);
    expect(november.from.getMonth()).toBe(10);
    expect(november.to.getMonth()).toBe(11);
    expect(columnsFor(november)).toHaveLength(30);
    expect(step(november, -1).from.getMonth()).toBe(9);
  });

  test("year scale steps to the following calendar year", () => {
    const y2026 = windowFor("YEAR", at(21));
    const y2027 = step(y2026, 1);
    expect(y2027.from.getFullYear()).toBe(2027);
    expect(y2027.to.getFullYear()).toBe(2028);
    expect(step(y2027, -1).from.getFullYear()).toBe(2026);
  });

  test("week and day scales step by seven days and one day", () => {
    const week = windowFor("WEEK", at(21));
    expect(step(week, 1).from.getDate()).toBe(26);
    const day = windowFor("DAY", at(21));
    expect(step(day, -1).from.getDate()).toBe(20);
  });

  test("a custom range slides by its own length", () => {
    const range = customRange(dmy("01/11/2026"), dmy("15/11/2026"));
    const next = step(range, 1);
    expect(next.from.getDate()).toBe(16);
    expect(next.from.getMonth()).toBe(10);
    expect(columnsFor(next)).toHaveLength(15);
    expect(isCanonical(range)).toBe(false);
  });
});

describe("URL round-trip", () => {
  test("canonical ranges serialize without `to` and restore", () => {
    const range = windowFor("WEEK", at(21));
    const params = rangeParams(range);
    expect(params.to).toBeUndefined();
    expect(rangeFromParams(params.scale, params.from, null)).toEqual(range);
  });

  test("custom ranges keep their exact window", () => {
    const range = customRange(dmy("01/11/2026"), dmy("15/11/2026"));
    const params = rangeParams(range);
    expect(params.to).toBe("2026-11-15");
    expect(rangeFromParams(params.scale, params.from, params.to)).toEqual(
      range,
    );
  });

  test("invalid params fall back to the default week", () => {
    const fallback = rangeFromParams("NOPE", "31/02/2026", null);
    expect(fallback.scale).toBe("WEEK");
    expect(isCanonical(fallback)).toBe(true);
  });
});
