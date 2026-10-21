import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { ClubTeamsDesk, TeamFilter, TeamForm } from "@/components/club-admin/club-teams-desk";
import { MemberTeamsCard } from "@/components/club-admin/member-teams-card";
import { getMembersList } from "@/lib/club-admin-api";
import { getEgearBrands } from "@/lib/egear-brands-api";
import {
  addTeamMember,
  deleteClubTeam,
  duplicateClubTeam,
  updateTeamMemberRole,
  getClubTeam,
  getClubTeams,
  removeTeamMember,
  saveClubTeam,
  setTeamArchived,
  type ClubTeam,
} from "@/lib/club-teams-api";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

jest.mock("@/lib/club-teams-api", () => {
  const actual = jest.requireActual("@/lib/club-teams-api");
  return {
    ...actual,
    getClubTeams: jest.fn(),
    getClubTeam: jest.fn(),
    saveClubTeam: jest.fn(),
    deleteClubTeam: jest.fn(),
    duplicateClubTeam: jest.fn(),
    addTeamMember: jest.fn(),
    updateTeamMemberRole: jest.fn(),
    removeTeamMember: jest.fn(),
    setTeamArchived: jest.fn(),
  };
});

jest.mock("@/lib/club-admin-api", () => {
  const actual = jest.requireActual("@/lib/club-admin-api");
  return { ...actual, getMembersList: jest.fn() };
});

jest.mock("@/lib/egear-brands-api", () => ({
  getEgearBrands: jest.fn().mockResolvedValue({ club: 2, egear_daedo: true, egear_kpnp: true }),
  saveEgearBrands: jest.fn(),
}));

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const cadets: ClubTeam = {
  id: 3,
  club: 2,
  name: "Cadets",
  discipline: "kyorugi",
  note: "Competition",
  member_count: 1,
  members: [{ id: 4, first_name: "Lea", last_name: "WEBER" }],
};

