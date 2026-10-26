/**
 * Tests for the shared category-aware date rules.
 *
 * Every surface that writes a ticket keeps its own controls, so these rules
 * decide what those controls mean and what gets saved: `DAILY` covers one day,
 * `MULTI_DAY` an inclusive span of days, and `HOURLY` the hours inside a single
 * day.
 */

import { describe, expect, test } from "bun:test";
import {
  deriveTimesForCategory,
  isTaskIntervalValid,
  nextDay,
  seedTimesForTask,
  taskPayloadFrom,
  toDateInput,
  toDateTimeInput,
} from "./task-dates";

/** `2026-10-21T09:00` local. */
const start = "2026-10-21T09:00";
const sameDayEnd = "2026-10-21T17:00";
const nextDayAt = (day: string, time = "00:00") => {
  const date = new Date(`${day}T${time}:00`);
  return toDateTimeInput(date.toISOString());
};

describe("toDateTimeInput", () => {
  test("renders local date and time from an ISO value", () => {
    expect(toDateTimeInput(new Date(2026, 9, 21, 14, 30).toISOString())).toBe(
      "2026-10-21T14:30",
    );
  });

  test("empty and invalid values stay empty", () => {
    expect(toDateTimeInput(null)).toBe("");
    expect(toDateTimeInput("")).toBe("");
    expect(toDateTimeInput("not-a-date")).toBe("");
  });
});

