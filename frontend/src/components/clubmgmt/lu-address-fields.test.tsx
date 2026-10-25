import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

import { LuAddressFields, type AddressValue } from "@/components/clubmgmt/lu-address-fields";
import { lookupLuAddress } from "@/lib/clubmgmt-api";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

jest.mock("@/lib/clubmgmt-api", () => ({
  lookupLuAddress: jest.fn(),
}));

const lookup = lookupLuAddress as jest.MockedFunction<typeof lookupLuAddress>;

function Harness({ initial }: { initial?: Partial<AddressValue> }) {
  const [value, setValue] = useState<AddressValue>({
    postal_code: "",
    locality: "",
    street: "",
    house_number: "",
    line2: "",
    country: "Luxembourg",
    use_for_invoice: false,
    ...initial,
  });
  return <LuAddressFields value={value} onChange={setValue} />;
}

describe("LuAddressFields lookup", () => {
  beforeEach(() => {
    lookup.mockReset();
  });

  it("splits a picked street after the postcode was entered", async () => {
    lookup.mockResolvedValue({
      postal_code: "2449",
      localities: ["Luxembourg"],
      streets: ["Boulevard Royal", "Rue des Roses, L-2445 Luxembourg"],
      houses: [
        {
          house_number: "10",
          street: "Boulevard Royal",
          locality: "Luxembourg",
          postal_code: "2449",
          label: "10, Boulevard Royal, L-2449 Luxembourg",
        },
      ],
    });
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("postalCode"), { target: { value: "2449" } });
    fireEvent.focus(screen.getByLabelText("street"));
    fireEvent.click(await screen.findByRole("button", { name: "10, Boulevard Royal, L-2449 Luxembourg" }));

    expect(screen.getByLabelText("street")).toHaveValue("Boulevard Royal");
    expect(screen.getByLabelText("houseNumber")).toHaveValue("10");
    expect(screen.getByLabelText("postalCode")).toHaveValue("2449");
    expect(screen.getByLabelText("locality")).toHaveValue("Luxembourg");
  });

  it("keeps a typed street when the postcode is entered afterwards", async () => {
    lookup.mockResolvedValue({
      postal_code: "2445",
      localities: ["Luxembourg"],
      streets: ["Rue des Roses, L-2445 Luxembourg"],
      houses: [],
    });
    render(<Harness initial={{ street: "Rue des Roses" }} />);
    fireEvent.change(screen.getByLabelText("postalCode"), { target: { value: "2445" } });
    await waitFor(() => expect(screen.getByLabelText("locality")).toHaveValue("Luxembourg"));
    expect(screen.getByLabelText("street")).toHaveValue("Rue des Roses");
    expect(screen.getByLabelText("postalCode")).toHaveValue("2445");
  });
});
