/**
 * Pure date math for the Planning Schedule.
 *
 * The schedule grid is dumb: it renders one column per entry of `columnsFor`
 * and one bar per `placeBar` result. Everything calendar-related — the
 * window for a scale, the columns inside it, where a ticket's bar starts and
 * how long it is, how a drag of N columns changes its dates, and how
 * navigation steps — lives here so it can be unit-tested without React.
 *
 * All dates are local time. A `ScheduleRange` is `[from, to)` with `from` at
 * local midnight; a custom range may be unaligned to its scale's calendar
 * boundaries, in which case navigation slides by the range's own length.
 */

import type {
  ScheduledTask,
  ScheduleRange,
  ScheduleScale,
} from "@/lib/mes/queries/types";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export const SCALES: readonly ScheduleScale[] = [
  "DAY",
  "WEEK",
  "MONTH",
  "YEAR",
];

export function isScale(
  value: string | null | undefined,
): value is ScheduleScale {
  return (
    value !== null &&
    value !== undefined &&
    (SCALES as readonly string[]).includes(value)
  );
}

/* ------------------------------------------------------------------ */
/* Local date helpers                                                  */
/* ------------------------------------------------------------------ */

export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function isMidnight(date: Date): boolean {
  return (
    date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0
  );
}

export function addHours(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Add calendar months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const daysInMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(day, daysInMonth));
  return result;
}

/** Monday 00:00 of the week containing `date`. */
export function startOfWeekMonday(date: Date): Date {
  const result = startOfDay(date);
  const weekday = (result.getDay() + 6) % 7; // Monday = 0
  return addDays(result, -weekday);
}

export function startOfMonth(date: Date): Date {
  const result = startOfDay(date);
  result.setDate(1);
  return result;
}

export function startOfYear(date: Date): Date {
  const result = startOfDay(date);
  result.setMonth(0, 1);
  return result;
}

/** Signed count of local days from `b` to `a`, tolerant of DST shifts. */
function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}

/* ------------------------------------------------------------------ */
/* Scale windows                                                      */
/* ------------------------------------------------------------------ */

/** The canonical `[from, to)` window of `scale` containing `anchor`. */
export function windowFor(scale: ScheduleScale, anchor: Date): ScheduleRange {
  switch (scale) {
    case "DAY": {
      const from = startOfDay(anchor);
      return { scale, from, to: addDays(from, 1) };
    }
    case "WEEK": {
      const from = startOfWeekMonday(anchor);
      return { scale, from, to: addDays(from, 7) };
    }
    case "YEAR": {
      const from = startOfYear(anchor);
      return { scale, from, to: addMonths(from, 12) };
    }
    default: {
      const from = startOfMonth(anchor);
      return { scale, from, to: addMonths(from, 1) };
    }
  }
}

/** The default view: the current week, Monday to Monday. */
export function defaultRange(): ScheduleRange {
  return windowFor("WEEK", new Date());
}

/** True when the range is the canonical window of its scale at `from`. */
export function isCanonical(range: ScheduleRange): boolean {
  const canonical = windowFor(range.scale, range.from);
  return (
    canonical.from.getTime() === range.from.getTime() &&
    canonical.to.getTime() === range.to.getTime()
  );
}

/* ------------------------------------------------------------------ */
/* Columns                                                            */
/* ------------------------------------------------------------------ */

/**
 * One `Date` per grid column: hours for the Day scale, days for Week and
 * Month (including custom day ranges), and first-of-month for Year.
 */
export function columnsFor(range: ScheduleRange): Date[] {
  const columns: Date[] = [];
  if (range.scale === "DAY") {
    for (let at = new Date(range.from); at < range.to; at = addHours(at, 1)) {
      columns.push(new Date(at));
    }
    return columns;
  }
  if (range.scale === "YEAR") {
    for (
      let at = startOfMonth(range.from);
      at < range.to;
      at = addMonths(at, 1)
    ) {
      columns.push(new Date(at));
    }
    return columns;
  }
  for (let at = startOfDay(range.from); at < range.to; at = addDays(at, 1)) {
    columns.push(new Date(at));
  }
  return columns;
}

/* ------------------------------------------------------------------ */
/* Bar placement                                                      */
/* ------------------------------------------------------------------ */

/**
 * The exclusive end of a ticket's interval, in local time.
 *
 * The interval is half-open `[start, end)`, so an end stored at local
 * midnight covers through the day before it: an end of `07/11 00:00` is "due
 * 06/11". That is exactly what the editor writes for a `MULTI_DAY` ticket
 * whose end day is the 6th, so a stored end never has to be interpreted any
 * further. An `HOURLY` ticket's end is the exact instant it was given.
 */
