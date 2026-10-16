import de from "../messages/de.json";
import en from "../messages/en.json";
import fr from "../messages/fr.json";
import lb from "../messages/lb.json";

const KEYS = [
  "committeeHistoryTitle",
  "committeeHistorySubtitle",
  "committeeMemberSubtitle",
  "committeeHistoryEmpty",
  "committeeAddPastTerm",
  "committeeColumnPerson",
  "committeeColumnRole",
  "committeeColumnClub",
  "committeeColumnStart",
  "committeeColumnEnd",
  "committeeColumnStatus",
  "committeeFilterAll",
  "committeeFilterCurrent",
  "committeeFilterPast",
  "committeeFilterLabel",
  "committeeRowActions",
  "committeeEditTerm",
  "committeeReplaceTerm",
  "committeeEndTerm",
  "committeeDeleteTerm",
  "committeePastTitle",
  "committeeEditTitle",
  "committeeReplaceTitle",
  "committeeEndTitle",
  "committeeDeletePanelTitle",
  "committeeReplaceHint",
  "committeeEndHint",
  "committeePastHint",
  "committeeEditHint",
  "committeeNewMember",
  "committeeEndDate",
  "committeeNotes",
  "committeeSaveTerm",
  "committeeReplaced",
  "committeeEnded",
  "committeePastAdded",
  "committeeUpdated",
  "committeeNeedMember",
  "committeeNeedEnd",
  "committeeEndBeforeStart",
  "committeeUpcoming",
  "committeeOfficeActions",
  "committeeRemoveDescription",
] as const;

describe("committee history copy", () => {
  it.each([
    ["en", en],
    ["fr", fr],
    ["de", de],
    ["lb", lb],
  ])("has the new strings in %s", (_locale, messages) => {
    const club = messages.ClubMgmt as Record<string, string>;
    for (const key of KEYS) {
      expect(club[key]?.trim()).toBeTruthy();
    }
    expect((messages.ClubAdmin as Record<string, string>).memberCommitteeTab.trim()).toBeTruthy();
    expect((messages.LtfAdmin as Record<string, string>).memberCommitteeTab.trim()).toBeTruthy();
  });
});
