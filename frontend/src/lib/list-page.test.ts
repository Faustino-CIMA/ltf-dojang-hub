import { displayPageSize, planListRead, readListPage } from "./list-page";

describe("list page size", () => {
  it("keeps 50 and 150 as one server page", () => {
    expect(planListRead("50", 2)).toEqual({ mode: "single", page: 2, pageSize: 50 });
    expect(planListRead("150", 1)).toEqual({ mode: "single", page: 1, pageSize: 150 });
  });

  it("splits 300 across server pages of 200", () => {
    expect(planListRead("300", 1)).toMatchObject({ mode: "window", first: 1, last: 2, offset: 0, size: 300 });
    expect(planListRead("300", 2)).toMatchObject({ mode: "window", first: 2, last: 3, offset: 100, size: 300 });
  });

  it("asks for every server page when the choice is all", async () => {
    const calls: Array<[number, number]> = [];
    const page = await readListPage("all", 4, async (pageNumber, pageSize) => {
      calls.push([pageNumber, pageSize]);
      const start = (pageNumber - 1) * pageSize;
      const count = 450;
      const results = Array.from({ length: Math.max(0, Math.min(pageSize, count - start)) }, (_, index) => start + index);
      return { count, results };
    });
    expect(calls).toEqual([
      [1, 200],
      [2, 200],
      [3, 200],
    ]);
    expect(page.count).toBe(450);
    expect(page.results).toHaveLength(450);
    expect(page.results[0]).toBe(0);
    expect(page.results[449]).toBe(449);
    expect(displayPageSize("all", 450)).toBe(450);
  });

  it("returns 300 rows from two server pages and does not request a missing page", async () => {
    const calls: number[] = [];
    const page = await readListPage("300", 1, async (pageNumber, pageSize) => {
      calls.push(pageNumber);
      const count = 180;
      const start = (pageNumber - 1) * pageSize;
      const results = Array.from({ length: Math.max(0, Math.min(pageSize, count - start)) }, (_, index) => start + index);
      return { count, results };
    });
    expect(calls).toEqual([1]);
    expect(page.results).toHaveLength(180);
    expect(displayPageSize("300", 180)).toBe(300);
  });
});
