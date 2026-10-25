import { applyAddressSuggestion, applyPostalLookup, splitAddressSuggestion } from "@/lib/address-suggestion";

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