function exclusiveEndOf(task: ScheduledTask): Date | null {
  const endAt = task.endDate ? new Date(task.endDate) : null;
  if (!endAt || Number.isNaN(endAt.getTime())) return null;
  return endAt;
}

function earlier(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

/** True for categories whose dates are measured in whole days. */
function isDayBasedTask(task: ScheduledTask): boolean {
  return task.taskType !== "HOURLY";
}

/**
 * The last whole local day a ticket's interval covers, or `null` when it has
 * no usable end. An end at local midnight is an exclusive boundary for
 * day-based tickets — an end date means "through the day before" — so the last
 * covered moment is the millisecond before the stored end either way.
 */
function lastDayOf(endAt: Date | null): Date | null {
  if (!endAt || Number.isNaN(endAt.getTime())) return null;
  return startOfDay(new Date(endAt.getTime() - 1));
}

/**
 * The last day a ticket's bar covers, for the schedule's "continues later"
 * indicator. Reads the same half-open convention the placement does, so a bar
 * that stops on the last visible day is not marked as running past it.
 */
export function lastCoveredDay(task: ScheduledTask): Date | null {
  return lastDayOf(task.endDate ? new Date(task.endDate) : null);
}

/**
 * Where a ticket's bar sits on the columns: the 0-based start index and the
 * number of columns it spans, clipped to the visible range. `null` when the
 * ticket cannot be placed (no dates at all, or no overlap with the range).
 *
 * The span follows the ticket's category, so a `DAILY` ticket always reads as
 * one day and an `HOURLY` ticket as exactly the hours it was given:
 *
 * - Day scale (hour columns): the columns that contain the interval. A
 *   day-based ticket is clipped to the day it starts on, so a multi-day ticket
 *   still shows one bar per visible day.
 * - Week and Month scale (day columns): `DAILY`/`HOURLY` one day,
 *   `MULTI_DAY` its inclusive start day through end day.
 * - Year scale (month columns): `DAILY`/`HOURLY` one month, `MULTI_DAY` its
 *   inclusive start month through end month.
 *
 * A ticket stored outside its category's shape — a `DAILY` or `HOURLY` ticket
 * whose interval runs past its start day, or a ticket with no start date — is
 * pinned to the single day it is due, so work that falls inside the window is
 * never silently left off the grid.
 */
export function placeBar(
  task: ScheduledTask,
  cols: Date[],
  scale: ScheduleScale,
): { start: number; span: number } | null {
  if (cols.length === 0) return null;
  const startAt = task.startDate ? new Date(task.startDate) : null;
  if (startAt && Number.isNaN(startAt.getTime())) return null;
  if (!startAt && !task.endDate) return null;

  const exclusiveEnd = exclusiveEndOf(task);
  const endAt = task.endDate ? new Date(task.endDate) : null;
  const startDay = startAt ? startOfDay(startAt) : null;
  const lastDay = lastDayOf(endAt);

  // `DAILY` and `HOURLY` bars are one column, and so is a spanning ticket with
  // no start date. Such a ticket is drawn on the single day it is due, clamped
  // into the window when its interval runs past it, so work the window still
  // holds is never left off the grid.
  const isOneColumn = task.taskType !== "MULTI_DAY" || !startDay;
  const due =
    lastDay && (!startDay || lastDay.getTime() > startDay.getTime())
      ? lastDay
      : (startDay ?? lastDay);
  if (isOneColumn && !due) return null;

  // The window's first and last column, in the anchor's own unit.
  const firstColumn =
    scale === "YEAR" ? startOfMonth(cols[0]) : startOfDay(cols[0]);
  const lastColumn =
    scale === "YEAR"
      ? startOfMonth(cols[cols.length - 1])
      : startOfDay(cols[cols.length - 1]);

  // The day the bar is anchored to: the start day for a spanning bar, the due
  // day for a one-column one.
  let anchor = startDay;
  if (isOneColumn) {
    if ((due as Date).getTime() < firstColumn.getTime()) return null;
    if (startDay && startDay.getTime() > lastColumn.getTime()) return null;
    anchor =
      (due as Date).getTime() > lastColumn.getTime()
        ? lastColumn
        : (due as Date);
  }
  if (!anchor) return null;

  let start = 0;
  let span = 1;
  if (scale === "DAY") {
    // A one-column ticket that starts inside the visible day keeps its stored
    // hours; one that started earlier, or has no start, fills the day it is
    // due on.
    if (startAt && startDay && startDay.getTime() === due?.getTime()) {
      const from = startAt.getTime() > cols[0].getTime() ? startAt : cols[0];
      const to = isDayBasedTask(task)
        ? exclusiveEnd
          ? earlier(exclusiveEnd, addDays(cols[0], 1))
          : addHours(startAt, 1)
        : (exclusiveEnd ?? addHours(startAt, 1));
      if (to.getTime() <= from.getTime()) return null;
      const rawSpan = (to.getTime() - from.getTime()) / HOUR_MS;
      if (rawSpan <= 0) return null;
      start = Math.floor((from.getTime() - cols[0].getTime()) / HOUR_MS);
      span = Math.max(1, Math.ceil(rawSpan));
    } else if (isOneColumn) {
      if (anchor.getTime() !== firstColumn.getTime()) return null;
      return { start: 0, span: 24 };
    } else {
      // A spanning ticket that starts before the visible day, or has no start
      // date at all, covers the visible day.
      const from =
        startAt && startAt.getTime() > cols[0].getTime() ? startAt : cols[0];
      const to = isDayBasedTask(task)
        ? exclusiveEnd
          ? earlier(exclusiveEnd, addDays(cols[0], 1))
          : addDays(cols[0], 1)
        : (exclusiveEnd ?? addHours(startAt as Date, 1));
      if (to.getTime() <= from.getTime()) return null;
      const rawSpan = (to.getTime() - from.getTime()) / HOUR_MS;
      if (rawSpan <= 0) return null;
      start = Math.floor((from.getTime() - cols[0].getTime()) / HOUR_MS);
      span = Math.max(1, Math.ceil(rawSpan));
    }
  } else if (scale === "YEAR") {
    const month = anchor as Date;
    start =
      (month.getFullYear() - cols[0].getFullYear()) * 12 +
      (month.getMonth() - cols[0].getMonth());
    if (isOneColumn) {
      span = 1;
    } else {
      // The month the ticket's last covered day falls in, so a ticket that
      // ends at local midnight does not reach into the next month's column.
      const last = lastDay ?? addDays(startOfDay(startDay as Date), 1);
      span = Math.max(
        1,
        (last.getFullYear() - (startDay as Date).getFullYear()) * 12 +
          (last.getMonth() - (startDay as Date).getMonth()) +
          1,
      );
    }
  } else {
    start = diffDays(anchor, cols[0]);
    if (isOneColumn) {
      span = 1;
    } else {
      // `MULTI_DAY`: the inclusive start day through the last day the ticket
      // covers, so a timed end still keeps its final day.
      const last = lastDay ?? anchor;
      span = Math.max(1, diffDays(last, anchor) + 1);
    }
  }

  const visibleStart = Math.max(0, start);
  const visibleEnd = Math.min(cols.length, start + span);
  if (visibleEnd <= visibleStart) return null;
  return { start: visibleStart, span: visibleEnd - visibleStart };
}

/* ------------------------------------------------------------------ */
/* Lane packing                                                       */
/* ------------------------------------------------------------------ */

/** One ticket's bar on its row: where it sits and which lane it occupies. */
export interface TicketLane {
  task: ScheduledTask;
  placement: { start: number; span: number };
  /** 0-based sub-row inside the employee row. */
  lane: number;
}

/**
 * Pack a row's bars into lanes so overlapping tickets never draw on top of
 * each other: the lane that finishes first is reused first. Tickets that
 * cannot be placed on the visible columns are dropped. The order of the input
 * is preserved, so the renderer can map the result back onto its tasks.
 */
export function assignLanes(
  tasks: ScheduledTask[],
  cols: Date[],
  scale: ScheduleScale,
): TicketLane[] {
  const placed: (TicketLane & { end: number; code: string })[] = [];
  for (const task of tasks) {
    const placement = placeBar(task, cols, scale);
    if (!placement) continue;
    placed.push({
      task,
      placement,
      lane: 0,
      end: placement.start + placement.span,
      code: task.taskCode,
    });
  }

  // Earliest start first, then the longest bar, so a lane is never opened
  // for a short bar that a longer one could have shared.
  placed.sort((a, b) => {
    if (a.placement.start !== b.placement.start) {
      return a.placement.start - b.placement.start;
    }
    if (a.end !== b.end) return b.end - a.end;
    return a.code.localeCompare(b.code);
  });

  const laneEnds: number[] = [];
  for (const item of placed) {
    let lane = laneEnds.findIndex((end) => end <= item.placement.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    item.lane = lane;
  }

  return placed
    .map((item) => ({
      task: item.task,
      placement: item.placement,
      lane: item.lane,
    }))
    .sort((a, b) => {
      const indexA = tasks.indexOf(a.task);
      const indexB = tasks.indexOf(b.task);
      return indexA - indexB;
    });
}

/** The lanes of an employee row, in render order, as lane counts. */
export type LaneCounts = number[];

/**
 * Which employee row owns absolute lane `laneOffset`, given each row's lane
 * count. A row's first lane is the sum of the counts of the rows above it, so
 * a drag of `n` lanes lands on the row that contains `firstLane + n` — which
 * keeps a drop on target when rows have grown to different heights.
 */
export function rowForLaneOffset(
  laneCounts: LaneCounts,
  laneOffset: number,
): number {
  let accumulated = 0;
  for (let index = 0; index < laneCounts.length; index += 1) {
    accumulated += Math.max(1, laneCounts[index]);
    if (laneOffset < accumulated) return index;
  }
  return Math.max(0, laneCounts.length - 1);
}

/* ------------------------------------------------------------------ */
/* Moving by columns                                                  */
/* ------------------------------------------------------------------ */

/**
 * The new dates when a ticket moves `delta` columns (one hour on Day, one day
 * on Week/Month, one month on Year). The duration — and the time of day —
 * is preserved. `endDate` is empty when the ticket has none, so the caller
 * can leave it untouched.
 */
export function shiftByColumns(
  task: ScheduledTask,
  delta: number,
  scale: ScheduleScale,
): { startDate: string; endDate: string } {
  const startAt = task.startDate ? new Date(task.startDate) : null;
  const endAt = task.endDate ? new Date(task.endDate) : null;
  if (!startAt || Number.isNaN(startAt.getTime())) {
    return { startDate: task.startDate ?? "", endDate: task.endDate ?? "" };
  }

  const shift = (date: Date): Date => {
    if (scale === "DAY") return addHours(date, delta);
    if (scale === "YEAR") return addMonths(date, delta);
    return addDays(date, delta);
  };

  return {
    startDate: shift(startAt).toISOString(),
    endDate:
      endAt && !Number.isNaN(endAt.getTime()) ? shift(endAt).toISOString() : "",
  };
}

/* ------------------------------------------------------------------ */
/* DD/MM/YYYY parsing                                                 */
/* ------------------------------------------------------------------ */

const DMY = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** Strict `DD/MM/YYYY` in local time; rejects impossible dates like 31/02. */
export function parseDmy(value: string): Date | null {
  const match = DMY.exec(value.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function formatDmy(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/**
 * A custom `[from, to]` day range from two `DD/MM/YYYY` dates. The end date
 * is inclusive on screen, so the exclusive `to` is the following midnight.
 */
export function customRange(from: Date, to: Date): ScheduleRange {
  const start = startOfDay(from);
  const endExclusive = addDays(startOfDay(to), 1);
  return { scale: "MONTH", from: start, to: endExclusive };
}

/* ------------------------------------------------------------------ */
/* Navigation                                                         */
/* ------------------------------------------------------------------ */

/**
 * Move the range one unit of its scale: a canonical window snaps to the next
 * calendar window (following month, year, …); a custom range slides by its
 * own length so the whole window shifts together.
 */
export function step(range: ScheduleRange, dir: -1 | 1): ScheduleRange {
  if (!isCanonical(range)) {
    const duration = diffDays(range.to, range.from);
    return {
      scale: range.scale,
      from: addDays(range.from, dir * duration),
      to: addDays(range.to, dir * duration),
    };
  }

  const anchor = (() => {
    switch (range.scale) {
      case "DAY":
        return addDays(range.from, dir);
      case "WEEK":
        return addDays(range.from, dir * 7);
      case "YEAR":
        return addMonths(range.from, dir * 12);
      default:
        return addMonths(range.from, dir);
    }
  })();
  return windowFor(range.scale, anchor);
}

/* ------------------------------------------------------------------ */
/* URL round-trip                                                     */
/* ------------------------------------------------------------------ */

/** Local date as `YYYY-MM-DD` (for URL params and API date-only bounds). */
export function toIsoDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** URL search params for a range: `scale`, `from` (YYYY-MM-DD), `to` when custom. */
export function rangeParams(range: ScheduleRange): {
  scale: string;
  from: string;
  to?: string;
} {
  const params: { scale: string; from: string; to?: string } = {
    scale: range.scale,
    from: toIsoDate(range.from),
  };
  if (!isCanonical(range)) params.to = toIsoDate(addDays(range.to, -1));
  return params;
}

/** Parse `YYYY-MM-DD` as a local date, or `null`. */
function parseIsoDate(value: string | null): Date | null {
  if (!value) return null;
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(value);
  if (!match) return null;
  const date = new Date(
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)) - 1,
    Number(value.slice(8, 10)),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The range described by URL params, or the default view when invalid. */
export function rangeFromParams(
  scale: string | null,
  from: string | null,
  to: string | null,
): ScheduleRange {
  if (to) {
    const fromDate = parseIsoDate(from);
    const toDate = parseIsoDate(to);
    if (fromDate && toDate && toDate.getTime() >= fromDate.getTime()) {
      return customRange(fromDate, toDate);
    }
    return defaultRange();
  }
  const resolvedScale = isScale(scale) ? scale : "WEEK";
  const fromDate = parseIsoDate(from);
  return windowFor(resolvedScale, fromDate ?? new Date());
}
