import { fireEvent, render, screen } from "@testing-library/react";

import {
  SlotSelector,
  allSlotSelection,
  normalizeSlotSelection,
  printJobSelectedSlots,
} from "@/components/license-cards/slot-selector";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { index?: number }) =>
    values && typeof values.index === "number" ? `${key}:${values.index}` : key,
}));

describe("slot selection", () => {
  it("keeps the designer order: in range, unique, and sorted", () => {
    expect(normalizeSlotSelection([9, 1, 1, -1, 10, 3], 10)).toEqual([1, 3, 9]);
    expect(allSlotSelection(3)).toEqual([0, 1, 2]);
    expect(allSlotSelection(0)).toEqual([]);
  });

  it("omits a full sheet and an empty choice, and sends a partial choice", () => {
    expect(printJobSelectedSlots([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 10)).toBeUndefined();
    expect(printJobSelectedSlots([], 10)).toBeUndefined();
    expect(printJobSelectedSlots([9, 2, 2], 10)).toEqual([2, 9]);
  });

  it("toggles one slot on the sheet preview", () => {
    const onChange = jest.fn();
    render(
      <SlotSelector slotCount={10} columns={2} selectedSlots={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]} onChange={onChange} />
    );
    expect(screen.getByRole("button", { name: "licenseCardPreviewSlotLabel:0" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "licenseCardPreviewSlotLabel:7" }));
    expect(onChange).toHaveBeenCalledWith([0, 1, 2, 3, 4, 5, 6, 8, 9]);
    fireEvent.click(screen.getByRole("button", { name: "licenseCardPreviewClearSlotsAction" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
