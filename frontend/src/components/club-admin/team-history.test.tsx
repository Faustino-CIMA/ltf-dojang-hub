import { render, screen } from "@testing-library/react";

import { TeamHistoryPanel } from "@/components/club-admin/team-history";
import type { TeamHistory } from "@/lib/club-teams-api";

jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const recorded: TeamHistory = {
  on: "2026-10-20",
  history_started_on: "2026-10-20",
  incomplete: false,
  roster: [{ id: 9, first_name: "Lea", last_name: "WEBER", role: "athlete" }],
  events: [
    {
      id: 1,
      action: "already",
      role: "athlete",
      previous_role: "",
      first_name: "Lea",
      last_name: "WEBER",
      note: "",
      occurred_on: "2026-10-20",
      occurred_time: "09:00",
      actor_name: "",
    },
    {
      id: 2,
      action: "added",
      role: "athlete",
      previous_role: "",
      first_name: "Lea",
      last_name: "WEBER",
      note: "Cadets",
      occurred_on: "2026-10-20",
      occurred_time: "10:00",
      actor_name: "WEBER Marc",
    },
  ],
};

describe("Team history", () => {
  it("shows who was already on the squad and a copy that names the source", () => {
    render(<TeamHistoryPanel teamId={1} onClose={() => undefined} preview={recorded} />);
    expect(screen.getByRole("dialog", { name: "teamHistoryTitle" })).toBeInTheDocument();
    expect(screen.getAllByText("WEBER Lea").length).toBeGreaterThan(0);
    expect(screen.getByText("teamHistoryAlready")).toBeInTheDocument();
    expect(screen.getByText('teamHistoryCopied:{"name":"Cadets"}')).toBeInTheDocument();
    expect(screen.getByText("teamHistoryNoActor")).toBeInTheDocument();
    expect(screen.getByText("WEBER Marc")).toBeInTheDocument();
  });

  it("explains that dates before the snapshot have no roster", () => {
    render(
      <TeamHistoryPanel
        teamId={1}
        onClose={() => undefined}
        preview={{ ...recorded, on: "2020-01-01", incomplete: true, roster: [], events: [] }}
      />,
    );
    expect(screen.getByText('teamHistoryIncomplete:{"date":"20 Oct 2026"}')).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "teamHistoryRoster" })).not.toBeInTheDocument();
  });
});
