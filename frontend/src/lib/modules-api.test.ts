import { isClubModuleAssigned, isInstallEntitled, type ModuleStatus } from "./modules-api";

const status: ModuleStatus = {
  entitled: ["preview"],
  modules: [],
  clubs: [
    { id: 1, name: "A", modules: ["preview"] },
    { id: 2, name: "B", modules: [] },
  ],
};

describe("module helpers", () => {
  it("detects install entitlement", () => {
    expect(isInstallEntitled(status, "preview")).toBe(true);
    expect(isInstallEntitled(status, "club_management")).toBe(false);
    expect(isInstallEntitled(null, "preview")).toBe(false);
  });

  it("detects per-club assignment", () => {
    expect(isClubModuleAssigned(status, "preview", 1)).toBe(true);
    expect(isClubModuleAssigned(status, "preview", 2)).toBe(false);
    expect(isClubModuleAssigned(status, "preview", null)).toBe(false);
  });
});
