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
  it("shows the item name, price, and a real size", () => {
    render(
      <ShopQrStickers
        name="Winter training jacket"
        variants={[
          variant(),
          variant({ id: 2, label: "L", sale_price: "12.5", qr_png: "data:image/png;base64,bbbb" }),
          variant({ id: 3, label: "Retired", is_active: false, sale_price: "9.00" }),
        ]}
      />
    );

    expect(screen.getAllByText("Winter training jacket")).toHaveLength(2);
    expect(screen.getByText("10.00 EUR")).toBeInTheDocument();
    expect(screen.getByText("12.50 EUR")).toBeInTheDocument();
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText("L")).toBeInTheDocument();
    expect(screen.queryByText("Retired")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "shopQrAlt:M" })).toHaveAttribute(
      "src",
      "data:image/png;base64,aaaa"
    );
  });

  it("omits Standard when the item has no size", () => {
    render(
      <ShopQrStickers
        name="Club belt"
        variants={[variant({ label: "Standard", sale_price: "10.00" })]}
      />
    );

    expect(screen.getByText("Club belt")).toBeInTheDocument();
    expect(screen.getByText("10.00 EUR")).toBeInTheDocument();
    expect(screen.queryByText("Standard")).not.toBeInTheDocument();
  });

  it("clamps a long item name so the tiles stay aligned", () => {
    const name = "Club winter training jacket with a hood and a small crest";
    render(<ShopQrStickers name={name} variants={[variant({ label: "160" })]} />);
    expect(screen.getByText(name)).toHaveClass("line-clamp-2");
    expect(screen.getByText("160")).toBeInTheDocument();
  });

  it("says when a size has no QR image", () => {
    render(<ShopQrStickers name="Club belt" variants={[variant({ qr_png: "" })]} />);
    expect(screen.getByText("shopQrPreviewEmpty")).toBeInTheDocument();
  });
});