describe("Club teams desk", () => {
  beforeEach(() => {
    jest.mocked(getEgearBrands).mockResolvedValue({ club: 2, egear_daedo: true, egear_kpnp: true });
    jest.mocked(getClubTeams).mockResolvedValue([]);
    jest.mocked(saveClubTeam).mockResolvedValue(cadets);
    jest.mocked(deleteClubTeam).mockResolvedValue(null);
    jest.mocked(getClubTeam).mockResolvedValue(cadets);
    jest.mocked(addTeamMember).mockResolvedValue({ ...cadets, member_count: 2, members: [...(cadets.members ?? []), { id: 6, first_name: "Mira", last_name: "KELLER" }] });
    jest.mocked(getMembersList).mockResolvedValue([
      { id: 4, first_name: "Lea", last_name: "WEBER" } as never,
      { id: 6, first_name: "Mira", last_name: "KELLER" } as never,
    ]);
  });

  it("requires a name and discipline, then saves the team", async () => {
    render(<ClubTeamsDesk clubId={2} />);
    await screen.findByText("teamsEmptyTitle");
    fireEvent.click(screen.getByRole("button", { name: "teamsAdd" }));
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByText("teamsName").closest("label")?.querySelector("[data-required='true']")).toBeTruthy();
    expect(within(panel).getByText("teamsDiscipline").closest("label")?.querySelector("[data-required='true']")).toBeTruthy();
    expect(within(panel).getByText("teamPss").closest("label")?.querySelector("[data-required='true']")).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: "teamsSave" }));
    expect(screen.getByText("teamsRequired")).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText(/teamsName/), { target: { value: "Cadets" } });
    fireEvent.click(within(panel).getByRole("button", { name: "teamsSave" }));
    await waitFor(() => expect(saveClubTeam).toHaveBeenCalledWith(null, {
      club: 2,
      name: "Cadets",
      discipline: "kyorugi",
      note: "",
      pss_system: "",
    }));
  });

  it("puts delete last and confirms it in a side panel", async () => {
    jest.mocked(getClubTeams).mockResolvedValue([cadets]);
    render(<ClubTeamsDesk clubId={2} />);
    await screen.findByText("Cadets");
    fireEvent.click(screen.getByRole("button", { name: "teamsActions" }));
    const menu = screen.getByRole("menu", { name: "teamsActions" });
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "teamsEditAction",
      "teamsManageAction",
      "teamDuplicateAction",
      "teamsDeleteAction",
    ]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "teamsDeleteAction" }));
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByRole("heading", { name: "teamsDeleteTitle" })).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "teamsDeleteConfirm" }));
    await waitFor(() => expect(deleteClubTeam).toHaveBeenCalledWith(3));
  });

  it("asks for a new name and reports people and groups that were not copied", async () => {
    jest.mocked(getClubTeams).mockResolvedValue([cadets]);
    jest.mocked(getClubTeam).mockResolvedValue({
      ...cadets,
      athlete_count: 1,
      coach_count: 0,
      groups: [],
      competition_on: "2026-05-02",
      competition_name: "Open",
    });
    jest.mocked(duplicateClubTeam).mockResolvedValue({
      team: { ...cadets, id: 9, name: "Cadets copy" },
      skipped_left_club: 1,
      dropped_groups: [{ name: "Gone", kind: "pair" }],
    });
    const onOpenTeam = jest.fn();
    render(<ClubTeamsDesk clubId={2} onOpenTeam={onOpenTeam} />);
    await screen.findByText("Cadets");
    fireEvent.click(screen.getByRole("button", { name: "teamsActions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "teamDuplicateAction" }));
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("teamDuplicateName").closest("label")?.querySelector("[data-required='true']")).toBeTruthy();
    expect(await within(panel).findByDisplayValue("Cadets copy")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "teamDuplicateAction" }));
    expect(await screen.findByText(/teamDuplicateSkipped/)).toBeInTheDocument();
    expect(screen.getByText("Gone")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "teamDuplicateOpen" }));
    expect(onOpenTeam).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
  });

  it("searches members and adds one from the manage panel", async () => {
    jest.mocked(getClubTeams).mockResolvedValue([cadets]);
    render(<ClubTeamsDesk clubId={2} />);
    await screen.findByText("Cadets");
    fireEvent.click(screen.getByRole("button", { name: "teamsActions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "teamsManageAction" }));
    expect(await screen.findByText("WEBER Lea")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("teamsSearchMembers"), { target: { value: "mira" } });
    expect(screen.queryByText("WEBER Lea")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "teamsAddMember" }));
    await waitFor(() => expect(addTeamMember).toHaveBeenCalledWith(3, 6, "athlete"));
  });

  it("adds a club coach as an athlete and changes a current member's role", async () => {
    jest.mocked(getClubTeams).mockResolvedValue([cadets]);
    jest.mocked(getClubTeam).mockResolvedValue({ ...cadets, suggested_coach_ids: [8] });
    jest.mocked(getMembersList).mockResolvedValue([
      { id: 4, first_name: "Lea", last_name: "WEBER", sex: "F" } as never,
      { id: 9, first_name: "Zoe", last_name: "ADAM", sex: "F" } as never,
      { id: 8, first_name: "Ann", last_name: "COACH", sex: "M" } as never,
    ]);
    jest.mocked(updateTeamMemberRole).mockResolvedValue(cadets);
    render(<ClubTeamsDesk clubId={2} />);
    await screen.findByText("Cadets");
    fireEvent.click(screen.getByRole("button", { name: "teamsActions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "teamsManageAction" }));
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("teamsOnTeam")).toBeInTheDocument();
    expect(within(panel).getByText("teamsClubMembers")).toBeInTheDocument();
    const coachMark = await within(panel).findByText("teamClubCoach");
    const names = within(panel).getAllByRole("listitem").map((item) => item.textContent ?? "");
    const addNames = names.filter((name) => name.includes("teamsAddMember"));
    expect(addNames[0]).toContain("COACH Ann");
    fireEvent.click(within(panel).getByRole("button", { name: "teamFilterSex" }));
    fireEvent.click(screen.getByRole("option", { name: "sexMale" }));
    expect(within(panel).queryByText("WEBER Lea")).not.toBeInTheDocument();
    expect(within(panel).getByText("COACH Ann")).toBeInTheDocument();
    fireEvent.click(within(coachMark.closest("li") as HTMLElement).getByRole("button", { name: "teamsAddMember" }));
    await waitFor(() => expect(addTeamMember).toHaveBeenCalledWith(3, 8, "athlete"));
    fireEvent.click(within(panel).getByRole("button", { name: "teamFilterSex" }));
    fireEvent.click(screen.getByRole("option", { name: "teamFilterAny" }));
    const role = within(panel).getByRole("group", { name: 'teamRoleChange:{"name":"WEBER Lea"}' });
    expect(within(role).getByRole("button", { name: "teamRoleAthlete" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(role).getByRole("button", { name: "teamRoleCoach" }));
    await waitFor(() => expect(updateTeamMemberRole).toHaveBeenCalledWith(3, 4, "coach"));
    expect(within(panel).getByRole("status")).toHaveTextContent("teamRoleUpdated");
  });

  it("warns when the discipline changes and archives from the edit panel", async () => {
    jest.mocked(getClubTeams).mockResolvedValue([cadets]);
    jest.mocked(setTeamArchived).mockResolvedValue({ ...cadets, archived: true });
    render(<ClubTeamsDesk clubId={2} />);
    await screen.findByText("Cadets");
    fireEvent.click(screen.getByRole("button", { name: "teamShowArchived" }));
    await waitFor(() => expect(getClubTeams).toHaveBeenCalledWith(2, { includeArchived: true }));
    fireEvent.click(screen.getByRole("button", { name: "teamsActions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "teamsEditAction" }));
    const panel = screen.getByRole("dialog");
    fireEvent.click(within(panel).getByRole("button", { name: "teamsDiscipline" }));
    fireEvent.click(screen.getByRole("option", { name: "teamsDisciplinePoomsae" }));
    expect(within(panel).getByText("teamDisciplineWarning")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "teamArchive" }));
    await waitFor(() => expect(setTeamArchived).toHaveBeenCalledWith(3, true));
  });
});

describe("Teams on the members list and member page", () => {
  it("filters with a multi-select popover", () => {
    const onChange = jest.fn();
    render(
      <TeamFilter teams={[{ id: 3, name: "Cadets", discipline: "kyorugi" }, { id: 4, name: "Poomsae A", discipline: "poomsae" }]} value={[]} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole("button", { name: "teamsFilter" }));
    fireEvent.click(screen.getByRole("option", { name: "teamsFilterNone" }));
    expect(onChange).toHaveBeenCalledWith("none");
    fireEvent.click(screen.getByRole("option", { name: "Cadets" }));
    expect(onChange).toHaveBeenCalledWith([3]);
    expect(screen.queryByText("Cadets · teamsDisciplineKyorugi")).not.toBeInTheDocument();
  });

  it("opens a team when its row is clicked", async () => {
    jest.mocked(getClubTeams).mockResolvedValue([cadets]);
    const onOpenTeam = jest.fn();
    render(<ClubTeamsDesk clubId={2} onOpenTeam={onOpenTeam} />);
    fireEvent.click(await screen.findByText("Cadets"));
    expect(onOpenTeam).toHaveBeenCalledWith(expect.objectContaining({ id: 3, discipline: "kyorugi" }));
  });

  it("lists the member's teams and removes one from the side panel", async () => {
    jest.mocked(getClubTeams).mockResolvedValue([cadets, { ...cadets, id: 8, name: "Poomsae A", discipline: "poomsae", member_count: 0 }]);
    jest.mocked(removeTeamMember).mockResolvedValue(cadets);
    const onChanged = jest.fn();
    render(<MemberTeamsCard memberId={4} clubId={2} teams={[{ id: 3, name: "Cadets", discipline: "kyorugi" }]} onChanged={onChanged} />);
    expect(screen.getByRole("region", { name: "teamsCardTitle" }).className).toContain("app-panel");
    expect(screen.getByText("Cadets · teamsDisciplineKyorugi")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "teamsManageOwn" }));
    expect(await screen.findByText(/Poomsae A/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "teamsRemoveMember" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("keeps a switched-off scoring system visible and not selectable", async () => {
    jest.mocked(getEgearBrands).mockResolvedValue({ club: 2, egear_daedo: true, egear_kpnp: false });
    render(
      <TeamForm
        clubId={2}
        team={{ ...cadets, pss_system: "kpnp", egear_daedo: true, egear_kpnp: false }}
        onClose={() => undefined}
        onSaved={() => undefined}
      />,
    );
    const trigger = screen.getByRole("button", { name: "teamPss" });
    expect(trigger).toHaveTextContent('teamPssSwitchedOff:{"brand":"gearKpnp"}');
    fireEvent.click(trigger);
    const option = await screen.findByRole("option", { name: 'teamPssSwitchedOff:{"brand":"gearKpnp"}' });
    expect(option).toBeDisabled();
    expect(screen.getByRole("option", { name: "gearDaedo" })).toBeEnabled();
    expect(screen.queryByRole("option", { name: "gearKpnp" })).not.toBeInTheDocument();
  });
});
