/** A flat minimum only changes the bill when it is higher than the flat price. */
export function flatMinimumCanApply(
  pricingType: string | null | undefined,
  amount: string | null | undefined,
  minimum: string | null | undefined,
): boolean {
  if (minimum == null || String(minimum).trim() === "") {
    return false;
  }
  if (pricingType !== "flat") {
    return true;
  }
  const price = Number(String(amount ?? "").replace(",", "."));
  const floor = Number(String(minimum).replace(",", "."));
  if (!Number.isFinite(price) || !Number.isFinite(floor)) {
    return true;
  }
  return floor > price;
}

export function visibleMinimumAmount(
  pricingType: string | null | undefined,
  amount: string | null | undefined,
  minimum: string | null | undefined,
): string | null {
  if (!flatMinimumCanApply(pricingType, amount, minimum)) {
    return null;
  }
  return String(minimum);
}
