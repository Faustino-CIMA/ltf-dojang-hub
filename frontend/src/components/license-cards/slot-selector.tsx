"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

/** Keep in-range slot indexes, drop duplicates, and sort them. Same rule as the card designer. */
export function normalizeSlotSelection(selectedSlots: number[], slotCount: number) {
  const unique = new Set<number>();
  for (const slot of selectedSlots) {
    if (Number.isInteger(slot) && slot >= 0 && slot < slotCount) {
      unique.add(slot);
    }
  }
  return Array.from(unique.values()).sort((left, right) => left - right);
}

export function allSlotSelection(slotCount: number) {
  if (slotCount <= 0) {
    return [];
  }
  return Array.from({ length: slotCount }, (_, index) => index);
}

/**
 * Slots to store on a print job.
 * The designer sends a partial list and omits an empty one. A full sheet is also
 * omitted here so a long run still continues on the next sheet from slot 0.
 */
export function printJobSelectedSlots(selectedSlots: number[], slotCount: number): number[] | undefined {
  const normalized = normalizeSlotSelection(selectedSlots, slotCount);
  if (slotCount <= 0 || normalized.length === 0 || normalized.length >= slotCount) {
    return undefined;
  }
  return normalized;
}

export function SlotSelector({
  slotCount,
  columns,
  selectedSlots,
  onChange,
}: {
  slotCount: number;
  columns: number;
  selectedSlots: number[];
  onChange: (slots: number[]) => void;
}) {
  const t = useTranslations("LtfAdmin");
  const normalized = normalizeSlotSelection(selectedSlots, slotCount);

  const toggle = (slotIndex: number) => {
    if (slotCount <= 0) {
      return;
    }
    const selectedSet = new Set(normalized);
    if (selectedSet.has(slotIndex)) {
      selectedSet.delete(slotIndex);
    } else {
      selectedSet.add(slotIndex);
    }
    onChange(normalizeSlotSelection(Array.from(selectedSet.values()), slotCount));
  };

  return (
    <div className="space-y-3 rounded-[var(--radius-card)] border border-border bg-secondary p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t("licenseCardPreviewSlotSelectorTitle")}</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={slotCount <= 0}
            onClick={() => onChange(allSlotSelection(slotCount))}
          >
            {t("licenseCardPreviewSelectAllSlotsAction")}
          </Button>
          <Button size="sm" variant="ghost" disabled={slotCount <= 0} onClick={() => onChange([])}>
            {t("licenseCardPreviewClearSlotsAction")}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted">{t("licenseCardPreviewSlotSelectorSubtitle")}</p>
      {slotCount <= 0 ? (
        <p className="text-xs text-muted">{t("licenseCardPreviewNoSlotsAvailable")}</p>
      ) : (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: slotCount }, (_, index) => {
            const selected = normalized.includes(index);
            return (
              <button
                key={index}
                type="button"
                aria-pressed={selected}
                className={`rounded-lg border px-2 py-2 text-xs transition ${
                  selected
                    ? "border-primary bg-[var(--accent-soft)] text-primary"
                    : "border-border bg-surface text-foreground hover:bg-secondary"
                }`}
                onClick={() => toggle(index)}
              >
                {t("licenseCardPreviewSlotLabel", { index })}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
