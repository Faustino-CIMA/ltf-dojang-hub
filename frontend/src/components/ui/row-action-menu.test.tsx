import { fireEvent, render, screen } from "@testing-library/react";
import { Eye, Trash2 } from "lucide-react";

import { RowActionMenu } from "@/components/ui/row-action-menu";

describe("RowActionMenu", () => {
  it("opens a menu of row actions and runs the chosen one", () => {
    const onRetry = jest.fn();
    const onDelete = jest.fn();
    render(
      <RowActionMenu
        label="Row actions"
        actions={[
          { key: "retry", label: "Retry", onSelect: onRetry },
          { key: "delete", label: "Delete", disabled: true, onSelect: onDelete },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Row actions" }));
    expect(screen.getByRole("menu", { name: "Row actions" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("skips disabled actions when moving with the arrow keys", () => {
    const onRetry = jest.fn();
    render(
      <RowActionMenu
        label="Row actions"
        actions={[
          { key: "retry", label: "Retry", onSelect: onRetry },
          { key: "delete", label: "Delete", disabled: true, onSelect: () => undefined },
          { key: "cancel", label: "Cancel", onSelect: () => undefined },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Row actions" }));
    const menu = screen.getByRole("menu", { name: "Row actions" });
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toHaveAccessibleName("Cancel");
  });

  it("shows an icon beside the label and styles a destructive action", () => {
    render(
      <RowActionMenu
        label="Row actions"
        actions={[
          {
            key: "preview",
            label: "Preview PDF",
            icon: <Eye aria-hidden="true" />,
            onSelect: () => undefined,
          },
          {
            key: "delete",
            label: "Delete",
            icon: <Trash2 aria-hidden="true" />,
            destructive: true,
            onSelect: () => undefined,
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Row actions" }));
    const preview = screen.getByRole("menuitem", { name: "Preview PDF" });
    expect(preview.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveClass("text-destructive");
  });
});
