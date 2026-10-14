import { fireEvent, render, screen } from "@testing-library/react";

import { PopoverSelect } from "@/components/ui/popover-select";

const options = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "failed", label: "Failed", disabled: true },
];

describe("PopoverSelect", () => {
  it("shows the selected label and chooses another option", () => {
    const onValueChange = jest.fn();
    render(
      <PopoverSelect
        value="all"
        onValueChange={onValueChange}
        options={options}
        ariaLabel="Status"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Status" }));
    expect(screen.getByRole("listbox", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "All statuses" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("option", { name: "Draft" }));
    expect(onValueChange).toHaveBeenCalledWith("draft");
  });

  it("moves between options with the keyboard", () => {
    const onValueChange = jest.fn();
    render(
      <PopoverSelect
        value="all"
        onValueChange={onValueChange}
        options={options}
        ariaLabel="Status"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Status" }));
    const list = screen.getByRole("listbox", { name: "Status" });
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(document.activeElement).toHaveAccessibleName("Draft");
    fireEvent.click(document.activeElement as HTMLElement);
    expect(onValueChange).toHaveBeenCalledWith("draft");
  });
});
