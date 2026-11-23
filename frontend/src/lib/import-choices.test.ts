import { applyListedChoice, type ChoiceRow } from "./import-choices";

const rows: ChoiceRow[] = [
  { sheet: "addresses", line: 2, action: "create", codes: [] },
  { sheet: "addresses", line: 3, action: "create", codes: [] },
  { sheet: "addresses", line: 4, action: "create", codes: [] },
  { sheet: "addresses", line: 5, action: "update", codes: [] },
];

describe("apply skip on the duplicates step", () => {
  it("skips only the rows listed there, not a plain new row", () => {
    const next = applyListedChoice(rows, {}, "skip");
    expect(next).toEqual({ "addresses:5": "skip" });
  });

  it("applies update only to a possible duplicate or an update", () => {
    const withDuplicate: ChoiceRow[] = [
      ...rows,
      { sheet: "addresses", line: 6, action: "create", codes: ["possible_duplicate"] },
    ];
    expect(applyListedChoice(withDuplicate, {}, "update")).toEqual({
      "addresses:5": "update",
      "addresses:6": "update",
    });
  });
});
