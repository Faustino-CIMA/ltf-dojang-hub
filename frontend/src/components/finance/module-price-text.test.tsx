import { render, screen } from "@testing-library/react";

import { ModulePriceText } from "@/components/finance/module-price-text";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    if (!values) return key;
    return `${key}:${Object.values(values).join("|")}`;
  },
}));

describe("Module price text", () => {
  it("names a per-member price and the minimum", () => {
    render(
      <ModulePriceText
        amount="2.00"
        currency="EUR"
        pricingType="per_active_member"
        minimumAmount="20.00"
        showMinimum
        hint
      />,
    );

    expect(screen.getByText("moduleFeePricePerMemberYear:2.00|EUR")).toBeInTheDocument();
    expect(screen.getByText("moduleFeeMinimumShown:20.00|EUR")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "aboutTitle:moduleFeePricingPerMember" })).toBeInTheDocument();
  });

  it("leaves a flat price as the amount", () => {
    render(
      <ModulePriceText amount="40.00" currency="EUR" pricingType="flat" minimumAmount="5.00" showMinimum />,
    );

    expect(screen.getByText("40.00 EUR")).toBeInTheDocument();
    expect(screen.queryByText(/moduleFeeMinimumShown/)).not.toBeInTheDocument();
  });
});
