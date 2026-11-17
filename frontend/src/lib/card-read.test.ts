import { readCardText, validBelgianNumber, validFrenchNumber, validGermanPensionNumber, validLuxembourgNumber } from "./card-read";

describe("card number shapes", () => {
  it("accepts the published check digits", () => {
    expect(validLuxembourgNumber("1893120105732")).toBe(true);
    expect(validLuxembourgNumber("1893120105733")).toBe(false);
    expect(validGermanPensionNumber("65170839J081")).toBe(true);
    expect(validGermanPensionNumber("65170839J088")).toBe(false);
    expect(validFrenchNumber("151024610204325")).toBe(true);
    expect(validBelgianNumber("42012205181")).toBe(true);
    expect(validBelgianNumber("42012205180")).toBe(false);
  });
});

describe("readCardText", () => {
  it("reads a Luxembourg national card and skips sex", () => {
    const read = readCardText(
      "LU",
      ["CARTE DE SECURITE SOCIALE", "GRAND-DUCHE DE LUXEMBOURG", "NOM Silva", "PRENOMS Ana Maria", "1893120105732"].join("\n"),
    );
    expect(read).toMatchObject({
      ok: true,
      firstNames: "Ana Maria",
      lastNames: "Silva",
      number: "1893120105732",
      sex: "",
    });
  });

  it("refuses the European face", () => {
    const read = readCardText("LU", "CARTE EUROPEENNE D'ASSURANCE MALADIE\nAna Silva\n123");
    expect(read).toEqual({ ok: false, reason: "wrong_card" });
  });

  it("names a German health card instead of calling it unreadable", () => {
    const read = readCardText("DE", "elektronische Gesundheitskarte\nKrankenversichertennummer A123456789\nAna Silva");
    expect(read).toEqual({ ok: false, reason: "health_card" });
  });

  it("reads a German pension number", () => {
    const read = readCardText(
      "DE",
      ["Versicherungsnummernachweis", "Familienname: Silva", "Vorname: Ana", "65 170839 J 081"].join("\n"),
    );
    expect(read).toMatchObject({ ok: true, number: "65170839J081", firstNames: "Ana", lastNames: "Silva", sex: "" });
  });

  it("reads a French Vitale number and a printed date", () => {
    const read = readCardText(
      "FR",
      ["Carte Vitale", "Nom: Martin", "Prenom: Camille", "Ne(e) le 02/10/1971", "1 51 02 461 020 43 25"].join("\n"),
    );
    expect(read).toMatchObject({
      ok: true,
      number: "151024610204325",
      firstNames: "Camille",
      lastNames: "Martin",
      dateOfBirth: "1971-10-02",
    });
  });

  it("reads a Belgian number with dots", () => {
    const read = readCardText(
      "BE",
      ["CARTE D'IDENTITE", "Nom: Dupont", "Prenoms: Luc", "42.01.22-051.81"].join("\n"),
    );
    expect(read).toMatchObject({ ok: true, number: "42012205181", firstNames: "Luc", lastNames: "Dupont" });
  });

  it("does not verify a number without a name", () => {
    const read = readCardText("LU", "CARTE DE SECURITE SOCIALE\n1893120105732");
    expect(read).toEqual({ ok: false, reason: "unreadable" });
  });
});
