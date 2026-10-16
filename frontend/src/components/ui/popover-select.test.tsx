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

  it("filters a long list from the search field", () => {
    const onValueChange = jest.fn();
    const columns = [
      { value: "first", label: "First Name" },
      { value: "last", label: "Last Name" },
      { value: "wt", label: "WT license ID" },
      { value: "email", label: "Email" },
    ];
    render(
      <PopoverSelect
        value="first"
        onValueChange={onValueChange}
        options={columns}
        ariaLabel="Source column"
        searchable
        searchPlaceholder="Search columns"
        emptyMessage="No columns match"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Source column" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search columns" }), {
      target: { value: "wt" },
    });
    expect(screen.getByRole("option", { name: "WT license ID" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Email" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search columns" }), {
      target: { value: "zzzz" },
    });
    expect(screen.getByText("No columns match")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search columns" }), {
      target: { value: "license" },
    });
    fireEvent.click(screen.getByRole("option", { name: "WT license ID" }));
    expect(onValueChange).toHaveBeenCalledWith("wt");
  });
});
