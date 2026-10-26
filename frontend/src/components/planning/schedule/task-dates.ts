/**
 * The one rule set for a ticket's dates, shared by every surface that writes
 * one.
 *
 * The category decides the shape of the interval: `DAILY` covers one day,
 * `MULTI_DAY` an inclusive span of days, and `HOURLY` the hours inside a
 * single day. Each surface keeps its controls in its own shape — the schedule
 * editor a pair of `datetime-local` strings, the Jobs form a day picker, an
 * hour pair and an end day — and everything here is pure, so the rules can be
 * unit-tested without React.
 */

import type { TaskType } from "@/lib/mes/queries/types";

const DAY_MS = 86_400_000;

const pad = (value: number) => String(value).padStart(2, "0");

/** Local `YYYY-MM-DDTHH:MM` from an ISO string (empty when unusable). */
export function toDateTimeInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The `YYYY-MM-DD` part of a local `datetime-local` value. */
export function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The `HH:MM` part of a local `datetime-local` value. */
export function toTimeInput(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `HH:MM` one hour later, staying inside the day when it can. */
export function addOneHour(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return time;
  if (hours >= 23) return "23:59";
  const date = new Date(2000, 0, 1, hours + 1, minutes);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseLocalInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    0,
    0,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Local midnight at the start of the day that holds `date`. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** The exclusive end of a day: the next local midnight. */
function endOfDay(date: Date): Date {
  return new Date(date.getTime() + DAY_MS);
}

/** A local day `YYYY-MM-DD` as a local `datetime-local` value at midnight. */
function dayToDateTime(day: string): string {
  return `${day}T00:00`;
}

/** The day after `day`, as `YYYY-MM-DD`. */
export function nextDay(day: string): string {
  const date = parseLocalInput(dayToDateTime(day));
  return date ? toDateInput(endOfDay(date)) : day;
}

/** True when the interval satisfies its category's rule. */
export function isTaskIntervalValid(
  taskType: TaskType,
  startText: string,
  endText: string,
): boolean {
  const start = parseLocalInput(startText);
  const end = parseLocalInput(endText);
  if (!start) return false;
  if (!end) return endText.length === 0;
  if (end.getTime() <= start.getTime()) return false;
  if (taskType === "HOURLY") {
    // An urgent in-hour task never crosses midnight.
    return toDateInput(end) === toDateInput(start);
  }
  return true;
}

/**
 * The dates a form's own controls describe, ready to save.
 *
 * Every surface that writes a ticket offers different controls — the schedule
 * editor a pair of `datetime-local` fields, the Jobs form a day picker, an
 * hour pair and an end day — so this takes those raw values and applies the
 * one rule set the schedule reads back:
 *
 * - `DAILY` is one day, starting at its beginning and closing at its deadline
 *   slot when one is chosen, otherwise at the end of the day.
 * - `HOURLY` is a start hour and an end hour inside a single day.
 * - `MULTI_DAY` is the only category that spans days, from its start day
 *   through its end day inclusive, so the stored end is the next local
 *   midnight and the schedule's inclusive-end-day rule keeps every day.
 *
 * `null` when the values do not satisfy the category's rule — an end that is
 * not after its start, an `HOURLY` pair that crosses midnight, or a missing
 * day — so the caller can refuse to save instead of writing a broken range.
 */
export function taskPayloadFrom(input: {
  taskType: TaskType;
  /** Local day the ticket falls on, `YYYY-MM-DD`. */
  day: string;
  /** `HH:MM` start hour — `HOURLY` only. */
  startHour?: string;
  /** `HH:MM` end hour — `HOURLY` only. */
  endHour?: string;
  /** Local inclusive end day, `YYYY-MM-DD` — `MULTI_DAY` only. */
  endDay?: string;
  /** `HH:MM` deadline inside the day — `DAILY` only. */
  deadline?: string;
}): { startDate: string; endDate: string } | null {
  const first = parseLocalInput(`${input.day}T00:00`);
  if (!first) return null;
  const startDay = startOfDay(first);

  // A day like 31/02 does not exist: the `Date` constructor rolls it over, so
  // it is only a real day when it reads back as itself.
  if (toDateInput(startDay) !== input.day) return null;

  if (input.taskType === "HOURLY") {
    const start = input.startHour
      ? parseLocalInput(`${input.day}T${input.startHour}`)
      : null;
    const end = input.endHour
      ? parseLocalInput(`${input.day}T${input.endHour}`)
      : null;
    if (!start || !end) return null;
    // An urgent in-hour task never crosses midnight, and its end comes after
    // its start.
    if (toDateInput(end) !== toDateInput(start)) return null;
    if (end.getTime() <= start.getTime()) return null;
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }

  if (input.taskType === "MULTI_DAY") {
    if (!input.endDay) return null;
    const last = parseLocalInput(`${input.endDay}T00:00`);
    if (!last) return null;
    if (toDateInput(last) !== input.endDay) return null;
    if (last.getTime() < startDay.getTime()) return null;
    return {
      startDate: startDay.toISOString(),
      endDate: endOfDay(last).toISOString(),
    };
  }

  // `DAILY` closes at its deadline slot when the form offers one, so the
  // domain's 17:00/18:00 choices survive; otherwise at the end of the day.
  const deadline = input.deadline
    ? parseLocalInput(`${input.day}T${input.deadline}`)
    : null;
  return {
    startDate: startDay.toISOString(),
    endDate: (deadline ?? endOfDay(startDay)).toISOString(),
  };
}

/**
 * The interval an editor starts from when a ticket's category changes, so a
 * switch never leaves an impossible value in the fields: a `DAILY` end folds
 * back to its own day, a `MULTI_DAY` end defaults to the start day, and an
 * `HOURLY` end stays on the start day, an hour later when nothing else fits.
 */
export function deriveTimesForCategory(
  taskType: TaskType,
  startText: string,
  endText: string,
): { startText: string; endText: string } {
  const start = parseLocalInput(startText);
  if (!start) return { startText, endText };
  const end = parseLocalInput(endText) ?? start;
  let nextEnd = end;
  if (taskType === "DAILY") {
    // A daily ticket has no end day of its own, so the end folds onto the
    // start day.
    nextEnd = startOfDay(start);
  } else if (taskType === "MULTI_DAY") {
    if (toDateInput(end) < toDateInput(start)) nextEnd = start;
  } else if (toDateInput(end) !== toDateInput(start)) {
    nextEnd = new Date(start.getTime() + 3_600_000);
  }
  const nextEndText = toDateTimeInput(nextEnd.toISOString());
  if (taskType === "HOURLY" && nextEndText <= startText) {
    nextEnd = new Date(start.getTime() + 3_600_000);
  }
  return { startText, endText: toDateTimeInput(nextEnd.toISOString()) };
}

/**
 * The seed interval for the editor's fields: a category's own dates with the
 * end inside the same day for `DAILY` and `HOURLY`, and an end that is never
 * before the start.
 */
export function seedTimesForTask(
  task: {
    taskType: TaskType;
    startDate: string | null;
    endDate: string | null;
  },
  prefill: { start: Date | null } | null | undefined,
): { startText: string; endText: string } {
  const source = task.startDate
    ? new Date(task.startDate)
    : (prefill?.start ?? null);
  if (!source || Number.isNaN(source.getTime())) {
    return { startText: "", endText: "" };
  }
  const taskType = task.taskType;
  const end = task.endDate ? new Date(task.endDate) : null;
  const endValid = end && !Number.isNaN(end.getTime());

  if (taskType === "DAILY" || taskType === "MULTI_DAY") {
    // A midnight end is an inclusive end day: show the day before it.
    const shown =
      endValid && end.getHours() === 0 && end.getMinutes() === 0
        ? new Date(end.getTime() - DAY_MS)
        : (end ?? source);
    const nextEnd = shown.getTime() >= source.getTime() ? shown : source;
    return {
      startText: toDateTimeInput(source.toISOString()),
      endText: toDateTimeInput(nextEnd.toISOString()),
    };
  }

  const nextEnd = endValid && end.getTime() > source.getTime() ? end : source;
  return {
    startText: toDateTimeInput(source.toISOString()),
    endText: toDateTimeInput(nextEnd.toISOString()),
  };
}
