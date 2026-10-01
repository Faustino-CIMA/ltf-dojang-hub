export function formatMoneyInput(value: string): string {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) {
    return value;
  }
  if (!/^-?\d+([.]\d*)?$/.test(trimmed)) {
    return value;
  }
  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) {
    return value;
  }
  return amount.toFixed(2);
}
