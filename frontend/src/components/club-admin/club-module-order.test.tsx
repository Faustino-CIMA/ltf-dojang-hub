import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ClubModuleOrderPanel } from "@/components/club-admin/club-module-order";
import type { ModuleOrderCatalog, ModuleOrderOffer } from "@/lib/ltf-finance-api";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
}));

function offer(overrides: Partial<ModuleOrderOffer> = {}): ModuleOrderOffer {
  return {
    kind: "module",
    key: "event_calendar",
    module_id: "event_calendar",
    bundle_id: null,
    name: "Event calendar",
    module_ids: ["event_calendar"],
    module_names: ["Event calendar"],
    amount: "40.00",
    estimated_amount: "40.00",
    currency: "EUR",
    pricing_type: "flat",
    active_member_count: null,
    state: "available",
    ends_at: null,
    invoice_id: null,
    invoice_number: null,
    comparison: null,
    ...overrides,
  };
}

function catalog(offers: ModuleOrderOffer[]): ModuleOrderCatalog {
  return { club_id: 3, active_member_count: 4, subscription_months: 12, offers };
}

describe("Club module order", () => {
  it("shows a grandfathered module as on with no end date and keeps it out of the picker", () => {
    render(
      <ClubModuleOrderPanel
        catalog={catalog([
          offer({
            key: "club_management",
            module_id: "club_management",
            name: "Club management",
            module_ids: ["club_management"],
            module_names: ["Club management"],
            state: "on",
          }),
          offer(),
        ])}
        invoicePath={(id) => `/en/dashboard/club/invoices/${id}`}
        onOrder={jest.fn()}
      />,
    );
    expect(screen.getByText("moduleOrderNoEnd")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "moduleOrderChoose" }));
    expect(screen.queryByRole("checkbox", { name: "Club management" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Event calendar" })).toBeInTheDocument();
    expect(document.querySelector("[data-required]")).toBeTruthy();
  });

  it("links an open invoice and does not offer that module again", () => {
    render(
      <ClubModuleOrderPanel
        catalog={catalog([
          offer({
            state: "open_invoice",
            invoice_id: 9,
            invoice_number: "INV-9",
          }),
        ])}
        invoicePath={(id) => `/en/dashboard/club/invoices/${id}`}
        onOrder={jest.fn()}
      />,
    );
    const link = screen.getByRole("link", { name: "moduleOrderOpenInvoice INV-9" });
    expect(link).toHaveAttribute("href", "/en/dashboard/club/invoices/9");
  });

  it("drops a single module that is already inside the selected bundle", async () => {
    const onOrder = jest.fn().mockResolvedValue({
      invoice_id: 4,
      invoice_number: "INV-4",
      order_id: 8,
      total: "100.00",
      currency: "EUR",
      lines: [],
      notices: [],
    });
    render(
      <ClubModuleOrderPanel
        catalog={catalog([
          offer({
            key: "club_management",
            module_id: "club_management",
            name: "Club management",
            module_ids: ["club_management"],
            module_names: ["Club management"],
            amount: "80.00",
            estimated_amount: "80.00",
          }),
          offer({
            kind: "bundle",
            key: "bundle:1",
            module_id: null,
            bundle_id: 1,
            name: "Competition pack",
            module_ids: ["club_management", "competition"],
            module_names: ["Club management", "Competition"],
            amount: "100.00",
            estimated_amount: "100.00",
            comparison: {
              lines: [
                { module_id: "club_management", name: "Club management", kind: "flat", amount: "80.00" },
                { module_id: "competition", name: "Competition", kind: "per_member", amount: "8.00" },
              ],
              sum: null,
              difference: null,
            },
          }),
        ])}
        invoicePath={(id) => `/en/dashboard/club/invoices/${id}`}
        onOrder={onOrder}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "moduleOrderChoose" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Club management" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Competition pack" }));
    expect(screen.getByText("moduleOrderDropped Club management Competition pack")).toBeInTheDocument();
    expect(screen.queryByText(/moduleOrderComparisonHigher/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "moduleOrderReview" }));
    expect(screen.getByText(/8\.00 EUR/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "moduleOrderConfirm" }));
    await waitFor(() => expect(onOrder).toHaveBeenCalledWith({ modules: [], bundles: [1] }));
  });

  it("asks the club to untick one when two bundles share a module", () => {
    render(
      <ClubModuleOrderPanel
        catalog={catalog([
          offer({
            kind: "bundle",
            key: "bundle:1",
            module_id: null,
            bundle_id: 1,
            name: "Competition pack",
            module_ids: ["club_management", "competition"],
            module_names: [],
          }),
          offer({
            kind: "bundle",
            key: "bundle:2",
            module_id: null,
            bundle_id: 2,
            name: "Calendar pack",
            module_ids: ["club_management", "event_calendar"],
            module_names: [],
          }),
        ])}
        invoicePath={(id) => `/en/dashboard/club/invoices/${id}`}
        onOrder={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "moduleOrderChoose" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Competition pack" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Calendar pack" }));
    expect(screen.getByText("moduleOrderShared")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "moduleOrderReview" })).toBeDisabled();
  });
});
