import { fireEvent, render, screen } from "@testing-library/react";

import { ModuleBundlesPanel } from "@/components/ltf-finance/module-bundles-panel";
import type { ClubFeeType, ModuleBundle, ModuleSubscriptionSettings } from "@/lib/ltf-finance-api";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.amount ? `${key} ${values.amount}` : key,
}));

const settings: ModuleSubscriptionSettings = {
  subscription_months: 12,
  renewal_notice_days: 30,
  payment_window_days: 30,
  payment_warning_days: 7,
  updated_at: "2026-01-01T00:00:00Z",
};

function fee(overrides: Partial<ClubFeeType> = {}): ClubFeeType {
  return {
    id: 1,
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

function bundle(overrides: Partial<ModuleBundle> = {}): ModuleBundle {
  return {
    id: 4,
    name: "Competition pack",
    code: "competition-pack",
    description: "",
    is_active: true,
    module_ids: ["club_management", "competition"],
    current_amount: "100.00",
    current_currency: "EUR",
    current_effective_from: "2026-03-01",
    has_invoices: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderPanel(bundles: ModuleBundle[] = [], moduleFees: ClubFeeType[] = [fee()]) {
  return render(
    <ModuleBundlesPanel
      bundles={bundles}
      moduleFees={moduleFees}
      settings={settings}
      onCreate={jest.fn()}
      onUpdate={jest.fn()}
      onRemove={jest.fn()}
      onSaveSettings={jest.fn()}
      onNotice={jest.fn()}
    />,
  );
}

describe("Module bundles panel", () => {
  it("shows an empty state and opens the add panel", () => {
    renderPanel();
    expect(screen.getByText("moduleBundleEmptyTitle")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "moduleBundleAdd" }));
    expect(screen.getByRole("dialog", { name: "moduleBundleAdd" })).toBeInTheDocument();
    expect(screen.getByLabelText(/moduleBundleNameLabel/)).toBeRequired();
  });

  it("compares a flat price and leaves a per-member price as a label", () => {
    renderPanel(
      [],
      [
        fee(),
        fee({
          id: 2,
          module_id: "competition",
          name: "Competition",
          current_amount: "2.00",
          current_pricing_type: "per_active_member",
        }),
      ],
    );
    fireEvent.click(screen.getByRole("button", { name: "moduleBundleAdd" }));
    fireEvent.click(screen.getByRole("button", { name: "moduleBundleModulesLabel" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "moduleClubManagement" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "moduleCompetition" }));
    fireEvent.change(screen.getByLabelText(/moduleBundleAmountLabel/), { target: { value: "100.00" } });
    expect(screen.getByText(/moduleBundlePerMember/)).toBeInTheDocument();
    expect(screen.getByText(/80\.00 EUR/)).toBeInTheDocument();
    expect(screen.queryByText(/moduleBundleComparisonHigher/)).not.toBeInTheDocument();
  });

  it("shows the euro difference when every selected module has a flat price", () => {
    renderPanel(
      [],
      [
        fee(),
        fee({
          id: 2,
          module_id: "competition",
          name: "Competition",
          current_amount: "40.00",
          current_pricing_type: "flat",
        }),
      ],
    );
    fireEvent.click(screen.getByRole("button", { name: "moduleBundleAdd" }));
    fireEvent.click(screen.getByRole("button", { name: "moduleBundleModulesLabel" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "moduleClubManagement" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "moduleCompetition" }));
    fireEvent.change(screen.getByLabelText(/moduleBundleAmountLabel/), { target: { value: "100.00" } });
    expect(screen.getByText("moduleBundleComparisonLower 20.00")).toBeInTheDocument();
  });

  it("opens the pencil editor and keeps Delete last until the bundle is invoiced", () => {
    renderPanel([bundle()]);
    fireEvent.click(screen.getByRole("button", { name: "moduleBundleEditAction" }));
    expect(screen.getByRole("dialog", { name: "moduleBundleEditTitle" })).toBeInTheDocument();
    expect(screen.getByLabelText(/moduleBundleNameLabel/)).toHaveValue("Competition pack");

    fireEvent.click(screen.getByRole("button", { name: "moduleBundleRowActions" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["moduleBundleDelete"]);
  });

  it("offers switch off instead of delete after a bundle has been invoiced", () => {
    renderPanel([bundle({ has_invoices: true })]);
    fireEvent.click(screen.getByRole("button", { name: "moduleBundleRowActions" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["moduleBundleSwitchOff"]);
  });
});
