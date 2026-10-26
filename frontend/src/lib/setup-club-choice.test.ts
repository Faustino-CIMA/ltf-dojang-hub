import {
  NO_CLUB_YET,
  applyClubChoiceToSameText,
  chooseClubForRow,
  clubRowOverrides,
  parkedAfterClubChoice,
  rowsSharingClubText,
} from "@/lib/setup-club-choice";

const rows = [
  { row_index: 1, club_name: "" },
  { row_index: 2, club_name: "  " },
  { row_index: 3, club_name: "Nowhere Dojang" },
  { row_index: 4, club_name: "nowhere dojang" },
  { row_index: 5, club_name: "Silver Crane Academy" },
];

describe("setup club choices", () => {
  it("keeps No club yet selected on that row only", () => {
    const choices = chooseClubForRow({}, 1, NO_CLUB_YET);
    expect(choices[1]).toBe(NO_CLUB_YET);
    expect(choices[2]).toBeUndefined();
    expect(clubRowOverrides(choices)).toEqual({ "1": { none: true } });
    expect(parkedAfterClubChoice({}, [1], NO_CLUB_YET)).toEqual({ 1: true });
  });

  it("assigns a club to one blank row without changing the other blank rows", () => {
    const choices = chooseClubForRow({}, 1, "9");
    expect(choices).toEqual({ 1: "9" });
    expect(rowsSharingClubText(rows, "")).toEqual([]);
    expect(rowsSharingClubText(rows, "   ")).toEqual([]);
    expect(applyClubChoiceToSameText({}, rows, rows[0], "9")).toEqual({ 1: "9" });
    expect(clubRowOverrides(choices)).toEqual({ "1": { club_id: 9 } });
    expect(parkedAfterClubChoice({ 1: true, 2: true }, [1], "9")).toEqual({ 1: false, 2: true });
  });

  it("applies a named club to every row with that text and leaves blank cells alone", () => {
    const applied = applyClubChoiceToSameText({ 1: NO_CLUB_YET }, rows, rows[2], "4");
    expect(applied[1]).toBe(NO_CLUB_YET);
    expect(applied[3]).toBe("4");
    expect(applied[4]).toBe("4");
    expect(applied[5]).toBeUndefined();
    expect(rowsSharingClubText(rows, "Nowhere Dojang")).toHaveLength(2);
  });
});