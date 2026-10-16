import { render, screen } from "@testing-library/react";

import { MemberCommitteePanel } from "@/components/member/member-committee-panel";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("MemberCommitteePanel", () => {
  it("lists the member's offices without edit actions", () => {
    render(
      <MemberCommitteePanel
        today="2026-10-16"
        terms={[
          {
            id: 4,
            role: "secretary",
            title: "",
            scope: "club",
            committee_name: "Board",
            club_id: 1,
            club_name: "TKD Club Uelzecht",
            started_on: "2024-03-01",
            ended_on: null,
            is_current: true,
          },
          {
            id: 3,
            role: "committee_member",
            title: "",
            scope: "club",
            committee_name: "Board",
            club_id: 1,
            club_name: "TKD Club Uelzecht",
            started_on: "2020-01-01",
            ended_on: "2024-03-01",
            is_current: false,
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "committeeHistoryTitle" })).toBeInTheDocument();
    expect(screen.getByText("role_secretary")).toBeInTheDocument();
    expect(screen.getByText("role_committee_member")).toBeInTheDocument();
    expect(screen.getAllByText("TKD Club Uelzecht")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /committeeOfficeActions/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "committeeDeleteTerm" })).not.toBeInTheDocument();
  });
});
