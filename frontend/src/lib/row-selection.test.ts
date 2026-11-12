import {
  applyRowRangeSelection,
  offPageSelectedCount,
  pruneSelection,
  togglePageSelection,
  visibleHeaderCheck,
} from "./row-selection";

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

describe("shift range selection", () => {
  const pageOrder = [10, 20, 30, 40, 50];

  it("toggles only the clicked row without shift", () => {
    expect(applyRowRangeSelection([], pageOrder, 30, null, false)).toEqual([30]);
    expect(applyRowRangeSelection([30, 90], pageOrder, 30, 10, false)).toEqual([90]);
  });

  it("selects the inclusive range in the current table order", () => {
    expect(applyRowRangeSelection([10], pageOrder, 40, 10, true)).toEqual([10, 20, 30, 40]);
    expect(applyRowRangeSelection([40], pageOrder, 10, 40, true)).toEqual([40, 10, 20, 30]);
  });

  it("clears the range when the clicked row is already selected", () => {
    expect(applyRowRangeSelection([10, 20, 30, 40, 90], pageOrder, 40, 20, true)).toEqual([10, 90]);
  });

  it("keeps a selection on another page and ignores an anchor that is not on this page", () => {
    expect(applyRowRangeSelection([90], pageOrder, 20, 90, true)).toEqual([90, 20]);
  });
});
