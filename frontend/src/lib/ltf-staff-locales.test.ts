import de from "../messages/de.json";
import en from "../messages/en.json";
import fr from "../messages/fr.json";
import lb from "../messages/lb.json";

const KEYS = [
  "staffFilterAriaLabel",
  "staffFilterAll",
  "staffFilterClub",
  "staffFilterStaff",
  "noClub",
  "ltfStaffBadge",
  "staffFunctionSecretary",
  "staffFunctionCoach",
  "staffFunctionPhotographer",
  "staffFunctionOther",
  "nationalTeamLtfCoaches",
  "staffAddAction",
  "staffAddTitle",
  "staffAddHint",
  "staffEditTitle",
  "staffEditHint",
  "staffEditAction",
  "staffDeleteTitle",
  "staffDeleteHint",
  "staffDeleteAction",
  "staffSaveAction",
  "staffSaving",
  "staffClose",
  "staffFunctionLabel",
  "staffStartLabel",
  "staffEndLabel",
  "staffClubLabel",
  "staffNoClubOption",
  "staffIssueTitle",
  "staffIssueHint",
  "staffIssueAction",
  "staffLicenseTypeLabel",
  "staffLicenseYearLabel",
  "staffNoLicenseOption",
  "staffLoginLabel",
  "staffLoginNone",
  "staffLoginLink",
  "staffLoginCreateAdmin",
  "staffLoginCreateFinance",
  "staffLoginUserLabel",
  "staffRowActions",
  "staffRevokeTitle",
  "staffRevokeHint",
  "staffRevokeAction",
  "staffSaved",
  "staffDeleted",
  "staffLicenseIssued",
  "staffLicenseRevoked",
  "staffDetailFunction",
  "staffDetailLogin",
  "staffNoLogin",
  "staffNeedName",
  "staffNeedFunction",
  "staffNeedLicenseType",
  "staffPastYear",
  "staffYearNotAllowed",
  "staffLicenceExists",
  "staffActiveLicenceExists",
  "ltfStaffCount",
] as const;

describe("LTF staff copy", () => {
  it.each([
    ["en", en],
    ["fr", fr],
    ["de", de],
    ["lb", lb],
  ])("has the staff strings in %s", (_locale, messages) => {
    const admin = messages.LtfAdmin as Record<string, string>;
    for (const key of KEYS) {
      expect(admin[key]?.trim()).toBeTruthy();
    }
    expect(admin.staffFunctionCoach).toBe(
      _locale === "fr" ? "Entraîneur LTF" : _locale === "en" ? "LTF Coach" : "LTF-Trainer",
    );
    expect(admin.noClub).toBe(
      _locale === "fr"
        ? "Aucun club"
        : _locale === "de"
          ? "Kein Verein"
          : _locale === "lb"
            ? "Kee Veräin"
            : "No club",
    );
  });
});
