import { offPageSelectedCount, pruneSelection, togglePageSelection, visibleHeaderCheck } from "./row-selection";

describe("row selection", () => {
  it("clears only the visible page when every visible row is selected", () => {
    expect(togglePageSelection([1, 2, 9], [1, 2])).toEqual([9]);
  });

  it("adds the visible page without dropping rows on other pages", () => {
    expect(togglePageSelection([9], [1, 2])).toEqual([9, 1, 2]);
  });

  it("marks the header from the visible rows only", () => {
    expect(visibleHeaderCheck([1, 9], [1, 2])).toBe("indeterminate");
    expect(visibleHeaderCheck([1, 2, 9], [1, 2])).toBe(true);
    expect(visibleHeaderCheck([9], [1, 2])).toBe(false);
    expect(offPageSelectedCount([1, 2, 9], [1, 2])).toBe(1);
  });

  it("drops ids that the current filter no longer shows", () => {
    expect(pruneSelection([1, 2, 3], [2, 4])).toEqual([2]);
  });
});
