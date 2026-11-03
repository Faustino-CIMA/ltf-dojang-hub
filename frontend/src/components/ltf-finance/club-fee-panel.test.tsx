import { fireEvent, render, screen } from "@testing-library/react";

import { ClubFeeFormPanel } from "@/components/ltf-finance/club-fee-panel";
import type { ClubFeeType } from "@/lib/ltf-finance-api";

jest.mock("next-intl", () => {
  const translate = (key: string) => key;
  return {
    useTranslations: () => translate,
    useLocale: () => "en",
  };
});

const fee: ClubFeeType = {
  id: 4,
  name: "Affiliation",
  code: "affiliation",
  description: "Yearly club affiliation",
  cadence: "annual",
  year: null,
  module_id: null,
  is_active: true,
  current_amount: "150.00",
  current_currency: "EUR",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("ClubFeeFormPanel", () => {
  it("opens an existing fee and saves the edited fields", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<ClubFeeFormPanel open fee={fee} saving={false} onClose={() => undefined} onSubmit={onSubmit} />);

    const name = screen.getByLabelText(/clubFeeNameLabel/);
    expect(name).toHaveValue("Affiliation");
    expect(screen.getByLabelText("clubFeeAmountLabel")).toHaveValue("150.00");
    expect(screen.getByLabelText("clubFeeDescriptionLabel")).toHaveValue("Yearly club affiliation");
    expect(screen.getByRole("checkbox", { name: "clubFeeActiveLabel" })).toBeChecked();

    fireEvent.change(name, { target: { value: "Club affiliation" } });
    fireEvent.change(screen.getByLabelText("clubFeeAmountLabel"), { target: { value: "175.00" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "clubFeeActiveLabel" }));
    fireEvent.click(screen.getByRole("button", { name: "clubFeeSaveAction" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Club affiliation",
      description: "Yearly club affiliation",
      cadence: "annual",
      amount: "175.00",
      isActive: false,
    });
  });
});
