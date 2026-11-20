import { formatFirstName, formatFullName, formatLastName, fullNameSortKey } from "@/lib/person-name";
import { ISO_3166_1_ALPHA_2 } from "@/lib/iso-3166-1-alpha-2";
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

  it("formats a full name as last name then first name", () => {
    expect(formatFullName({ first_name: "jean-pierre", last_name: "dupont" })).toBe("DUPONT Jean-Pierre");
    expect(formatFullName({ first_name: "  ADA ", last_name: "" })).toBe("Ada");
    expect(formatFullName(null)).toBe("");
  });

  it("sorts full names by last name, then first name", () => {
    const ada = fullNameSortKey({ first_name: "Ada", last_name: "Lovelace" });
    const ann = fullNameSortKey({ first_name: "Ann", last_name: "Lovelace" });
    const grace = fullNameSortKey({ first_name: "Grace", last_name: "Hopper" });
    expect([ann, grace, ada].sort()).toEqual([grace, ada, ann]);
  });
});

describe("nationality and phone label helpers", () => {
  it("maps legacy nationality names to ISO codes", () => {
    expect(nationalityCodeFromStored("Luxembourg")).toBe("LU");
    expect(nationalityCodeFromStored("lu")).toBe("LU");
    expect(nationalityCodeFromStored("Thailand")).toBe("TH");
    expect(nationalityCodeFromStored("")).toBe("");
  });

  it("lists every ISO country in locale order, with accents beside their base letter", () => {
    for (const locale of ["en", "fr", "de", "lb"]) {
      const options = nationalityOptions(locale);
      expect(options.map((row) => row.code).sort()).toEqual([...ISO_3166_1_ALPHA_2].sort());
      const collator = new Intl.Collator(locale, { usage: "sort", sensitivity: "variant" });
      const names = options.map((row) => row.name);
      expect([...names].sort((left, right) => collator.compare(left, right))).toEqual(names);
    }
    const french = nationalityOptions("fr");
    const at = (code: string) => french.findIndex((row) => row.code === code);
    expect(at("EG")).toBeGreaterThan(-1);
    expect(at("EG")).toBeLessThan(at("ES"));
    expect(at("EG")).toBeLessThan(at("ZW"));
    expect(french[0]?.code).not.toBe("LU");
    expect(nationalityOptions("en").find((row) => row.code === "TH")?.name).toMatch(/thailand/i);
    expect(nationalityCodeFromStored("Narnia")).toBe("Narnia");
  });

  it("normalizes Greater Region address countries to ISO codes", () => {
    expect(normalizeAddressCountry("")).toBe("LU");
    expect(normalizeAddressCountry("de")).toBe("DE");
    expect(normalizeAddressCountry("Belgique")).toBe("BE");
    expect(normalizeAddressCountry("France")).toBe("FR");
    expect(normalizeAddressCountry("Luxembourg")).toBe("LU");
    expect(addressCountryConfig("DE").postalDigits).toBe(5);
    expect(addressCountryConfig("BE").postalDigits).toBe(4);
    expect(addressCountryConfig("FR").lookup).toBe(false);
    expect(addressCountryConfig("LU").lookup).toBe(true);
    expect(addressCountryConfig("Germany").name).toBe("Germany");
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
