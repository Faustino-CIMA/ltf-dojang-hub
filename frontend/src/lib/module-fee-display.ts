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

/** A flat maximum only changes the bill when it is lower than the flat price. */
export function flatMaximumCanApply(
  pricingType: string | null | undefined,
  amount: string | null | undefined,
  maximum: string | null | undefined,
): boolean {
  if (maximum == null || String(maximum).trim() === "") {
    return false;
  }
  if (pricingType !== "flat") {
    return true;
  }
  const price = Number(String(amount ?? "").replace(",", "."));
  const cap = Number(String(maximum).replace(",", "."));
  if (!Number.isFinite(price) || !Number.isFinite(cap)) {
    return true;
  }
  return cap < price;
}

export function visibleMaximumAmount(
  pricingType: string | null | undefined,
  amount: string | null | undefined,
  maximum: string | null | undefined,
): string | null {
  if (!flatMaximumCanApply(pricingType, amount, maximum)) {
    return null;
  }
  return String(maximum);
}

export function maximumIsBelowMinimum(minimum: string, maximum: string): boolean {
  if (!minimum.trim() || !maximum.trim()) {
    return false;
  }
  const floor = Number(minimum.replace(",", "."));
  const cap = Number(maximum.replace(",", "."));
  if (!Number.isFinite(floor) || !Number.isFinite(cap)) {
    return false;
  }
  return cap < floor;
}
