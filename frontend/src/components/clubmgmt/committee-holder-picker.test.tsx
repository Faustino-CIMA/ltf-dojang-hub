import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { CommitteeHolderPicker } from "@/components/clubmgmt/committee-holder-picker";
import { CommitteeTermPanel } from "@/components/clubmgmt/committee-term-panel";
import type { CommitteeHolderChoice } from "@/lib/clubmgmt-api";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const kraus: CommitteeHolderChoice = {
  id: 4,
  first_name: "Lio",
  last_name: "Kraus",
  club_id: 2,
  club_name: "History Club",
};
const staff: CommitteeHolderChoice = {
  id: 9,
  first_name: "Nora",
  last_name: "Staff",
  club_id: null,
  club_name: "",
};
const other: CommitteeHolderChoice = {
  id: 15,
  first_name: "Paul",
  last_name: "Other",
  club_id: 8,
  club_name: "Other Club",
};

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

function search(query: string, page: number) {
  const needle = query.trim().toLowerCase();
  const matches = [kraus, staff, other].filter((row) => {
    if (!needle) {
      return true;
    }
    return `${row.first_name} ${row.last_name}`.toLowerCase().includes(needle);
  });
  const pageSize = 2;
  const start = (page - 1) * pageSize;
  const results = matches.slice(start, start + pageSize);
  return { results, hasMore: start + pageSize < matches.length };
}

describe("CommitteeHolderPicker", () => {
  it("searches on the server and shows the club, including LTF people", async () => {
    const load = jest.fn(async (query: string, page: number) => search(query, page));
    render(<CommitteeHolderPicker value="" onValueChange={jest.fn()} load={load} debounceMs={0} />);

    fireEvent.click(screen.getByRole("button", { name: "committeeColumnPerson" }));
    expect(await screen.findByRole("option", { name: "KRAUS Lio · History Club" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "STAFF Nora · committeeHolderLtf" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "OTHER Paul · Other Club" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "committeeHolderMore" }));
    expect(await screen.findByRole("option", { name: "OTHER Paul · Other Club" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "committeeSearchMembers" }), {
      target: { value: "kraus" },
    });
    await waitFor(() => {
      expect(screen.queryByRole("option", { name: "STAFF Nora · committeeHolderLtf" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("option", { name: "KRAUS Lio · History Club" })).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith("kraus", 1, expect.any(AbortSignal));
  });
});

describe("federation replace picker", () => {
  it("uses the holder search instead of the people already on the board", async () => {
    const load = jest.fn(async (query: string, page: number) => search(query, page));
    const onReplace = jest.fn();
    render(
      <CommitteeTermPanel
        panel={{ mode: "replace", mandate: president }}
        members={[{ id: 99, name: "LOCAL Only" }]}
        roles={[{ value: "president", label: "President" }]}
        busy={false}
        onClose={() => undefined}
        onEdit={() => undefined}
        onReplace={onReplace}
        onEnd={() => undefined}
        onCreatePast={() => undefined}
        onDelete={() => undefined}
        loadHolders={load}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "committeeColumnPerson" }));
    fireEvent.click(await screen.findByRole("option", { name: "KRAUS Lio · History Club" }));
    expect(screen.queryByRole("option", { name: "LOCAL Only" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "committeeReplaceTerm" }));
    expect(onReplace).toHaveBeenCalledWith(
      president,
      expect.objectContaining({ member: 4 }),
    );
  });
});
