import { fireEvent, render, screen } from "@testing-library/react";

import { EntityTable } from "@/components/club-admin/entity-table";

const rows = [
  { id: 1, name: "Zola" },
  { id: 2, name: "Abel" },
];

describe("EntityTable sorting", () => {
  it("exposes a keyboard-focusable header and reports the next sort", () => {
    const onSortChange = jest.fn();
    render(
      <EntityTable
        rows={rows}
        sort={null}
        onSortChange={onSortChange}
        columns={[{ key: "name", header: "Full name", sortable: true }]}
      />
    );

    const header = screen.getByRole("columnheader", { name: "Full name" });
    expect(header).toHaveAttribute("aria-sort", "none");
    const button = screen.getByRole("button", { name: "Full name" });
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(onSortChange).toHaveBeenCalledWith({ key: "name", direction: "asc" });
  });

  it("sorts every loaded row on the client", () => {
    const { rerender } = render(
      <EntityTable
        clientSort
        rows={rows}
        sort={{ key: "name", direction: "asc" }}
        onSortChange={() => undefined}
        columns={[
          {
            key: "name",
            header: "Full name",
            sortable: true,
            sortValue: (row) => row.name,
          },
        ]}
      />
    );

    const cells = screen.getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual(["Abel", "Zola"]);
    expect(screen.getByRole("columnheader", { name: "Full name" })).toHaveAttribute("aria-sort", "ascending");

    rerender(
      <EntityTable
        clientSort
        rows={rows}
        sort={{ key: "name", direction: "desc" }}
        onSortChange={() => undefined}
        columns={[
          {
            key: "name",
            header: "Full name",
            sortable: true,
            sortValue: (row) => row.name,
          },
        ]}
      />
    );
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["Zola", "Abel"]);
    expect(screen.getByRole("columnheader", { name: "Full name" })).toHaveAttribute("aria-sort", "descending");
  });
});
