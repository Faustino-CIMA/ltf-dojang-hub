import { fireEvent, render, screen } from "@testing-library/react";

import { ModulePurchaseOverrides } from "@/components/ltf-admin/module-purchase-overrides";
import type { ModulePurchaseRow } from "@/lib/ltf-admin-api";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const purchase: ModulePurchaseRow = {
  id: 4,
  club: 2,
  club_name: "Override Club",
  description: "Club management",
  module_ids: ["club_management"],
  status: "active",
  ends_at: "2026-12-01",
  automation_hold: "override",
  switched_off: false,
  renewal_choice: "unanswered",
  source: "order",
};

describe("Module purchase overrides", () => {
  it("puts Edit first and Cancel last", () => {
    render(
      <ModulePurchaseOverrides
        clubs={[{ id: 2, name: "Override Club" }]}
        clubId="2"
        purchases={[purchase]}
        audits={[]}
        onSelectClub={jest.fn()}
        onOverride={jest.fn()}
        onNotice={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "modulePurchaseRowActions" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "modulePurchaseEdit",
      "modulePurchaseSwitchOn",
      "modulePurchaseSwitchOff",
      "modulePurchaseWaive",
      "modulePurchaseClearHold",
      "modulePurchaseCancel",
    ]);
  });

  it("requires an end date unless the purchase stays open", () => {
    const onNotice = jest.fn();
    const onOverride = jest.fn();
    render(
      <ModulePurchaseOverrides
        clubs={[{ id: 2, name: "Override Club" }]}
        clubId="2"
        purchases={[purchase]}
        audits={[]}
        onSelectClub={jest.fn()}
        onOverride={onOverride}
        onNotice={onNotice}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "modulePurchaseRowActions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "modulePurchaseEdit" }));
    const date = screen.getByLabelText(/modulePurchaseEndLabel/);
    expect(date).toBeRequired();
    fireEvent.change(date, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "modulePurchaseSave" }));
    expect(onNotice).toHaveBeenCalledWith("error", "modulePurchaseNeedDate");
    expect(onOverride).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("modulePurchaseKeepOpen"));
    expect(screen.getByLabelText(/modulePurchaseEndLabel/)).not.toBeRequired();
  });
});
