import { fireEvent, render, screen } from "@testing-library/react";

import { LicenseCardRowActions } from "@/components/ltf-admin/license-card-row-actions";

const labels = {
  menu: "Row actions",
  openDesigner: "Open designer",
  setDefault: "Set default",
  alreadyDefault: "Default",
  clone: "Save as new template",
  export: "Export",
  exporting: "Exporting",
  delete: "Delete template",
};

describe("LicenseCardRowActions", () => {
  it("puts every template action in the row menu and styles delete as destructive", () => {
    const onOpenDesigner = jest.fn();
    const onDelete = jest.fn();
    render(
      <LicenseCardRowActions
        isDefault={false}
        busy={false}
        labels={labels}
        onOpenDesigner={onOpenDesigner}
        onSetDefault={jest.fn()}
        onClone={jest.fn()}
        onExport={jest.fn()}
        onDelete={onDelete}
      />
    );

    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Row actions" }));
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Open designer",
      "Set default",
      "Save as new template",
      "Export",
      "Delete template",
    ]);
    for (const item of items) {
      expect(item.querySelector("svg")).not.toBeNull();
    }
    expect(screen.getByRole("menuitem", { name: "Delete template" })).toHaveClass("text-destructive");

    fireEvent.click(screen.getByRole("menuitem", { name: "Open designer" }));
    expect(onOpenDesigner).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("disables set default when the template is already the default", () => {
    const onSetDefault = jest.fn();
    render(
      <LicenseCardRowActions
        isDefault
        busy={false}
        labels={labels}
        onOpenDesigner={jest.fn()}
        onSetDefault={onSetDefault}
        onClone={jest.fn()}
        onExport={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Row actions" }));
    const setDefault = screen.getByRole("menuitem", { name: "Default" });
    expect(setDefault).toBeDisabled();
    fireEvent.click(setDefault);
    expect(onSetDefault).not.toHaveBeenCalled();
  });
});
