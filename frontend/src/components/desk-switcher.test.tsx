import { fireEvent, render, screen } from "@testing-library/react";

import { DeskSwitchAsk, DeskSwitcher } from "@/components/desk-switcher";

const names = {
  club_admin: "Club Admin",
  ltf_admin: "LTF Admin",
  ops: "Ops",
};

const desks = [
  { desk: "club_admin", level: "full", club_id: 4, club_name: "Vichten" },
  { desk: "ltf_admin", level: "read_only", club_id: null, club_name: "" },
];

describe("DeskSwitcher", () => {
  it("stays a plain screen when there is only one desk", () => {
    const { container } = render(
      <DeskSwitcher
        desks={[desks[0]]}
        active={desks[0]}
        names={names}
        viewOnlyLabel="View only"
        menuLabel="Desks"
        onSelect={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each granted desk and tags view only", () => {
    const onSelect = jest.fn();
    render(
      <DeskSwitcher
        desks={desks}
        active={desks[0]}
        names={names}
        viewOnlyLabel="View only"
        menuLabel="Desks"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Desks" }));
    expect(screen.getAllByText("Club Admin · Vichten").length).toBeGreaterThan(0);
    expect(screen.getByText("View only")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /LTF Admin/ }));
    expect(onSelect).toHaveBeenCalledWith(desks[1]);
  });

  it("keeps Ops current and opens another desk in one click", () => {
    const ops = { desk: "ops", level: "full", club_id: null, club_name: "" };
    const onSelect = jest.fn();
    render(
      <DeskSwitcher
        desks={[desks[0], ops]}
        active={ops}
        names={names}
        viewOnlyLabel="View only"
        menuLabel="Desks"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Desks" }));
    fireEvent.click(screen.getByRole("button", { name: "Ops" }));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Desks" }));
    fireEvent.click(screen.getByRole("button", { name: /Club Admin/ }));
    expect(onSelect).toHaveBeenCalledWith(desks[0]);
  });
});

describe("DeskSwitchAsk", () => {
  it("does not switch until the person confirms", () => {
    const onConfirm = jest.fn();
    const onStay = jest.fn();
    render(
      <DeskSwitchAsk
        title="Open another desk"
        message="Open LTF Admin? You will see every club, including minors."
        confirmLabel="Open desk"
        stayLabel="Stay here"
        onConfirm={onConfirm}
        onStay={onStay}
      />,
    );
    expect(screen.getByText(/including minors/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stay here" }));
    expect(onStay).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
