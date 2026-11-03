import { committeeHolderLabel } from "./committee-holder";

describe("committee holder label", () => {
  it("puts the family name first and the club after it", () => {
    expect(
      committeeHolderLabel(
        { first_name: "Lio", last_name: "Kraus", club_name: "History Club" },
        "LTF",
      ),
    ).toBe("KRAUS Lio · History Club");
  });

  it("marks a person with no club as LTF", () => {
    expect(committeeHolderLabel({ first_name: "Nora", last_name: "Staff", club_name: "" }, "LTF")).toBe(
      "STAFF Nora · LTF",
    );
  });
});
