import { describe, expect, it } from "vitest";
import { formatCalendarDate, formatTimestamp } from "@/lib/format";

describe("formatCalendarDate", () => {
  it("formats Data API dates without shifting the day", () => {
    expect(formatCalendarDate("en", "2027-03-14")).toBe("14 Mar 2027");
  });

  it("also accepts full ISO timestamps (the date part is used)", () => {
    expect(formatCalendarDate("en", "2027-03-14T00:00:00.000Z")).toBe("14 Mar 2027");
  });

  it("never throws on unexpected input", () => {
    expect(formatCalendarDate("en", "not a date")).toBe("not a date");
  });

  it("formats in Amharic", () => {
    expect(formatCalendarDate("am", "2027-03-14")).toMatch(/2027/);
  });
});

describe("formatTimestamp", () => {
  it("shows times in Addis Ababa time", () => {
    // 21:30 UTC is 00:30 the next day in Addis Ababa (UTC+3).
    expect(formatTimestamp("en", "2026-10-24T21:30:00Z")).toBe("25 Oct 2026, 00:30");
  });
});
