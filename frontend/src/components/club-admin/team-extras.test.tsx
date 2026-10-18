import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { TeamGroups } from "@/components/club-admin/team-groups";
import { TeamRoster } from "@/components/club-admin/team-roster";
import { TeamWeighInPanel } from "@/components/club-admin/team-weigh-in";
import { getBodyMeasurements } from "@/lib/body-measurements-api";
import {
  deleteTeamGroup,
  downloadTeamSheet,
  getClubTeam,
  saveTeamCompetition,
  saveTeamGroup,
  saveTeamWeighIn,
  type ClubTeam,
} from "@/lib/club-teams-api";

jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

jest.mock("@/lib/club-teams-api", () => {
  const actual = jest.requireActual("@/lib/club-teams-api");
  return {
    ...actual,
    getClubTeam: jest.fn(),
    saveTeamWeighIn: jest.fn(),
    saveTeamCompetition: jest.fn(),
    saveTeamGroup: jest.fn(),
    deleteTeamGroup: jest.fn(),
    downloadTeamSheet: jest.fn(),
  };
});

jest.mock("@/lib/body-measurements-api", () => {
  const actual = jest.requireActual("@/lib/body-measurements-api");
  return { ...actual, getBodyMeasurements: jest.fn() };
});

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const lea = {
  id: 4,
  first_name: "Lea",
  last_name: "WEBER",
  sex: "F",
  birth_year: 2010,
  belt_rank: "4th Kup",
  age_class: "junior",
  poomsae_division: "junior",
  latest_weight_kg: "62.4",
  latest_weight_on: "2026-08-20",
  latest_height_cm: 170,
  latest_height_on: "2026-08-20",
  weight_category: "-63 kg",
  weight_delta_kg: "-0.6",
  weight_warning: true,
  licence_status: "active",
  licence_warning: "expires",
};

const team: ClubTeam = {
  id: 1,
  club: 2,
  name: "Cadets",
  discipline: "kyorugi",
  note: "",
  member_count: 1,
  competition_on: "2026-09-12",
  competition_name: "Open",
  weight_margin_kg: "1.0",
  members: [lea],
  groups: [],
};

describe("Team extras", () => {
  beforeEach(() => {
    jest.mocked(getBodyMeasurements).mockResolvedValue({ results: [], suggestion: null });
    jest.mocked(saveTeamWeighIn).mockResolvedValue({ created: 1, team });
    jest.mocked(saveTeamCompetition).mockResolvedValue({ ...team, competition_name: "City Open" });
    jest.mocked(saveTeamGroup).mockResolvedValue(team);
    jest.mocked(deleteTeamGroup).mockResolvedValue(team);
    jest.mocked(downloadTeamSheet).mockResolvedValue(undefined);
  });

  it("saves a quick weigh-in and skips a blank weight", async () => {
    render(<TeamWeighInPanel team={team} onClose={() => undefined} onSaved={() => undefined} />);
    expect(screen.getByText("heightWeightDate").closest("label")?.querySelector("[data-required='true']")).toBeTruthy();
    expect(screen.getByText(/62\.4/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("teamWeighInWeight"), { target: { value: "61.0" } });
    fireEvent.click(screen.getByRole("button", { name: "teamWeighInSave" }));
    await waitFor(() =>
      expect(saveTeamWeighIn).toHaveBeenCalledWith(1, expect.any(String), [{ member: 4, weight_kg: "61.0" }]),
    );
  });

  it("shows competition warnings and downloads the sheet", async () => {
    jest.mocked(getClubTeam).mockResolvedValue(team);
    render(<TeamRoster teamId={1} onBack={() => undefined} />);
    expect(await screen.findByText("teamWeightNear")).toBeInTheDocument();
    expect(screen.getByText("teamLicenceExpires")).toBeInTheDocument();
    expect(screen.getByText(/Open/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "teamExportPdf" }));
    expect(downloadTeamSheet).toHaveBeenCalledWith(1, "pdf", "en");
    fireEvent.click(screen.getByRole("button", { name: "teamCompetition" }));
    const panel = screen.getByRole("dialog");
    fireEvent.change(within(panel).getByLabelText("teamCompetitionName"), { target: { value: "City Open" } });
    fireEvent.click(within(panel).getByRole("button", { name: "teamsSave" }));
    await waitFor(() =>
      expect(saveTeamCompetition).toHaveBeenCalledWith(1, expect.objectContaining({ competition_name: "City Open", weight_margin_kg: "1.0" })),
    );
  });

  it("lists a Poomsae pair and puts delete last", () => {
    const poomsae: ClubTeam = {
      ...team,
      id: 2,
      name: "Poomsae A",
      discipline: "poomsae",
      groups: [
        {
          id: 9,
          kind: "pair",
          name: "A",
          members: [
            { id: 4, first_name: "Lea", last_name: "WEBER", sex: "F" },
            { id: 6, first_name: "Mira", last_name: "KELLER", sex: "M" },
          ],
        },
      ],
    };
    render(<TeamGroups team={poomsae} onChanged={() => undefined} />);
    expect(screen.getByText("teamGroupsSource")).toBeInTheDocument();
    expect(screen.getByText("WEBER Lea, KELLER Mira")).toBeInTheDocument();
    expect(screen.getByText("teamGroupsKind").closest("label")?.querySelector("[data-required='true']")).toBeFalsy();
    fireEvent.click(screen.getByRole("button", { name: "teamGroupsAdd" }));
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByText("teamGroupsKind").closest("label")?.querySelector("[data-required='true']")).toBeTruthy();
    expect(within(panel).getByText("teamGroupsAthletes").closest("label")?.querySelector("[data-required='true']")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "teamsClose" }));
    fireEvent.click(screen.getByRole("button", { name: "teamGroupsActions" }));
    const menu = screen.getByRole("menu", { name: "teamGroupsActions" });
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "teamsEditAction",
      "teamsDeleteAction",
    ]);
  });
});
