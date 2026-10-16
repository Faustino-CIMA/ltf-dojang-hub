import { fireEvent, render, screen } from "@testing-library/react";

import { CommitteeHistoryTable } from "@/components/clubmgmt/committee-history-table";
import { CommitteeTermPanel } from "@/components/clubmgmt/committee-term-panel";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    if (!values) {
      return key;
    }
    return `${key}:${Object.values(values).join("|")}`;
  },
}));

const president = {
  id: 1,
  role: "president",
  title: "",
  member: 10,
  member_name: "REDING Anne",
  member_first_name: "Anne",
  member_last_name: "Reding",
  person: null,
  person_name: "",
  person_first_name: "",
  person_last_name: "",
  started_on: "2020-01-01",
  ended_on: null,
  notes: "",
};

const pastSecretary = {
  ...president,
  id: 2,
  role: "secretary",
  member: 11,
  member_first_name: "Jeff",
  member_last_name: "Lorang",
  member_name: "LORANG Jeff",
  started_on: "2016-01-01",
  ended_on: "2020-01-01",
};

describe("CommitteeHistoryTable", () => {
  it("shows LastName FirstName and keeps Delete last in the row menu", () => {
    render(
      <CommitteeHistoryTable
        mandates={[president, pastSecretary]}
        canManage
        today="2026-10-16"
        onEdit={() => undefined}
        onReplace={() => undefined}
        onEnd={() => undefined}
        onDelete={() => undefined}
      />,
    );

    expect(screen.getByText("REDING Anne")).toBeInTheDocument();
    expect(screen.getByText("LORANG Jeff")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "committeeOfficeActions:role_president" }));
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(items).toEqual(["committeeEditTerm", "committeeReplaceTerm", "committeeEndTerm", "committeeDeleteTerm"]);
    expect(screen.getByRole("menuitem", { name: "committeeDeleteTerm" })).toHaveClass("text-destructive");
  });

  it("hides row actions when the viewer cannot edit", () => {
    render(
      <CommitteeHistoryTable
        mandates={[president]}
        canManage={false}
        today="2026-10-16"
        onEdit={() => undefined}
        onReplace={() => undefined}
        onEnd={() => undefined}
        onDelete={() => undefined}
      />,
    );
    expect(screen.queryByRole("button", { name: /committeeOfficeActions/ })).not.toBeInTheDocument();
  });
});

describe("CommitteeTermPanel", () => {
  it("confirms delete in a side panel and hands the office over on the chosen day", () => {
    const onDelete = jest.fn();
    const onReplace = jest.fn();
    const { rerender } = render(
      <CommitteeTermPanel
        panel={{ mode: "delete", mandate: president }}
        members={[{ id: 12, name: "LORANG Jeff" }]}
        roles={[{ value: "president", label: "President" }]}
        busy={false}
        onClose={() => undefined}
        onEdit={() => undefined}
        onReplace={onReplace}
        onEnd={() => undefined}
        onCreatePast={() => undefined}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByRole("dialog", { name: "committeeDeletePanelTitle" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "committeeDeleteTerm" }));
    expect(onDelete).toHaveBeenCalledWith(president);

    rerender(
      <CommitteeTermPanel
        panel={{ mode: "replace", mandate: president, memberId: 12 }}
        members={[{ id: 12, name: "LORANG Jeff" }]}
        roles={[{ value: "president", label: "President" }]}
        busy={false}
        onClose={() => undefined}
        onEdit={() => undefined}
        onReplace={onReplace}
        onEnd={() => undefined}
        onCreatePast={() => undefined}
        onDelete={onDelete}
      />,
    );
    fireEvent.change(screen.getByLabelText("committeeColumnStart"), { target: { value: "2026-03-12" } });
    fireEvent.click(screen.getByRole("button", { name: "committeeReplaceTerm" }));
    expect(onReplace).toHaveBeenCalledWith(president, { member: 12, started_on: "2026-03-12" });
  });
});
