import { parkReasonText } from "@/lib/parked-members";

describe("parked member reasons", () => {
  const t = (key: string, values?: Record<string, string>) => `${key}:${values?.club ?? values?.value ?? values?.clubs ?? ""}`;

  it("keeps an empty club distinct from a club that was not found", () => {
    const empty = { park_club_text: "", park_detail: {} };
    expect(parkReasonText(t, "no_club", empty)).toBe("reason_no_club:");
    const missing = { park_club_text: "Nowhere Dojang", park_detail: {} };
    expect(parkReasonText(t, "club_not_found", missing)).toBe("reason_club_not_found:Nowhere Dojang");
    expect(parkReasonText(t, "gender_blank", empty)).toBe("reason_gender_blank:");
  });
});