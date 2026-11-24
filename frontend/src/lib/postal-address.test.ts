import { postalAddressLines, shownDelivery } from "@/lib/postal-address";

const vichten = {
  street: "rue Principale",
  house_number: "87",
  line2: "",
  postal_code: "9190",
  locality: "Vichten",
  country: "LU",
};

describe("postalAddressLines", () => {
  it("prints the invoice envelope, with the country name in the screen language", () => {
    expect(postalAddressLines(vichten, "en")).toEqual(["87, rue Principale", "L-9190 Vichten", "Luxembourg"]);
    expect(postalAddressLines(vichten, "fr")).toEqual(["87, rue Principale", "L-9190 Vichten", "Luxembourg"]);
    expect(postalAddressLines(vichten, "de")).toEqual(["87, rue Principale", "L-9190 Vichten", "Luxemburg"]);
    expect(postalAddressLines(vichten, "lb")).toEqual(["87, rue Principale", "L-9190 Vichten", "Lëtzebuerg"]);
  });

  it("keeps an extra line and leaves a non-Luxembourg postcode as it was stored", () => {
    expect(
      postalAddressLines(
        {
          street: "Hauptstraße",
          house_number: "4",
          line2: "Wohnung 2",
          postal_code: "54290",
          locality: "Trier",
          country: "DE",
        },
        "de",
      ),
    ).toEqual(["4, Hauptstraße", "Wohnung 2", "54290 Trier", "Deutschland"]);
  });
});

describe("shownDelivery", () => {
  it("keeps the stored choice, so an address does not turn an email choice into post", () => {
    expect(shownDelivery("email")).toBe("email");
    expect(shownDelivery("")).toBe("email");
    expect(shownDelivery("post")).toBe("post");
    expect(shownDelivery("hand")).toBe("hand");
  });
});
