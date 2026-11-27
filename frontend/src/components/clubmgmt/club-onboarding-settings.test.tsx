import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ClubOnboardingSettings } from "./club-onboarding-settings";

const getClubOnboarding = jest.fn();
const saveClubOnboarding = jest.fn();
const addClubRulesVersion = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
}));

jest.mock("@/lib/clubmgmt-api", () => ({
  getClubOnboarding: (...args: unknown[]) => getClubOnboarding(...args),
  saveClubOnboarding: (...args: unknown[]) => saveClubOnboarding(...args),
  addClubRulesVersion: (...args: unknown[]) => addClubRulesVersion(...args),
  openClubRulesFile: jest.fn(),
}));

const loaded = {
  public_link_enabled: false,
  invites_enabled: false,
  equipment_note: "",
  photo_requirement: "optional",
  medico_requirement: "optional",
  rules: [
    {
      id: 2,
      version: 2,
      effective_on: "2026-12-01",
      kind: "url",
      filename: "",
      url: "https://example.test/rules",
      sha256: "abc",
      is_current: true,
    },
  ],
};

describe("ClubOnboardingSettings", () => {
  beforeEach(() => {
    getClubOnboarding.mockReset();
    saveClubOnboarding.mockReset();
    addClubRulesVersion.mockReset();
    getClubOnboarding.mockResolvedValue(loaded);
  });

  it("shows the current rules version and its date", async () => {
    render(<ClubOnboardingSettings clubId={4} onError={jest.fn()} onSuccess={jest.fn()} />);
    expect(await screen.findByText(/onboardingRulesVersion 2/)).toBeInTheDocument();
    expect(screen.getByText(/onboardingRulesCurrent/)).toBeInTheDocument();
    expect(screen.getByText("01.12.2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://example.test/rules" })).toHaveAttribute(
      "href",
      "https://example.test/rules",
    );
  });

  it("saves the join flags and the equipment note", async () => {
    saveClubOnboarding.mockResolvedValue({ ...loaded, public_link_enabled: true, equipment_note: "White dobok" });
    const onSuccess = jest.fn();
    render(<ClubOnboardingSettings clubId={4} onError={jest.fn()} onSuccess={onSuccess} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "onboardingPublicLink" }));
    fireEvent.change(screen.getByLabelText("onboardingEquipment"), { target: { value: "White dobok" } });
    fireEvent.click(screen.getByRole("button", { name: "onboardingSave" }));
    await waitFor(() => expect(saveClubOnboarding).toHaveBeenCalledWith(4, expect.objectContaining({
      public_link_enabled: true,
      equipment_note: "White dobok",
      photo_requirement: "optional",
    })));
    expect(onSuccess).toHaveBeenCalledWith("onboardingSettingsSaved");
  });

  it("asks for a file or a link, not both", async () => {
    const onError = jest.fn();
    render(<ClubOnboardingSettings clubId={4} onError={onError} onSuccess={jest.fn()} />);
    fireEvent.change(await screen.findByLabelText(/onboardingRulesDate/), { target: { value: "2026-11-27" } });
    fireEvent.click(screen.getByRole("button", { name: "onboardingRulesAdd" }));
    expect(onError).toHaveBeenCalledWith("onboardingRulesNeedOne");
    expect(addClubRulesVersion).not.toHaveBeenCalled();
  });
});
