import {
  applyAddressSuggestion,
  applyPostalLookup,
  houseNumberOptions,
  joinStreetLine,
  lookupStreetNames,
  splitAddressSuggestion,
  splitStreetLine,
} from "@/lib/address-suggestion";

const empty = { street: "", house_number: "", postal_code: "", locality: "" };

describe("address suggestion splitting", () => {
  it("splits a full Geoportail label into street, number, postcode, and locality", () => {
    expect(splitAddressSuggestion("10, Boulevard Royal, L-2449 Luxembourg")).toEqual({
      house_number: "10",
      street: "Boulevard Royal",
      postal_code: "2449",
      locality: "Luxembourg",
    });
    expect(splitAddressSuggestion("25C, Boulevard Royal, L-2449 Luxembourg").house_number).toBe("25C");
  });

  it("postcode then street: picking a suggestion does not leave the whole address in the street", () => {
    const afterPostcode = { ...empty, postal_code: "2449" };
    const picked = applyAddressSuggestion(afterPostcode, "10, Boulevard Royal, L-2449 Luxembourg");

    expect(picked.street).toBe("Boulevard Royal");
    expect(picked.street).not.toMatch(/2449|Luxembourg|,/);
    expect(picked.house_number).toBe("10");
    expect(picked.postal_code).toBe("2449");
    expect(picked.locality).toBe("Luxembourg");
  });

  it("postcode then street: a nearby label keeps its own postcode and does not wipe a typed house number when the label has none", () => {
    const afterPostcode = { ...empty, postal_code: "2449", house_number: "8" };
    const picked = applyAddressSuggestion(afterPostcode, "Rue des Roses, L-2445 Luxembourg");

    expect(picked).toEqual({
      street: "Rue des Roses",
      house_number: "8",
      postal_code: "2445",
      locality: "Luxembourg",
    });
  });

  it("a street-only suggestion does not overwrite the postcode, number, or locality already typed", () => {
    const typed = { street: "Bou", house_number: "8", postal_code: "2449", locality: "Luxembourg" };
    expect(applyAddressSuggestion(typed, "Boulevard Royal")).toEqual({
      street: "Boulevard Royal",
      house_number: "8",
      postal_code: "2449",
      locality: "Luxembourg",
    });
  });

  it("street suggestions are street names, even when the lookup label is a whole address", () => {
    expect(
      lookupStreetNames(
        ["Boulevard Royal", "Rue des Roses, L-2445 Luxembourg"],
        [
          {
            street: "Boulevard Royal",
            label: "10, Boulevard Royal, L-2449 Luxembourg",
          },
          { label: "4, Rue des Roses, L-2445 Luxembourg" },
        ],
      ),
    ).toEqual(["Boulevard Royal", "Rue des Roses"]);
  });

  it("reloads a joined number and street, and keeps a line that cannot be split safely", () => {
    expect(splitStreetLine("12 Rue de Test", { postal_code: "1234", locality: "Musterstadt" })).toEqual({
      house_number: "12",
      street: "Rue de Test",
    });
    expect(splitStreetLine("12, Rue de la Gare")).toEqual({
      house_number: "12",
      street: "Rue de la Gare",
    });
    expect(
      splitStreetLine("10, Boulevard Royal, L-2449 Luxembourg", {
        postal_code: "2449",
        locality: "Luxembourg",
      }),
    ).toEqual({ house_number: "10", street: "Boulevard Royal" });
    expect(
      splitStreetLine("10 Boulevard Royal, L-2449 Luxembourg", {
        postal_code: "L-2449",
        locality: "Luxembourg",
      }),
    ).toEqual({ house_number: "10", street: "Boulevard Royal" });

    const unsplittable = "10, Boulevard Royal, L-2449 Luxembourg";
    expect(splitStreetLine(unsplittable)).toEqual({ house_number: "", street: unsplittable });
    expect(splitStreetLine("Secretariat, building C")).toEqual({
      house_number: "",
      street: "Secretariat, building C",
    });
    expect(splitStreetLine("12 99")).toEqual({ house_number: "", street: "12 99" });
    expect(joinStreetLine("10", "Boulevard Royal")).toBe("10 Boulevard Royal");
    expect(splitStreetLine("17B Rue des Lilas", { postal_code: "1000", locality: "Luxembourg" })).toEqual({
      house_number: "17B",
      street: "Rue des Lilas",
    });
    expect(splitAddressSuggestion("17bis, Rue des Lilas, L-1000 Luxembourg").house_number).toBe("17bis");
    expect(splitStreetLine("3rd floor")).toEqual({ house_number: "", street: "3rd floor" });
  });

  it("offers letter suffixes in numeric order and does not invent numbers", () => {
    expect(
      houseNumberOptions(
        [
          { house_number: "10", street: "Rue des Lilas" },
          { house_number: "2", street: "Rue des Lilas" },
          { house_number: "17B", street: "Rue des Lilas" },
          { house_number: "17", street: "Rue des Lilas" },
          { house_number: "17b", street: "Rue des Lilas" },
          { house_number: "4", street: "Other Street" },
        ],
        "rue des lilas",
      ),
    ).toEqual(["2", "10", "17", "17B"]);
  });

  it("street then postcode: the lookup fills locality and leaves the typed street alone", () => {
    const afterStreet = { ...empty, street: "Rue des Roses", house_number: "4" };
    const afterPostcode = applyPostalLookup(afterStreet, { postal_code: "2445", locality: "Luxembourg" });

    expect(afterPostcode).toEqual({
      street: "Rue des Roses",
      house_number: "4",
      postal_code: "2445",
      locality: "Luxembourg",
    });
  });
});
