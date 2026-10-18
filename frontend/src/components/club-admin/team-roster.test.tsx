import { fireEvent, render, screen, within } from "@testing-library/react";

import { TeamRoster } from "@/components/club-admin/team-roster";
import { getBodyMeasurements, type MeasurementList } from "@/lib/body-measurements-api";
import { getClubTeam, type ClubTeam } from "@/lib/club-teams-api";

jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

jest.mock("@/lib/club-teams-api", () => {
  const actual = jest.requireActual("@/lib/club-teams-api");
  return { ...actual, getClubTeam: jest.fn() };
});

jest.mock("@/lib/body-measurements-api", () => {
  const actual = jest.requireActual("@/lib/body-measurements-api");
  return { ...actual, getBodyMeasurements: jest.fn(), saveBodyMeasurement: jest.fn(), deleteBodyMeasurement: jest.fn() };
});

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const history: MeasurementList = {
  suggestion: { age_class: "junior", category: "-63 kg", weight_kg: "62.4", measured_on: "2026-08-20" },
  results: [
    {
      id: 2,
      member: 4,
      measured_on: "2026-08-20",
      weight_kg: "62.4",
      height_cm: 170,
      note: "After training",
      recorded_by: 1,
      created_at: "2026-08-20T10:00:00Z",
      updated_at: "2026-08-20T10:00:00Z",
    },
  ],
};

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
  licence_status: "active",
};

const kyorugi: ClubTeam = {
  id: 1,
  club: 2,
  name: "Cadets",
  discipline: "kyorugi",
  note: "",
  member_count: 1,
  members: [lea],
};

const poomsae: ClubTeam = {
  ...kyorugi,
  id: 2,
  name: "Poomsae A",
  discipline: "poomsae",
};

describe("Team roster", () => {
  beforeEach(() => {
    jest.mocked(getBodyMeasurements).mockResolvedValue(history);
  });

  it("shows the Kyorugi columns and expands that member's measurements", async () => {
    jest.mocked(getClubTeam).mockResolvedValue(kyorugi);
    render(<TeamRoster teamId={1} onBack={() => undefined} />);
    expect(await screen.findByRole("columnheader", { name: "teamRosterAgeClass" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "teamRosterCategory" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "teamRosterDelta" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "heightWeightLatestWeight" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "teamRosterPoomsaeDivision" })).not.toBeInTheDocument();
    expect(screen.getByText("WEBER Lea")).toBeInTheDocument();
    expect(screen.getByText("-63 kg")).toBeInTheDocument();
    expect(screen.getByText('heightWeightKg:{"value":"-0.6"}')).toBeInTheDocument();
    expect(screen.getByText("4th Kup")).toBeInTheDocument();
    expect(screen.getByText("statusActive")).toBeInTheDocument();

    fireEvent.click(screen.getByText("WEBER Lea"));
    expect(await screen.findByRole("button", { name: "heightWeightAdd" })).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(2);
    const menuButton = screen.getByRole("button", { name: "heightWeightActions" });
    fireEvent.click(menuButton);
    const menu = screen.getByRole("menu", { name: "heightWeightActions" });
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "heightWeightEditAction",
      "heightWeightDeleteAction",
    ]);
    expect(getBodyMeasurements).toHaveBeenCalledWith(4);
    const section = document.getElementById("height-weight-title")?.closest("section");
    expect(section?.className ?? "").not.toContain("app-panel");
  });

  it("shows the Poomsae columns and the cited age divisions", async () => {
    jest.mocked(getClubTeam).mockResolvedValue(poomsae);
    render(<TeamRoster teamId={2} onBack={() => undefined} />);
    expect(await screen.findByRole("columnheader", { name: "teamRosterPoomsaeDivision" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "teamRosterGradePoomsae" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "heightWeightLatestHeight" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "teamRosterCategory" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "heightWeightLatestWeight" })).not.toBeInTheDocument();
    expect(screen.getByText("teamPoomsaeJunior")).toBeInTheDocument();
    expect(screen.getByText("teamPoomsaeSource")).toBeInTheDocument();
    expect(screen.getByText("4th Kup")).toBeInTheDocument();
  });
});
