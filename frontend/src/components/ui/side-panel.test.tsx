import { fireEvent, render, screen } from "@testing-library/react";

import { SidePanel } from "@/components/ui/side-panel";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("SidePanel", () => {
  it("has one close control, and Escape closes it", () => {
    const onClose = jest.fn();
    render(
      <SidePanel
        open
        title="Edit fee"
        closeLabel="Close"
        onClose={onClose}
        footer={<button type="button">Save</button>}
      >
        <p>Form</p>
      </SidePanel>,
    );

    const closeButtons = screen.getAllByRole("button", { name: "Close" });
    expect(closeButtons).toHaveLength(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
