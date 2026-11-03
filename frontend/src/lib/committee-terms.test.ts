import { committeeRowActionKeys, isActiveOn, termStatus } from "@/lib/committee-terms";

describe("committee term dates", () => {
  it("treats the end date as the day the new holder takes over", () => {
    const leaving = { started_on: "2020-01-01", ended_on: "2026-03-12" };
    const arriving = { started_on: "2026-03-12", ended_on: null };
    expect(isActiveOn(leaving, "2026-03-11")).toBe(true);
    expect(isActiveOn(leaving, "2026-03-12")).toBe(false);
    expect(isActiveOn(arriving, "2026-03-12")).toBe(true);
    expect(termStatus(leaving, "2026-03-12")).toBe("past");
    expect(termStatus(arriving, "2026-03-12")).toBe("current");
  });

  it("keeps an open term current", () => {
    expect(isActiveOn({ started_on: "2024-03-01", ended_on: null }, "2026-10-16")).toBe(true);
  });

  it("orders row actions with delete last", () => {
    const day = "2026-10-16";
    expect(committeeRowActionKeys({ started_on: "2024-01-01", ended_on: null, vacant: false }, day)).toEqual([
      "edit",
      "replace",
      "end",
      "delete",
    ]);
    expect(committeeRowActionKeys({ started_on: "2024-01-01", ended_on: null, vacant: true }, day)).toEqual([
      "edit",
      "end",
      "delete",
    ]);
    expect(committeeRowActionKeys({ started_on: "2018-01-01", ended_on: "2019-01-01", vacant: false }, day)).toEqual([
      "edit",
      "delete",
    ]);
  });
});
