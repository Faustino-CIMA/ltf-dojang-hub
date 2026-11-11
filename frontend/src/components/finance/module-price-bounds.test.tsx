import { render, screen } from "@testing-library/react";

import { ModulePriceBounds } from "@/components/finance/module-price-bounds";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    if (!values) return key;
    return `${key}:${Object.values(values).join("|")}`;
  },
}));

describe("Module price bounds", () => {
  it("shows the minimum and the maximum when both can change the bill", () => {
    render(
      <ModulePriceBounds
        pricingType="per_active_member"
        amount="10.00"
        currency="EUR"
        minimumAmount="50.00"
        maximumAmount="300.00"
      />,
    );

    expect(screen.getByText("moduleFeeMinimumShown:50.00|EUR")).toBeInTheDocument();
    expect(screen.getByText("moduleFeeMaximumShown:300.00|EUR")).toBeInTheDocument();
  });

  it("omits an empty maximum and a flat maximum that cannot lower the price", () => {
    const { rerender } = render(
      <ModulePriceBounds pricingType="flat" amount="80.00" currency="EUR" minimumAmount={null} maximumAmount={null} />,
    );
    expect(screen.queryByText(/moduleFeeMaximumShown/)).not.toBeInTheDocument();
    rerender(
      <ModulePriceBounds pricingType="flat" amount="80.00" currency="EUR" maximumAmount="100.00" />,
    );
    expect(screen.queryByText(/moduleFeeMaximumShown/)).not.toBeInTheDocument();
  });
});
