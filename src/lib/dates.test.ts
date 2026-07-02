import { describe, expect, it } from "vitest";
import {
  addDays,
  eachDate,
  formatDate,
  isValidDate,
  isoWeekKey,
  mondayOf,
  monthRange,
  todayStr,
  weekdayCount,
} from "./dates";

describe("addDays", () => {
  it("crosses month boundaries", () => {
    expect(addDays("2026-06-30", 2)).toBe("2026-07-02");
  });
  it("handles negative deltas", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("isoWeekKey", () => {
  it("start of a year that begins on Thursday", () => {
    expect(isoWeekKey("2026-01-01")).toBe("2026-W01");
  });
  it("belongs to previous ISO year at boundary", () => {
    expect(isoWeekKey("2027-01-01")).toBe("2026-W53");
  });
  it("mid-year week", () => {
    expect(isoWeekKey("2026-07-02")).toBe("2026-W27");
  });
  it("monday and sunday of same week share a key", () => {
    expect(isoWeekKey("2026-06-29")).toBe(isoWeekKey("2026-07-05"));
  });
});

describe("eachDate", () => {
  it("returns inclusive range", () => {
    expect(eachDate("2026-07-01", "2026-07-03")).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ]);
  });
  it("returns empty when end < start", () => {
    expect(eachDate("2026-07-03", "2026-07-01")).toEqual([]);
  });
});

describe("weekdayCount", () => {
  it("skips weekends", () => {
    // Fri Jul 3 → Mon Jul 6 2026: Fri + Mon are weekdays
    expect(weekdayCount("2026-07-03", "2026-07-06")).toBe(2);
  });
});

describe("mondayOf", () => {
  it("returns the Monday of the week", () => {
    expect(mondayOf("2026-07-02")).toBe("2026-06-29");
  });
  it("is identity on Mondays", () => {
    expect(mondayOf("2026-06-29")).toBe("2026-06-29");
  });
});

describe("monthRange", () => {
  it("returns first and last day", () => {
    expect(monthRange("2026-07")).toEqual(["2026-07-01", "2026-07-31"]);
  });
  it("handles February", () => {
    expect(monthRange("2026-02")).toEqual(["2026-02-01", "2026-02-28"]);
  });
});

describe("isValidDate", () => {
  it("accepts real dates", () => {
    expect(isValidDate("2026-02-28")).toBe(true);
  });
  it("rejects impossible dates", () => {
    expect(isValidDate("2026-02-30")).toBe(false);
  });
  it("rejects malformed strings", () => {
    expect(isValidDate("02/28/2026")).toBe(false);
  });
});

describe("formatDate", () => {
  it("renders human-readable dates", () => {
    expect(formatDate("2026-07-02")).toBe("Jul 2, 2026");
  });
});

describe("todayStr", () => {
  it("returns a valid date string", () => {
    expect(isValidDate(todayStr())).toBe(true);
  });
});
