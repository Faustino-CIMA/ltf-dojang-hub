import { staffActionErrorMessage } from "./staff-action-error";

describe("staffActionErrorMessage", () => {
  const t = (key: string) => `translated:${key}`;

  it("translates a past-year refusal", () => {
    expect(staffActionErrorMessage(new Error("past_year"), t, "fallback")).toBe(
      "translated:staffPastYear",
    );
  });

  it("leaves an unknown message as the server sent it", () => {
    expect(staffActionErrorMessage(new Error("staff_required"), t, "fallback")).toBe(
      "staff_required",
    );
  });
});
