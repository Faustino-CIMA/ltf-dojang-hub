import { fireEvent, render, screen } from "@testing-library/react";

import { ModuleFeesPanel } from "@/components/ltf-finance/module-fees-panel";
import type { ClubFeeType } from "@/lib/ltf-finance-api";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

function fee(overrides: Partial<ClubFeeType> = {}): ClubFeeType {
  return {
    id: 7,
    name: "Club management",
    code: "club-management",
    description: "",
    cadence: "annual",
    year: null,
    module_id: "club_management",
    is_active: true,
    has_invoices: false,
    current_amount: "80.00",
    current_currency: "EUR",
    current_pricing_type: "flat",
    current_minimum_amount: null,
    current_effective_from: "2026-01-01",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderPanel(rows: ClubFeeType[]) {
  return render(
    <ModuleFeesPanel
      fees={rows}
      prices={[]}
      onCreate={jest.fn()}
      onSave={jest.fn()}
      onRemove={jest.fn()}
      onNotice={jest.fn()}
    />
  );
}

describe("Module fees panel", () => {
  it("opens the add side panel with popovers instead of dropdowns", () => {
    renderPanel([]);
    fireEvent.click(screen.getByRole("button", { name: "moduleFeeAdd" }));
    expect(screen.getByRole("dialog", { name: "moduleFeeAddTitle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "moduleFeeModuleLabel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "moduleFeePricingLabel" })).toBeInTheDocument();
    expect(screen.getByLabelText("moduleFeeAmountLabel")).toBeInTheDocument();
    expect(screen.getByLabelText("moduleFeeMinimumLabel")).toBeInTheDocument();
    expect(document.querySelector("select")).toBeNull();
  });

  it("puts Edit first and Delete last when the fee has no invoice", () => {
    renderPanel([fee()]);
    const card = screen.getByRole("heading", { name: "moduleFeesTitle" }).closest("section");
    expect(card?.className).toContain("app-panel");
    expect(card).toContainElement(screen.getByRole("button", { name: "moduleFeeAdd" }));
    fireEvent.click(screen.getByRole("button", { name: "moduleFeeRowActions" }));
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["moduleFeeEdit", "moduleFeeDelete"]);
  });

  it("switches off instead of deleting a fee that was already invoiced", () => {
    renderPanel([fee({ has_invoices: true })]);
    fireEvent.click(screen.getByRole("button", { name: "moduleFeeRowActions" }));
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["moduleFeeEdit", "moduleFeeSwitchOff"]);
    fireEvent.click(items[1]);
    expect(screen.getByRole("dialog", { name: "moduleFeeSwitchOffTitle" })).toBeInTheDocument();
  });
});
