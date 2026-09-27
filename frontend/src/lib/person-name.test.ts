import { formatFirstName, formatLastName } from "@/lib/person-name";
import {
  addressCountryConfig,
  nationalityCodeFromStored,
  nationalityOptions,
  normalizeAddressCountry,
  normalizePhoneLabel,
} from "@/lib/nationalities";

describe("person name formatting", () => {
  it("capitalizes first names including hyphens and extra words", () => {
    expect(formatFirstName("jean-pierre marie")).toBe("Jean-Pierre Marie");
    expect(formatFirstName("  ADA  ")).toBe("Ada");
  });

  it("uppercases last names including hyphens", () => {
    expect(formatLastName("dupont-schmit")).toBe("DUPONT-SCHMIT");
    expect(formatLastName("  member ")).toBe("MEMBER");
  });
});

describe("nationality and phone label helpers", () => {
  it("maps legacy nationality names to ISO codes", () => {
    expect(nationalityCodeFromStored("Luxembourg")).toBe("LU");
    expect(nationalityCodeFromStored("lu")).toBe("LU");
    expect(nationalityCodeFromStored("Thailand")).toBe("TH");
    expect(nationalityCodeFromStored("")).toBe("");
  });

  it("includes Thailand and other previously missing countries", () => {
    const codes = nationalityOptions("en").map((row) => row.code);
    expect(codes).toEqual(expect.arrayContaining(["TH", "KR", "SI", "CY", "MT", "AL", "JP", "VN"]));
    expect(nationalityOptions("en").find((row) => row.code === "TH")?.name).toMatch(/thailand/i);
  });

  it("normalizes Greater Region address countries", () => {
    expect(normalizeAddressCountry("")).toBe("Luxembourg");
    expect(normalizeAddressCountry("de")).toBe("Germany");
    expect(normalizeAddressCountry("Belgique")).toBe("Belgium");
    expect(normalizeAddressCountry("France")).toBe("France");
    expect(addressCountryConfig("Germany").postalDigits).toBe(5);
    expect(addressCountryConfig("Belgium").postalDigits).toBe(4);
    expect(addressCountryConfig("France").lookup).toBe(false);
    expect(addressCountryConfig("Luxembourg").lookup).toBe(true);
  });

  it("normalizes phone labels to translation keys", () => {
    expect(normalizePhoneLabel("mobile")).toBe("mobile");
    expect(normalizePhoneLabel("Cell")).toBe("mobile");
    expect(normalizePhoneLabel("home")).toBe("home");
    expect(normalizePhoneLabel("bureau")).toBe("work");
    expect(normalizePhoneLabel("fax")).toBe("other");
    expect(normalizePhoneLabel("")).toBe("");
  });
});
