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

describe("editing an office", () => {
  const panelProps = {
    members: [{ id: 99, name: "LOCAL Only" }],
    roles: [{ value: "president", label: "President" }],
    busy: false,
    onClose: () => undefined,
    onReplace: () => undefined,
    onEnd: () => undefined,
    onCreatePast: () => undefined,
    onDelete: () => undefined,
  };

  it("shows the current holder when that person is not on the first page", async () => {
    const load = jest.fn(async (query: string) => {
      if (query.trim()) {
        return { results: [], hasMore: false };
      }
      return { results: [kraus], hasMore: true };
    });
    const onEdit = jest.fn();
    render(
      <CommitteeTermPanel
        panel={{ mode: "edit", mandate: president }}
        {...panelProps}
        onEdit={onEdit}
        loadHolders={load}
      />,
    );

    const person = screen.getByRole("button", { name: "committeeColumnPerson" });
    expect(person).toHaveTextContent("REDING Anne");
    expect(person).not.toHaveTextContent("committeeNeedMember");

    fireEvent.click(person);
    fireEvent.change(screen.getByRole("searchbox", { name: "committeeSearchMembers" }), {
      target: { value: "nobody" },
    });
    await waitFor(() => expect(load).toHaveBeenCalledWith("nobody", 1, expect.any(AbortSignal)));
    expect(screen.getByRole("button", { name: "committeeColumnPerson" })).toHaveTextContent("REDING Anne");

    fireEvent.click(screen.getByRole("button", { name: "committeeSaveTerm" }));
    expect(onEdit).toHaveBeenCalledWith(
      president,
      expect.objectContaining({ member: 10, person: null }),
    );
  });

  it("keeps a contact holder and still accepts another person", async () => {
    const contact = {
      ...president,
      member: null,
      member_name: "",
      member_first_name: "",
      member_last_name: "",
      person: 7,
      person_name: "WEBER Lia",
      person_first_name: "Lia",
      person_last_name: "Weber",
    };
    const load = jest.fn(async () => ({ results: [kraus], hasMore: false }));
    const onEdit = jest.fn();
    render(
      <CommitteeTermPanel
        panel={{ mode: "edit", mandate: contact }}
        {...panelProps}
        onEdit={onEdit}
        loadHolders={load}
      />,
    );

    expect(screen.getByRole("button", { name: "committeeColumnPerson" })).toHaveTextContent("WEBER Lia");
    fireEvent.click(screen.getByRole("button", { name: "committeeSaveTerm" }));
    expect(onEdit).toHaveBeenCalledWith(
      contact,
      expect.objectContaining({ member: null, person: 7 }),
    );

    fireEvent.click(screen.getByRole("button", { name: "committeeColumnPerson" }));
    fireEvent.click(await screen.findByRole("option", { name: "KRAUS Lio · History Club" }));
    fireEvent.click(screen.getByRole("button", { name: "committeeSaveTerm" }));
    expect(onEdit).toHaveBeenLastCalledWith(
      contact,
      expect.objectContaining({ member: 4, person: null }),
    );
  });

  it("shows the holder on the club list and leaves a new office empty", () => {
    const onEdit = jest.fn();
    const { rerender } = render(
      <CommitteeTermPanel
        panel={{ mode: "edit", mandate: president }}
        {...panelProps}
        onEdit={onEdit}
      />,
    );

    expect(screen.getByRole("button", { name: "committeeColumnPerson" })).toHaveTextContent("REDING Anne");
    fireEvent.click(screen.getByRole("button", { name: "committeeSaveTerm" }));
    expect(onEdit).toHaveBeenCalledWith(
      president,
      expect.objectContaining({ member: 10, person: null }),
    );

    rerender(
      <CommitteeTermPanel
        panel={{ mode: "past", committeeId: 3 }}
        {...panelProps}
        onEdit={onEdit}
      />,
    );
    expect(screen.getByRole("button", { name: "committeeColumnPerson" })).toHaveTextContent("committeeNeedMember");
  });
});
