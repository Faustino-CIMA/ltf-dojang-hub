import { fireEvent, render, screen, within } from "@testing-library/react";

import { MemberNationalTeamBlock } from "@/components/national-team/member-national-team-block";
import { NationalTeamDesk } from "@/components/national-team/national-team-desk";
import type { AthleteNationalTeam, SquadSelectionRow } from "@/lib/national-team-api";
import type { Member } from "@/lib/ltf-admin-api";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const selection: SquadSelectionRow = {
  id: 4,
  member: 9,
  person: { id: 9, first_name: "Lea", last_name: "WEBER", club_id: 2, club_name: "Centre Luxembourg" },
  squad: 1,
  squad_name: "National team",
  squad_code: "national_team",
  season: 3,
  season_year: 2026,
  club_id: 2,
  club_name: "Centre Luxembourg",
  age_class: "senior",
  weight_category: "-67 kg",
  is_captain: true,
  started_on: "2026-01-01",
  ended_on: null,
  is_current: true,
  ltf_level: { id: 3, code: "A3", name: "A3", sort_order: 3, is_active: true },
  cosl: { pathway: "elite", rank: "P3", project: "olympic" },
  support: "sportlycee",
  coaches: [{ id: 8, first_name: "Alex", last_name: "COACH", function: "national_coach" }],
};

const preview = {
  seasons: [{ id: 3, year: 2026, starts_on: "2026-01-01", ends_on: "2026-12-31" }],
  squads: [
    { id: 1, code: "national_team", name: "National team", discipline: "kyorugi", is_active: true, sort_order: 1 },
    { id: 2, code: "young_talents", name: "Young talents", discipline: "kyorugi", is_active: true, sort_order: 2 },
  ],
  clubs: [{ id: 2, name: "Centre Luxembourg" }],
  levels: [{ id: 3, code: "A3", name: "A3", sort_order: 3, is_active: true }],
  selections: [selection],
  staff: [],
  settings: { forbid_overlapping_squads: false },
  statuses: [
    {
      id: 11,
      member: 9,
      scheme: "cosl",
      started_on: "2026-01-01",
      ended_on: null,
      source_note: "COSL letter",
      cadre_level_id: null,
      level: null,
      cosl_pathway: "elite",
      cosl_rank: "P3",
      cosl_project: "olympic",
      support_program: "",
    },
  ],
  members: [],
};

describe("National team desk", () => {
  it("shows the squad table with popover filters and delete last", () => {
    render(<NationalTeamDesk canManage preview={preview} />);
    expect(screen.getByText("WEBER Lea")).toBeInTheDocument();
    expect(screen.getByText("Centre Luxembourg")).toBeInTheDocument();
    expect(screen.getByText("National team")).toBeInTheDocument();
    expect(screen.getByText("-67 kg")).toBeInTheDocument();
    expect(screen.getByText("A3")).toBeInTheDocument();
    expect(screen.getByText("nationalTeamCoslElite P3 · nationalTeamProjectOlympic")).toBeInTheDocument();
    expect(screen.getByText("nationalTeamSupportSportlycee")).toBeInTheDocument();
    for (const name of ["nationalTeamSeason", "nationalTeamSquad", "nationalTeamClub"]) {
      expect(
        screen.getAllByRole("button", { name }).some((button) => button.getAttribute("aria-haspopup") === "listbox")
      ).toBe(true);
    }
    expect(document.querySelector("select")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "nationalTeamRowActions" }));
    const menu = screen.getByRole("menu", { name: "nationalTeamRowActions" });
    const items = within(menu).getAllByRole("menuitem");
    expect(items[items.length - 1]).toHaveAccessibleName("nationalTeamDelete");
  });

  it("opens the add-selection panel and the status history", () => {
    render(<NationalTeamDesk canManage preview={preview} />);
    fireEvent.click(screen.getByRole("button", { name: "nationalTeamAddSelection" }));
    const dialog = screen.getByRole("dialog", { name: "nationalTeamAddSelection" });
    expect(within(dialog).getByLabelText("nationalTeamWeight")).toBeInTheDocument();
    expect(within(dialog).getByText("nationalTeamWeight").closest("label")?.querySelector("[data-required]")).toBeNull();
    expect(within(dialog).getByText("nationalTeamAgeClass").closest("label")?.querySelector("[data-required]")).toBeNull();
    expect(within(dialog).getByText("nationalTeamEnd").closest("label")?.querySelector("[data-required]")).toBeNull();
    for (const name of ["nationalTeamMember", "nationalTeamSquad", "nationalTeamStart"]) {
      expect(within(dialog).getByText(name).closest("label")?.querySelector("[data-required='true']")).not.toBeNull();
    }
    expect(within(dialog).getByText(/requiredLegend/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "nationalTeamAgeClass" }));
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual([
      "nationalTeamAgeUnset",
      "nationalTeamAgePupils (7–8, nationalTeamAgeRegional)",
      "nationalTeamAgeMinimes (9–11, nationalTeamAgeRegional)",
      "nationalTeamAgeCadet (12–14)",
      "nationalTeamAgeJunior (15–17)",
      "nationalTeamAgeSenior (17+)",
      "nationalTeamAgeYouth",
    ]);
    const close = screen
      .getAllByRole("button", { name: "nationalTeamClose" })
      .find((button) => button.textContent === "nationalTeamClose");
    fireEvent.click(close!);
    fireEvent.click(screen.getByRole("button", { name: "nationalTeamRowActions" }));
    const menu = screen.getByRole("menu", { name: "nationalTeamRowActions" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "nationalTeamStatus" }));
    expect(screen.getByText("COSL letter")).toBeInTheDocument();
    expect(screen.getByLabelText("nationalTeamSourceNote")).toBeInTheDocument();
  });

  it("suggests the age class from the athlete birth year", () => {
    const athlete = {
      id: 12,
      first_name: "Nina",
      last_name: "CADET",
      date_of_birth: "2013-04-02",
      club: 2,
    } as Member;
    render(<NationalTeamDesk canManage preview={{ ...preview, members: [athlete] }} />);
    fireEvent.click(screen.getByRole("button", { name: "nationalTeamAddSelection" }));
    const dialog = screen.getByRole("dialog", { name: "nationalTeamAddSelection" });
    fireEvent.click(within(dialog).getByRole("button", { name: "CADET Nina" }));
    expect(within(dialog).getByRole("button", { name: "nationalTeamAgeClass" })).toHaveTextContent(
      "nationalTeamAgeCadet (12–14)"
    );
  });
});

describe("Club national team block", () => {
  const athlete: AthleteNationalTeam = {
    member: selection.person,
    selections: [selection],
    statuses: preview.statuses,
    current: {
      ltf_level: { code: "A3", name: "A3" },
      cosl: { pathway: "elite", rank: "P3", project: "olympic" },
      support: "sportlycee",
    },
  };

  it("is read only and shows the coach name without private details", () => {
    render(<MemberNationalTeamBlock memberId={9} preview={athlete} />);
    expect(screen.getByText("nationalTeamBlockTitle")).toBeInTheDocument();
    expect(screen.getByText(/COACH Alex/)).toBeInTheDocument();
    expect(screen.getByText(/COSL letter/)).toBeInTheDocument();
    expect(screen.queryByText(/alex.coach@/)).toBeNull();
    expect(screen.queryByRole("button", { name: "nationalTeamEdit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "nationalTeamDelete" })).toBeNull();
  });
});
