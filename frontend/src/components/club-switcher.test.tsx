import { act, fireEvent, render, screen } from "@testing-library/react";

import { ClubSwitcher } from "@/components/club-switcher";

const labels = {
  allClubsLabel: "All clubs",
  placeholder: "Choose a club",
  ariaLabel: "Selected club",
  searchPlaceholder: "Search clubs",
  emptyMessage: "No clubs match",
};

function clubs(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Club ${index + 1}`,
  }));
}

describe("ClubSwitcher", () => {
  it("opens a popover, marks the current club, and switches with the same value", () => {
    const onValueChange = jest.fn();
    render(
      <ClubSwitcher
        clubs={[
          { id: 1, name: "Silver Crane" },
          { id: 2, name: "Musterstadt" },
        ]}
        value="1"
        onValueChange={onValueChange}
        {...labels}
      />,
    );

    const button = screen.getByRole("button", { name: "Selected club" });
    expect(button).toHaveTextContent("Silver Crane");
    expect(button).toHaveAttribute("aria-haspopup", "listbox");
    expect(button.className).toContain("focus-visible:ring-2");

    fireEvent.click(button);
    const current = screen.getByRole("option", { name: "Silver Crane" });
    expect(current).toHaveAttribute("aria-selected", "true");
    expect(current.querySelector("svg")).toBeTruthy();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: "Musterstadt" }));
    expect(onValueChange).toHaveBeenCalledWith("2");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("keeps a single club selectable the same way", () => {
    const onValueChange = jest.fn();
    render(<ClubSwitcher clubs={[{ id: 4, name: "Only Club" }]} value="4" onValueChange={onValueChange} {...labels} />);

    fireEvent.click(screen.getByRole("button", { name: "Selected club" }));
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Only Club" }));
    expect(onValueChange).toHaveBeenCalledWith("4");
  });

  it("offers every club and searches once the list is longer than eight", () => {
    const onValueChange = jest.fn();
    render(
      <ClubSwitcher
        clubs={clubs(9)}
        value="all"
        allowAllClubs
        onValueChange={onValueChange}
        {...labels}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Selected club" }));
    expect(screen.getByRole("option", { name: "All clubs" })).toHaveAttribute("aria-selected", "true");
    const search = screen.getByRole("searchbox", { name: "Search clubs" });
    fireEvent.change(search, { target: { value: "club 9" } });
    expect(screen.getByRole("option", { name: "Club 9" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Club 1" })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "zzzz" } });
    expect(screen.getByText("No clubs match")).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "all" } });
    fireEvent.click(screen.getByRole("option", { name: "All clubs" }));
    expect(onValueChange).toHaveBeenCalledWith("all");
  });

  it("moves with the keyboard and closes on Escape", () => {
    const onValueChange = jest.fn();
    render(
      <ClubSwitcher
        clubs={[
          { id: 1, name: "Silver Crane" },
          { id: 2, name: "Musterstadt" },
        ]}
        value="1"
        onValueChange={onValueChange}
        {...labels}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Selected club" }));
    const list = screen.getByRole("listbox", { name: "Selected club" });
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(document.activeElement).toHaveAccessibleName("Musterstadt");
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("closes when the pointer goes outside the popover", async () => {
    render(
      <div>
        <button type="button">Outside</button>
        <ClubSwitcher
          clubs={[
            { id: 1, name: "Silver Crane" },
            { id: 2, name: "Musterstadt" },
          ]}
          value="1"
          onValueChange={jest.fn()}
          {...labels}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Selected club" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const outside = screen.getByRole("button", { name: "Outside" });
    fireEvent.pointerDown(outside);
    fireEvent.click(outside);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
