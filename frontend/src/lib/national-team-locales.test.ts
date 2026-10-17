import de from "../messages/de.json";
import en from "../messages/en.json";
import fr from "../messages/fr.json";
import lb from "../messages/lb.json";

const ADMIN_KEYS = [
  "navNationalTeam",
  "nationalTeamTitle",
  "nationalTeamAddSelection",
  "nationalTeamForbidOverlap",
  "nationalTeamCoslElite",
  "nationalTeamCoslPromotion",
  "nationalTeamProjectOlympic",
  "nationalTeamSupportSportlycee",
  "nationalTeamStaffNationalCoach",
] as const;

const CLUB_KEYS = [
  "nationalTeamBlockTitle",
  "nationalTeamBlockEmpty",
  "nationalTeamCoaches",
  "nationalTeamStatusHistory",
] as const;

describe("National team copy", () => {
  it.each([
    ["en", en],
    ["fr", fr],
    ["de", de],
    ["lb", lb],
  ])("has the national team strings in %s", (_locale, messages) => {
    const admin = messages.LtfAdmin as Record<string, string>;
    const club = messages.ClubAdmin as Record<string, string>;
    const finance = messages.LtfFinance as Record<string, string>;
    for (const key of ADMIN_KEYS) {
      expect(admin[key]?.trim()).toBeTruthy();
    }
    for (const key of CLUB_KEYS) {
      expect(club[key]?.trim()).toBeTruthy();
    }
    expect(finance.navNationalTeam?.trim()).toBeTruthy();
  });
});
