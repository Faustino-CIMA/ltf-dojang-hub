import de from "./de.json";
import en from "./en.json";
import fr from "./fr.json";
import lb from "./lb.json";

const CLUB_KEYS = [
  "federationLabel",
  "federationWt",
  "federationItf",
  "federationFilterLabel",
  "federationAll",
  "rcsNumberLabel",
  "rcsNumberPlaceholder",
  "rcsNumberInvalid",
  "openLbrSearch",
  "headOfficeLabel",
  "headOfficeHint",
] as const;

const ACCESS_KEYS = [
  "actorHomeClubOnly",
  "accessMenu",
  "accessSend",
  "accessCopy",
  "accessPanelTitle",
  "accessDownloadWarning",
  "accessKindSetup",
  "accessKindReset",
] as const;

describe("club federation messages", () => {
  it("keeps the new club and venue keys in en, fr, de and lb", () => {
    const venueKeys = Object.keys(en.TrainingVenues).sort();
    for (const messages of [en, fr, de, lb]) {
      for (const key of CLUB_KEYS) {
        expect(messages.ClubAdmin[key]).toEqual(expect.any(String));
        expect(messages.LtfAdmin[key]).toEqual(expect.any(String));
        expect(messages.ClubAdmin[key].length).toBeGreaterThan(0);
      }
      expect(Object.keys(messages.TrainingVenues).sort()).toEqual(venueKeys);
      expect(Object.keys(messages.Setup).sort()).toEqual(Object.keys(en.Setup).sort());
      expect(Object.keys(messages.AccountSetup).sort()).toEqual(Object.keys(en.AccountSetup).sort());
      for (const key of ACCESS_KEYS) {
        expect(messages.ClubAdmin[key]).toEqual(expect.any(String));
        expect(messages.ClubAdmin[key].length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the confidential setup-link warning in English", () => {
    expect(en.Setup.downloadWarning).toBe(
      "This file contains live login links. Anyone who has it can take over these accounts until the links are used or expire (7 days). Don't email it as a whole, send each person only their own link, and delete the file afterwards."
    );
  });
});
