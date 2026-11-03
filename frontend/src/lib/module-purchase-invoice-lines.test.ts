import {
  modulePurchaseLineTotal,
  modulePurchaseUnitPrice,
  orderItemsAreModulePurchases,
  type FinanceOrderItem,
} from "./ltf-finance-api";

function line(overrides: Partial<FinanceOrderItem>): FinanceOrderItem {
  return {
    id: 1,
    license: null,
    price_snapshot: "100.00",
    quantity: 1,
    ...overrides,
  };
}

describe("module purchase invoice lines", () => {
  it("keeps a bundle as one line with its own total", () => {
    const bundle = line({
      description: "Competition pack — Club management, Competition",
      charged_amount: "100.00",
      module_purchase: true,
    });
    expect(orderItemsAreModulePurchases([bundle])).toBe(true);
    expect(modulePurchaseUnitPrice(bundle, "EUR")).toBe("100.00 EUR");
    expect(modulePurchaseLineTotal(bundle, "EUR")).toBe("100.00 EUR");
  });

  it("leaves a club fee line on the existing item columns", () => {
    expect(orderItemsAreModulePurchases([line({ module_purchase: false })])).toBe(false);
    expect(orderItemsAreModulePurchases([line({ license: { id: 1 } as FinanceOrderItem["license"] })])).toBe(false);
  });
});
