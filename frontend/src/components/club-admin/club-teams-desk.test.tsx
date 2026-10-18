import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { ClubTeamsDesk, TeamFilter } from "@/components/club-admin/club-teams-desk";
import { MemberTeamsCard } from "@/components/club-admin/member-teams-card";
import { getMembersList } from "@/lib/club-admin-api";
import {
  addTeamMember,
  deleteClubTeam,
  updateTeamMemberRole,
  getClubTeam,
  getClubTeams,
  removeTeamMember,
  saveClubTeam,
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
    addTeamMember: jest.fn(),
    updateTeamMemberRole: jest.fn(),
    removeTeamMember: jest.fn(),
  };
});

jest.mock("@/lib/club-admin-api", () => {
  const actual = jest.requireActual("@/lib/club-admin-api");
  return { ...actual, getMembersList: jest.fn() };
});

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
    fireEvent.click(within(panel).getByRole("button", { name: "teamsSave" }));
    expect(screen.getByText("teamsRequired")).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText(/teamsName/), { target: { value: "Cadets" } });
    fireEvent.click(within(panel).getByRole("button", { name: "teamsSave" }));
    await waitFor(() => expect(saveClubTeam).toHaveBeenCalledWith(null, {
      club: 2,
      name: "Cadets",
      discipline: "kyorugi",
      note: "",
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
      "teamsDeleteAction",
    ]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "teamsDeleteAction" }));
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByRole("heading", { name: "teamsDeleteTitle" })).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "teamsDeleteConfirm" }));
    await waitFor(() => expect(deleteClubTeam).toHaveBeenCalledWith(3));
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

  it("adds a club coach with the coach role and can change a role later", async () => {
    jest.mocked(getClubTeams).mockResolvedValue([cadets]);
    jest.mocked(getClubTeam).mockResolvedValue({ ...cadets, suggested_coach_ids: [8] });
    jest.mocked(getMembersList).mockResolvedValue([
      { id: 4, first_name: "Lea", last_name: "WEBER" } as never,
      { id: 9, first_name: "Zoe", last_name: "ADAM" } as never,
      { id: 8, first_name: "Ann", last_name: "COACH" } as never,
    ]);
    jest.mocked(updateTeamMemberRole).mockResolvedValue(cadets);
    render(<ClubTeamsDesk clubId={2} />);
    await screen.findByText("Cadets");
    fireEvent.click(screen.getByRole("button", { name: "teamsActions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "teamsManageAction" }));
    const panel = await screen.findByRole("dialog");
    const coachMark = await within(panel).findByText("teamClubCoach");
    const names = within(panel).getAllByRole("listitem").map((item) => item.textContent ?? "");
    const addNames = names.filter((name) => name.includes("teamsAddMember"));
    expect(addNames[0]).toContain("COACH Ann");
    fireEvent.click(within(panel).getByRole("button", { name: "teamRoleLabel" }));
    fireEvent.click(screen.getByRole("option", { name: "teamRoleCoach" }));
    fireEvent.click(within(coachMark.closest("li") as HTMLElement).getByRole("button", { name: "teamsAddMember" }));
    await waitFor(() => expect(addTeamMember).toHaveBeenCalledWith(3, 8, "coach"));
    fireEvent.click(within(panel).getByRole("button", { name: 'teamRoleChange:{"name":"WEBER Lea"}' }));
    fireEvent.click(screen.getByRole("option", { name: "teamRoleCoach" }));
    await waitFor(() => expect(updateTeamMemberRole).toHaveBeenCalledWith(3, 4, "coach"));
  });
});

describe("Teams on the members list and member page", () => {
  it("filters with a multi-select popover", () => {
    const onChange = jest.fn();
    render(
      <TeamFilter teams={[{ id: 3, name: "Cadets", discipline: "kyorugi" }, { id: 4, name: "Poomsae A", discipline: "poomsae" }]} selected={[]} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole("button", { name: "teamsFilter" }));
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
});
