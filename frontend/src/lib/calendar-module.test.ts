import { calendarModuleAvailable } from "@/lib/calendar-module";

describe("calendarModuleAvailable", () => {
  it("keeps the calendar when the status request fails", () => {
    expect(calendarModuleAvailable({ ok: false })).toBe(true);
  });

  it("hides the calendar only when the module is really off", () => {
    expect(calendarModuleAvailable({ ok: true, enabled: false })).toBe(false);
    expect(calendarModuleAvailable({ ok: true, enabled: true })).toBe(true);
  });
});
