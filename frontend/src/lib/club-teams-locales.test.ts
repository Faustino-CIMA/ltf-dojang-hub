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
  "teamsFilterNone",
  "teamDuplicateAction",
  "teamDuplicateTitle",
  "teamDuplicateName",
  "teamDuplicateSkipped",
  "teamDuplicateDropped",
  "teamHistory",
  "teamHistoryTitle",
  "teamHistoryHint",
  "teamHistoryOn",
  "teamHistoryIncomplete",
  "teamHistoryEmpty",
  "teamHistoryRoster",
  "teamHistoryChanges",
  "teamHistoryWhen",
  "teamHistoryChange",
  "teamHistoryBy",
  "teamHistoryAdded",
  "teamHistoryRemoved",
  "teamHistoryRoleChanged",
  "teamHistoryAlready",
  "teamHistoryCopied",
  "teamHistoryNoActor",
  "teamsColumn",
  "teamsCardTitle",
  "teamsCardEmpty",
  "teamsRequired",
  "teamRosterBack",
  "teamRosterBirthYear",
  "teamRosterAgeClass",
  "teamRosterGrade",
  "teamRosterGradePoomsae",
  "teamRosterCategory",
  "teamRosterDelta",
  "teamRosterLicence",
  "teamRosterLicenceNone",
  "teamRosterPoomsaeDivision",
  "teamPoomsaeCadet",
  "teamPoomsaeJunior",
  "teamPoomsaeUnder30",
  "teamPoomsaeOver65",
  "teamPoomsaeSource",
  "teamWeighIn",
  "teamWeighInHint",
  "teamCompetitionDate",
  "teamCompetitionAdd",
  "teamCompetitionRemove",
  "teamCompetitionRemovePrompt",
  "teamWeightMarginHint",
  "teamWeightNear",
  "teamLicenceExpires",
  "teamExportPdf",
  "teamGroupsTitle",
  "teamGroupsHint",
  "teamGroupsSource",
  "teamGroupsPair",
  "teamGroupsTeam",
  "teamGroupsDeleteConfirm",
  "teamsMemberCount",
  "teamRoleAthlete",
  "teamRoleCoach",
  "teamRoleLabel",
  "teamRoleChange",
  "teamRoleHint",
  "teamClubCoach",
  "teamCoachesHeading",
  "teamAthletesHeading",
  "teamCategoryNoBirthDate",
  "teamCategoryNoSex",
  "teamCategoryNoWeight",
  "teamCategoryNoClass",
  "teamCategoryYouth",
  "teamCategorySet",
  "teamCategorySetWt",
  "teamCategorySetBe",
  "teamCategorySetNl",
  "teamCategorySetDe",
  "teamCategorySetFr",
  "teamCategorySetAt",
  "teamCategorySetCustom",
  "teamCategoryNoSetAge",
  "teamCategorySourceBe",
  "teamCategorySourceNl",
  "teamCustomAgeFrom",
  "teamCustomAgeTo",
  "teamCustomSex",
  "teamCustomLimits",
  "teamCustomAddBand",
  "teamCustomError",
  "teamsClubMembers",
  "teamFilterAge",
  "teamFilterAny",
  "teamMakeCoach",
  "teamMakeAthlete",
  "teamAddWeight",
  "teamOpenMember",
  "teamRemoveFromTeam",
  "teamRemovePrompt",
  "teamRowActions",
  "teamSelectMember",
  "teamBulkBar",
  "teamBulkCount",
  "teamArchive",
  "teamUnarchive",
  "teamShowArchived",
  "teamDisciplineWarning",
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
    expect(club.teamWeightMarginHint).toContain("{margin}");
    expect(club.teamGroupsDeleteHint).toContain("{name}");
    expect(club.teamsMemberCount).toContain("{athletes");
    expect(club.teamCategoryNoClass).toContain("{ageClass}");
    expect(club.teamCategoryNoSetAge).toContain("{age}");
    expect(club.teamCategoryNoSetAge).toContain("{set}");
    expect(club.teamRoleChange).toContain("{name}");
    expect(club.teamRemovePrompt).toContain("{name}");
    expect(club.teamRowActions).toContain("{name}");
    expect(club.teamSelectMember).toContain("{name}");
    expect(club.teamBulkCount).toContain("{count}");
    expect(club.teamBulkRemoveConfirm).toContain("{count}");
    expect(club.teamHistoryIncomplete).toContain("{date}");
    expect(club.teamHistoryRoleChanged).toContain("{role}");
    expect(club.teamHistoryCopied).toContain("{name}");
  });
});
