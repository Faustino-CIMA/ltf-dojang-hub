import en from "../messages/en.json";
import lb from "../messages/lb.json";

import { clubSidebarGroup, ltfFinanceSidebarGroup, ltfSidebarGroup } from "./sidebar-groups";

describe("sidebar group titles", () => {
  it("labels LTF admin and LTF finance sections as LTF management", () => {
    expect(ltfSidebarGroup("overview").labelKey).toBe("navGroupLtfManagement");
    expect(ltfSidebarGroup("committee").labelKey).toBe("navGroupLtfManagement");
    expect(ltfSidebarGroup("overview").id).toBe(ltfSidebarGroup("committee").id);
    expect(ltfFinanceSidebarGroup().labelKey).toBe("navGroupLtfManagement");
  });

  it("keeps calendar and preview groups on LTF pages", () => {
    expect(ltfSidebarGroup("calendar").labelKey).toBe("navGroupCalendar");
    expect(ltfSidebarGroup("preview").labelKey).toBe("navGroupPreview");
  });

  it("keeps club management on club pages", () => {
    expect(clubSidebarGroup("finance")?.labelKey).toBe("navGroupClubManagement");
    expect(clubSidebarGroup("members")?.labelKey).toBe("navGroupClub");
    expect(clubSidebarGroup("settings")).toBeUndefined();
  });

  it("has an LTF management translation in every supported locale", () => {
    expect(en.Common.navGroupLtfManagement).toBe("LTF management");
    expect(lb.Common.navGroupLtfManagement.trim().length).toBeGreaterThan(0);
    expect(en.Common.navGroupClubManagement).toBe("Club management");
    expect(lb.Common.navGroupClubManagement).not.toBe(lb.Common.navGroupLtfManagement);
  });
});
