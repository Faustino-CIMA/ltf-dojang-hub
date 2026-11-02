import { fireEvent, render, screen } from "@testing-library/react";

import { FinanceListFilters } from "@/components/finance/finance-list-filters";

jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: { label?: string; count?: number }) => {
    if (namespace === "Common" && key === "filterGroupStatus") return "Status";
    if (namespace === "Common" && key === "resetFilters") return "Reset filters";
    if (namespace === "Common" && key === "filterGroupCountLabel") return `${values?.label}, ${values?.count}`;
    if (namespace === "ClubAdmin" && key === "financeLedgerLabel") return "Accounting";
    if (namespace === "ClubAdmin" && key === "financeLedgerAll") return "All";
    if (namespace === "ClubAdmin" && key === "financeLedgerLtf") return "LTF";
    if (namespace === "ClubAdmin" && key === "financeLedgerClub") return "Club";
    if (namespace === "ClubAdmin" && key === "financeLedgerFilterAriaLabel") return "Accounting";
    return key;
  },
}));

describe("FinanceListFilters", () => {
  it("keeps status and accounting behind singular labels and resets both", () => {
    const onResetStatus = jest.fn();
    const onLedgerChange = jest.fn();
    render(
      <FinanceListFilters
        statusActive
        onResetStatus={onResetStatus}
        ledger="club"
        onLedgerChange={onLedgerChange}
        status={<p>Placed</p>}
      />,
    );
    expect(screen.getByRole("button", { name: "Status, 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accounting, 1" })).toBeInTheDocument();
    expect(screen.queryByText("Placed")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Status, 1" }));
    expect(screen.getByText("Placed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(onResetStatus).toHaveBeenCalled();
    expect(onLedgerChange).toHaveBeenCalledWith("all");
  });
});
