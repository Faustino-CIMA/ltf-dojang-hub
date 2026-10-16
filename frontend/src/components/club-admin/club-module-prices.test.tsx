import { render, screen } from "@testing-library/react";

import { ClubModulePrices } from "@/components/club-admin/club-module-prices";
import type { ClubModuleFeeQuote } from "@/lib/ltf-finance-api";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    if (!values) return key;
    return `${key}:${Object.values(values).join("|")}`;
  },
}));

const quote: ClubModuleFeeQuote = {
  club_id: 1,
  year: 2026,
  active_member_count: 48,
  estimate: true,
  modules: [
    {
      module_id: "club_management",
      name: "Club management",
      enabled: true,
      has_price: true,
      pricing_type: "per_active_member",
      amount: "2.00",
      currency: "EUR",
      minimum_amount: "150.00",
      effective_from: "2026-01-01",
      active_member_count: 48,
      calculated_amount: "96.00",
      estimated_amount: "150.00",
      minimum_applied: true,
    },
    {
      module_id: "event_calendar",
      name: "Event calendar",
      enabled: false,
      has_price: true,
      pricing_type: "flat",
      amount: "40.00",
      currency: "EUR",
      minimum_amount: null,
      effective_from: "2026-01-01",
      active_member_count: 48,
      calculated_amount: "40.00",
      estimated_amount: "40.00",
      minimum_applied: false,
    },
  ],
};

describe("Club profile module prices", () => {
  it("shows the estimate, the member calculation, and no edit controls", () => {
    render(<ClubModulePrices quote={quote} />);

    expect(screen.getByRole("heading", { name: "modulePricesTitle" })).toBeInTheDocument();
    expect(screen.getByText("modulePricesEstimateHint")).toBeInTheDocument();
    expect(screen.getByText("modulePricesOn")).toBeInTheDocument();
    expect(screen.getByText("modulePricesOff")).toBeInTheDocument();
    expect(
      screen.getByText("modulePricesCalculation:48|€2.00|€96.00 modulePricesMinimumLine:€150.00|€150.00")
    ).toBeInTheDocument();
    expect(screen.getByText("modulePricesFlat:€40.00")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit|delete|save|add/i })).not.toBeInTheDocument();
  });
});
