import { closedInfoHint, reduceInfoHint } from "./info-hint-state";

describe("info hint", () => {
  it("opens on hover or focus and closes when the pointer or focus leaves", () => {
    const shown = reduceInfoHint(closedInfoHint, "enter");
    expect(shown.open).toBe(true);
    expect(reduceInfoHint(shown, "leave").open).toBe(false);
    const focused = reduceInfoHint(closedInfoHint, "focus");
    expect(reduceInfoHint(focused, "blur").open).toBe(false);
  });

  it("pins on click so leaving does not close it, until Escape or a second click", () => {
    const pinned = reduceInfoHint(reduceInfoHint(closedInfoHint, "enter"), "click");
    expect(pinned).toEqual({ open: true, pinned: true });
    expect(reduceInfoHint(pinned, "leave").pinned).toBe(true);
    expect(reduceInfoHint(pinned, "escape")).toEqual(closedInfoHint);
    expect(reduceInfoHint(pinned, "click")).toEqual(closedInfoHint);
  });
});
