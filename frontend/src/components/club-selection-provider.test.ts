import { resolveAssignedClubId } from "./club-selection-provider";

describe("resolveAssignedClubId", () => {
  const clubs = [
    { id: 4, name: "Other", is_home: false },
    { id: 9, name: "Home", is_home: true },
    { id: 2, name: "Third", is_home: false },
  ];

  it("keeps an explicit persisted club", () => {
    expect(resolveAssignedClubId(clubs, 2)).toBe(2);
  });

  it("selects the home club when nothing is persisted", () => {
    expect(resolveAssignedClubId(clubs, null)).toBe(9);
  });

  it("ignores a persisted id the admin cannot access", () => {
    expect(resolveAssignedClubId(clubs, 99)).toBe(9);
  });

  it("falls back to the first club when there is no home club", () => {
    expect(resolveAssignedClubId([{ id: 4 }, { id: 9 }], null)).toBe(4);
  });
});