import de from "../messages/de.json";
import en from "../messages/en.json";
import fr from "../messages/fr.json";
import lb from "../messages/lb.json";

const FINANCE_KEYS = [
  "settingsTabModuleFees",
  "moduleFeesTitle",
  "moduleFeesSubtitle",
  "moduleFeeAdd",
  "moduleFeeEdit",
  "moduleFeeDelete",
  "moduleFeeSwitchOff",
  "moduleFeePricingFlat",
  "moduleFeePricingPerMember",
  "moduleFeeMinimumHint",
  "moduleFeeBillingHint",
  "moduleClubManagement",
  "moduleCompetition",
  "moduleEventCalendar",
] as const;

const CLUB_KEYS = [
  "modulePricesTitle",
  "modulePricesSubtitle",
  "modulePricesEstimateHint",
  "modulePricesOn",
  "modulePricesOff",
  "modulePricesCalculation",
  "modulePricesMinimumLine",
  "modulePricesFlat",
  "moduleClubManagement",
  "moduleCompetition",
  "moduleEventCalendar",
] as const;

describe("module fee copy", () => {
  it.each([
    ["en", en],
    ["fr", fr],
    ["de", de],
    ["lb", lb],
  ])("has the module fee strings in %s", (_locale, messages) => {
    const finance = messages.LtfFinance as Record<string, string>;
    const club = messages.ClubAdmin as Record<string, string>;
    for (const key of FINANCE_KEYS) {
      expect(finance[key]?.trim()).toBeTruthy();
    }
    for (const key of CLUB_KEYS) {
      expect(club[key]?.trim()).toBeTruthy();
    }
  });
});