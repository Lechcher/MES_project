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
 * Where a ticket's bar sits on the columns: the 0-based start index and the
 * number of columns it spans, clipped to the visible range. `null` when the
 * ticket cannot be placed (no start date, or no overlap with the range).
 *
 * An end date at local midnight is treated as inclusive (a ticket due
 * `06/11` covers the 6th); an end with a time of day stops there.
 */
export function placeBar(
  task: ScheduledTask,
  cols: Date[],
  scale: ScheduleScale,
): { start: number; span: number } | null {
  if (cols.length === 0 || !task.startDate) return null;
  const startAt = new Date(task.startDate);
  if (Number.isNaN(startAt.getTime())) return null;

  const endAt = task.endDate ? new Date(task.endDate) : null;
  const exclusiveEnd = endAt
    ? isMidnight(endAt)
      ? addDays(endAt, 1)
      : endAt
    : null;

  let start = 0;
  let span = 1;
  if (scale === "DAY") {
    start = Math.floor((startAt.getTime() - cols[0].getTime()) / HOUR_MS);
    const rawSpan = exclusiveEnd
      ? (exclusiveEnd.getTime() - startAt.getTime()) / HOUR_MS
      : 1;
    span = Math.max(1, Math.ceil(rawSpan));
  } else if (scale === "YEAR") {
    start =
      (startAt.getFullYear() - cols[0].getFullYear()) * 12 +
      (startAt.getMonth() - cols[0].getMonth());
    const endRef = exclusiveEnd ?? addMonths(startAt, 1);
    span = Math.max(
      1,
      (endRef.getFullYear() - startAt.getFullYear()) * 12 +
        (endRef.getMonth() - startAt.getMonth()) +
        1,
    );
  } else {
    start = diffDays(startAt, cols[0]);
    const rawSpan = exclusiveEnd
      ? (exclusiveEnd.getTime() - startAt.getTime()) / DAY_MS
      : 1;
    span = Math.max(1, Math.ceil(rawSpan));
  }

  const visibleStart = Math.max(0, start);
  const visibleEnd = Math.min(cols.length, start + span);
  if (visibleEnd <= visibleStart) return null;
  return { start: visibleStart, span: visibleEnd - visibleStart };
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
