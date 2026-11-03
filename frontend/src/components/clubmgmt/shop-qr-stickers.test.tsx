import { render, screen } from "@testing-library/react";

import { ShopQrStickers } from "@/components/clubmgmt/shop-qr-stickers";
import type { ShopVariant } from "@/lib/clubmgmt-api";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${values.size}` : key,
}));

function variant(overrides: Partial<ShopVariant> = {}): ShopVariant {
  return {
    id: 1,
    label: "M",
    quantity: 2,
    reorder_level: 1,
    is_active: true,
    low_stock: false,
    qr_payload: "LTFSHOP:2:1:token",
    qr_png: "data:image/png;base64,aaaa",
    sale_price: "10.00",
    ...overrides,
  };
}

describe("ShopQrStickers", () => {
  it("shows a QR preview for each active size", () => {
    render(
      <ShopQrStickers
        variants={[
          variant(),
          variant({ id: 2, label: "L", qr_png: "data:image/png;base64,bbbb" }),
          variant({ id: 3, label: "Retired", is_active: false }),
        ]}
      />
    );

    expect(screen.getByRole("img", { name: "shopQrAlt:M" })).toHaveAttribute(
      "src",
      "data:image/png;base64,aaaa"
    );
    expect(screen.getByRole("img", { name: "shopQrAlt:L" })).toBeInTheDocument();
    expect(screen.queryByText("Retired")).not.toBeInTheDocument();
  });

  it("says when a size has no QR image", () => {
    render(<ShopQrStickers variants={[variant({ qr_png: "" })]} />);
    expect(screen.getByText("shopQrPreviewEmpty")).toBeInTheDocument();
  });
});
