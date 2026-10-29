import { exampleExpiryDate } from "./license-validity";

describe("exampleExpiryDate", () => {
  it("uses 31 December for a calendar-year licence", () => {
    const expiry = exampleExpiryDate("calendar_year", 0, 0, new Date(2026, 9, 29));
    expect(expiry.getFullYear()).toBe(2026);
    expect(expiry.getMonth()).toBe(11);
    expect(expiry.getDate()).toBe(31);
  });

  it("moves 29 February to 28 February when the target year is not a leap year", () => {
    const expiry = exampleExpiryDate("duration", 1, 0, new Date(2024, 1, 29));
    expect(expiry.getFullYear()).toBe(2025);
    expect(expiry.getMonth()).toBe(1);
    expect(expiry.getDate()).toBe(28);
  });

  it("adds days after the years", () => {
    const expiry = exampleExpiryDate("duration", 0, 1, new Date(2026, 0, 31));
    expect(expiry.getFullYear()).toBe(2026);
    expect(expiry.getMonth()).toBe(1);
    expect(expiry.getDate()).toBe(1);
  });
});