describe("nextDay", () => {
  test("steps over a month end", () => {
    expect(nextDay("2026-10-31")).toBe("2026-11-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
  });
});

describe("isTaskIntervalValid", () => {
  test("an end at or before the start is invalid", () => {
    expect(isTaskIntervalValid("DAILY", start, start)).toBe(false);
    expect(isTaskIntervalValid("HOURLY", start, "2026-10-21T08:00")).toBe(
      false,
    );
    expect(isTaskIntervalValid("DAILY", start, "2026-10-22T00:00")).toBe(true);
  });

  test("an hourly ticket never crosses midnight", () => {
    expect(isTaskIntervalValid("HOURLY", start, "2026-10-22T04:00")).toBe(
      false,
    );
    expect(isTaskIntervalValid("HOURLY", start, sameDayEnd)).toBe(true);
  });

  test("a multi-day interval may cross days", () => {
    expect(isTaskIntervalValid("MULTI_DAY", start, "2026-10-24T17:00")).toBe(
      true,
    );
  });

  test("a missing start is invalid and a missing end is allowed", () => {
    expect(isTaskIntervalValid("DAILY", "", "2026-10-21T17:00")).toBe(false);
    expect(isTaskIntervalValid("DAILY", start, "")).toBe(true);
  });
});

describe("taskPayloadFrom", () => {
  test("a daily ticket is one day and starts at its beginning", () => {
    expect(taskPayloadFrom({ taskType: "DAILY", day: "2026-10-21" })).toEqual({
      startDate: new Date(2026, 9, 21, 0, 0).toISOString(),
      endDate: new Date(2026, 9, 22, 0, 0).toISOString(),
    });
  });

  test("a daily ticket keeps its deadline slot on the same day", () => {
    // The Jobs form's 17:00 slot is the deadline, so it survives the save.
    expect(
      taskPayloadFrom({
        taskType: "DAILY",
        day: "2026-10-21",
        deadline: "17:00",
      }),
    ).toEqual({
      startDate: new Date(2026, 9, 21, 0, 0).toISOString(),
      endDate: new Date(2026, 9, 21, 17, 0).toISOString(),
    });
  });

  test("an hourly ticket is a start and an end hour inside one day", () => {
    expect(
      taskPayloadFrom({
        taskType: "HOURLY",
        day: "2026-10-21",
        startHour: "10:30",
        endHour: "11:30",
      }),
    ).toEqual({
      startDate: new Date(2026, 9, 21, 10, 30).toISOString(),
      endDate: new Date(2026, 9, 21, 11, 30).toISOString(),
    });
  });

  test("a multi-day ticket covers every day through its end day", () => {
    expect(
      taskPayloadFrom({
        taskType: "MULTI_DAY",
        day: "2026-10-20",
        endDay: "2026-10-31",
      }),
    ).toEqual({
      startDate: new Date(2026, 9, 20, 0, 0).toISOString(),
      endDate: new Date(2026, 10, 1, 0, 0).toISOString(),
    });
  });

  test("an hourly end that is not after its start is refused", () => {
    expect(
      taskPayloadFrom({
        taskType: "HOURLY",
        day: "2026-10-21",
        startHour: "11:30",
        endHour: "10:30",
      }),
    ).toBeNull();
    expect(
      taskPayloadFrom({
        taskType: "HOURLY",
        day: "2026-10-21",
        startHour: "10:30",
        endHour: "10:30",
      }),
    ).toBeNull();
  });

  test("an hourly pair that crosses midnight is refused", () => {
    expect(
      taskPayloadFrom({
        taskType: "HOURLY",
        day: "2026-10-21",
        startHour: "23:00",
        endHour: "01:00",
      }),
    ).toBeNull();
  });

  test("a multi-day end before its start is refused", () => {
    expect(
      taskPayloadFrom({
        taskType: "MULTI_DAY",
        day: "2026-10-21",
        endDay: "2026-10-20",
      }),
    ).toBeNull();
  });

  test("a missing day, hour or end day is refused", () => {
    expect(taskPayloadFrom({ taskType: "DAILY", day: "" })).toBeNull();
    expect(
      taskPayloadFrom({
        taskType: "HOURLY",
        day: "2026-10-21",
        endHour: "11:30",
      }),
    ).toBeNull();
    expect(
      taskPayloadFrom({
        taskType: "HOURLY",
        day: "2026-10-21",
        startHour: "10:30",
      }),
    ).toBeNull();
    expect(
      taskPayloadFrom({ taskType: "MULTI_DAY", day: "2026-10-21" }),
    ).toBeNull();
  });

  test("an impossible day is refused", () => {
    expect(
      taskPayloadFrom({ taskType: "DAILY", day: "2026-02-31" }),
    ).toBeNull();
  });
});

describe("deriveTimesForCategory", () => {
  test("switching to daily folds the end back to its own day", () => {
    expect(
      deriveTimesForCategory("DAILY", start, "2026-10-24T17:00").endText.slice(
        0,
        10,
      ),
    ).toBe("2026-10-21");
  });

  test("switching to multi-day defaults the end day to the start day", () => {
    expect(
      deriveTimesForCategory(
        "MULTI_DAY",
        start,
        "2026-10-19T17:00",
      ).endText.slice(0, 10),
    ).toBe("2026-10-21");
  });

  test("switching to hourly keeps a same-day end and falls back one hour later", () => {
    expect(deriveTimesForCategory("HOURLY", start, sameDayEnd).endText).toBe(
      sameDayEnd,
    );
    expect(
      deriveTimesForCategory("HOURLY", start, "2026-10-22T04:00").endText,
    ).toBe("2026-10-21T10:00");
  });

  test("an invalid start is left untouched", () => {
    expect(deriveTimesForCategory("DAILY", "", "")).toEqual({
      startText: "",
      endText: "",
    });
  });
});

describe("seedTimesForTask", () => {
  const task = (
    taskType: "DAILY" | "MULTI_DAY" | "HOURLY",
    startIso: string | null,
    endIso: string | null,
  ) => ({
    taskType,
    startDate: startIso,
    endDate: endIso,
  });

  test("a daily ticket with a canonical midnight end seeds one day", () => {
    const seeded = seedTimesForTask(
      task(
        "DAILY",
        new Date(2026, 9, 21, 9, 0).toISOString(),
        new Date(2026, 9, 22, 0, 0).toISOString(),
      ),
      null,
    );
    expect(seeded.startText.slice(0, 10)).toBe("2026-10-21");
    expect(seeded.endText.slice(0, 10)).toBe("2026-10-21");
  });

  test("a multi-day ticket seeds its inclusive last day", () => {
    const seeded = seedTimesForTask(
      task(
        "MULTI_DAY",
        new Date(2026, 9, 12, 0, 0).toISOString(),
        new Date(2026, 9, 15, 0, 0).toISOString(),
      ),
      null,
    );
    expect(seeded.startText.slice(0, 10)).toBe("2026-10-12");
    expect(seeded.endText.slice(0, 10)).toBe("2026-10-14");
  });

  test("an hourly ticket seeds its hours", () => {
    const seeded = seedTimesForTask(
      task(
        "HOURLY",
        new Date(2026, 9, 20, 13, 0).toISOString(),
        new Date(2026, 9, 20, 15, 0).toISOString(),
      ),
      null,
    );
    expect(seeded.startText).toBe("2026-10-20T13:00");
    expect(seeded.endText).toBe("2026-10-20T15:00");
  });

  test("a create form seeds from the clicked cell", () => {
    const seeded = seedTimesForTask(task("DAILY", null, null), {
      start: new Date(2026, 9, 21, 0, 0),
    });
    expect(seeded.startText).toBe("2026-10-21T00:00");
  });

  test("a ticket without dates seeds nothing", () => {
    expect(seedTimesForTask(task("DAILY", null, null), null)).toEqual({
      startText: "",
      endText: "",
    });
  });
});

describe("toDateInput", () => {
  test("renders a local day", () => {
    expect(toDateInput(new Date(2026, 9, 21, 23, 30))).toBe("2026-10-21");
  });

  test("nextDayAt keeps a helper usable", () => {
    expect(nextDayAt("2026-10-21").slice(0, 10)).toBe("2026-10-21");
  });
});
