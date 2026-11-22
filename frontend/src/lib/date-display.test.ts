import { formatDisplayDate, formatDisplayDateTime, luxembourgTodayIso, parseDisplayDateToIso } from "./date-display";

describe("display dates", () => {
  it("prints a calendar date as day.month.year", () => {
    expect(formatDisplayDate("2026-11-29")).toBe("29.11.2026");
    expect(formatDisplayDate("")).toBe("-");
  });

  it("prints a timestamp in Europe/Luxembourg", () => {
    expect(formatDisplayDateTime("2026-11-29T13:05:00Z")).toBe("29.11.2026 14:05");
    expect(formatDisplayDateTime("2026-07-29T12:05:00Z")).toBe("29.07.2026 14:05");
  });

  it("keeps accepting ISO and day-first text", () => {
    expect(parseDisplayDateToIso("2026-11-29")).toBe("2026-11-29");
    expect(parseDisplayDateToIso("29.11.2026")).toBe("2026-11-29");
    expect(parseDisplayDateToIso("29/11/2026")).toBe("2026-11-29");
    expect(parseDisplayDateToIso("29-11-2026")).toBe("2026-11-29");
    expect(parseDisplayDateToIso("29 Nov 2026")).toBe("2026-11-29");
    expect(parseDisplayDateToIso("31.02.2026")).toBeNull();
  });

  it("uses the Luxembourg calendar day for today", () => {
    expect(luxembourgTodayIso(new Date("2026-11-29T23:30:00Z"))).toBe("2026-11-30");
    expect(luxembourgTodayIso(new Date("2026-07-29T22:30:00Z"))).toBe("2026-07-30");
  });
});
