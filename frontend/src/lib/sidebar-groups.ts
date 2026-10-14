export const LTF_MANAGEMENT_GROUP_ID = "ltfManagement";

export type CommonNavGroupKey =
  | "navGroupClub"
  | "navGroupClubManagement"
  | "navGroupLtfManagement"
  | "navGroupCalendar"
  | "navGroupPreview";

export type SidebarGroup = {
  id: string;
  labelKey: CommonNavGroupKey;
};

const CLUB_MANAGEMENT_ITEM_IDS = new Set(["finance", "families", "shop", "training", "promotion"]);

export function ltfSidebarGroup(itemId: string): SidebarGroup {
  if (itemId === "calendar") {
    return { id: "calendar", labelKey: "navGroupCalendar" };
  }
  if (itemId === "preview") {
    return { id: "preview", labelKey: "navGroupPreview" };
  }
  return { id: LTF_MANAGEMENT_GROUP_ID, labelKey: "navGroupLtfManagement" };
}

export function ltfFinanceSidebarGroup(): SidebarGroup {
  return { id: LTF_MANAGEMENT_GROUP_ID, labelKey: "navGroupLtfManagement" };
}

export function clubSidebarGroup(itemId: string): SidebarGroup | undefined {
  if (itemId === "admins" || itemId === "settings") {
    return undefined;
  }
  if (CLUB_MANAGEMENT_ITEM_IDS.has(itemId)) {
    return { id: "clubManagement", labelKey: "navGroupClubManagement" };
  }
  if (itemId === "calendar") {
    return { id: "calendar", labelKey: "navGroupCalendar" };
  }
  if (itemId === "preview") {
    return { id: "preview", labelKey: "navGroupPreview" };
  }
  return { id: "club", labelKey: "navGroupClub" };
}
