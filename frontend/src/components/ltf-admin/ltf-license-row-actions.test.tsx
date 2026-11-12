import { fireEvent, render, screen } from "@testing-library/react";

import { DeskAccessContext } from "@/components/desk-access";
import { LtfLicenseRowActions } from "@/components/ltf-admin/ltf-license-row-actions";

const labels = {
  menuLabel: "Row actions",
  editLabel: "Edit",
  printLabel: "Print license cards",
  downloadLabel: "Download PDF",
  deleteLabel: "Delete",
  onEdit: jest.fn(),
  onPrint: jest.fn(),
  onDownload: jest.fn(),
  onDelete: jest.fn(),
};

describe("LtfLicenseRowActions", () => {
  beforeEach(() => {
    labels.onEdit.mockReset();
    labels.onPrint.mockReset();
    labels.onDownload.mockReset();
    labels.onDelete.mockReset();
  });

  it("orders Edit, print, download, then Delete, each with an icon", () => {
    render(<LtfLicenseRowActions {...labels} />);
    fireEvent.click(screen.getByRole("button", { name: "Row actions" }));
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Edit",
      "Print license cards",
      "Download PDF",
      "Delete",
    ]);
    for (const item of items) {
      expect(item.querySelector("svg")).not.toBeNull();
    }
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveClass("text-destructive");
    fireEvent.click(screen.getByRole("menuitem", { name: "Download PDF" }));
    expect(labels.onDownload).toHaveBeenCalledTimes(1);
    expect(labels.onDelete).not.toHaveBeenCalled();
  });

  it("hides print and download on a view-only desk", () => {
    render(
      <DeskAccessContext.Provider value={{ readOnly: true, viewOnlyLabel: "View only" }}>
        <LtfLicenseRowActions {...labels} />
      </DeskAccessContext.Provider>
    );
    expect(screen.queryByRole("button", { name: "Row actions" })).not.toBeInTheDocument();
  });
});
