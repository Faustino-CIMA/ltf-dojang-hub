import { displayClubName, replaceNoClubToken } from "./club-label";

describe("club labels", () => {
  const labels = { noClub: "No club", unknownClub: "Unknown club" };

  it("uses No club when the record has no club", () => {
    expect(displayClubName(null, null, labels)).toBe("No club");
    expect(displayClubName(undefined, "LTF", labels)).toBe("No club");
  });

  it("keeps a real club name and only falls back when the id cannot be resolved", () => {
    expect(displayClubName(4, "TKD Esch", labels)).toBe("TKD Esch");
    expect(displayClubName(4, "", labels)).toBe("Unknown club");
  });

  it("fills the lookup token used by designer lists", () => {
    expect(replaceNoClubToken("{{no_club}} · LTF-1", "Aucun club")).toBe("Aucun club · LTF-1");
  });
});
