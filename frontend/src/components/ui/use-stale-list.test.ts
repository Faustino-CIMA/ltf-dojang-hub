import { renderHook } from "@testing-library/react";

import { clearStaleLists, useStaleWhileLoading } from "@/components/ui/use-stale-list";

describe("useStaleWhileLoading", () => {
  beforeEach(() => {
    clearStaleLists();
  });

  it("shows a skeleton only before the first list arrives", () => {
    const first = renderHook(
      ({ rows, isLoading }: { rows: number[]; isLoading: boolean }) =>
        useStaleWhileLoading("members", rows, isLoading),
      { initialProps: { rows: [] as number[], isLoading: true } },
    );
    expect(first.result.current.showSkeleton).toBe(true);
    expect(first.result.current.rows).toEqual([]);

    first.rerender({ rows: [1, 2], isLoading: false });
    expect(first.result.current.showSkeleton).toBe(false);
    expect(first.result.current.rows).toEqual([1, 2]);

    first.rerender({ rows: [1, 2], isLoading: true });
    expect(first.result.current.showSkeleton).toBe(false);
    expect(first.result.current.rows).toEqual([1, 2]);
  });

  it("keeps the previous list when the page is opened again", () => {
    const first = renderHook(
      ({ rows, isLoading }: { rows: string[]; isLoading: boolean }) =>
        useStaleWhileLoading("clubs", rows, isLoading),
      { initialProps: { rows: ["Alpha"], isLoading: false } },
    );
    expect(first.result.current.rows).toEqual(["Alpha"]);
    first.unmount();

    const again = renderHook(
      ({ rows, isLoading }: { rows: string[]; isLoading: boolean }) =>
        useStaleWhileLoading("clubs", rows, isLoading),
      { initialProps: { rows: [] as string[], isLoading: true } },
    );
    expect(again.result.current.showSkeleton).toBe(false);
    expect(again.result.current.rows).toEqual(["Alpha"]);

    again.rerender({ rows: ["Alpha", "Beta"], isLoading: false });
    expect(again.result.current.rows).toEqual(["Alpha", "Beta"]);
  });
});
