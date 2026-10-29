export type ValidityMode = "calendar_year" | "duration";

/** Example expiry for the licence-type form. Years are added first; 29 February becomes 28 February in a non-leap year. */
export function exampleExpiryDate(
  mode: ValidityMode,
  years: number,
  days: number,
  today = new Date(),
): Date {
  if (mode !== "duration") {
    return new Date(today.getFullYear(), 11, 31);
  }
  const targetYear = today.getFullYear() + years;
  const month = today.getMonth();
  let day = today.getDate();
  if (month === 1 && day === 29 && new Date(targetYear, 1, 29).getMonth() !== 1) {
    day = 28;
  }
  const anchored = new Date(targetYear, month, day);
  anchored.setDate(anchored.getDate() + days);
  return anchored;
}
