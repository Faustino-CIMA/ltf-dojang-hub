import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

import { LuAddressFields, type AddressValue } from "@/components/clubmgmt/lu-address-fields";
import { joinStreetLine, splitStreetLine } from "@/lib/address-suggestion";
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

  it("offers street names after the postcode, and keeps the whole address out of Street", async () => {
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
        {
          house_number: "4",
          street: "",
          locality: "Luxembourg",
          postal_code: "2445",
          label: "4, Rue des Roses, L-2445 Luxembourg",
        },
      ],
    });
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("postalCode"), { target: { value: "2449" } });
    fireEvent.focus(screen.getByLabelText("street"));

    expect(await screen.findByRole("button", { name: "Boulevard Royal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rue des Roses" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /L-2449|L-2445/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Boulevard Royal" }));

    expect(screen.getByLabelText("street")).toHaveValue("Boulevard Royal");
    expect(screen.getByLabelText("houseNumber")).toHaveValue("");
    expect(screen.getByLabelText("postalCode")).toHaveValue("2449");
    expect(screen.getByLabelText("locality")).toHaveValue("Luxembourg");

    fireEvent.change(screen.getByLabelText("houseNumber"), { target: { value: "10" } });
    expect(screen.getByLabelText("street")).toHaveValue("Boulevard Royal");
    expect(screen.getByLabelText("houseNumber")).toHaveValue("10");
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

function JoinedHarness({
  initialLine,
  initialPostal = "",
  initialLocality = "",
}: {
  initialLine: string;
  initialPostal?: string;
  initialLocality?: string;
}) {
  const [line, setLine] = useState(initialLine);
  const [line2, setLine2] = useState("");
  const [postal, setPostal] = useState(initialPostal);
  const [locality, setLocality] = useState(initialLocality);
  const split = splitStreetLine(line, { postal_code: postal, locality });
  return (
    <>
      <span data-testid="stored-line">{line}</span>
      <LuAddressFields
        showCountry={false}
        value={{
          ...split,
          line2,
          postal_code: postal,
          locality,
          country: "Luxembourg",
          use_for_invoice: false,
        }}
        onChange={(next) => {
          setLine(joinStreetLine(next.house_number, next.street));
          setLine2(next.line2);
          setPostal(next.postal_code);
          setLocality(next.locality);
        }}
      />
    </>
  );
}

describe("joined address line round trip", () => {
  beforeEach(() => {
    lookup.mockReset();
  });

  it("shows a saved number and street, and leaves an unsplittable line in Street", () => {
    const { unmount } = render(
      <JoinedHarness initialLine="12 Rue de Test" initialPostal="1234" initialLocality="Musterstadt" />,
    );
    expect(screen.getByLabelText("houseNumber")).toHaveValue("12");
    expect(screen.getByLabelText("street")).toHaveValue("Rue de Test");
    expect(screen.getByTestId("stored-line")).toHaveTextContent("12 Rue de Test");
    unmount();

    const splitReload = render(
      <JoinedHarness
        initialLine="10, Boulevard Royal, L-2449 Luxembourg"
        initialPostal="2449"
        initialLocality="Luxembourg"
      />,
    );
    expect(screen.getByLabelText("street")).toHaveValue("Boulevard Royal");
    expect(screen.getByLabelText("houseNumber")).toHaveValue("10");
    expect(screen.getByLabelText("street")).not.toHaveValue(expect.stringMatching(/2449|,/));
    splitReload.unmount();

    const hiddenPlace = render(<JoinedHarness initialLine="10, Boulevard Royal, L-2449 Luxembourg" />);
    expect(screen.getByLabelText("street")).toHaveValue("10, Boulevard Royal, L-2449 Luxembourg");
    expect(screen.getByLabelText("houseNumber")).toHaveValue("");
    hiddenPlace.unmount();

    render(<JoinedHarness initialLine="Secretariat, building C" initialPostal="2449" initialLocality="Luxembourg" />);
    expect(screen.getByLabelText("street")).toHaveValue("Secretariat, building C");
    expect(screen.getByLabelText("houseNumber")).toHaveValue("");
  });

  it("stores a picked street and house number without the whole address", async () => {
    lookup.mockResolvedValue({
      postal_code: "2449",
      localities: ["Luxembourg"],
      streets: ["Boulevard Royal"],
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
    render(<JoinedHarness initialLine="" />);
    fireEvent.change(screen.getByLabelText("postalCode"), { target: { value: "2449" } });
    fireEvent.focus(screen.getByLabelText("street"));
    fireEvent.click(await screen.findByRole("button", { name: "Boulevard Royal" }));
    fireEvent.change(screen.getByLabelText("houseNumber"), { target: { value: "10" } });

    expect(screen.getByLabelText("street")).toHaveValue("Boulevard Royal");
    expect(screen.getByLabelText("houseNumber")).toHaveValue("10");
    expect(screen.getByLabelText("locality")).toHaveValue("Luxembourg");
    expect(screen.getByTestId("stored-line")).toHaveTextContent("10 Boulevard Royal");
    expect(screen.getByTestId("stored-line").textContent).not.toMatch(/L-2449|,/);
  });

  it("offers a letter suffix from the street lookup and keeps a typed number that is not listed", async () => {
    lookup.mockImplementation(async (postal: string, street?: string) => {
      if (street) {
        return {
          postal_code: postal,
          localities: ["Luxembourg"],
          streets: ["Rue des Lilas"],
          houses: [
            {
              house_number: "17",
              street: "Rue des Lilas",
              locality: "Luxembourg",
              postal_code: postal,
              label: "17, Rue des Lilas, L-1000 Luxembourg",
            },
            {
              house_number: "17B",
              street: "Rue des Lilas",
              locality: "Luxembourg",
              postal_code: postal,
              label: "17B, Rue des Lilas, L-1000 Luxembourg",
            },
          ],
        };
      }
      return {
        postal_code: postal,
        localities: ["Luxembourg"],
        streets: ["Rue des Lilas"],
        houses: [
          {
            house_number: "1",
            street: "Rue des Lilas",
            locality: "Luxembourg",
            postal_code: postal,
            label: "1, Rue des Lilas, L-1000 Luxembourg",
          },
        ],
      };
    });
    render(<JoinedHarness initialLine="" />);
    fireEvent.change(screen.getByLabelText("postalCode"), { target: { value: "1000" } });
    fireEvent.focus(screen.getByLabelText("street"));
    fireEvent.click(await screen.findByRole("button", { name: "Rue des Lilas" }));

    await waitFor(() => expect(document.querySelector('option[value="17B"]')).toBeTruthy());
    expect(document.querySelector('option[value="1"]')).toBeNull();

    fireEvent.change(screen.getByLabelText("houseNumber"), { target: { value: "17C" } });
    expect(screen.getByLabelText("houseNumber")).toHaveValue("17C");
    expect(screen.getByLabelText("street")).toHaveValue("Rue des Lilas");
    expect(screen.getByTestId("stored-line")).toHaveTextContent("17C Rue des Lilas");
  });
});
