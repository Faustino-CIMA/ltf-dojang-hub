import de from "../messages/de.json";
import en from "../messages/en.json";
import fr from "../messages/fr.json";
import lb from "../messages/lb.json";

const KEYS = [
  "navTeams",
  "teamsTitle",
  "teamsAdd",
  "teamsDisciplineKyorugi",
  "teamsDisciplinePoomsae",
  "teamsManageAction",
  "teamsDeleteConfirm",
  "teamsFilter",
  "teamsColumn",
  "teamsCardTitle",
  "teamsCardEmpty",
  "teamsRequired",
] as const;

describe("Club team copy", () => {
  it.each([
    ["en", en],
    ["fr", fr],
    ["de", de],
    ["lb", lb],
  ])("has the team strings in %s", (_locale, messages) => {
    const club = messages.ClubAdmin as Record<string, string>;
    for (const key of KEYS) {
      expect(club[key]?.trim()).toBeTruthy();
    }
    expect(club.teamsDeleteHint).toContain("{name}");
  });
});
