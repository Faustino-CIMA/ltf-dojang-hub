import { compareSortValues, sortRowsByKey, toOrderingParam, toggleSort } from "@/lib/table-sort";

describe("table sort", () => {
  it("toggles a column from ascending to descending", () => {
    expect(toggleSort(null, "name")).toEqual({ key: "name", direction: "asc" });
    expect(toggleSort({ key: "name", direction: "asc" }, "name")).toEqual({
      key: "name",
      direction: "desc",
    });
    expect(toggleSort({ key: "name", direction: "desc" }, "club")).toEqual({
      key: "club",
      direction: "asc",
    });
  });

  it("encodes the ordering query used by the API", () => {
    expect(toOrderingParam(null)).toBeUndefined();
    expect(toOrderingParam({ key: "name", direction: "asc" })).toBe("name");
    expect(toOrderingParam({ key: "issued_at", direction: "desc" })).toBe("-issued_at");
  });

  it("compares empty values last and sorts the full list", () => {
    expect(compareSortValues(null, "A")).toBeGreaterThan(0);
    expect(compareSortValues(2, 10)).toBeLessThan(0);
    const rows = [
      { id: 1, name: "Zola" },
      { id: 2, name: "" },
      { id: 3, name: "Abel" },
    ];
    expect(sortRowsByKey(rows, { key: "name", direction: "asc" }, { name: (row) => row.name }).map((row) => row.id)).toEqual([
      3, 1, 2,
    ]);
    expect(sortRowsByKey(rows, { key: "name", direction: "desc" }, { name: (row) => row.name }).map((row) => row.id)).toEqual([
      1, 3, 2,
    ]);
  });
});
