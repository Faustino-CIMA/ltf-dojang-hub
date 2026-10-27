import { fireEvent, render, screen } from "@testing-library/react";

import { InvoiceAddressChoices, markSingleInvoiceAddress } from "@/components/clubmgmt/invoice-address-mark";

describe("markSingleInvoiceAddress", () => {
  const rows = [
    { street: "Rue Example", use_for_invoice: true },
    { street: "Quai des Lanternes", use_for_invoice: true },
    { street: "Chemin de la Vallée", use_for_invoice: false },
  ];

  it("keeps the flag on the address that was just chosen", () => {
    expect(markSingleInvoiceAddress(rows, 1, true).map((row) => row.use_for_invoice)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("clears only the address that was unticked", () => {
    expect(markSingleInvoiceAddress(rows, 0, false).map((row) => row.use_for_invoice)).toEqual([
      false,
      true,
      false,
    ]);
  });
});

describe("InvoiceAddressChoices", () => {
  it("unticks the other addresses when one is chosen", () => {
    const onChange = jest.fn();
    const rows = [
      { label: "1 Example Street", use_for_invoice: true },
      { label: "4 Quai des Lanternes", use_for_invoice: false },
    ];
    render(
      <InvoiceAddressChoices
        rows={rows}
        hint="Only one address receives invoices."
        labelFor={(row) => row.label}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "4 Quai des Lanternes" }));

    expect(onChange).toHaveBeenCalledWith([
      { label: "1 Example Street", use_for_invoice: false },
      { label: "4 Quai des Lanternes", use_for_invoice: true },
    ]);
  });
});
